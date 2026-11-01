/**
 * Run/access test: drive the engine through a Corp-installed server with ice
 * and verify the Runner can break subroutines, access cards, and steal an
 * agenda. Deterministic seed.
 *
 * This is the runs-layer regression record, and it doubles as a citation
 * watchdog for the rule ids the runs layer depends on: the engine comments
 * that document the behavior pinned here must keep citing those sections, so
 * the last test greps the engine sources for each id — a stale citation fails
 * this file instead of surviving a re-read of docs/rules-gotchas.md.
 *
 * Pinned here (rules cited in the assertions below):
 * - Install servers (rules 4.6.6d, 8.5.2d): ice protects any server, an
 *   agenda creates a new remote — `src/engine/legal-moves.ts`.
 * - Rez cost is the printed cost (rule 1.16.8) — `src/engine/runs.ts`.
 * - The encounter completes into the movement phase (rule 6.5.6), which parks
 *   for the jack-out decision (rules 6.9.4c, 6.6.3) — `src/engine/settle.ts`.
 * - Run success is declared at the Success Phase (rule 6.7.2) —
 *   `src/engine/runs.ts` / `src/engine/settle.ts`.
 * - A remote emptied mid-run ends the run neither successful nor unsuccessful
 *   (rules 8.5.8, 10.3.1h) — `src/engine/settle.ts`, `src/engine/state.ts`.
 */

import { cardDef, engine } from "../src/mod.ts";
import type { GameState, Move } from "../src/types.ts";
import { newStarterGame, play } from "./helpers/fixtures.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

// ---------------------------------------------------------------------------
// Deterministic scenario (seed 1): the corp's opening hand holds
// offworld_office (agenda) and whitespace (code gate), so the corp can build
// remote-1 = agenda in the root behind an ice, and the runner opens with
// Unity — a decoder that breaks whitespace's code-gate subroutines.
// ---------------------------------------------------------------------------

function corpMove(state: GameState, pred: (m: Move) => boolean, what: string): Move {
  return assertDefined(
    engine.getLegalMoves(state, "corp").find(pred),
    what,
  );
}

function runnerMove(state: GameState, pred: (m: Move) => boolean, what: string): Move {
  return assertDefined(
    engine.getLegalMoves(state, "runner").find(pred),
    what,
  );
}

/** Spend the corp's remaining clicks (gaining credits) until the turn passes. */
function endCorpTurn(state: GameState): GameState {
  let cur = state;
  while (!cur.winner && cur.turn.player === "corp") {
    const moves = engine.getLegalMoves(cur, "corp");
    if (moves.length === 0) break;
    const gain = moves.find((m) => m.kind === "corp.gainCredits") ?? moves[0]!;
    cur = play(cur, "corp", gain);
    const discard = engine.getLegalMoves(cur, "corp").find((m) => m.kind === "discard");
    if (discard) cur = play(cur, "corp", discard);
  }
  return cur;
}

function iceOf(state: GameState, serverId: string) {
  const ice = state.servers.find((s) => s.id === serverId)?.ice[0];
  return assertDefined(ice, `ice protecting ${serverId}`);
}

Deno.test("run: the corp builds a remote (agenda behind ice) that the runner can run", () => {
  const state = newStarterGame(1);
  const installAgenda = corpMove(
    state,
    (m) => m.kind === "corp.install" && m.cardId === "offworld_office" && m.server === "new-remote",
    "seed 1: the corp opens with offworld_office to install in a new remote",
  );
  const afterAgenda = play(state, "corp", installAgenda);
  const remote = assertDefined(
    afterAgenda.servers.find((s) => s.id === "remote-1"),
    "installing the agenda created remote-1 (rule 8.5.2c)",
  );
  assertEquals(remote.root.map((c) => c.cardId), ["offworld_office"]);

  // Ice protects the new server (rule 4.6.6d), outermost position (8.5.2d).
  const installIce = corpMove(
    afterAgenda,
    (m) => m.kind === "corp.install" && m.cardId === "whitespace" && m.server === "remote-1",
    "the corp can install whitespace protecting remote-1",
  );
  const afterIce = play(afterAgenda, "corp", installIce);
  assertEquals(iceOf(afterIce, "remote-1").cardId, "whitespace");
});

