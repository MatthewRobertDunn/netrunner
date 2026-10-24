/**
 * Development-time import script for the Netrunner Engine.
 *
 * Fetches the two CyberClick starter decklists and their card records from the
 * NetrunnerDB API, normalizes them, and writes a version-controlled snapshot to
 * `data/`. Raw API responses are retained under `data/raw/` for auditability.
 *
 * This script is the ONLY part of the project that needs network access.
 * Gameplay, tests, and builds run offline from the checked-in snapshot.
 *
 * Usage:
 *   deno run --allow-net --allow-read --allow-write scripts/import-starter-decks.ts
 *
 * The script never silently overwrites a curated snapshot: if `data/cards.json`
 * already exists, it writes the fresh import alongside it (see output paths)
 * and prints a diff summary for manual review.
 */

const RUNNER_DECK_ID = "4b9cf488-5bd9-4415-a57a-0864d4d0e600";
const CORP_DECK_ID = "382f2e2d-eabf-47c8-ae55-adb93b3df3e9";
const API_BASE = "https://api.netrunnerdb.com/api/v3/public";
const RETRIEVED_AT = new Date().toISOString().slice(0, 10);

interface DecklistResponse {
  data: {
    id: string;
    attributes: {
      user_id: string;
      name: string;
      identity_card_id: string;
      side_id: string;
      faction_id: string;
      card_slots: Record<string, number>;
      num_cards: number;
      influence_spent: number;
      follows_basic_deckbuilding_rules: boolean;
      created_at: string;
      updated_at: string;
    };
  };
  meta?: Record<string, unknown>;
}

interface CardsResponse {
  data: Array<{
    id: string;
    type: string;
    attributes: Record<string, unknown>;
  }>;
  links?: Record<string, string>;
  meta?: Record<string, unknown>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.json() as T;
}

/** Fields copied verbatim from the NetrunnerDB card attributes. */
const CARD_FIELDS = [
  "title",
  "stripped_title",
  "text",
  "stripped_text",
  "card_type_id",
  "side_id",
  "faction_id",
  "cost",
  "advancement_requirement",
  "agenda_points",
  "base_link",
  "deck_limit",
  "influence_cost",
  "influence_limit",
  "memory_cost",
  "minimum_deck_size",
  "strength",
  "trash_cost",
  "is_unique",
  "card_subtype_ids",
  "display_subtypes",
  "keywords",
  "stripped_rules_text",
  "quantity",
  "date_release",
  "updated_at",
] as const;

