# Netrunner Engine (CyberClick starter decks)

A standalone, rules-driven Netrunner card game engine in Deno/TypeScript, targeting the two
CyberClick NetrunnerDB starter decks (Runner `4b9cf488-5bd9-4415-a57a-0864d4d0e600`, Corp
`382f2e2d-eabf-47c8-ae55-adb93b3df3e9`).

## Features

- **Typed public API** (`src/mod.ts`): `validateDeck`, `startGame`, `getLegalMoves`, `applyMove`,
  `getPlayerView`, `getPublicGameStatus`, `getPublicGameStatusFor`, `starterDeckConfigs`,
  `starterDeckCardIds`, `cardSupport`, `starterDeckSupport`.
- **Offline.** Card data is checked in at `data/cards.json` and `data/starter-decks.json`; the only
  network consumers are the dev-time import script (`deno task import-decks`) and the image fetcher
  (`deno task fetch-images`), which downloads `data/images/<card-id>.webp` (xlarge, 34 files) from
  NetrunnerDB's card-images CDN.
- **Deterministic.** A seeded PRNG stored in state makes replays reproducible. `applyMove` works on
  a deep copy so an illegal move can never mutate the caller's state; it returns either an
  `ApplyMoveResult` or an `IllegalMove` discriminated union.
- **Visible support status.** Every card has a `CardBehavior` definition keyed by card id (rules
  text is never parsed). `cardSupport` / `starterDeckSupport` report `supported` / `partial` /
  `unsupported` per card.
- **Tested.** `deno test` runs 53 tests across setup, cards, runs, visibility, determinism,
  public-status, AI playthrough, and UCT-vs-random strength suites.