Deno.test("run: the approach rez window parks for the corp and rezzing charges the printed cost", () => {
  // Setup: agenda + ice in remote-1, corp turn burned.
  let state = newStarterGame(1);
  state = play(
    state,
    "corp",
    corpMove(
      state,
      (m) =>
        m.kind === "corp.install" && m.cardId === "offworld_office" && m.server === "new-remote",
      "corp can install the agenda",
    ),
  );
  state = play(
    state,
    "corp",
    corpMove(
      state,
      (m) => m.kind === "corp.install" && m.cardId === "whitespace" && m.server === "remote-1",
      "corp can install the ice",
    ),
  );
  state = endCorpTurn(state);
  assertEquals(state.turn.player, "runner", "the runner's turn begins");

  // Unity is the decoder: strength 1 breaks code gates (whitespace prints 0).
  const installUnity = runnerMove(
    state,
    (m) => m.kind === "runner.install" && m.cardId === "unity",
    "the runner opens with Unity to install",
  );
  state = play(state, "runner", installUnity);

  // The run reaches the approach rez window (rule 6.9.2b): the corp parks.
  const runMove = runnerMove(
    state,
    (m) => m.kind === "runner.run" && m.server === "remote-1",
    "the runner can run remote-1",
  );
  let running = play(state, "runner", runMove);
  const window = assertDefined(
    running.prompts[0],
    "the corp rez window is pending after the run starts",
  );
  assertEquals(window.kind, "rez-window");
  assertEquals(window.player, "corp");

  // Rezzing charges the printed rez cost exactly once (rule 1.16.8).
  const printed = cardDef("whitespace").cost;
  assert(printed !== null, "whitespace has a printed rez cost");
  const creditsBefore = running.corp.credits;
  const rezAnswer = assertDefined(
    engine.getLegalMoves(running, "corp").find(
      (m) => m.kind === "prompt.answer" && m.optionId !== "pass",
    ),
    "the corp has a rez option in its window",
  );
  running = play(running, "corp", rezAnswer);
  assertEquals(running.corp.credits, creditsBefore - printed, "rezzing charged the printed cost");
  assertEquals(iceOf(running, "remote-1").rezzed, true, "the ice is now rezzed");
  assertEquals(running.run?.phase, "encounter-ice", "the encounter begins (rule 6.5)");

  // Encounter (rule 6.5.6): the runner breaks whitespace's subroutines.
  const unbrokenTotal = 2; // whitespace prints two subroutines
  for (let sub = 0; sub < unbrokenTotal; sub++) {
    const breakMove = runnerMove(
      running,
      (m) => m.kind === "runner.breakSubroutine" && m.subIndex === sub,
      `the runner can break whitespace's subroutine ${sub} with Unity`,
    );
    running = play(running, "runner", breakMove);
    assert(
      running.run?.broken.includes(sub) ?? false,
      `subroutine ${sub} is recorded as broken`,
    );
  }
  assertEquals(
    running.run?.phase,
    "movement",
    "once every subroutine is handled the encounter completes into the movement phase " +
      "(rule 6.5.6)",
  );

  // The movement phase parks for the jack-out decision (rules 6.9.4c, 6.6.3).
  const movementMoves = engine.getLegalMoves(running, "runner");
  assert(
    movementMoves.some((m) => m.kind === "runner.continueRun") &&
      movementMoves.some((m) => m.kind === "runner.jackOut"),
    "the movement phase offers both continueRun and jackOut",
  );

  // Continuing declares success at the Success Phase (rule 6.7.2) and breaches.
  const continueMove = runnerMove(
    running,
    (m) => m.kind === "runner.continueRun",
    "the runner can continue the run",
  );
  running = play(running, "runner", continueMove);
  assertEquals(running.run?.successful, true, "the run is declared successful");
  assertEquals(running.breach?.server, "remote-1", "the successful run breaches the remote");

  // The single root candidate is auto-accessed; the decision is pending.
  const accessedId = assertDefined(
    running.breach?.accessing,
    "the agenda is being accessed (rule 7.3.4: a single candidate auto-selects)",
  );
  assertEquals(
    accessedId,
    assertDefined(running.servers.find((s) => s.id === "remote-1")).root[0]!.id,
    "the accessed card is the installed agenda",
  );
  const accessPrompt = assertDefined(
    running.prompts[0],
    "the access decision is pending for the runner",
  );
  assertEquals(accessPrompt.kind, "access-decision");
  assertEquals(accessPrompt.player, "runner");

  // An agenda has no trash cost (rule 7.1.5a) — the only resolution steals it.
  const finishMove = runnerMove(
    running,
    (m) => m.kind === "runner.finishAccess",
    "the runner can finish the access",
  );
  const scoreBefore = running.runner.score.length;
  const pointsBefore = running.runner.agendaPoints;
  const done = play(running, "runner", finishMove);

  assertEquals(
    done.runner.score.length,
    scoreBefore + 1,
    "the accessed agenda is stolen into the runner's score",
  );
  assertEquals(done.runner.score.map((c) => c.cardId), ["offworld_office"]);
  assertEquals(
    done.runner.agendaPoints,
    pointsBefore + (cardDef("offworld_office").agendaPoints ?? 0),
    "the steal banks the agenda's printed points",
  );
  assertEquals(done.breach, null, "the breach is over");
  assertEquals(done.run, null, "the run has ended");
  const runEnd = assertDefined(
    done.log.filter((e) => e.type === "run-end").at(-1),
    "a run-end event was logged",
  );
  assertEquals(
    runEnd.type === "run-end" ? runEnd.successful : null,
    true,
    "the run was successful",
  );
  assertEquals(runEnd.type === "run-end" ? runEnd.server : null, "remote-1");
});

Deno.test("run: rule citations the runs layer depends on stay in the engine", () => {
  // The comments documenting the behavior pinned above must keep citing their
  // sections (docs/rules-gotchas.md entry 1 — known-stale citations). When a
  // rule citation goes stale this fails; re-read the cited section then.
  const files = [
    "src/engine/legal-moves.ts",
    "src/engine/runs.ts",
    "src/engine/settle.ts",
    "src/engine/state.ts",
  ];
  const text = files
    .map((f) => Deno.readTextFileSync(new URL(`../${f}`, import.meta.url)))
    .join("\n");
  const cited = [
    "4.6.6d", // ice protects any server
    "8.5.2d", // ice installs at the outermost position
    "1.16.8", // rez cost is the printed cost
    "6.9.2c", // unrezzed ice is passed at approach
    "6.5.6", // the encounter completes into the movement phase
    "6.9.4c", // the movement phase parks for the jack-out decision
    "6.7.2", // run success at the Success Phase
    "8.5.8", // a pruned server's run ends neither successful nor unsuccessful
    "10.3.1h", // the checkpoint run-end consequence
  ];
  for (const rule of cited) {
    assert(
      text.includes(rule),
      `the runs layer no longer cites rule ${rule} — re-read that section in ` +
        `docs/rules-v26.03.txt and fix the citation (or re-pin the behavior here)`,
    );
  }
});
