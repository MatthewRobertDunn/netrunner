/**
 * Hidden information (rules 10.2.2, 4.3.4): the UCT AI must not be able to
 * plan around the exact order of the opponent's deck. Its decision at a given
 * position must be the same regardless of which card sits on top of the
 * opponent's deck, because the AI cannot see it.
 *
 * Implementation: simulations run with `drawMode: "random"`, so every draw
 * pulls a uniformly random card from the remaining deck instead of the top
 * one. The multiset of cards in the opponent's deck is still visible, which
 * is the accepted concession.
 */

import { engine, starterDeckConfigs, UctAI } from "../src/mod.ts";
import type { GameState } from "../src/types.ts";
import { assert } from "./helpers/assert.ts";

function swapTopTwo(state: GameState, side: "corp" | "runner"): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  const p = s[side];
  if (p.deck.length >= 2) {
    const tmp = p.deck[0]!;
    p.deck[0] = p.deck[1]!;
    p.deck[1] = tmp;
  }
  return s;
}

Deno.test("AI: decision is invariant to the opponent's deck order", () => {
  const ai = new UctAI({ iterations: 20, timeBudgetMs: 400 });

  for (const seed of [1, 7, 42, 99]) {
    const decks = starterDeckConfigs();
    let state = engine.startGame({
      corp: decks.corp,
      runner: decks.runner,
      mode: "starter-decks",
      seed,
    });

    // Advance a few turns so the AI has a non-trivial decision to make.
    for (let i = 0; i < 4 && !state.winner; i++) {
      const actor = state.prompts[0]?.player ?? state.turn.player;
      const legal = engine.getLegalMoves(state, actor);
      if (legal.length === 0) break;
      const r = engine.applyMove(state, actor, legal[0]!);
      if (r.kind === "illegal-move") break;
      state = r.state;
    }

    const actor = state.prompts[0]?.player ?? state.turn.player;
    const legal = engine.getLegalMoves(state, actor);
    if (legal.length < 2) continue;

    // The AI must not be able to see the opponent's deck order, so swapping
    // the top two cards of the opponent's deck must not change the decision.
    const opponent = actor === "corp" ? "runner" : "corp";
    const original = ai.chooseMove(state, actor, legal);
    const swapped = ai.chooseMove(swapTopTwo(state, opponent), actor, legal);

    assert(
      JSON.stringify(original) === JSON.stringify(swapped),
      `seed ${seed}: AI decision changed when the opponent's top card changed`,
    );
  }
});

Deno.test("AI: drawMode controls whether draws come from the top or randomly", () => {
  const decks = starterDeckConfigs();
  const state = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed: 42,
  });

  // The authoritative game always draws from the top of the deck.
  assert(state.drawMode === "top", "real games draw from the top of the deck");

  // In top mode, drawing takes deck[0].
  const topDown = JSON.parse(JSON.stringify(state)) as GameState;
  topDown.corp.clicks = 3;
  const topCard = topDown.corp.deck[0]!.cardId;
  const r1 = engine.applyMove(topDown, "corp", { kind: "corp.draw" });
  assert(r1.kind === "applied", "corp.draw applies");
  assert(
    r1.state.corp.hand[r1.state.corp.hand.length - 1]!.cardId === topCard,
    "top mode draws deck[0]",
  );

  // In random mode, drawing takes a random card each time. With a 28-card
  // deck there are many PRNG seeds for which the drawn card is not deck[0],
  // so the mode genuinely randomises draws (rather than always drawing the
  // top card regardless of the flag).
  const distinct = new Set(state.corp.deck.map((c) => c.cardId));
  if (distinct.size < 2) return; // nothing to randomise
  let randomDrawsNonTop = false;
  for (let rng = 0; rng < 100 && !randomDrawsNonTop; rng++) {
    const sim = JSON.parse(JSON.stringify(state)) as GameState;
    sim.corp.clicks = 3;
    sim.drawMode = "random";
    sim.rngState = rng;
    const r = engine.applyMove(sim, "corp", { kind: "corp.draw" });
    if (r.kind !== "applied") continue;
    const drawn = r.state.corp.hand[r.state.corp.hand.length - 1]?.cardId;
    if (drawn && drawn !== topCard) randomDrawsNonTop = true;
  }
  assert(
    randomDrawsNonTop,
    "random mode draws a card other than deck[0] for some PRNG seeds",
  );
});
