/**
 * Random AI: picks uniformly among the legal moves.
 *
 * Determinism note: the choice uses the game state's own seeded PRNG, so a
 * full game played by two RandomAIs is reproducible from the game seed alone.
 */

import { rngInt } from "../engine/rng.ts";
import type { GameState, Move, PlayerSide } from "../types.ts";
import type { GameAI } from "./types.ts";

export class RandomAI implements GameAI {
  readonly name = "random";

  chooseMove(state: GameState, _side: PlayerSide, legal: Move[]): Move {
    const idx = rngInt(state, legal.length);
    return legal[idx] ?? legal[0]!;
  }
}

export const randomAI = new RandomAI();
