/**
 * The AI information boundary (rules 10.2, 1.21, 4.2.2, 4.3.2, 4.3.4).
 *
 * The subject of this file used to be "the UCT AI is invariant to the
 * opponent's deck order"; with the UCT AI gone, that property now belongs to
 * the boundary itself:
 *
 * (a) determinization invariance — two true states that differ ONLY in hidden
 *     order (opponent deck order, hand order, own deck order) produce the
 *     identical view, context, and therefore identical `determinize` output
 *     and identical AI decisions for the same seed. What an AI cannot see, it
 *     cannot plan around.
 *
 * (b) context hygiene — `makeAIDecisionContext` output contains no card
 *     instance ids and nothing derived from `state.rngState` beyond the
 *     caller-supplied seed.
 */

import {
  decisionSeedFor,
  determinize,
  engine,
  makeAIDecisionContext,
  makeRng,
  RandomAI,
  starterDeckConfigs,
} from "../src/mod.ts";
import type { AIDecisionContext, GameState, PlayerSide, PlayerView } from "../src/types.ts";
import { starterFixtures } from "../src/testing/fixtures.ts";
import { decide } from "./helpers/boundary.ts";
import { assert, assertEquals } from "./helpers/assert.ts";

/** Advance a game `steps` decisions with RandomAI (through the boundary). */
function randomGame(seed: number, steps: number): GameState {
  const decks = starterFixtures();
  let state = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
  const ai = new RandomAI();
  for (let i = 0; i < steps && !state.winner; i++) {
    const actor: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
    const legal = engine.getLegalMoves(state, actor);
    if (legal.length === 0) break;
    const result = engine.applyMove(state, actor, decide(ai, state, actor, legal, i));
    if (result.kind === "illegal-move") break;
    state = result.state;
  }
  return state;
}

/** Permute an array in place with a fixed xorshift stream (order-only change). */
function permute<T>(list: T[], streamSeed: number): void {
  let s = streamSeed | 0;
  for (let i = list.length - 1; i > 0; i--) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const j = Math.abs(s) % (i + 1);
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
  }
}

/**
 * A copy of `state` that differs ONLY in hidden card order: the opponent's
 * deck, the opponent's hand, and the deciding player's own deck are permuted.
 * Everything visible is untouched.
 */
function reorderHidden(state: GameState, side: PlayerSide, streamSeed: number): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  const opponent: PlayerSide = side === "corp" ? "runner" : "corp";
  permute(s[opponent].deck, streamSeed);
  permute(s[opponent].hand, streamSeed + 1);
  permute(s[side].deck, streamSeed + 2);
  return s;
}

function actorOf(state: GameState): PlayerSide {
  return state.prompts[0]?.player ?? state.turn.player;
}

// ---------------------------------------------------------------------------
// (a) Determinization invariance
// ---------------------------------------------------------------------------

Deno.test("hidden info: determinize ignores the order of every hidden zone", () => {
  for (const seed of [1, 7, 42, 99, 2024]) {
    const state = randomGame(seed, 6);
    const actor = actorOf(state);
    const legal = engine.getLegalMoves(state, actor);
    if (legal.length < 2) continue;

    const view: PlayerView = engine.getPlayerView(state, actor);
    const ctx: AIDecisionContext = makeAIDecisionContext(state, actor, seed);
    const shuffled = reorderHidden(state, actor, seed * 7919);

    // The view and the context cannot distinguish the two true states...
    assertEquals(
      engine.getPlayerView(shuffled, actor),
      view,
      `seed ${seed}: the view leaked hidden order`,
    );
    assertEquals(
      makeAIDecisionContext(shuffled, actor, seed),
      ctx,
      `seed ${seed}: the context leaked hidden order`,
    );

    // ...so the hypothetical worlds must be identical.
    const d1 = determinize(view, ctx, makeRng(seed));
    const d2 = determinize(engine.getPlayerView(shuffled, actor), ctx, makeRng(seed));
    assertEquals(d2, d1, `seed ${seed}: determinize output depended on hidden order`);

    // And so must the placeholder AI's decision.
    assertEquals(
      decide(new RandomAI(), shuffled, actor, legal, seed),
      decide(new RandomAI(), state, actor, legal, seed),
      `seed ${seed}: AI decision changed when hidden order changed`,
    );
  }
});

