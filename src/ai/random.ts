/**
 * Random AI: picks uniformly among the legal moves.
 *
 * Determinism note: the choice uses this AI's own internal mulberry32 PRNG,
 * seeded at construction. It never reads or writes `state.rngState` — the
 * authoritative game PRNG belongs to the engine alone, so merely *asking* an
 * AI for a decision can never perturb the game (and `getLegalMoves` +
 * `chooseMove` stay side-effect free for any caller).
 */

import type { GameState, Move, PlayerSide } from "../types.ts";
import type { GameAI } from "./types.ts";

export class RandomAI implements GameAI {
  readonly name = "random";
  private rngState: number;

  constructor(seed = 0x9e3779b9) {
    this.rngState = seed | 0;
  }

  /** mulberry32: float in [0, 1), advancing this AI's own PRNG state. */
  private next(): number {
    this.rngState = (this.rngState + 0x6d2b79f5) | 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  chooseMove(_state: GameState, _side: PlayerSide, legal: Move[]): Move {
    const idx = Math.floor(this.next() * legal.length);
    return legal[idx] ?? legal[0]!;
  }
}

export const randomAI = new RandomAI();
