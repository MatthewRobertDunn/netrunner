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
import { newStarterGame, play } from "../src/testing/fixtures.ts";
import type { DeckConfig, GameState, Move, PlayerSide } from "../src/types.ts";
import { assert, assertEquals } from "./helpers/assert.ts";

// ---------------------------------------------------------------------------
// Fixtures: deterministic corp decks via `orderedCards`
// ---------------------------------------------------------------------------

const CORP_IDENTITY = "the_syndicate_profit_over_principle";

/** A corp deck whose top-to-bottom order is exactly `ordered`. */
function orderedCorpDeck(ordered: string[]): DeckConfig {
  const counts = new Map<string, number>();
  for (const id of ordered) counts.set(id, (counts.get(id) ?? 0) + 1);
  return {
    identity: CORP_IDENTITY,
    cards: [...counts].map(([cardId, count]) => ({ cardId, count })),
    orderedCards: ordered,
  };
}

/** Filler cards drawn from the corp starter pool (after the scripted hand). */
const CORP_FILLER = [
  "hedge_fund",
  "hedge_fund",
  "hedge_fund",
  "government_subsidy",
  "government_subsidy",
  "offworld_office",
  "offworld_office",
  "send_a_message",
  "send_a_message",
  "nico_campaign",
  "nico_campaign",
  "urtica_cipher",
  "urtica_cipher",
  "tithe",
  "tithe",
  "whitespace",
  "whitespace",
  "palisade",
  "palisade",
];

function newGameWithCorpOrder(hand: string[], seed = 3): GameState {
  const decks = starterDeckConfigs();
  return engine.startGame({
    corp: orderedCorpDeck([...hand, ...CORP_FILLER]),
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
}

/** Spend the corp's remaining clicks and answer its discard prompt, ending its turn. */
function endCorpTurn(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 10; i++) {
    if (cur.turn.player !== "corp" || cur.winner) break;
    const legal = engine.getLegalMoves(cur, "corp");
    if (legal.length === 0) break;
    const gain = legal.find((m) => m.kind === "corp.gainCredits") ?? legal[0]!;
    cur = play(cur, "corp", gain).state;
  }
  return cur;
}

/**
 * HQ breach with random candidates pending: the runner ran HQ and the breach
 * is waiting for the runner's access choice among the corp's hand cards.
 */
function hqBreachState(seed = 3): GameState {
  let state = newStarterGame(seed);
  state = endCorpTurn(state);
  const run = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "runner.run" && m.server === "hq",
  );
  assert(run && run.kind === "runner.run", "runner can run HQ");
  const after = play(state, "runner", run).state;
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
  let state = newGameWithCorpOrder(["manegarm_skunkworks"], seed);
  const install = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.install" && m.cardId === "manegarm_skunkworks" && m.server === "rd",
  );
  assert(install && install.kind === "corp.install", "corp can install the upgrade in R&D");
  state = play(state, "corp", install).state;
  state = endCorpTurn(state);
  const run = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "runner.run" && m.server === "rd",
  );
  assert(run && run.kind === "runner.run", "runner can run R&D");
  const after = play(state, "runner", run).state;
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

Deno.test("purity: HQ breach state with random candidates stays identical", () => {
  const state = hqBreachState();
  assertPure(state, "runner");
  assertPure(state, "corp");

  const legal = engine.getLegalMoves(state, "runner");
  assert(
    legal.some((m) => m.kind === "runner.accessRandom"),
    "accessRandom is offered whenever random candidates exist",
  );
  // Repeated enumeration yields the same moves (no hidden state advance).
  const again = engine.getLegalMoves(state, "runner");
  assertEquals(again, legal, "enumeration is stable across calls");
});

Deno.test("purity: R&D breach state with a specific and a random candidate stays identical", () => {
  const state = rdChoiceState();
  assertPure(state, "runner");
  assertPure(state, "corp");

  const legal = engine.getLegalMoves(state, "runner");
  assert(
    legal.some((m) => m.kind === "runner.accessCard"),
    "the specific (root) candidate is offered",
  );
  assert(
    legal.some((m) => m.kind === "runner.accessRandom"),
    "the random (top of R&D) candidate is offered",
  );
});

Deno.test("purity: getLegalMoves is pure even in random-draw simulations", () => {
  // AI simulations run with drawMode "random"; enumeration must not sample
  // there either (the deck card is only picked when the access is applied).
  const state = rdChoiceState();
  const sim = JSON.parse(JSON.stringify(state)) as GameState;
  sim.drawMode = "random";
  assertPure(sim, "runner");
});

// ---------------------------------------------------------------------------
// The random selection happens at apply time
// ---------------------------------------------------------------------------

Deno.test("purity: runner.accessRandom applies and advances the PRNG exactly at apply time", () => {
  const state = hqBreachState();
  const legal = engine.getLegalMoves(state, "runner");
  const accessRandom = legal.find((m) => m.kind === "runner.accessRandom");
  assert(accessRandom && accessRandom.kind === "runner.accessRandom", "move is offered");

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
  for (let i = 0; i < 50; i++) ai.chooseMove(state, "corp", legal);
  assertEquals(JSON.stringify(state), before, "chooseMove mutated the game state");
  assertEquals(state.rngState, rngBefore, "chooseMove advanced the game PRNG");
});

Deno.test("purity: RandomAI is deterministic for a fixed seed", () => {
  const state = newStarterGame(42);
  const legal = engine.getLegalMoves(state, "corp");
  const a = new RandomAI(1234);
  const b = new RandomAI(1234);
  for (let i = 0; i < 30; i++) {
    assertEquals(
      a.chooseMove(state, "corp", legal),
      b.chooseMove(state, "corp", legal),
      "same seed => same choice",
    );
  }
});
