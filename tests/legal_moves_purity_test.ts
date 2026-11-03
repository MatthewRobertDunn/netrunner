/**
 * Purity of move enumeration and AI decisions.
 *
 * `getLegalMoves` must be a pure function of the state: listing legal moves
 * (rule 7.3.4 candidates included) must never advance `state.rngState` or
 * touch any other state field. The random hand/deck access is only sampled
 * when `runner.accessRandom` is *applied* — enumerating the move only states
 * that random candidates exist. `RandomAI` likewise owns its PRNG and never
 * touches the game's.
 */

import { engine, RandomAI, starterDeckConfigs } from "../src/mod.ts";
import {
  continueRun,
  endCorpTurn,
  newGameWithCorpHand,
  newStarterGame,
  play,
} from "./helpers/fixtures.ts";
import type { GameState, Move, PlayerSide } from "../src/types.ts";
import { isCorpInstall } from "../src/types.ts";
import { decide } from "./helpers/boundary.ts";
import { assert, assertEquals, deepClone } from "./helpers/assert.ts";

/**
 * HQ breach with random candidates pending: the runner ran HQ and the breach
 * is waiting for the runner's access choice among the corp's hand cards.
 */
function hqBreachState(seed = 3): GameState {
  let state = newStarterGame(seed);
  state = endCorpTurn(state);
  const run = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "run" && m.server === "hq",
  );
  assert(run && run.kind === "run", "runner can run HQ");
  const after = continueRun(play(state, "runner", run));
  assert(after.breach !== null, "the HQ run reaches a breach");
  assert(after.breach!.accessing === undefined, "the access choice is pending");
  return after;
}

/**
 * R&D breach with one specific and one random candidate: the corp installed
 * the Manegarm Skunkworks upgrade in the R&D root, so the runner chooses
 * between it and the (random) top card of R&D.
 */
function rdChoiceState(seed = 3): GameState {
  let state = newGameWithCorpHand(["manegarm_skunkworks"], seed);
  const install = engine.getLegalMoves(state, "corp").find(
    (m) => isCorpInstall(m) && m.cardId === "manegarm_skunkworks" && m.server === "rd",
  );
  assert(install && install.kind === "install", "corp can install the upgrade in R&D");
  state = play(state, "corp", install);
  state = endCorpTurn(state);
  const run = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "run" && m.server === "rd",
  );
  assert(run && run.kind === "run", "runner can run R&D");
  let after = continueRun(play(state, "runner", run));
  // Continuing to the server opens the Corp's (R) rez window (6.9.4e — the
  // facedown upgrade in the root); the Corp passes it so the breach below
  // sees the same facedown candidate the test pins.
  const windowPrompt = after.prompts[0];
  if (windowPrompt?.kind === "rez-window") {
    const pass = engine.getLegalMoves(after, "corp").find(
      (m) => m.kind === "prompt.answer" && m.optionId === "pass",
    );
    assert(pass !== undefined, "corp can pass the server-approach rez window");
    after = play(after, "corp", pass!);
  }
  assert(after.breach !== null, "the R&D run reaches a breach");
  assert(after.breach!.accessing === undefined, "the access choice is pending");
  return after;
}

// ---------------------------------------------------------------------------
// Purity of getLegalMoves
// ---------------------------------------------------------------------------

function assertPure(state: GameState, side: PlayerSide): void {
  const before = JSON.stringify(state);
  const rngBefore = state.rngState;
  const legal = engine.getLegalMoves(state, side);
  assertEquals(
    JSON.stringify(state),
    before,
    `getLegalMoves(${side}) mutated the game state`,
  );
  assertEquals(state.rngState, rngBefore, `getLegalMoves(${side}) advanced the PRNG`);
  return void legal;
}

Deno.test("purity: getLegalMoves never mutates the state across random games", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const decks = starterDeckConfigs();
    let state = engine.startGame({
      corp: decks.corp,
      runner: decks.runner,
      mode: "starter-decks",
      seed,
    });
    for (let i = 0; i < 300 && !state.winner; i++) {
      // Both sides: even a side with no decisions must not perturb the state.
      assertPure(state, "corp");
      assertPure(state, "runner");
      const side: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
      const legal = engine.getLegalMoves(state, side);
      if (legal.length === 0) break;
      const idx = i % legal.length;
      const move: Move = legal[idx]!;
      const result = engine.applyMove(state, side, move);
      if (result.kind === "illegal-move") break;
      state = result.state;
    }
  }
});

