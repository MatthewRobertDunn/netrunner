/**
 * AI player interface.
 *
 * An AI is a pure decision function: given the authoritative game state and
 * the side it controls, it returns the move it wants to make. AIs never
 * mutate state and never call `applyMove` themselves - the game loop owns
 * state transitions, which keeps any AI usable interchangeably with any
 * other (and with the same engine API used by human front-ends).
 */

import type { GameState, Move, PlayerSide } from "../types.ts";

export interface GameAI {
  /** Short human-readable name, used in test output and tournament logs. */
  readonly name: string;
  /** Pick a move from `legal` for `side` in `state`. Must not mutate state. */
  chooseMove(state: GameState, side: PlayerSide, legal: Move[]): Move;
}