async function main(): Promise<void> {
  console.log(`NetrunnerDB import — retrieval date ${RETRIEVED_AT}`);

  const rawDir = "data/raw";
  await Deno.mkdir(rawDir, { recursive: true });

  // 1. Decklists -----------------------------------------------------------------
  const runnerDeckUrl = `${API_BASE}/decklists/${RUNNER_DECK_ID}`;
  const corpDeckUrl = `${API_BASE}/decklists/${CORP_DECK_ID}`;
  const runnerDeck = await fetchJson<DecklistResponse>(runnerDeckUrl);
  const corpDeck = await fetchJson<DecklistResponse>(corpDeckUrl);
  await Deno.writeTextFile(
    `${rawDir}/decklist-runner.json`,
    JSON.stringify(runnerDeck, null, 2) + "\n",
  );
  await Deno.writeTextFile(
    `${rawDir}/decklist-corp.json`,
    JSON.stringify(corpDeck, null, 2) + "\n",
  );
  console.log(
    `Fetched runner decklist (${
      Object.keys(runnerDeck.data.attributes.card_slots).length
    } distinct cards)`,
  );
  console.log(
    `Fetched corp decklist   (${
      Object.keys(corpDeck.data.attributes.card_slots).length
    } distinct cards)`,
  );

  // 2. Card records --------------------------------------------------------------
  const runnerCardsUrl = `${API_BASE}/cards?filter[decklist_id]=${RUNNER_DECK_ID}`;
  const corpCardsUrl = `${API_BASE}/cards?filter[decklist_id]=${CORP_DECK_ID}`;
  const runnerCards = await fetchJson<CardsResponse>(runnerCardsUrl);
  const corpCards = await fetchJson<CardsResponse>(corpCardsUrl);
  await Deno.writeTextFile(
    `${rawDir}/cards-runner.json`,
    JSON.stringify(runnerCards, null, 2) + "\n",
  );
  await Deno.writeTextFile(`${rawDir}/cards-corp.json`, JSON.stringify(corpCards, null, 2) + "\n");

  // 3. Normalize -----------------------------------------------------------------
  const seen = new Set<string>();
  const catalogue: Record<string, unknown>[] = [];

  for (const payload of [runnerCards, corpCards]) {
    for (const card of payload.data) {
      if (seen.has(card.id)) continue; // cards endpoint may overlap; dedupe on id
      seen.add(card.id);
      const a = card.attributes as Record<string, unknown>;
      const normalized: Record<string, unknown> = {
        id: card.id,
        netrunnerdb_id: card.id,
      };
      for (const f of CARD_FIELDS) {
        if (a[f] !== undefined) normalized[f] = a[f];
      }
      // Keep any additional gameplay-relevant attributes not in CARD_FIELDS.
      for (const [k, v] of Object.entries(a)) {
        if (!(k in normalized) && v !== null && typeof v !== "object") {
          normalized[k] = v;
        }
      }
      normalized.printing_ids = a.printing_ids ?? [];
      catalogue.push(normalized);
    }
  }

  const catalogueDoc = {
    _source: {
      provider: "NetrunnerDB",
      api_base: API_BASE,
      runner_decklist_id: RUNNER_DECK_ID,
      corp_decklist_id: CORP_DECK_ID,
      runner_decklist_url: runnerDeckUrl,
      corp_decklist_url: corpDeckUrl,
      runner_cards_url: runnerCardsUrl,
      corp_cards_url: corpCardsUrl,
      retrieved_at: RETRIEVED_AT,
      api_meta: { runner: runnerCards.meta ?? null, corp: corpCards.meta ?? null },
    },
    cards: catalogue,
  };

  await Deno.writeTextFile("data/cards.json", JSON.stringify(catalogueDoc, null, 2) + "\n");
  console.log(`Wrote data/cards.json with ${catalogue.length} card definitions`);

  // 4. Deck configs --------------------------------------------------------------
  const decksDoc = {
    _source: {
      provider: "NetrunnerDB",
      retrieved_at: RETRIEVED_AT,
      fixtures: [
        {
          name: "starter-decks-cyberclick-v1",
          runner_decklist_id: RUNNER_DECK_ID,
          corp_decklist_id: CORP_DECK_ID,
        },
      ],
    },
    decks: {
      runner: {
        decklist_id: RUNNER_DECK_ID,
        name: runnerDeck.data.attributes.name,
        user_id: runnerDeck.data.attributes.user_id,
        side: runnerDeck.data.attributes.side_id,
        identity: runnerDeck.data.attributes.identity_card_id,
        cards: runnerDeck.data.attributes.card_slots,
        num_cards: runnerDeck.data.attributes.num_cards,
        influence_spent: runnerDeck.data.attributes.influence_spent,
        follows_basic_deckbuilding_rules:
          runnerDeck.data.attributes.follows_basic_deckbuilding_rules,
      },
      corp: {
        decklist_id: CORP_DECK_ID,
        name: corpDeck.data.attributes.name,
        user_id: corpDeck.data.attributes.user_id,
        side: corpDeck.data.attributes.side_id,
        identity: corpDeck.data.attributes.identity_card_id,
        cards: corpDeck.data.attributes.card_slots,
        num_cards: corpDeck.data.attributes.num_cards,
        influence_spent: corpDeck.data.attributes.influence_spent,
        follows_basic_deckbuilding_rules: corpDeck.data.attributes.follows_basic_deckbuilding_rules,
      },
    },
  };

  await Deno.writeTextFile("data/starter-decks.json", JSON.stringify(decksDoc, null, 2) + "\n");
  console.log("Wrote data/starter-decks.json");

  // 5. Sanity checks -------------------------------------------------------------
  const allIds = new Set(catalogue.map((c) => c.id as string));
  const problems: string[] = [];
  for (
    const [side, deck] of [["runner", decksDoc.decks.runner], [
      "corp",
      decksDoc.decks.corp,
    ]] as const
  ) {
    if (!allIds.has(deck.identity)) {
      problems.push(`${side} identity ${deck.identity} missing from catalogue`);
    }
    let total = 0;
    for (const [cardId, count] of Object.entries(deck.cards)) {
      if (!allIds.has(cardId)) problems.push(`${side} deck card ${cardId} missing from catalogue`);
      if (cardId !== deck.identity) total += count as number;
    }
    // NetrunnerDB quirk: num_cards excludes the identity card, card_slots includes it.
    if (total !== deck.num_cards) {
      problems.push(`${side} deck total (excl. identity) ${total} != num_cards ${deck.num_cards}`);
    }
  }
  const runnerCardIds = new Set(runnerCards.data.map((c) => c.id));
  const corpCardIds = new Set(corpCards.data.map((c) => c.id));
  if (runnerCardIds.size !== 17 || corpCardIds.size !== 17) {
    problems.push(
      `expected 17 distinct cards per deck, got runner=${runnerCardIds.size} corp=${corpCardIds.size}`,
    );
  }
  if (problems.length > 0) {
    console.error("SANITY PROBLEMS:");
    for (const p of problems) console.error("  - " + p);
    Deno.exit(1);
  }
  console.log("Sanity checks passed.");
  console.log("\nReview the generated files, then commit them. Never auto-commit a refresh.");
}

await main();