Deno.test("purity: breach states with random candidates stay identical", async (t) => {
  await t.step("HQ breach (random-only candidates)", () => {
    const state = hqBreachState();
    assertPure(state, "runner");
    assertPure(state, "corp");

    const legal = engine.getLegalMoves(state, "runner");
    assert(
      legal.some((m) => m.kind === "accessRandom"),
      "accessRandom is offered whenever random candidates exist",
    );
    // Repeated enumeration yields the same moves (no hidden state advance).
    const again = engine.getLegalMoves(state, "runner");
    assertEquals(again, legal, "enumeration is stable across calls");
  });

  await t.step("R&D breach (a specific and a random candidate)", () => {
    const state = rdChoiceState();
    assertPure(state, "runner");
    assertPure(state, "corp");

    const legal = engine.getLegalMoves(state, "runner");
    assert(
      legal.some((m) => m.kind === "accessCard"),
      "the specific (root) candidate is offered",
    );
    assert(
      legal.some((m) => m.kind === "accessRandom"),
      "the random (top of R&D) candidate is offered",
    );
  });
});

Deno.test("purity: every offered move is accepted by applyMove (offered ⇒ applies)", () => {
  // Br lesson: legal-moves once offered a choose-one option (Brân's install-ice-
  // inward) that applyMove rejected — the enumerator and the applier disagreed.
  // Enumerating is cheap; asserting every offer applies closes that class.
  for (let seed = 1; seed <= 12; seed++) {
    const decks = starterDeckConfigs();
    let state = engine.startGame({
      corp: decks.corp,
      runner: decks.runner,
      mode: "starter-decks",
      seed,
    });
    for (let i = 0; i < 250 && !state.winner; i++) {
      const side: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
      const legal = engine.getLegalMoves(state, side);
      for (const move of legal) {
        const result = engine.applyMove(state, side, move);
        if (result.kind === "illegal-move") {
          throw new Error(
            `offered ⇒ applies violated: ${JSON.stringify(move)} for ${side} was ` +
              `rejected as illegal (seed ${seed}, step ${i}): ${result.reason}`,
          );
        }
      }
      if (legal.length === 0) break;
      // Drive forward with a rotating pick to walk many states/positions.
      const applied = engine.applyMove(state, side, legal[i % legal.length]!);
      if (applied.kind === "illegal-move") break;
      state = applied.state;
    }
  }
});

Deno.test("purity: getLegalMoves is pure even in random-draw simulations", () => {
  // AI simulations run with drawMode "random"; enumeration must not sample
  // there either (the deck card is only picked when the access is applied).
  const state = rdChoiceState();
  const sim = deepClone(state) as GameState;
  sim.drawMode = "random";
  assertPure(sim, "runner");
});

// ---------------------------------------------------------------------------
// The random selection happens at apply time
// ---------------------------------------------------------------------------

Deno.test("purity: runner.accessRandom applies and advances the PRNG exactly at apply time", () => {
  const state = hqBreachState();
  const legal = engine.getLegalMoves(state, "runner");
  const accessRandom = legal.find((m) => m.kind === "accessRandom");
  assert(accessRandom && accessRandom.kind === "accessRandom", "move is offered");

  const rngBefore = state.rngState;
  const result = engine.applyMove(state, "runner", accessRandom);
  assert(result.kind === "applied", "accessRandom applies");
  assert(
    result.state.rngState !== rngBefore,
    "the PRNG advances when the random access is applied",
  );
  assert(result.state.breach!.accessing !== undefined, "a card is being accessed");
  // The chosen card is a corp hand card (the only random candidates here).
  const accessed = result.state.breach!.accessing!;
  assert(
    state.corp.hand.some((c) => c.id === accessed),
    "the random access chose a hand card",
  );
});

// ---------------------------------------------------------------------------
// RandomAI owns its PRNG
// ---------------------------------------------------------------------------

Deno.test("purity: RandomAI.chooseMove never touches state.rngState", () => {
  const state = newStarterGame(42);
  const legal = engine.getLegalMoves(state, "corp");
  assert(legal.length > 1, "the test needs a real choice");

  const before = JSON.stringify(state);
  const rngBefore = state.rngState;
  const ai = new RandomAI();
  for (let i = 0; i < 50; i++) decide(ai, state, "corp", legal, i);
  assertEquals(JSON.stringify(state), before, "chooseMove mutated the game state");
  assertEquals(state.rngState, rngBefore, "chooseMove advanced the game PRNG");
});

Deno.test("purity: RandomAI is deterministic for a fixed seed", () => {
  const state = newStarterGame(42);
  const legal = engine.getLegalMoves(state, "corp");
  const a = new RandomAI();
  const b = new RandomAI();
  for (let i = 0; i < 30; i++) {
    assertEquals(
      decide(a, state, "corp", legal, i),
      decide(b, state, "corp", legal, i),
      "same seed => same choice",
    );
  }
});
