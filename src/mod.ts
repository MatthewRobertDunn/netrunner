/**
 * Netrunner Engine -- public API.
 *
 * Small, typed, offline. Usage:
 *
 * ```ts
 * import { engine, starterDeckConfigs } from "./src/mod.ts";
 *
 * const decks = starterDeckConfigs();
 * const state = engine.startGame({
 *   corp: decks.corp,
 *   runner: decks.runner,
 *   mode: "starter-decks",
 *   seed: 42,
 * });
 *
 * const moves = engine.getLegalMoves(state, "corp");
 * const result = engine.applyMove(state, "corp", moves[0]!);
 * const view = engine.getPlayerView(result.state, "corp");
 * const status = engine.getPublicGameStatus(state);
 * ```
 *
 * `applyMove` returns `ApplyMoveResult` for a legal move, or an `IllegalMove`
 * describing why it was rejected. The original state is never mutated.
 *
 * `getPublicGameStatus` returns a viewer-agnostic DTO of everything the
 * Comprehensive Rules (rules 10.2.2/10.2.3) treat as public knowledge: credits,
 * clicks, tags, agenda points, and hand/deck/discard counts for both players
 * (4.3.4), plus turn/phase, score area, server placement, run and breach
 * progress, pending prompts and support warnings. It never leaks hidden
 * information, so both players can safely call it and receive the same value.
 *
 * AI players live in `src/ai/mod.ts` (`RandomAI`, `playGame`). They never see a
 * `GameState`: `GameAI.chooseMove` takes only a sanitized `PlayerView`, the
 * legal moves, and an `AIDecisionContext`. An AI builds its own hypothetical
 * worlds with `determinize(view, ctx, rng)` and may then use `applyMove` /
 * `getLegalMoves` on those hypotheses.
 */

import { cardDef, tryCardDef } from "./cards/catalogue.ts";
import { cardSupportReport, supportStatus } from "./cards/effects.ts";
import {
  starterDeckConfigs,
  starterPoolCardIds,
  verifyFixtureAgainstSnapshot,
} from "./decks/starter-decks-cyberclick-v1.ts";
import { applyMove } from "./engine/apply.ts";
import { determinize } from "./engine/determinize.ts";
import { getLegalMoves } from "./engine/legal-moves.ts";
import { getPublicGameStatus, getPublicGameStatusFor } from "./engine/public-status.ts";
import { makeRng } from "./engine/rng.ts";
import { startGame, validateDeck } from "./engine/setup.ts";
import { cardVisibleTo } from "./engine/state.ts";
import type { Rng } from "./engine/rng.ts";

export * from "./types.ts";
export type { Rng };
export {
  applyMove,
  cardVisibleTo,
  determinize,
  getLegalMoves,
  getPublicGameStatus,
  getPublicGameStatusFor,
  makeRng,
  startGame,
  validateDeck,
};

// The view projection and the GameEngine facade live in the engine; the
// barrel only re-exports them (src/ai/play.ts imports the facade directly,
// so the barrel is never inside an ai → mod → ai cycle).
export { getPlayerView } from "./engine/view.ts";
export { engine } from "./engine/facade.ts";

// AI surface — explicit, not `export * from "./ai/mod.ts"`: a star export
// re-exports whatever the AI module grows, and the barrel must be a curated
// public surface. `infoSetKey` stays internal to src/ai/context.ts (its only
// production consumer is `decisionSeedFor`); `fastCloneState` is exported
// below from its engine home.
export {
  AiGameError,
  decisionSeedFor,
  EvalAI,
  makeAIDecisionContext,
  playGame,
  RandomAI,
  randomAI,
} from "./ai/mod.ts";
export type { EvalAIOptions, GameOutcome } from "./ai/mod.ts";

// Shared clone infrastructure (engine/determinize + AI playouts); kept on the
// barrel because tests import it from here.
export { fastCloneState } from "./engine/clone.ts";

/** Aggregate support report for the complete starter-deck card pool. */
export function starterDeckSupport() {
  const ids = starterPoolCardIds();
  const report = cardSupportReport(ids);
  return { ...report, all: ids };
}

export {
  cardDef,
  cardSupportReport,
  starterDeckConfigs,
  starterPoolCardIds,
  supportStatus,
  tryCardDef,
  verifyFixtureAgainstSnapshot,
};
