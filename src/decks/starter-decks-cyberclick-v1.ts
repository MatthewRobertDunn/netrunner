/**
 * Versioned starter-deck fixture: `starter-decks-cyberclick-v1`.
 *
 * Loaded from the checked-in NetrunnerDB snapshot (`data/starter-decks.json`).
 * If NetrunnerDB lists change, add a new fixture version rather than mutating
 * this one.
 */

import decksRaw from "../../data/starter-decks.json" with { type: "json" };
import catalogueRaw from "../../data/cards.json" with { type: "json" };
import type { DeckConfig } from "../types.ts";

interface StarterDeckEntry {
  decklist_id: string;
  name: string;
  user_id: string;
  side: "runner" | "corp";
  identity: string;
  cards: Record<string, number>;
  num_cards: number;
  influence_spent: number;
}

interface DecksFile {
  _source: {
    provider: string;
    retrieved_at: string;
    fixtures: { name: string; runner_decklist_id: string; corp_decklist_id: string }[];
  };
  decks: { runner: StarterDeckEntry; corp: StarterDeckEntry };
}

export const FIXTURE_NAME = "starter-decks-cyberclick-v1";

const data = decksRaw as unknown as DecksFile;

/** Card ids that this decklist is allowed to contain (verified at import time). */
const importedCardIds: ReadonlySet<string> = new Set(
  (catalogueRaw as unknown as { cards: { id: string }[] }).cards.map((c) => c.id),
);

export function starterDeckConfigs(): { corp: DeckConfig; runner: DeckConfig } {
  const toConfig = (entry: StarterDeckEntry): DeckConfig => ({
    identity: entry.identity,
    cards: Object.entries(entry.cards)
      .filter(([cardId, count]) => count > 0 && cardId !== entry.identity)
      .map(([cardId, count]) => ({ cardId, count })),
  });
  return { corp: toConfig(data.decks.corp), runner: toConfig(data.decks.runner) };
}

export function starterDeckIds(): { runner: string[]; corp: string[] } {
  const s = starterDeckConfigs();
  return {
    runner: s.runner.cards.flatMap((e) => Array<string>(e.count).fill(e.cardId)),
    corp: s.corp.cards.flatMap((e) => Array<string>(e.count).fill(e.cardId)),
  };
}

/** Every card id (incl. identity) in the supported starter-deck card pool. */
export function starterPoolCardIds(): string[] {
  const s = starterDeckConfigs();
  const ids = [
    s.runner.identity,
    s.corp.identity,
    ...s.runner.cards.map((e) => e.cardId),
    ...s.corp.cards.map((e) => e.cardId),
  ];
  return [...new Set(ids)];
}

export function starterDecklistMetadata(side: "runner" | "corp"): StarterDeckEntry {
  return data.decks[side];
}

export function importMeta() {
  return { ...data._source };
}

/** Sanity check used by tests: fixture quantites match the imported decklist. */
export function verifyFixtureAgainstSnapshot(): string[] {
  const problems: string[] = [];
  for (const side of ["runner", "corp"] as const) {
    const entry = data.decks[side];
    for (const [cardId, count] of Object.entries(entry.cards)) {
      if (!importedCardIds.has(cardId)) {
        problems.push(`${side}: ${cardId} missing from card catalogue`);
      }
      if (count < 1) problems.push(`${side}: ${cardId} has count ${count}`);
    }
  }
  return problems;
}
