/**
 * Regression tests for icebreaker pump expiry (rule 3.9.5b/3.9.5d).
 *
 * A paid ability that modifies an icebreaker's strength lasts "for the
 * remainder of the current encounter"; used outside an encounter it expires at
 * the next checkpoint. Before the fix, `pumpIcebreaker` incremented
 * `strengthBoost` and nothing ever reset it, so pumps were permanent for the
 * rest of the game. The boost must now be cleared when an encounter ends and
 * when the run ends — and Unity's static "+X = installed icebreakers" strength
 * (which is recomputed on the fly, never stored in `strengthBoost`) must not
 * be clobbered by that sweep.
 *
 * All scenarios use ordered decks and a fixed seed, so they are deterministic.
 */

import { engine } from "../src/mod.ts";
import type { DeckConfig, GameState, Move } from "../src/types.ts";
import { orderedCorpDeck, play } from "../src/testing/fixtures.ts";
import { assert, assertDefined } from "./helpers/assert.ts";

const RUNNER_IDENTITY = "the_catalyst_convention_breaker";

/** Filler cards so the ordered decks survive several draws. */
const CORP_FILLER = Array.from({ length: 25 }, () => "hedge_fund");
const RUNNER_FILLER = Array.from({ length: 20 }, () => "sure_gamble");

/** A runner deck whose top-to-bottom order is exactly `ordered`. */
function orderedRunnerDeck(ordered: string[]): DeckConfig {
  const counts = new Map<string, number>();
  for (const id of ordered) counts.set(id, (counts.get(id) ?? 0) + 1);
  return {
    identity: RUNNER_IDENTITY,
    cards: [...counts].map(([cardId, count]) => ({ cardId, count })),
    orderedCards: ordered,
  };
}

function startGame(corpOrdered: string[], runnerOrdered: string[], seed = 1): GameState {
  return engine.startGame({
    corp: orderedCorpDeck([...corpOrdered, ...CORP_FILLER]),
    runner: orderedRunnerDeck([...runnerOrdered, ...RUNNER_FILLER]),
    mode: "starter-decks",
    seed,
  });
}

/** Spend corp clicks (and answer any discard prompt) until it is the Runner's turn. */
function endCorpTurn(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 15 && cur.turn.player === "corp" && !cur.winner; i++) {
    const moves = engine.getLegalMoves(cur, "corp");
    if (moves.length === 0) break;
    const move = moves.find((m) => m.kind === "corp.gainCredits") ?? moves[0]!;
    cur = play(cur, "corp", move).state;
  }
  return cur;
}

/** Corp turn 1: install the first hand card (ice) on HQ, then end the turn. */
function corpInstallIceOnHqAndEndTurn(state: GameState): GameState {
  const iceId = state.corp.hand[0]!.cardId;
  const install = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.install" && m.cardId === iceId && m.server === "hq",
  );
  assertDefined(install, `corp can install ${iceId} on HQ`);
  return endCorpTurn(play(state, "corp", install!).state);
}

function sureGamble(state: GameState): GameState {
  return play(state, "runner", { kind: "runner.playEvent", cardId: "sure_gamble" }).state;
}

function installProgram(state: GameState, cardId: string): GameState {
  const move = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "runner.install" && m.cardId === cardId,
  );
  assertDefined(move, `runner can install ${cardId}`);
  return play(state, "runner", move!).state;
}

function runHq(state: GameState): GameState {
  const move = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "runner.run" && m.server === "hq",
  );
  assertDefined(move, "runner can run HQ");
  return play(state, "runner", move!).state;
}

/** Corp answers the pending rez window by rezzing the approached ice. */
function corpRezApproachedIce(state: GameState): GameState {
  const prompt = state.prompts[0];
  assert(prompt && prompt.kind === "rez-window", "expected a pending corp rez window");
  const option = prompt.options.find((o) => o.targetId);
  assertDefined(option, "rez window has a rez option");
  return play(state, "corp", {
    kind: "prompt.answer",
    player: "corp",
    promptId: prompt.id,
    optionId: option!.id,
  }).state;
}

