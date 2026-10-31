/**
 * Red Team regression tests.
 *
 * Printed text: "When you install this resource, load 12[credit] onto it. When it
 * is empty, trash it. [click]: Run a central server you have not run this turn.
 * If successful, take 3[credit] from this resource."
 *
 *  - The click ability is *not* once per turn; its only restriction is the
 *    central-server choice ("a central server you have not run this turn"),
 *    which `legalityMoves` already enforces via
 *    `needsServer: "central-not-run-this-turn"`.
 *  - The run it initiates counts toward the same-central-twice restriction that
 *    Red Team imposes on all runs while it is installed (docs/rules-questions.md
 *    §8), so a subsequent basic `runner.run` on that central must be illegal.
 *  - The Runner can still use the ability repeatedly for different centrals that
 *    turn (there is no once-per-turn guard), and the ability itself must not be
 *    offered for a central already run this turn.
 */

import { engine, starterDeckConfigs } from "../src/mod.ts";
import type { CardId, DeckConfig, GameState, Move, PlayerSide } from "../src/types.ts";
import { continueRun, play } from "../src/testing/fixtures.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Runner deck whose opening hand starts with `first` (in order). */
function runnerDeckWithFirst(first: CardId[]): DeckConfig {
  const cfg = starterDeckConfigs().runner;
  const rest = cfg.cards.flatMap((e) => Array<CardId>(e.count).fill(e.cardId));
  for (const id of first) {
    const i = rest.indexOf(id);
    if (i < 0) throw new Error(`${id} is not in the runner starter pool`);
    rest.splice(i, 1);
  }
  const ordered = [...first, ...rest];
  const counts = new Map<string, number>();
  for (const id of ordered) counts.set(id, (counts.get(id) ?? 0) + 1);
  return {
    identity: cfg.identity,
    cards: [...counts].map(([cardId, count]) => ({ cardId, count })),
    orderedCards: ordered,
  };
}

function newGame(runnerFirst: CardId[] = []): GameState {
  return engine.startGame({
    corp: starterDeckConfigs().corp,
    runner: runnerDeckWithFirst(runnerFirst),
    mode: "starter-decks",
    seed: 3,
  });
}

/** Play first-legal moves until it is `side`'s turn (or the game ends). */
function burnUntil(state: GameState, side: PlayerSide): GameState {
  let cur = state;
  for (let i = 0; i < 60; i++) {
    if (cur.winner || cur.turn.player === side) return cur;
    const active = cur.turn.player;
    const moves = engine.getLegalMoves(cur, active);
    if (moves.length === 0) return cur;
    cur = play(cur, active, moves[0]!).state;
  }
  return cur;
}

/** Finish the current turn, then play first-legal moves until it is `side`'s turn. */
function nextTurnOf(state: GameState, side: PlayerSide): GameState {
  let cur = state;
  const starter = cur.turn.player;
  for (let i = 0; i < 60 && !cur.winner && cur.turn.player === starter; i++) {
    const moves = engine.getLegalMoves(cur, starter);
    if (moves.length === 0) break;
    cur = play(cur, starter, moves[0]!).state;
  }
  return burnUntil(cur, side);
}

/** Resolve an in-progress run/breach until it ends. */
function resolveRun(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 80; i++) {
    if (!cur.run || cur.winner) return cur;
    const moves = engine.getLegalMoves(cur, "runner");
    const m = moves.find((x) => x.kind === "runner.continueRun") ??
      moves.find((x) => x.kind === "runner.finishAccess") ??
      moves.find((x) => x.kind === "runner.accessCard" || x.kind === "runner.accessRandom") ??
      moves.find((x) => x.kind === "prompt.answer");
    if (m) {
      cur = play(cur, "runner", m).state;
      continue;
    }
    const corpMoves = engine.getLegalMoves(cur, "corp");
    if (corpMoves.length > 0) {
      cur = play(cur, "corp", corpMoves[0]!).state;
      continue;
    }
    return cur;
  }
  return cur;
}

