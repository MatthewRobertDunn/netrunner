/**
 * Run movement-phase tests (rules 6.1.5, 6.6.3, 6.9.4c, 6.7.2).
 *
 * The movement phase is a real decision point: the run parks there and the
 * Runner chooses `runner.jackOut` (6.9.4c) or `runner.continueRun` (6.9.4d-g).
 * Reaching the server always goes through `declareSuccess`, so a run past only
 * unrezzed ice still fires "run-successful", sets `successfulRunThisTurn`
 * (Carmen's discount), and ends successful.
 */

import { cardDef, engine, starterDeckConfigs } from "../src/mod.ts";
import { endCorpTurn, newGameWithCorpHand, newStarterGame, play } from "../src/testing/fixtures.ts";
import type { GameState, Move } from "../src/types.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

function moveKinds(state: GameState, side: "corp" | "runner"): string[] {
  return engine.getLegalMoves(state, side).map((m) => m.kind);
}

function findMove(state: GameState, side: "corp" | "runner", kind: Move["kind"]): Move | undefined {
  return engine.getLegalMoves(state, side).find((m) => m.kind === kind);
}

/** Install `cardId` as ice protecting a brand-new remote, then end the Corp turn. */
function corpTurnWithIceOnRemote(hand: string[], iceCount: number, seed = 3): GameState {
  let cur = newGameWithCorpHand(hand, seed);
  for (let i = 0; i < iceCount; i++) {
    const server = i === 0 ? "new-remote" : "remote-1";
    const install = engine.getLegalMoves(cur, "corp").find(
      (m) => m.kind === "corp.install" && m.cardId === hand[0]! && m.server === server,
    );
    assertDefined(install, `corp can install ice ${i + 1} on ${server}`);
    cur = play(cur, "corp", install!).state;
  }
  return endCorpTurn(cur);
}

function runServer(state: GameState, server: string): GameState {
  const run = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "runner.run" && m.server === server,
  );
  assertDefined(run, `runner can run ${server}`);
  return play(state, "runner", run!).state;
}

/** The Corp passes its rez window (the approached ice stays unrezzed). */
function corpPassesRezWindow(state: GameState): GameState {
  const pass = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "prompt.answer" && m.optionId === "pass",
  );
  assertDefined(pass, "corp has a pass option in the rez window");
  return play(state, "corp", pass!).state;
}

/** The Corp rezzes the approached ice in its rez window. */
function corpRezzesInWindow(state: GameState): GameState {
  const rez = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "prompt.answer" && m.optionId !== "pass",
  );
  assertDefined(rez, "corp has a rez option in the rez window");
  return play(state, "corp", rez!).state;
}

/** Drive a breach to completion (random access + finish). */
function driveBreach(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 30; i++) {
    if (!cur.breach || cur.winner) break;
    const moves = engine.getLegalMoves(cur, "runner");
    const m = moves.find((x) => x.kind === "runner.accessRandom") ??
      moves.find((x) => x.kind === "runner.accessCard") ??
      moves.find((x) => x.kind === "runner.finishAccess");
    if (!m) break;
    cur = play(cur, "runner", m).state;
  }
  return cur;
}

