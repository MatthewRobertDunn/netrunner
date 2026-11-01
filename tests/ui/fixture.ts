/**
 * Fixtures for UI component tests.
 *
 * Builds an engine state the same way the install/legal-moves tests do, then
 * applies a list of moves so component tests land on a deterministic board.
 * `publicStatusFor` mirrors how GameScreen feeds `engine.getPublicGameStatusFor`
 * into the public-status DTO (viewer-aware for installed cards).
 */

import { engine, starterDeckConfigs } from "../../src/mod.ts";
import type { GameState, Move, PlayerSide } from "../../src/types.ts";

// The `moves` list is a heterogeneous bag of Move variants, so it is typed as
// Move[] rather than a single literal variant. Callers previously cast to
// never[] to dodge the union — that is both wrong (the array is not empty)
// and it throws away every type check on the moves they pass.

function fresh(seed: number): GameState {
  return engine.startGame({
    corp: starterDeckConfigs().corp,
    runner: starterDeckConfigs().runner,
    mode: "starter-decks",
    seed,
  });
}

function play(state: GameState, side: "corp" | "runner", m: Move): GameState {
  const r = engine.applyMove(state, side, m);
  if (r.kind !== "applied") {
    throw new Error(`move ${m.kind} rejected: ${(r as { reason: string }).reason}`);
  }
  return r.state;
}

/** Build a deterministic game state reached by playing `moves` in order. */
export function createTestFixture(
  seed = 1,
  humanSide: PlayerSide = "runner",
  moves: Move[] = [],
): { state: GameState; humanSide: PlayerSide } {
  let state = fresh(seed);
  for (const m of moves) {
    const actor = (m as { player?: PlayerSide }).player ??
      (m.kind.startsWith("corp") ? "corp" : "runner");
    state = play(state, actor, m);
  }
  return { state, humanSide };
}

/** Public game status for `humanSide`, like GameScreen renders. */
export function publicStatusFor(state: GameState, humanSide: PlayerSide) {
  return engine.getPublicGameStatusFor(state, humanSide);
}

// `palisadeInHand` and `freshCorpHandWithExtraPalisade` were deleted: nothing
// in the repo referenced them, and the palisade-duplication scenario they
// supported is not exercised by any test.