/** The Red Team instance installed by the Runner (loaded with 12 credits). */
function installedRedTeam(state: GameState) {
  const card = state.runner.installed.find((c) => c.cardId === "red_team");
  return assertDefined(card, "Red Team is installed");
}

/** The legal `runner.ability` move that uses Red Team to run `server`. */
function redTeamRunMove(state: GameState, server: string): Move | undefined {
  return engine.getLegalMoves(state, "runner").find((m) =>
    m.kind === "runner.ability" && m.targetId === installedRedTeam(state).id &&
    m.abilityIndex === 0 && m.server === server
  );
}

/** Which `runner.run` targets are currently offered. */
function runTargets(state: GameState): string[] {
  return engine.getLegalMoves(state, "runner")
    .filter((m) => m.kind === "runner.run")
    .map((m) => (m as { server: string }).server);
}

/** A runner turn with Red Team installed (5 credits spent, 12 loaded onto it). */
function runnerTurnWithRedTeam(): GameState {
  let s = newGame(["red_team"]);
  s = burnUntil(s, "runner");
  s = play(s, "runner", { kind: "runner.install", cardId: "red_team" }).state;
  installedRedTeam(s); // asserts the install worked
  return s;
}

// ---------------------------------------------------------------------------
// The ability's run counts toward the same-central-twice restriction
// ---------------------------------------------------------------------------

Deno.test("red team: the ability's run counts toward the same-central-twice restriction", () => {
  let s = runnerTurnWithRedTeam();
  assert(s.runner.ranServersThisTurn.length === 0, "no server has been run yet this turn");

  const run = assertDefined(redTeamRunMove(s, "hq"), "the ability can run HQ");
  s = play(s, "runner", run).state;
  assert(s.run !== null, "the ability initiated a run");
  assertEquals(
    s.runner.ranServersThisTurn,
    ["hq"],
    "the ability's HQ run was recorded (like a basic runner.run)",
  );

  // The restriction applies while Red Team is installed, so the basic
  // `runner.run` move must not offer HQ again this turn.
  s = resolveRun(s);
  assert(!runTargets(s).includes("hq"), "a second basic run on HQ is not offered");
  assert(runTargets(s).includes("rd"), "R&D has not been run, so it is still offered");
  assert(
    runTargets(s).includes("archives"),
    "Archives has not been run, so it is still offered",
  );
});

Deno.test("red team: the ability's run restricts only the central it ran, and the basic move mirrors it", () => {
  let s = newGame(["red_team"]);
  s = burnUntil(s, "runner");
  s = play(s, "runner", { kind: "runner.install", cardId: "red_team" }).state;
  const red = installedRedTeam(s);

  // A basic run on Archives first: the restriction applies to that central only.
  s = play(s, "runner", { kind: "runner.run", server: "archives" }).state;
  assertEquals(s.runner.ranServersThisTurn, ["archives"], "archives is recorded");
  s = resolveRun(s);
  assert(!runTargets(s).includes("archives"), "archives cannot be run again this turn");
  assert(runTargets(s).includes("hq"), "HQ is still runnable with a basic move");

  // The Red Team ability itself only offers centrals not yet run.
  const offered = engine.getLegalMoves(s, "runner")
    .filter((m) => m.kind === "runner.ability" && m.targetId === red.id && m.abilityIndex === 0)
    .map((m) => (m as { server?: string }).server);
  assertEquals(offered.sort(), ["hq", "rd"], "the ability excludes the already-run central");

  // Using it on HQ keeps HQ restricted and leaves R&D alone.
  const use = assertDefined(
    engine.getLegalMoves(s, "runner").find((m) =>
      m.kind === "runner.ability" && m.targetId === red.id && m.abilityIndex === 0 &&
      m.server === "hq"
    ),
    "the ability can run HQ",
  );
  s = play(s, "runner", use).state;
  s = resolveRun(s);
  assert(!runTargets(s).includes("hq"), "HQ cannot be run again after the ability's run");
  assert(runTargets(s).includes("rd"), "R&D is still runnable");
});

// ---------------------------------------------------------------------------
// The ability is not once per turn (printed text has no such restriction)
// ---------------------------------------------------------------------------

