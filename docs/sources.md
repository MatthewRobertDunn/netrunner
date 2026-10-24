# Sources

## Rules

- **Netrunner Comprehensive Rules v26.03.** Retrieved 2026-10-24. Text dump
  at `docs/rules-v26.03.txt` (~7,313 lines). The HTML was fetched from the
  official Netrunner Comprehensive Rules page; the text dump was cleaned and
  verified against the following sections used by the engine:
  - 1.6.4–1.6.7 (starting credits, starting hand, mulligans, first turn)
  - 1.7 (ending the game: flatline, decking, agenda-point target)
  - 1.10 (public/private information)
  - 1.12 (rezzing)
  - 1.16 (installing)
  - 1.17 (scoring)
  - 1.18 (advancing)
  - 1.19 (trashing)
  - 1.20 (memory)
  - 5.2 (basic actions)
  - 5.3 (Corp draw phase / mandatory draw)
  - 5.4 (action phase)
  - 5.5 (Runner discard phase)
  - 5.6 (Corp turn)
  - 5.7 (Runner turn)
  - 6.5 (encountering ice)
  - 6.7 (successful runs)
  - 6.8 (ending a run)
  - 6.9 (run steps)
  - 7.3–7.5 (breach / access)
  - 9.9 (subroutine resolution)

## Card data

- **NetrunnerDB API v3 public.** Retrieved 2026-10-24.
  - Runner starter deck: `https://api.netrunnerdb.com/api/v3/public/decklists/4b9cf488-5bd9-4415-a57a-0864d4d0e600`
  - Corp starter deck: `https://api.netrunnerdb.com/api/v3/public/decklists/382f2e2d-eabf-47c8-ae55-adb93b3df3e9`
  - Card endpoints: `https://api.netrunnerdb.com/api/v3/public/cards?filter[decklist_id]=<id>`
- Raw responses are checked in at `data/raw/` (runner and corp). The
  normalised offline snapshots are `data/cards.json` (34 cards) and
  `data/starter-decks.json`. Refresh with `deno task import-decks`.

## Implementation

- TypeScript 5.x under Deno 2.9.8, strict mode, `noUncheckedIndexedAccess`.
- No third-party runtime dependencies; the only test dependency is a
  hand-written assertion helper at `tests/helpers/assert.ts` (no network).
- Seeded deterministic PRNG (`src/engine/rng.ts`) — same seed + same moves =>
  same state.

## Known limitations

- The engine targets the **CyberClick starter decks only**. Cards outside this
  pool are not modelled, and the starter identities have no printed abilities
  (min deck 30, base link 0).
- No tags, no virus counters, no trash-resource or purge basic actions — none
  of these mechanics appear in the starter pool.
- Several card effects are simplified where the starter pool does not require
  the full rule. See `docs/rules-questions.md` for the recorded interpretations.
- `docs/card-data-audit.md` lists every field in the checked-in card snapshot
  and any fields the engine does not use.