/** Play runner run-phase/access moves until the run fully ends. */
function drainRun(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 20 && cur.run !== null && !cur.winner; i++) {
    const moves = engine.getLegalMoves(cur, "runner");
    // Prefer progressing the run; jack out only as a last resort.
    const move = moves.find((m) => m.kind === "runner.continueRun") ??
      moves.find((m) =>
        m.kind === "runner.accessRandom" || m.kind === "runner.accessCard" ||
        m.kind === "runner.finishAccess"
      ) ??
      moves.find((m) => m.kind === "runner.resolveSubroutines") ??
      moves.find((m) => m.kind === "runner.jackOut");
    if (!move) break;
    cur = play(cur, "runner", move).state;
  }
  return cur;
}

function installed(state: GameState, cardId: string) {
  return assertDefined(
    state.runner.installed.find((c) => c.cardId === cardId),
    `${cardId} is installed`,
  );
}

function pumpMove(state: GameState, programId: string): Move {
  const move = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "runner.pumpIcebreaker" && m.programId === programId,
  );
  assertDefined(move, `pump move offered for ${programId}`);
  return move!;
}

function breakMove(state: GameState, programId: string, subIndex: number): Move {
  const move = engine.getLegalMoves(state, "runner").find(
    (m) =>
      m.kind === "runner.breakSubroutine" && m.programId === programId && m.subIndex === subIndex,
  );
  assertDefined(move, `break move offered for sub ${subIndex}`);
  return move!;
}

const RUNNER_HAND = [
  "sure_gamble",
  "cleaver",
  "carmen",
  "sure_gamble",
  "sure_gamble",
  "mayfly",
  "unity",
  "docklands_pass",
  "telework_contract",
  "cleaver",
];

Deno.test("pump: strength boost expires when the encounter ends", () => {
  let state = startGame(["tithe", "hedge_fund", "hedge_fund"], RUNNER_HAND);
  state = corpInstallIceOnHqAndEndTurn(state);
  state = sureGamble(state);
  state = installProgram(state, "carmen");
  state = runHq(state);
  state = corpRezApproachedIce(state);

  // Encounter with rezzed Tithe (sentry, strength 1); Carmen (strength 2) pumps +3.
  const carmen = installed(state, "carmen");
  assert(state.run?.phase === "encounter-ice", "encounter in progress");
  state = play(state, "runner", pumpMove(state, carmen.id)).state;
  assert(
    installed(state, "carmen").strengthBoost === 3,
    "pump recorded a +3 strengthBoost during the encounter",
  );

  // Break both subroutines; the encounter completes while the run continues.
  state = play(state, "runner", breakMove(state, carmen.id, 0)).state;
  state = play(state, "runner", breakMove(state, carmen.id, 1)).state;
  assert(state.run !== null, "the run is still active after the encounter");
  assert(
    state.run!.phase !== "encounter-ice",
    `the encounter is over (phase ${state.run!.phase})`,
  );
  assert(
    installed(state, "carmen").strengthBoost === undefined,
    "strengthBoost is cleared at encounter end (rule 3.9.5b), before the run ends",
  );

  // Ending the run must not resurrect or matter either: still cleared.
  state = drainRun(state);
  assert(state.run === null, "run ended");
  assert(
    installed(state, "carmen").strengthBoost === undefined,
    "strengthBoost still cleared after the run ended",
  );
});

Deno.test("pump: strength boost expires when the run ends mid-encounter", () => {
  let state = startGame(["palisade", "hedge_fund", "hedge_fund"], RUNNER_HAND);
  state = corpInstallIceOnHqAndEndTurn(state);
  state = sureGamble(state);
  state = installProgram(state, "cleaver");
  state = runHq(state);
  state = corpRezApproachedIce(state);

  // Encounter with rezzed Palisade (barrier, strength 2, end-the-run sub).
  const cleaver = installed(state, "cleaver");
  state = play(state, "runner", pumpMove(state, cleaver.id)).state;
  assert(
    installed(state, "cleaver").strengthBoost === 1,
    "pump recorded a +1 strengthBoost during the encounter",
  );

  // Resolve the unbroken subroutine: Palisade ends the run mid-encounter, so
  // the encounter never "completes" — finishRun must clear the boost.
  const resolve = engine.getLegalMoves(state, "runner").find((m) =>
    m.kind === "runner.resolveSubroutines"
  );
  assertDefined(resolve, "resolveSubroutines offered");
  state = play(state, "runner", resolve!).state;
  assert(state.run === null, "the run ended (state.run is null)");
  assert(
    installed(state, "cleaver").strengthBoost === undefined,
    "strengthBoost is cleared when the run ends (rules 3.9.5b/3.9.5d)",
  );
});

