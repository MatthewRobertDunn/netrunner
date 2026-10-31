/**
 * Manegarm Skunkworks toll tests (rule 6.9.4g approach toll).
 *
 * Regression for the double-charge bug: the toll prompt options carry both
 * `creditCost`/`clickCost` (spent once by `answerPrompt`'s generic option-cost
 * spend, and used by `movesForPrompt` to filter unaffordable options) AND the
 * `pay-toll-credits`/`pay-toll-clicks` effects. `spendToll` used to spend a
 * second time and bail out early when the generic spend had already drained the
 * runner — so `run.tollPaid` was never set, the toll re-prompted, and the pay
 * option was no longer affordable, forcing the Runner to end the run after
 * paying. Now `spendToll` only sets the flag; the generic spend is the single
 * charge.
 *
 * Fixture: the Corp opens with nico_campaign + manegarm_skunkworks, installs
 * the asset in a new remote and the upgrade in that remote's root, rezzes the
 * upgrade in the action phase (corp.rez), and ends the turn. The Runner then
 * runs remote-1 and hits the toll prompt on approach.
 */

import { engine } from "../src/mod.ts";
import { endCorpTurn, newGameWithCorpHand, play } from "../src/testing/fixtures.ts";
import type { ApplyMoveResult, GameState } from "../src/types.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

/**
 * Corp turn 1: install nico_campaign in a new remote, install
 * manegarm_skunkworks in that remote's root, rez it (corp.rez), end the turn,
 * and the Runner runs the remote — stopping at the toll prompt.
 */
function tollState(seed = 3): GameState {
  let state = newGameWithCorpHand(["nico_campaign", "manegarm_skunkworks"], seed);

  const installAsset = engine.getLegalMoves(state, "corp").find((m) =>
    m.kind === "corp.install" && m.cardId === "nico_campaign" && m.server === "new-remote"
  );
  assertDefined(installAsset, "corp can install nico_campaign in a new remote");
  state = play(state, "corp", installAsset!).state;

  const installUpgrade = engine.getLegalMoves(state, "corp").find((m) =>
    m.kind === "corp.install" && m.cardId === "manegarm_skunkworks" && m.server === "remote-1"
  );
  assertDefined(installUpgrade, "corp can install manegarm_skunkworks in remote-1's root");
  state = play(state, "corp", installUpgrade!).state;

  const manegarm = state.servers
    .flatMap((s) => [...s.root, ...s.ice])
    .find((c) => c.cardId === "manegarm_skunkworks");
  assertDefined(manegarm, "manegarm is installed");
  assertEquals(manegarm!.rezzed, false, "manegarm starts unrezzed");

  // Ice is rezzed during runs only; assets/upgrades are rezzed in the action
  // phase via corp.rez (legal-moves.ts corpActionMoves).
  const rez = engine.getLegalMoves(state, "corp").find((m) =>
    m.kind === "corp.rez" && m.targetId === manegarm!.id
  );
  assertDefined(rez, "corp.rez move exists for the installed upgrade");
  state = play(state, "corp", rez!).state;
  assertEquals(
    state.servers.flatMap((s) => s.root).find((c) => c.cardId === "manegarm_skunkworks")
      ?.rezzed,
    true,
    "manegarm is rezzed after corp.rez",
  );

  state = endCorpTurn(state);

  const run = engine.getLegalMoves(state, "runner").find((m) =>
    m.kind === "runner.run" && m.server === "remote-1"
  );
  assertDefined(run, "runner can run remote-1");
  state = play(state, "runner", run!).state;
  // The run parks in the movement phase (rule 6.9.4c); continuing reaches the
  // server, where the rezzed Manegarm raises its toll prompt.
  const cont = engine.getLegalMoves(state, "runner").find((m) => m.kind === "runner.continueRun");
  assertDefined(cont, "continueRun is offered in the movement phase");
  state = play(state, "runner", cont!).state;

  assert(tollPrompt(state) !== undefined, "the Manegarm toll prompt is pending");
  return state;
}

/** The pending Manegarm toll prompt, if any. */
function tollPrompt(state: GameState) {
  const p = state.prompts[0];
  if (p && p.kind === "choose-one" && p.options.some((o) => o.id === "toll-credits")) return p;
  return undefined;
}

/** Option ids currently offered for the pending prompt (runner side). */
function offeredOptionIds(state: GameState): string[] {
  const ids: string[] = [];
  for (const m of engine.getLegalMoves(state, "runner")) {
    if (m.kind === "prompt.answer") ids.push(m.optionId);
  }
  return ids;
}

