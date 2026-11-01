/**
 * Fixtures for UI component tests.
 *
 * Builds an engine state the same way the install/legal-moves tests do, then
 * applies a list of moves so component tests land on a deterministic board.
 * `publicStatusFor` mirrors how GameScreen feeds `engine.getPublicGameStatusFor`
 * into the public-status DTO (viewer-aware for installed cards).
 */

import { engine, starterDeckConfigs } from "../../src/mod.ts";
import type { GameState, Move, PlayerSide, Prompt } from "../../src/types.ts";
import { play } from "../helpers/fixtures.ts";
import { deepClone } from "../helpers/assert.ts";

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

/**
 * A state whose only prompt is a runner access-decision on `cardId` — the
 * shape the access-zoom test needs. Built as a typed `Prompt` (never a cast),
 * so an engine-side prompt-shape change fails here, not at the call site.
 */
export function accessDecisionFixture(
  state: GameState,
  cardId: string,
  id = 999,
): GameState {
  const s = deepClone(state);
  const prompt: Prompt = { kind: "access-decision", id, player: "runner", cardId };
  s.prompts = [prompt];
  return s;
}

// `palisadeInHand` and `freshCorpHandWithExtraPalisade` were deleted: nothing
// in the repo referenced them, and the palisade-duplication scenario they
// supported is not exercised by any test.
