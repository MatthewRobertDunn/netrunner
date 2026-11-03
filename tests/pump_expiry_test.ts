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
import type { GameState, Move } from "../src/types.ts";
import { isCorpInstall } from "../src/types.ts";
import {
  endCorpTurn,
  orderedCorpDeck,
  orderedRunnerDeck,
  play,
  repeated,
} from "./helpers/fixtures.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

/**
 * Filler cards so the ordered decks survive several draws.
 *
 * Deliberate variant of the shared `CORP_FILLER` (see tests/helpers/fixtures.ts):
 * this scenario rezzes and runs the same HQ ice across two runner turns, so the
 * corp needs a deep, single-card-draw deck. The canonical 19-card pool would
 * run the scripted hand dry; 25 copies of hedge_fund guarantee the draws keep
 * coming without changing any test assertion.
 */
const CORP_FILLER_DRAW = repeated("hedge_fund", 25);
const RUNNER_FILLER_DRAW = repeated("sure_gamble", 20);

function startGame(corpOrdered: string[], runnerOrdered: string[], seed = 1): GameState {
  return engine.startGame({
    corp: orderedCorpDeck([...corpOrdered, ...CORP_FILLER_DRAW]),
    runner: orderedRunnerDeck([...runnerOrdered, ...RUNNER_FILLER_DRAW]),
    mode: "starter-decks",
    seed,
  });
}

/** Corp turn 1: install the first hand card (ice) on HQ, then end the turn. */
function corpInstallIceOnHqAndEndTurn(state: GameState): GameState {
  const iceId = state.corp.hand[0]!.cardId;
  const install = engine.getLegalMoves(state, "corp").find(
    (m) => isCorpInstall(m) && m.cardId === iceId && m.server === "hq",
  );
  assertDefined(install, `corp can install ${iceId} on HQ`);
  return endCorpTurn(play(state, "corp", install!), 15);
}

function sureGamble(state: GameState): GameState {
  return play(state, "runner", { kind: "playEvent", cardId: "sure_gamble" });
}

function installProgram(state: GameState, cardId: string): GameState {
  const move = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "install" && m.cardId === cardId,
  );
  assertDefined(move, `runner can install ${cardId}`);
  return play(state, "runner", move!);
}

function runHq(state: GameState): GameState {
  const move = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "run" && m.server === "hq",
  );
  assertDefined(move, "runner can run HQ");
  return play(state, "runner", move!);
}

/** Corp answers the pending rez window by rezzing the approached ice. */
function corpRezApproachedIce(state: GameState): GameState {
  const prompt = state.prompts[0];
  assert(prompt && prompt.kind === "rez-window", "expected a pending corp rez window");
  const option = prompt.options.find((o) => o.targetId);
  assertDefined(option, "rez window has a rez option");
  return play(state, "corp", {
    kind: "prompt.answer",
    promptId: prompt.id,
    optionId: option!.id,
  });
}

/** Play runner run-phase/access moves until the run fully ends. */
function drainRun(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 20 && cur.run !== null && !cur.winner; i++) {
    const moves = engine.getLegalMoves(cur, "runner");
    // Prefer progressing the run; jack out only as a last resort.
    const move = moves.find((m) => m.kind === "continueRun") ??
      moves.find((m) =>
        m.kind === "accessRandom" || m.kind === "accessCard" ||
        m.kind === "finishAccess"
      ) ??
      moves.find((m) => m.kind === "resolveSubroutines") ??
      moves.find((m) => m.kind === "jackOut");
    if (!move) break;
    cur = play(cur, "runner", move);
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
    (m) => m.kind === "pumpIcebreaker" && m.programId === programId,
  );
  assertDefined(move, `pump move offered for ${programId}`);
  return move!;
}