/** Answer the pending toll prompt with `optionId`; returns the apply result. */
function answerToll(state: GameState, optionId: string): ApplyMoveResult {
  const move = engine.getLegalMoves(state, "runner").find((m) =>
    m.kind === "prompt.answer" && m.optionId === optionId
  );
  assertDefined(move, `toll option ${optionId} is offered`);
  return play(state, "runner", move!);
}

/** Count log events matching `pred`. */
function countEvents(state: GameState, pred: (e: GameState["log"][number]) => boolean): number {
  return state.log.filter(pred).length;
}

/** The (single) run-end log event, narrowed to its typed variant. */
function runEndEvent(state: GameState): Extract<GameState["log"][number], { type: "run-end" }> {
  const e = state.log.find((e) => e.type === "run-end");
  if (!e || e.type !== "run-end") throw new Error("no run-end event logged");
  return e;
}

/**
 * Play the run out to completion (access everything, finish every access),
 * asserting the toll prompt never re-appears. Returns the final state.
 */
function finishRunToEnd(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 30; i++) {
    if (cur.winner || !cur.run) break;
    assert(
      tollPrompt(cur) === undefined,
      "the toll prompt must not re-appear after it was answered (tollPaid)",
    );
    const moves = engine.getLegalMoves(cur, "runner");
    if (moves.length === 0) break;
    const m = moves.find((mm) => mm.kind === "runner.continueRun") ??
      moves.find((mm) => mm.kind === "runner.finishAccess") ??
      moves.find((mm) => mm.kind === "runner.accessCard") ??
      moves[0]!;
    cur = play(cur, "runner", m).state;
  }
  return cur;
}

Deno.test("toll: paying 5 credits charges exactly once, sets tollPaid, and the run proceeds", () => {
  const state = tollState();
  assertEquals(state.runner.credits, 5, "runner starts with 5 credits");
  assertEquals(offeredOptionIds(state), ["toll-credits", "toll-clicks", "toll-end"]);

  const result = answerToll(state, "toll-credits");
  const after = result.state;

  // Charged exactly once: 5 -> 0, a single spend-credits event, no second charge.
  assertEquals(after.runner.credits, 0, "exactly 5 credits were spent (5 -> 0)");
  assertEquals(
    result.events.filter((e) =>
      e.type === "spend-credits" && e.player === "runner" &&
      e.amount === 5
    ).length,
    1,
    "exactly one spend-credits(5) event for the runner",
  );
  assertEquals(
    countEvents(after, (e) => e.type === "lose-credits" && e.player === "runner"),
    0,
    "no lose-credits event: the toll is not charged a second time",
  );

  // The flag sticks and settle does not re-prompt.
  assertEquals(after.run?.tollPaid, true, "run.tollPaid is set after paying");
  assert(tollPrompt(after) === undefined, "no toll prompt is pending after paying");

  // The run proceeds to the breach instead of ending.
  assert(after.run !== null && after.breach !== null, "the run became successful (breach began)");
  assert(
    engine.getLegalMoves(after, "runner").some((m) => m.kind === "runner.accessCard"),
    "the runner is offered access cards",
  );

  const end = finishRunToEnd(after);
  assertEquals(end.run, null, "the run finished");
  assertEquals(runEndEvent(end).successful, true, "the run ended successful");
});

Deno.test("toll: spending 2 clicks charges exactly once, sets tollPaid, and the run proceeds", () => {
  const state = tollState();
  const clicksBefore = state.runner.clicks;
  assertEquals(clicksBefore, 3, "runner has 3 clicks left after initiating the run");

  const result = answerToll(state, "toll-clicks");
  const after = result.state;

  // Charged exactly once: one spend-clicks(2) event (state.spendClicks, via
  // answerPrompt's generic clickCost spend), no second lose-clicks charge.
  assertEquals(after.runner.clicks, clicksBefore - 2, "exactly 2 clicks were spent");
  assertEquals(
    result.events.filter((e) =>
      e.type === "spend-clicks" && e.player === "runner" &&
      e.amount === 2
    ).length,
    1,
    "exactly one spend-clicks(2) event for the runner",
  );
  assertEquals(
    countEvents(after, (e) => e.type === "lose-clicks" && e.player === "runner" && e.amount === 2),
    0,
    "no lose-clicks(2) event: the toll is not charged a second time",
  );
  assertEquals(after.runner.credits, 5, "no credits were spent");

  assertEquals(after.run?.tollPaid, true, "run.tollPaid is set after paying clicks");
  assert(tollPrompt(after) === undefined, "no toll prompt is pending after paying");
  assert(after.run !== null && after.breach !== null, "the run became successful (breach began)");

  const end = finishRunToEnd(after);
  assertEquals(end.run, null, "the run finished");
  assertEquals(runEndEvent(end).successful, true, "the run ended successful");
});