Deno.test("red team: the ability is not once per turn (printed text has no once-per-turn)", () => {
  let s = newGame(["red_team"]);
  s = burnUntil(s, "runner");
  s = play(s, "runner", { kind: "runner.install", cardId: "red_team" }).state;

  // 4 clicks on the turn: 1 to install, 3 left — three ability uses plus the
  // run resolutions still fit inside the turn.
  for (const server of ["hq", "rd", "archives"]) {
    const use = redTeamRunMove(s, server);
    assertDefined(use, `the ability is offered again for ${server} (no once-per-turn)`);
    s = play(s, "runner", use!).state;
    s = resolveRun(s);
    assert(
      s.runner.ranServersThisTurn.includes(server as never),
      `${server} was recorded as run this turn`,
    );
  }
  assert(
    redTeamRunMove(s, "hq") === undefined,
    "after all three centrals are run the ability has no legal target",
  );
  assert(runTargets(s).length === 0, "no basic run is offered either (all centrals ran)");
});

Deno.test("red team: the restriction resets on the next runner turn", () => {
  let s = runnerTurnWithRedTeam();
  s = play(s, "runner", assertDefined(redTeamRunMove(s, "hq"), "the ability can run HQ")).state;
  s = resolveRun(s);
  assert(!runTargets(s).includes("hq"), "HQ is restricted for the rest of this turn");

  s = nextTurnOf(s, "runner");
  assertEquals(s.runner.ranServersThisTurn, [], "ranServersThisTurn is reset each turn");
  assert(runTargets(s).includes("hq"), "HQ is runnable again on a later turn");
  assert(
    redTeamRunMove(s, "hq") !== undefined,
    "the ability can run HQ again on a later turn",
  );
});

// ---------------------------------------------------------------------------
// The successful run pays out from the resource
// ---------------------------------------------------------------------------

Deno.test("red team: a successful ability run takes 3 credits from the resource", () => {
  let s = runnerTurnWithRedTeam();
  const red = installedRedTeam(s);
  assertEquals(red.hostedCredits, 12, "installing loaded 12 credits onto Red Team");
  const creditsBefore = s.runner.credits;
  s =
    play(s, "runner", assertDefined(redTeamRunMove(s, "archives"), "the ability can run archives"))
      .state;
  s = resolveRun(s);
  assertEquals(
    installedRedTeam(s).hostedCredits,
    9,
    "the successful run took 3 credits from the resource",
  );
  // The install already happened before creditsBefore was captured, so the
  // expected total is simply before + 3 (0 spent to run, +3 banked).
  assertEquals(s.runner.credits, creditsBefore + 3, "the Runner banked the 3 credits");
});

Deno.test("red team: Red Team is trashed when the resource is empty", () => {
  let s = newGame(["red_team"]);
  s = burnUntil(s, "runner");
  s = play(s, "runner", { kind: "runner.install", cardId: "red_team" }).state;

  // Drain the resource: use the ability four times, resolving each run.
  for (let i = 0; i < 4; i++) {
    const server = ["hq", "rd", "archives", "hq"][i]!;
    const use = redTeamRunMove(s, server);
    if (!use) break; // every central already ran this turn: only 3 centrals exist
    s = play(s, "runner", use).state;
    s = resolveRun(s);
  }
  // 12 credits minus 4 successful runs is impossible (only 3 centrals), so check
  // the empty-trash rule on the next turn where all centrals are available again.
  s = nextTurnOf(s, "runner");
  const left = installedRedTeam(s).hostedCredits ?? 0;
  assert(left <= 3, "at most one more run can drain the resource");
  if (left === 3) {
    const final = redTeamRunMove(s, "hq");
    if (final) {
      s = play(s, "runner", final).state;
      s = resolveRun(s);
    }
  }
  assert(
    s.runner.installed.every((c) => c.cardId !== "red_team"),
    "an empty Red Team is trashed ('When it is empty, trash it.')",
  );
});

// Silence unused import lint for `continueRun` when a variant is unused.
void continueRun;