- **AI players.** `src/ai/mod.ts` exposes a `GameAI` interface (`name`, `chooseMove(state, side, legal)`),
  a `RandomAI` (uniform pick using the state's own seeded PRNG), and a `UctAI` (MCTS with UCB1).
  `playGame({ corp, runner, state })` runs a full game between any two AIs; decisions are routed by
  *who may act* (the turn player, or the prompted player during rez windows and accesses).

## Setup

```sh
# Install Deno 2.9.8 (or later).
deno --version

# Install dependencies (none — the engine is self-contained).
# Refresh the offline snapshots from NetrunnerDB (dev only, needs network).
deno task import-decks
# Download the xlarge WebP card images (dev only, needs network).
deno task fetch-images

# Build the web bundle on the host (committed to git; the Docker image
# ships it as-is, no build step in the image):
deno task build-web

# Serve the static site:
deno task serve-web

# Run the test suite.
deno task test

# Type-check, lint, and format.
deno task check
deno task lint
deno task fmt
```

## Docker

A production image serves the pre-built static site only — no build step,
no shell, no package manager, runs as nonroot. ~50 MB base + 9.7 MB site.

```sh
docker build -t netrunner .
docker run --rm -p 8000:8000 netrunner

# Custom port / bind address:
docker run --rm -e PORT=8080 -p 8080:8080 netrunner
```

The image's only runtime dependency is the Deno interpreter, used by the
tiny static file server (`public/serve.ts`) with scoped permissions:
`--allow-read=/app/public --allow-env=PORT --allow-net`. It binds 0.0.0.0 by
default; set `PORT` to change the port.

### Pre-built multi-arch images

Ready-to-use tarballs for `linux/amd64` and `linux/arm64` are checked into
`release/` (equivalent to what `docker build` of the Dockerfile produces):

```sh
docker load -i release/netrunner-amd64.tar   # yields netrunner:amd64
docker load -i release/netrunner-arm64.tar   # yields netrunner:arm64
docker run --rm -p 8000:8000 netrunner:amd64
```

They are produced by `scripts/export-docker-images.sh`, which uses
[`crane`](https://github.com/google/go-containerregistry) instead of a Docker
daemon — so the images can be built on hosts where `dockerd` cannot
`mount(2)`/`unshare(2)` (e.g. unprivileged containers). Requires `crane` and
GNU `tar`:

```sh
scripts/export-docker-images.sh
```

An alternative is `docker buildx` via `docker-bake.hcl`:

```sh
docker buildx create --use
docker buildx bake --load netrunner-amd64 netrunner-arm64
docker save netrunner:amd64 -o release/netrunner-amd64.tar
docker save netrunner:arm64 -o release/netrunner-arm64.tar
```

## Usage

```ts
import { engine, starterDeckConfigs } from "./src/mod.ts";

const decks = starterDeckConfigs();
const state = engine.startGame({
  corp: decks.corp,
  runner: decks.runner,
  mode: "starter-decks",
  seed: 42,
});

// Enumerate every legal move for the Corp.
const moves = engine.getLegalMoves(state, "corp");

// Apply a move; the original state is never mutated.
const result = engine.applyMove(state, "corp", moves[0]!);
if (result.kind === "illegal-move") {
  console.error(result.reason);
} else {
  const view = engine.getPlayerView(result.state, "corp");
  console.log(view.corp.credits, view.corp.clicks);
}

// Everything the rules consider public knowledge (rule 1.10).
const status = engine.getPublicGameStatus(result.state);
console.log(status.players.corp.credits, status.players.runner.tags);
```

## Public game status (rule 1.10)

`engine.getPublicGameStatus(state)` returns a `PublicGameStatus` DTO holding only information that
_both_ players are always entitled to see:

- both players' credits, clicks, tags, agenda points, and hand/deck/discard counts (never card
  identities),
- turn number/player/phase, the agenda-point target and win state,
- identity cards and every scored agenda,
- server placement, unrezzed card counts per server, and rezzed ice,
- public run state (server, phase, position, broken subroutines) and public breach state (server,
  random-access budget),
- pending prompts and support warnings.

Because the DTO deliberately excludes hidden information — the opponent's hand/deck card identities
and unrezzed Corp card ids — `getPublicGameStatus` returns the same value no matter who is asking.

`engine.getPublicGameStatusFor(state, viewer)` returns the same DTO with one addition: the Corp sees
the ids of its own installed cards, since you always know your own cards. Hidden information about
the _opponent_ is still never included in either function.

## How to identify unsupported effects

Every card in the starter pool has a behaviour definition in `src/cards/effects.ts`. The
`supportStatus` for a card is one of:

- `supported` — all printed effects are modelled.
- `partial` — some effects are modelled; `note` explains which ones are not.
- `unsupported` — no effects are modelled.

Use `engine.cardSupport(cardId)` or `engine.starterDeckSupport()` to query support. The engine never
silently skips a material effect: if an effect is not modelled, the move that would trigger it is
simply not offered as legal, and the game state records a `supportWarning` (visible via
`engine.supportWarningsOf(state)`).

## Project layout

```
data/                 Offline card snapshots + raw API responses + images/*.webp
docs/                 rules-v26.03.txt, sources.md, rules-questions.md,
                      card-data-audit.md
src/
  mod.ts              Public facade
  types.ts            All core types
  cards/
    catalogue.ts      Immutable printed-card data (from data/cards.json)
    effects.ts        Typed CardBehavior per card id
  decks/
    starter-decks-cyberclick-v1.ts   Fixture loader
  engine/
    setup.ts          Deck validation + game start
    turns.ts          Turn/phase machinery, discard, hand size
    runs.ts           Run initiation, rez, ice encounter
    settle.ts         The settle loop: run/breach stepping, scoring, mulligans
    effects.ts        Card effect execution (subroutines, triggers, choices)
    legal-moves.ts    Per-phase move enumeration
    apply.ts          Validate + execute + settle a move
    state.ts          Zone movement, credits, damage
    rng.ts            Seeded PRNG
  ai/
    types.ts          GameAI interface
    random.ts         RandomAI
    uct.ts            UctAI (MCTS with UCB1)
    play.ts           playGame loop, AiGameError
  tests/                Smoke, cards, setup, runs, visibility, determinism,
                       public-status, AI playthrough, UCT-vs-random suites
scripts/              import-starter-decks.ts (dev only)
```

## Rules version

The engine implements the Netrunner Comprehensive Rules **v26.03** (retrieved 2026-10-24). The text
dump is at `docs/rules-v26.03.txt`; the recorded interpretations and known simplifications are in
`docs/rules-questions.md`.

## Known limitations

- Targets the **CyberClick starter decks only**. Cards outside this pool are not modelled, and the
  starter identities have no printed abilities.
- No tags, no virus counters, no trash-resource or purge basic actions — none of these mechanics
  appear in the starter pool.
- Several card effects are simplified where the starter pool does not require the full rule (see
  `docs/rules-questions.md`).