Deno.test("toll: choosing to end the run ends it unsuccessful without charging anything", () => {
  const state = tollState();
  const result = answerToll(state, "toll-end");
  const after = result.state;

  assertEquals(after.run, null, "the run ended");
  assertEquals(after.runner.credits, 5, "no credits were spent");
  assertEquals(after.runner.clicks, 3, "no clicks were spent");
  assertEquals(
    result.events.filter((e) =>
      e.type === "spend-credits" || e.type === "spend-clicks" || e.type === "lose-credits" ||
      e.type === "lose-clicks"
    ).length,
    0,
    "ending the run spends nothing",
  );
  assertEquals(runEndEvent(after).successful, false, "the run ended unsuccessful");
});

Deno.test("toll: the 5-credit option is not offered when the runner has fewer than 5 credits", () => {
  const state = tollState();
  // Deterministic fixture tweak: the runner is short on credits at the toll.
  state.runner.credits = 2;
  const offered = offeredOptionIds(state);
  assert(!offered.includes("toll-credits"), "toll-credits is filtered out (2 < 5 credits)");
  assertEquals(offered, ["toll-clicks", "toll-end"]);

  // The clicks option is still available and works from the low-credit state.
  const result = answerToll(state, "toll-clicks");
  const after = result.state;
  assertEquals(after.runner.credits, 2, "credits untouched by the click toll");
  assertEquals(after.runner.clicks, 1, "exactly 2 clicks spent");
  assertEquals(after.run?.tollPaid, true, "run.tollPaid is set");
  assert(after.run !== null && after.breach !== null, "the run proceeded to the breach");

  const end = finishRunToEnd(after);
  assertEquals(runEndEvent(end).successful, true, "the run ended successful");
});

Deno.test("toll: the prompt appears once per run — a second run re-prompts, a paid run never does", () => {
  let state = tollState();
  // Run 1: pay with clicks (3 -> 1 click left, credits untouched).
  state = answerToll(state, "toll-clicks").state;
  assertEquals(state.run?.tollPaid, true);
  state = finishRunToEnd(state);
  assertEquals(state.run, null, "run 1 finished");
  assertEquals(runEndEvent(state).successful, true);
  assert(tollPrompt(state) === undefined, "no toll prompt lingers after run 1");
  assertEquals(state.runner.clicks, 1, "one click left after run 1 + 2-click toll");
  assertEquals(state.runner.credits, 5, "credits untouched in run 1");

  // Run 2 on the same server: the toll is per-approach, so it prompts again.
  const run2 = engine.getLegalMoves(state, "runner").find((m) =>
    m.kind === "runner.run" && m.server === "remote-1"
  );
  assertDefined(run2, "the runner can run remote-1 again");
  state = play(state, "runner", run2!).state;
  // The run parks in the movement phase; continuing approaches the server and
  // raises the toll prompt again.
  const cont = engine.getLegalMoves(state, "runner").find((m) => m.kind === "runner.continueRun");
  assertDefined(cont, "run 2 parks in the movement phase");
  state = play(state, "runner", cont!).state;
  assert(tollPrompt(state) !== undefined, "run 2 approaches the rezzed upgrade: toll prompts");
  // With 0 clicks left after initiating run 2, only the credit option is offered.
  assertEquals(offeredOptionIds(state), ["toll-credits", "toll-end"]);

  const result = answerToll(state, "toll-credits");
  const after = result.state;
  assertEquals(after.runner.credits, 0, "run 2 paid exactly 5 credits");
  assertEquals(after.run?.tollPaid, true, "run 2's tollPaid is set");
  assert(tollPrompt(after) === undefined, "run 2 does not re-prompt after paying");

  // Across both runs the toll charged exactly once per run: one 2-click spend,
  // one 5-credit spend, no duplicate charges.
  assertEquals(
    countEvents(after, (e) => e.type === "spend-clicks" && e.player === "runner" && e.amount === 2),
    1,
    "exactly one spend-clicks(2) across both runs",
  );
  assertEquals(
    countEvents(
      after,
      (e) => e.type === "spend-credits" && e.player === "runner" && e.amount === 5,
    ),
    1,
    "exactly one spend-credits(5) across both runs",
  );
  assertEquals(
    countEvents(after, (e) => e.type === "lose-credits" && e.player === "runner"),
    0,
    "no double charge in either run",
  );

  const end = finishRunToEnd(after);
  assertEquals(runEndEvent(end).successful, true, "run 2 ended successful");
});
