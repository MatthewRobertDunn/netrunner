/**
 * Regression tests for `getLegalMoves` soundness: every move it returns must
 * apply, every applied move must change the game state, and every random game
 * must reach a winner.
 *
 * These are the properties the fuzz audit checks across 20 full games. They
 * are kept as tests so a future change that makes `getLegalMoves` offer an
 * illegal move or a no-op move fails loudly.
 *
 * All three properties are asserted in ONE sweep of 20 games (not one sweep
 * per property). A single pass exercises every branch once, so V8 records the
 * coverage for all three invariants together; splitting them across `t.step`s
 * previously dropped branch records from the steps that did not run.
 */

import { engine, RandomAI, starterDeckConfigs } from "../src/mod.ts";
import type { GameState, PlayerSide } from "../src/types.ts";
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

Deno.test("legal moves: every offered move applies, changes state, and reaches a winner", () => {
  let illegalOffered = 0;
  let noopMoves = 0;
  let stuck = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const out = playRandomGame(seed, 500);
    illegalOffered += out.illegalOffered;
    noopMoves += out.noopMoves;
    if (!out.state.winner) stuck++;
  }

  assert(illegalOffered === 0, "getLegalMoves never offers a move applyMove rejects");
  assert(noopMoves === 0, "every offered move changes the game state");
  assert(stuck === 0, "every random game reaches a winner");
});
