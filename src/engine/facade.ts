/**
 * The `GameEngine` facade: one object exposing the engine's public surface
 * (validate, start, legal moves, apply, public status, player view).
 *
 * This lives in the engine, and the public barrel (`src/mod.ts`) only
 * re-exports it — previously the facade lived in the barrel, which forced
 * `src/ai/play.ts` to import the barrel and created an ai → mod → ai module
 * cycle. `play.ts` now imports this module directly.
 */

import { applyMove } from "./apply.ts";
import { getLegalMoves } from "./legal-moves.ts";
import { getPublicGameStatus, getPublicGameStatusFor } from "./public-status.ts";
import { startGame, validateDeck } from "./setup.ts";
import { getPlayerView } from "./view.ts";
import type {
  ApplyMoveResult,
  DeckConfig,
  DeckValidationResult,
  GameConfig,
  GameEngine,
  GameState,
  IllegalMove,
  Move,
  PlayerSide,
  PlayerView,
  PublicGameStatus,
} from "../types.ts";

export const engine: GameEngine = {
  validateDeck(
    deck: DeckConfig,
    side: PlayerSide,
    mode?: GameConfig["mode"],
  ): DeckValidationResult {
    return validateDeck(deck, side, mode);
  },
  startGame(config: GameConfig): GameState {
    return startGame(config);
  },
  getLegalMoves(state: GameState, player: PlayerSide): Move[] {
    return getLegalMoves(state, player);
  },
  applyMove(state: GameState, player: PlayerSide, move: Move): ApplyMoveResult | IllegalMove {
    // The facade never forwards options: `mutate` is for AI playouts that own
    // their state (src/ai/eval.ts calls engine/apply.ts directly) — a public
    // caller can never ask the engine to mutate its state.
    return applyMove(state, player, move);
  },
  /**
   * Public game status (rules 10.2.2/10.2.3): only information both players
   * are always entitled to see, so this returns the same value for either viewer.
   */
  getPublicGameStatus(state: GameState): PublicGameStatus {
    return getPublicGameStatus(state);
  },
  /**
   * Public game status as seen by `viewer`. Identical to `getPublicGameStatus`
   * except the Corp additionally sees the ids of its own installed cards.
   */
  getPublicGameStatusFor(state: GameState, viewer: PlayerSide): PublicGameStatus {
    return getPublicGameStatusFor(state, viewer);
  },
  getPlayerView(state: GameState, player: PlayerSide): PlayerView {
    return getPlayerView(state, player);
  },
};
