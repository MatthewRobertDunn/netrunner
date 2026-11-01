/**
 * Deck registry: which validation mode may use which card pool.
 *
 * This module is the single mapping from a `GameConfig["mode"]` to the set of
 * card ids a deck in that mode may contain. The engine's deck validation
 * (`engine/setup.ts`) asks this registry for the pool instead of importing a
 * specific deck SKU, so adding a deck version (e.g. a "v2" starter fixture)
 * only touches `src/decks/` — `src/mod.ts` stays the composition root that
 * wires the fixture and the engine together.
 */

import { starterPoolCardIds } from "./starter-decks-cyberclick-v1.ts";
import type { CardId, GameConfig } from "../types.ts";

/**
 * The allowed-card pool for a validation mode.
 *
 * - "starter-decks": only cards belonging to a registered starter fixture.
 * - "open-play": every card in the catalogue (no extra pool restriction).
 */
export function allowedCardIds(mode: GameConfig["mode"]): ReadonlySet<CardId> | null {
  switch (mode) {
    case "starter-decks":
      return new Set(starterPoolCardIds());
    case "open-play":
      return null;
  }
}
