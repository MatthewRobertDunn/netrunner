/**
 * Regression tests for `getLegalMoves` soundness: every move it returns must
 * apply, and every applied move must change the game state.
 *
 * These are the properties the fuzz audit checks across 20 full games. They
 * are kept as tests so a future change that makes `getLegalMoves` offer an
 * illegal move or a no-op move fails loudly.
 */

import { engine, RandomAI, starterDeckConfigs } from "../src/mod.ts";
import type { GameState, Move, PlayerSide } from "../src/types.ts";
import { decide } from "./helpers/boundary.ts";
import { assert } from "./helpers/assert.ts";

function playRandomGame(
  seed: number,
  maxMoves: number,
): { state: GameState; illegalOffered: number; noopMoves: number } {
  const ai = new RandomAI();
  const decks = starterDeckConfigs();
  let state = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
  let illegalOffered = 0;
  let noopMoves = 0;

  for (let i = 0; i < maxMoves; i++) {
    if (state.winner) break;
    const side: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
    const legal = engine.getLegalMoves(state, side);
    if (legal.length === 0) break;

    const move = decide(ai, state, side, legal, i + 1);
    const result = engine.applyMove(state, side, move);
    if (result.kind === "illegal-move") {
      illegalOffered++;
      break;
    }

    const before = JSON.stringify(state);
    state = result.state;
    if (JSON.stringify(state) === before) noopMoves++;
  }

  return { state, illegalOffered, noopMoves };
}

Deno.test("legal moves: every offered move applies across 20 random games", () => {
  let illegalOffered = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = playRandomGame(seed, 500);
    illegalOffered += r.illegalOffered;
  }
  assert(illegalOffered === 0, "getLegalMoves never offers a move applyMove rejects");
});

Deno.test("legal moves: no offered move is a no-op across 20 random games", () => {
  let noopMoves = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = playRandomGame(seed, 500);
    noopMoves += r.noopMoves;
  }
  assert(noopMoves === 0, "every offered move changes the game state");
});

Deno.test("legal moves: no game gets stuck without a winner", () => {
  let stuck = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = playRandomGame(seed, 500);
    if (!r.state.winner) stuck++;
  }
  assert(stuck === 0, "every random game reaches a winner");
});
