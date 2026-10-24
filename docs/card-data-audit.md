# Card data audit

This document lists every field present in the checked-in card snapshot
(`data/cards.json`, retrieved 2026-10-24 from the NetrunnerDB API v3 public
endpoint) and records which fields the engine uses and which it ignores.

## Snapshot provenance

| Field | Value |
|---|---|
| Provider | NetrunnerDB |
| API base | `https://api.netrunnerdb.com/api/v3/public` |
| Runner decklist id | `4b9cf488-5bd9-4415-a57a-0864d4d0e600` |
| Corp decklist id | `382f2e2d-eabf-47c8-ae55-adb93b3df3e9` |
| Retrieved at | 2026-10-24 |
| Card count | 34 (17 runner + 17 corp) |

## Raw fields per card

The API returns the following fields for each card. The engine's
`CardDef` interface (`src/cards/catalogue.ts`) maps them as follows:

| Raw field | Engine field | Used? |
|---|---|---|
| `id` | `id` | Yes — primary key |
| `netrunnerdb_id` | — | Ignored (duplicate of `id` in this pool) |
| `title` | `title` | Yes — display |
| `stripped_title` | `strippedTitle` | Yes — used for fuzzy matching |
| `text` | `text` | Yes — logged; **never parsed for rules** |
| `stripped_text` | `strippedText` | Yes — logged |
| `card_type_id` | `type` | Yes — drives install/rez/scoring logic |
| `side_id` | `side` | Yes — deck validation |
| `faction_id` | `faction` | Yes — informational only |
| `cost` | `cost` | Yes — play/install/rez cost |
| `advancement_requirement` | `advancementRequirement` | Yes — score eligibility |
| `agenda_points` | `agendaPoints` | Yes — victory condition |
| `base_link` | `baseLink` | Yes — Runner link (0 for starter identities) |
| `deck_limit` | `deckLimit` | Yes — deck validation |
| `influence_cost` | `influenceCost` | Yes — deck validation (open-play mode) |
| `influence_limit` | `influenceLimit` | Yes — deck validation |
| `memory_cost` | `memoryCost` | Yes — program install legality |
| `minimum_deck_size` | `minimumDeckSize` | Yes — deck validation (open-play mode) |
| `strength` | `strength` | Yes — ice/icebreaker strength |
| `trash_cost` | `trashCost` | Yes — access trash cost |
| `is_unique` | `unique` | Yes — enforced in deck validation |
| `card_subtype_ids` | `subtypes` | Yes — icebreaker subtype matching |
| `display_subtypes` | `displaySubtypes` | Yes — informational only |
| `date_release` | — | Ignored |
| `updated_at` | `updatedAt` | Yes — informational only |
| `in_restriction` | — | Ignored |
| `num_printings` | — | Ignored |
| `designed_by` | — | Ignored |
| `layout_id` | — | Ignored |
| `num_extra_faces` | — | Ignored |
| `latest_printing_id` | — | Ignored |
| `printing_ids` | `printingIds` | Yes — informational only |

## Known quirks

1. **Numeric fields are strings in the raw API response.** `cost`,
   `advancement_requirement`, `agenda_points`, `base_link`, `deck_limit`,
   `influence_cost`, `influence_limit`, `memory_cost`, `minimum_deck_size`,
   `strength`, and `trash_cost` are returned as JSON strings (e.g. `"5"`).
   `src/cards/catalogue.ts` coerces them with a `num()` helper; this is an
   import-time normalisation, not a runtime mutation.

2. **`num_cards` excludes the identity.** The decklist API reports
   `num_cards` without the identity card, while `card_slots` includes it.
   The engine's `starter-decks.json` follows the API convention; the
   `starter-deck-cyberclick-v1.ts` fixture adds 1 to the card count when
   reporting total deck size.

3. **Identity cards have no printed abilities.** Both starter identities are
   plain "Starter game only" cards (min deck 30, base link 0, no abilities).
   The engine treats them as such and does not model any identity abilities.

## Decklist snapshot fields

`data/starter-decks.json` contains, per deck:

| Field | Meaning |
|---|---|
| `id` | Decklist id (UUID) |
| `name` | Display name |
| `identity` | Identity card id |
| `card_slots` | `{ cardId: count }` including the identity |
| `num_cards` | Total excluding the identity |
| `date_creation` / `date_update` | Decklist timestamps |
| `cards_url` | API endpoint used to fetch the card list |

The engine's `DeckConfig` shape is `{ identity, cards: { cardId, count }[] }`;
the fixture loader strips the identity from `card_slots` and re-adds it as
`identity`.