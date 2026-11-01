/**
 * Test-only convenience: call an AI through the information boundary.
 *
 * Mirrors what the trusted shells (`playGame`, the web app) do: project the
 * authoritative state into a sanitized `PlayerView`, build the hidden-card
 * `AIDecisionContext`, and call `chooseMove` with no `GameState` in sight.
 */

import { engine, makeAIDecisionContext } from "../../src/mod.ts";
import type { GameAI, GameState, Move, PlayerSide } from "../../src/types.ts";

/**
 * Ask `ai` for a move as `side`, seeing only the view and the context.
 *
 * `legal` is REQUIRED — the optional form used to silently fall back to
 * `getLegalMoves(state, side)`, which let callers skip building the list they
 * meant to offer. `seed` is REQUIRED too: AIs are pure functions of their
 * inputs, so callers driving whole games must vary the seed per decision (the
 * real shells derive it from the view via `decisionSeedFor`); a constant seed
 * repeats the same picks.
 */
export function decide(
  ai: GameAI,
  state: GameState,
  side: PlayerSide,
  legal: Move[],
  seed: number,
): Move {
  const view = engine.getPlayerView(state, side);
  const ctx = makeAIDecisionContext(state, side, seed);
  return ai.chooseMove(view, legal, ctx);
}