function breakMove(state: GameState, programId: string, subIndex: number): Move {
  const move = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "breakSubroutine" && m.programId === programId && m.subIndex === subIndex,
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

Deno.test("pump: strength boost expires at encounter end and when the run ends mid-encounter (rules 3.9.5b/3.9.5d)", async (t) => {
  await t.step("strength boost expires when the encounter ends", () => {
    let state = startGame(["tithe", "hedge_fund", "hedge_fund"], RUNNER_HAND);
    state = corpInstallIceOnHqAndEndTurn(state);
    state = sureGamble(state);
    state = installProgram(state, "carmen");
    state = runHq(state);
    state = corpRezApproachedIce(state);

    // Encounter with rezzed Tithe (sentry, strength 1); Carmen (strength 2) pumps +3.
    const carmen = installed(state, "carmen");
    assert(state.run?.phase === "encounter-ice", "encounter in progress");
    state = play(state, "runner", pumpMove(state, carmen.id));
    assert(
      installed(state, "carmen").strengthBoost === 3,
      "pump recorded a +3 strengthBoost during the encounter",
    );

    // Break both subroutines; the encounter completes while the run continues.
    state = play(state, "runner", breakMove(state, carmen.id, 0));
    state = play(state, "runner", breakMove(state, carmen.id, 1));
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

  await t.step("strength boost expires when the run ends mid-encounter", () => {
    let state = startGame(["palisade", "hedge_fund", "hedge_fund"], RUNNER_HAND);
    state = corpInstallIceOnHqAndEndTurn(state);
    state = sureGamble(state);
    state = installProgram(state, "cleaver");
    state = runHq(state);
    state = corpRezApproachedIce(state);

    // Encounter with rezzed Palisade (barrier, strength 2, end-the-run sub).
    const cleaver = installed(state, "cleaver");
    state = play(state, "runner", pumpMove(state, cleaver.id));
    assert(
      installed(state, "cleaver").strengthBoost === 1,
      "pump recorded a +1 strengthBoost during the encounter",
    );

    // Resolve the unbroken subroutine: Palisade ends the run mid-encounter, so
    // the encounter never "completes" — finishRun must clear the boost.
    const resolve = engine.getLegalMoves(state, "runner").find((m) =>
      m.kind === "resolveSubroutines"
    );
    assertDefined(resolve, "resolveSubroutines offered");
    state = play(state, "runner", resolve!);
    assert(state.run === null, "the run ended (state.run is null)");
    assert(
      installed(state, "cleaver").strengthBoost === undefined,
      "strengthBoost is cleared when the run ends (rules 3.9.5b/3.9.5d)",
    );
  });
});

Deno.test("pump: Unity's +X is a real pump (rule 3.9.5b), expired by the sweep", () => {
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
  state = play(state, "runner", { kind: "gainCredits" });
  state = endCorpTurn(state, 15);
  // Runner turn 2: gain a credit, sure_gamble (+9 net), install Carmen (3rd
  // icebreaker), run HQ. (Sure Gamble costs 5 and gains 9 here; without the
  // extra credit neither it nor Carmen's 5-credit install is affordable.)
  state = play(state, "runner", { kind: "gainCredits" });
  state = sureGamble(state);
  state = installProgram(state, "carmen");
  state = runHq(state);
  state = corpRezApproachedIce(state);

  const unity = installed(state, "unity");
  // Rule 3.9.5g: Unity interfaces only while its strength is >= the ice's.
  // Printed strength 1 < Diviner's 3, so no break move until it is pumped —
  // the "+X = installed icebreakers" boost is bought with credits, never free.
  assert(
    !engine.getLegalMoves(state, "runner").some(
      (m) => m.kind === "breakSubroutine" && m.programId === unity.id,
    ),
    "Unity at printed strength 1 cannot interface with Diviner (strength 3)",
  );

  // Pumping Unity is a real pump: +X for the encounter, X = installed
  // icebreakers including Unity itself (3 here), paid with 1 credit.
  const creditsBefore = state.runner.credits;
  state = play(state, "runner", pumpMove(state, unity.id));
  assertEquals(installed(state, "unity").strengthBoost, 3, "Unity pumped +3 (X = 3 breakers)");
  assertEquals(
    state.runner.credits,
    creditsBefore - 1,
    "the pump cost 1 credit",
  );
  assert(
    !state.supportWarnings.some((w) => w.includes("Unity")),
    "no static-strength support warning",
  );

  // The boosted strength opens the break move; break Diviner's subroutine
  // with Unity and the encounter completes while the run continues.
  state = play(state, "runner", breakMove(state, unity.id, 0));
  assert(state.run !== null && state.run.phase !== "encounter-ice", "encounter over, run active");
  assert(
    installed(state, "unity").strengthBoost === undefined,
    "Unity's pump expired at encounter end (rule 3.9.5b)",
  );

  // Second run on the same rezzed ice (next runner turn — turn 2's clicks are
  // spent): Unity is back to strength 1, so the break move is gone until the
  // runner pumps again — and the fresh pump re-evaluates X from the board.
  state = drainRun(state);
  state = endCorpTurn(state, 15); // runner t2 clicks are spent; play out the corp turn
  state = runHq(state);
  assert(state.run?.phase === "encounter-ice", "second encounter begins");
  assert(
    !engine.getLegalMoves(state, "runner").some(
      (m) => m.kind === "breakSubroutine" && m.programId === unity.id,
    ),
    "the sweep restored Unity to printed strength 1 (no free interface)",
  );
  state = play(state, "runner", pumpMove(state, unity.id));
  assertEquals(
    installed(state, "unity").strengthBoost,
    3,
    "the second pump re-evaluates X (still 3 icebreakers installed)",
  );
  state = play(state, "runner", breakMove(state, unity.id, 0));
  state = drainRun(state);
  assert(state.run === null, "final run ended");
});