/** Find a seed whose Runner opening hand contains Carmen. */
function findCarmenSeed(): number | null {
  const decks = starterDeckConfigs();
  for (let seed = 1; seed <= 50; seed++) {
    const state = engine.startGame({
      corp: decks.corp,
      runner: decks.runner,
      mode: "starter-decks",
      seed,
    });
    if (state.runner.hand.some((c) => c.cardId === "carmen")) return seed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. Jack-out (rules 6.1.5, 6.6.3, 6.9.4c)
// ---------------------------------------------------------------------------

Deno.test("movement: the run parks in the movement phase and jack-out is legal", () => {
  let cur = corpTurnWithIceOnRemote(["tithe"], 1);
  cur = runServer(cur, "remote-1");
  cur = corpPassesRezWindow(cur); // ice stays unrezzed and is passed

  // The movement phase is now a decision point for the Runner.
  assertEquals(cur.run?.phase, "movement", "the run parks in the movement phase");
  const kinds = moveKinds(cur, "runner");
  assert(kinds.includes("runner.jackOut"), "jack-out is offered in the movement phase");
  assert(kinds.includes("runner.continueRun"), "continue is offered in the movement phase");

  const clicksBefore = cur.runner.clicks;
  const creditsBefore = cur.runner.credits;
  const jackOut = findMove(cur, "runner", "runner.jackOut");
  assertDefined(jackOut, "jack-out move exists");
  cur = play(cur, "runner", jackOut!).state;

  assert(cur.run === null, "jacking out ends the run");
  assert(cur.log.some((e) => e.type === "jack-out"), "the jack-out is logged");
  assert(!cur.log.some((e) => e.type === "run-successful"), "no success is declared");
  assert(!cur.log.some((e) => e.type === "breach"), "no breach happens");
  const runEnd = cur.log.find((e) => e.type === "run-end");
  assertDefined(runEnd, "the run-end event is logged");
  assertEquals((runEnd as { successful: boolean }).successful, false, "the run ends unsuccessful");
  assertEquals(cur.runner.clicks, clicksBefore, "jacking out spends no clicks");
  assertEquals(cur.runner.credits, creditsBefore, "jacking out spends no credits");
});

// ---------------------------------------------------------------------------
// 2. Continue (rule 6.9.4d-f): pass ice and approach the next one
// ---------------------------------------------------------------------------

Deno.test("movement: continueRun passes the ice and approaches the next position", () => {
  let cur = corpTurnWithIceOnRemote(["tithe", "tithe"], 2);
  cur = runServer(cur, "remote-1");
  cur = corpRezzesInWindow(cur); // outer ice rezzed -> encounter
  const resolve = findMove(cur, "runner", "runner.resolveSubroutines");
  assertDefined(resolve, "the Runner can resolve the encounter");
  cur = play(cur, "runner", resolve!).state;

  // Encounter done: the run parks in the movement phase at the outer ice.
  assertEquals(cur.run?.phase, "movement", "the run parks after the encounter");
  assertEquals(cur.run?.position, 1, "still at the outer ice position");
  assert(moveKinds(cur, "runner").includes("runner.continueRun"), "continue is offered");

  const cont = findMove(cur, "runner", "runner.continueRun");
  assertDefined(cont, "continueRun move exists");
  cur = play(cur, "runner", cont!).state;

  // Passed the outer ice and moved inward: now approaching the inner ice.
  assertEquals(cur.run?.phase, "approach-ice", "continueRun advances to the approach-ice phase");
  assertEquals(cur.run?.position, 0, "the position moved inward");
  assert(
    cur.log.some((e) => e.type === "pass-ice"),
    "passing the ice is logged",
  );
  assert(
    cur.log.some((e) => e.type === "approach-ice"),
    "approaching the next ice is logged",
  );

  // Inner ice unrezzed, corp passes: passed, movement parks again at the server.
  cur = corpPassesRezWindow(cur);
  assertEquals(cur.run?.phase, "movement", "the run parks again at the server position");
  assertEquals(cur.run?.position, null, "no ice left inward");
  cur = play(cur, "runner", findMove(cur, "runner", "runner.continueRun")!).state;
  assert(cur.log.some((e) => e.type === "run-successful"), "the run is declared successful");
  assertEquals(cur.runner.successfulRunThisTurn, true, "successfulRunThisTurn is set");
});

// ---------------------------------------------------------------------------
// 3. Runs past only unrezzed ice still declare success (rule 6.7.2)
// ---------------------------------------------------------------------------

Deno.test("movement: a run past only unrezzed ice declares success and breaches", () => {
  let cur = corpTurnWithIceOnRemote(["tithe"], 1);
  cur = runServer(cur, "remote-1");
  cur = corpPassesRezWindow(cur); // the only ice is never rezzed

  assertEquals(cur.run?.phase, "movement", "the run parks at the server");
  assert(!cur.log.some((e) => e.type === "run-successful"), "not yet successful while parked");

  cur = play(cur, "runner", findMove(cur, "runner", "runner.continueRun")!).state;

  assert(cur.log.some((e) => e.type === "run-successful"), "run-successful event fires");
  assert(cur.log.some((e) => e.type === "breach"), "a breach follows");
  assertEquals(cur.runner.successfulRunThisTurn, true, "successfulRunThisTurn is set");
  const runEnd = cur.log.find((e) => e.type === "run-end");
  assertDefined(runEnd, "the run ends");
  assertEquals((runEnd as { successful: boolean }).successful, true, "the run ends successful");
});

// ---------------------------------------------------------------------------
// 4. Regression: a rezzed-ice run still declares success via the new path
// ---------------------------------------------------------------------------

Deno.test("movement: a rezzed-ice run declares success through the movement phase", () => {
  let cur = corpTurnWithIceOnRemote(["tithe"], 1);
  cur = runServer(cur, "remote-1");
  cur = corpRezzesInWindow(cur); // ice rezzed -> encounter
  cur = play(cur, "runner", findMove(cur, "runner", "runner.resolveSubroutines")!).state;

  assertEquals(cur.run?.phase, "movement", "the run parks in the movement phase");
  assertEquals(cur.run?.position, 0, "at the innermost (only) ice");
  assert(
    moveKinds(cur, "runner").includes("runner.jackOut"),
    "jack-out offered after the encounter",
  );

  cur = play(cur, "runner", findMove(cur, "runner", "runner.continueRun")!).state;

  assert(cur.log.some((e) => e.type === "run-successful"), "run-successful event fires");
  assert(cur.log.some((e) => e.type === "breach"), "a breach follows");
  assertEquals(cur.runner.successfulRunThisTurn, true, "successfulRunThisTurn is set");
  const runEnd = cur.log.find((e) => e.type === "run-end");
  assertDefined(runEnd, "the run ends");
  assertEquals((runEnd as { successful: boolean }).successful, true, "the run ends successful");
});

// ---------------------------------------------------------------------------
// 5. Carmen's discount after a successful run this turn (apply.ts cost-2)
// ---------------------------------------------------------------------------

Deno.test("movement: Carmen installs for cost-2 after a successful run this turn", () => {
  const seed = findCarmenSeed();
  if (seed === null) {
    console.log("no seed has Carmen in the Runner's opening hand — skip");
    return;
  }
  let cur = newStarterGame(seed);
  assert(
    cur.runner.hand.some((c) => c.cardId === "carmen"),
    "the Runner's opening hand has Carmen",
  );
  cur = endCorpTurn(cur);

  // Give the Runner 4 credits so the printed cost (5) is unaffordable without
  // the discount (fixture tweak on a copy, like the purity tests' drawMode).
  cur = JSON.parse(JSON.stringify(cur)) as GameState;
  cur.runner.credits = 4;
  const carmenCost = cardDef("carmen").cost ?? 0;

  const before = engine.getLegalMoves(cur, "runner").filter(
    (m) => m.kind === "runner.install" && m.cardId === "carmen",
  );
  assertEquals(before.length, 0, "Carmen is not installable at 4 credits before a successful run");

  // Run HQ (no ice), continue through the movement phase, finish the breach.
  cur = runServer(cur, "hq");
  assertEquals(cur.run?.phase, "movement", "the HQ run parks in the movement phase");
  cur = play(cur, "runner", findMove(cur, "runner", "runner.continueRun")!).state;
  assert(cur.log.some((e) => e.type === "run-successful"), "the HQ run is successful");
  assertEquals(cur.runner.successfulRunThisTurn, true, "successfulRunThisTurn is set");
  cur = driveBreach(cur);
  assert(cur.run === null, "the run is over");

  const install = engine.getLegalMoves(cur, "runner").find(
    (m) => m.kind === "runner.install" && m.cardId === "carmen",
  );
  assertDefined(install, "Carmen is installable after a successful run this turn");
  const after = play(cur, "runner", install!).state;
  assertEquals(
    after.runner.credits,
    4 - (carmenCost - 2),
    `Carmen cost ${carmenCost} minus the 2-credit discount (4 -> ${4 - (carmenCost - 2)})`,
  );
  assert(after.runner.installed.some((c) => c.cardId === "carmen"), "Carmen is installed");
});

// ---------------------------------------------------------------------------
// 6. Manegarm toll fires on the continue path (approach-server, rule 6.9.4g)
// ---------------------------------------------------------------------------

Deno.test("movement: the Manegarm toll prompt fires when continuing to the server", () => {
  let cur = newGameWithCorpHand(["manegarm_skunkworks", "tithe"], 3);
  // Ice first (creates the remote), then the upgrade into it.
  const ice = engine.getLegalMoves(cur, "corp").find(
    (m) => m.kind === "corp.install" && m.cardId === "tithe" && m.server === "new-remote",
  );
  assertDefined(ice, "corp can install the ice in a new remote");
  cur = play(cur, "corp", ice!).state;
  const upgrade = engine.getLegalMoves(cur, "corp").find(
    (m) =>
      m.kind === "corp.install" && m.cardId === "manegarm_skunkworks" && m.server === "remote-1",
  );
  assertDefined(upgrade, "corp can install the upgrade in the remote");
  cur = play(cur, "corp", upgrade!).state;
  const root = cur.servers.find((s) => s.id === "remote-1")!.root[0]!;
  const rez = engine.getLegalMoves(cur, "corp").find(
    (m) => m.kind === "corp.rez" && m.targetId === root.id,
  );
  assertDefined(rez, "corp can rez the upgrade in its action phase");
  cur = play(cur, "corp", rez!).state;
  cur = endCorpTurn(cur);

  cur = runServer(cur, "remote-1");
  cur = corpPassesRezWindow(cur); // tithe stays unrezzed and is passed
  assertEquals(cur.run?.phase, "movement", "the run parks at the server");
  assert(!cur.prompts.some((p) => p.kind === "choose-one"), "no toll prompt while parked");

  cur = play(cur, "runner", findMove(cur, "runner", "runner.continueRun")!).state;
  const toll = cur.prompts.find((p) => p.kind === "choose-one");
  assertDefined(toll, "the Manegarm toll prompt fires on continue (approach server)");
  if (toll?.kind === "choose-one") {
    assert(
      toll.options.some((o) => o.id === "toll-credits") &&
        toll.options.some((o) => o.id === "toll-clicks"),
      "the toll offers credits or clicks",
    );
  }
});
