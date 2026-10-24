/**
 * Test fixtures: the `starter-decks-cyberclick-v1` deck configuration.
 *
 * Test data only. Nothing here is an official opening sequence; tests that need
 * a specific card order supply `orderedCards` explicitly.
 */

import { engine, starterDeckConfigs } from "../mod.ts";
import type { DeckConfig, GameState, Move, PlayerSide } from "../types.ts";
import type { ApplyMoveResult } from "../types.ts";

export function starterFixtures(): { corp: DeckConfig; runner: DeckConfig } {
  return starterDeckConfigs();
}

export function newStarterGame(
  seed = 1,
  overrides: Partial<{ runner: DeckConfig; corp: DeckConfig }> = {},
): GameState {
  const decks = starterFixtures();
  return engine.startGame({
    corp: overrides.corp ?? decks.corp,
    runner: overrides.runner ?? decks.runner,
    mode: "starter-decks",
    seed,
  });
}

export type Outcome = { state: GameState; result: ApplyMoveResult };

/** Apply a move and return the new state (asserts the move was legal). */
export function play(state: GameState, side: PlayerSide, move: Move): ApplyMoveResult {
  const result = engine.applyMove(state, side, move);
  if (result.kind === "illegal-move") {
    throw new Error(
      `Illegal move ${JSON.stringify(move)} for ${side}: ${result.reason}`,
    );
  }
  return result;
}

/** Apply a sequence of moves, returning the final state. */
export function playAll(state: GameState, steps: { side: PlayerSide; move: Move }[]): GameState {
  let current = state;
  for (const step of steps) {
    const result = play(current, step.side, step.move);
    current = result.state;
  }
  return current;
}

/** Convenience: moves of a given kind. */
export function movesOfKind(state: GameState, side: PlayerSide, kind: Move["kind"]): Move[] {
  return engine.getLegalMoves(state, side).filter((m) => m.kind === kind);
}

export { engine };