Deno.test("hidden info: determinize works for both sides at the same position", () => {
  const state = randomGame(42, 9);
  for (const side of ["corp", "runner"] as const) {
    const view = engine.getPlayerView(state, side);
    const ctx = makeAIDecisionContext(state, side, 5);
    const det = determinize(view, ctx, makeRng(5));
    assertEquals(
      engine.getPlayerView(det, side),
      view,
      `${side}: round-trip failed mid-game`,
    );
  }
});

// ---------------------------------------------------------------------------
// (b) Context hygiene
// ---------------------------------------------------------------------------

Deno.test("hidden info: the context carries no instance ids and no rngState", () => {
  for (const seed of [3, 11, 77]) {
    const state = randomGame(seed, 8);
    for (const side of ["corp", "runner"] as const) {
      const ctx = makeAIDecisionContext(state, side, 123456);

      // Only definition ids: no `corp-12`-style instance ids anywhere.
      const json = JSON.stringify(ctx);
      assert(
        !/\b(corp|runner)-\d+\b/.test(json),
        `${side}: context leaked an instance id: ${json.slice(0, 200)}`,
      );

      // Shape: exactly the four documented fields.
      assertEquals(Object.keys(ctx).sort(), ["ownDeck", "seed", "side", "unseen"]);
      assertEquals(ctx.seed, 123456, "the seed is the caller's, verbatim");

      // Nothing in the context depends on state.rngState: changing it (with
      // the same caller seed) must not change the context.
      const mutated = JSON.parse(JSON.stringify(state)) as GameState;
      mutated.rngState = (mutated.rngState ^ 0x5f3759df) | 0;
      assertEquals(
        makeAIDecisionContext(mutated, side, 123456),
        ctx,
        `${side}: context depended on state.rngState`,
      );
    }
  }
});

Deno.test("hidden info: the decision seed is a pure function of the view", () => {
  for (const seed of [3, 11, 77]) {
    const state = randomGame(seed, 8);
    const actor = actorOf(state);
    const view = engine.getPlayerView(state, actor);

    // Same observable state, different hidden order AND different rngState.
    const shuffled = reorderHidden(state, actor, seed * 104729);
    shuffled.rngState = (shuffled.rngState ^ 0x5f3759df) | 0;
    const shuffledView = engine.getPlayerView(shuffled, actor);
    assertEquals(
      decisionSeedFor(shuffledView),
      decisionSeedFor(view),
      `seed ${seed}: the decision seed depended on hidden state`,
    );

    // With self-derived seeds the boundary inputs — and therefore a sampling
    // AI's pick — are identical across the two true states. (This is the
    // regression test for deriving seeds from state.rngState: an XOR mix of
    // rngState is invertible and would hand the AI the game's PRNG state.)
    assertEquals(
      makeAIDecisionContext(shuffled, actor, decisionSeedFor(shuffledView)),
      makeAIDecisionContext(state, actor, decisionSeedFor(view)),
      `seed ${seed}: boundary inputs differed across hidden state`,
    );
    const legal = engine.getLegalMoves(state, actor);
    if (legal.length >= 2) {
      assertEquals(
        decide(new RandomAI(), shuffled, actor, legal, decisionSeedFor(shuffledView)),
        decide(new RandomAI(), state, actor, legal, decisionSeedFor(view)),
        `seed ${seed}: the pick changed when hidden state changed`,
      );
    }
  }
});

Deno.test("hidden info: determinize output never echoes the true rngState", () => {
  const state = randomGame(7, 5);
  const actor = actorOf(state);
  const ctx = makeAIDecisionContext(state, actor, 4242);
  const det = determinize(engine.getPlayerView(state, actor), ctx, makeRng(4242));
  // The hypothesis is seeded from the passed rng's state, which derives from
  // ctx.seed — not from the game's rngState.
  assert(det.rngState !== state.rngState, "hypothesis rngState equals the game's rngState");
});

Deno.test("hidden info: the real game always draws from the top of the deck", () => {
  const decks = starterDeckConfigs();
  const state = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed: 42,
  });
  assert(state.drawMode === "top", "real games draw from the top of the deck");

  // Hypothetical worlds are seeded with "random" draws (see determinize), so
  // a playout cannot plan around a memorised order (rules 10.2.2, 4.3.4).
  const ctx = makeAIDecisionContext(state, "corp", 9);
  const det = determinize(engine.getPlayerView(state, "corp"), ctx, makeRng(9));
  assert(det.drawMode === "random", "hypotheses draw randomly, not from the top");
});