Deno.test("pump: Unity's static +X strength is not a pump and survives the sweep", () => {
  const runnerDeck = [
    "unity",
    "cleaver",
    "sure_gamble",
    "carmen",
    "sure_gamble",
    "sure_gamble",
    "unity",
    "mayfly",
    "docklands_pass",
    "telework_contract",
  ];
  let state = startGame(["diviner", "hedge_fund", "hedge_fund"], runnerDeck);
  // Corp turn 1: install Diviner (code gate, strength 3) on HQ.
  state = corpInstallIceOnHqAndEndTurn(state);
  // Runner turn 1: sure_gamble (+6), install Unity (3) and Cleaver (3),
  // gain a credit. (Not Mayfly: it trashes when the first run ends — that
  // would drop Unity's icebreaker count below Diviner's strength for the
  // second run.)
  state = sureGamble(state);
  state = installProgram(state, "unity");
  state = installProgram(state, "cleaver");
  state = play(state, "runner", { kind: "runner.gainCredits" }).state;
  state = endCorpTurn(state);
  // Runner turn 2: gain a credit, sure_gamble (+9 net), install Carmen (3rd
  // icebreaker), run HQ. (Sure Gamble costs 5 and gains 9 here; without the
  // extra credit neither it nor Carmen's 5-credit install is affordable.)
  state = play(state, "runner", { kind: "runner.gainCredits" }).state;
  state = sureGamble(state);
  state = installProgram(state, "carmen");
  state = runHq(state);
  state = corpRezApproachedIce(state);

  const unity = installed(state, "unity");
  const cleaver = installed(state, "cleaver");
  // Unity's strength = installed icebreakers (3) >= Diviner's 3, so Unity can
  // interface even though its printed strength is 1 — the +X is static.
  assert(
    engine.getLegalMoves(state, "runner").some(
      (m) => m.kind === "runner.breakSubroutine" && m.programId === unity.id,
    ),
    "Unity (3 icebreakers installed) can break Diviner (strength 3)",
  );

  // Pumping Unity must do nothing: the move exists but only records a warning.
  state = play(state, "runner", pumpMove(state, unity.id)).state;
  assert(
    installed(state, "unity").strengthBoost === undefined,
    "Unity's strengthBoost is never written by a pump",
  );
  assert(
    state.supportWarnings.some((w) => w.includes("Unity")),
    "the static-strength support warning was recorded",
  );

  // Pump Cleaver, then break Diviner's subroutine with Unity; the encounter
  // completes while the run continues.
  state = play(state, "runner", pumpMove(state, cleaver.id)).state;
  assert(installed(state, "cleaver").strengthBoost === 1, "Cleaver pumped +1");
  state = play(state, "runner", breakMove(state, unity.id, 0)).state;
  assert(state.run !== null && state.run.phase !== "encounter-ice", "encounter over, run active");
  assert(
    installed(state, "cleaver").strengthBoost === undefined,
    "Cleaver's pump expired at encounter end",
  );
  assert(
    installed(state, "unity").strengthBoost === undefined,
    "the sweep left Unity's strengthBoost untouched (it was never set)",
  );

  // Second run on the same rezzed ice (next runner turn — turn 2's clicks are
  // spent): Unity's static +X must still be intact — if the sweep had cleared
  // a static bonus stored in strengthBoost, Unity's strength would drop to 1
  // and the break move below would not be offered.
  state = drainRun(state);
  state = endCorpTurn(state); // runner t2 clicks are spent; play out the corp turn
  state = runHq(state);
  assert(state.run?.phase === "encounter-ice", "second encounter begins");
  assert(
    engine.getLegalMoves(state, "runner").some(
      (m) => m.kind === "runner.breakSubroutine" && m.programId === unity.id,
    ),
    "Unity's static strength survives the pump-expiry sweep",
  );
  state = drainRun(state);
  assert(state.run === null, "final run ended");
});
