# AGENTS.md

Guide for AI agents working on this repo. The full README covers features and usage; this file is
the build/verify loop, the engine invariants, and the mistakes I keep repeating.

## Build & verify loop

```sh
# Type-check (prints nothing and exits 0 on success). FULL PATH.
/usr/local/bin/deno check src/mod.ts
/usr/local/bin/deno check src/web/entry.ts   # the Vue UI; src/mod.ts does not import it

# Format check, lint, check, and test suite in one task (131 tests, ~11s)
deno task verify

# AI sanity: EvalAI vs RandomAI win rates + move variety (~1 min)
deno run --allow-read scripts/check-ai.ts

# Rebuild the web bundle (committed to git; the Docker image ships it as-is)
deno run --allow-all scripts/build-web.ts

# Restart the dev server after a rebuild
pkill -f "deno.*serve-web"; sleep 1
(deno task serve-web > /tmp/opencode/serve.log 2>&1 &)
sleep 3; deno eval "const r = await fetch('http://localhost:8000/'); console.log(r.status)"

# Publish to the host (rebuilds bundle, exports docker tarball, restarts systemd)
deno task publish
```

- Local git branch is `master`; the remote is `main`. Push with `git push origin master:main` — `gh`
  is permanently authenticated (see Secrets), and `gh auth setup-git` wires git's HTTPS credential
  helper, so no token juggling is needed.
- `deno` is at `/usr/local/bin/deno` (2.9.8, Debian/glibc aarch64).
- Vue is imported as the bare specifier `vue`, mapped once in `deno.json`. Never inline an `npm:`
  specifier in a source file — `no-import-prefix` fails the lint and the import map keeps the
  version in one place. `deno bundle` (scripts/build-web.ts) resolves the map too.
- `public/dist/app.js` is build output: excluded from lint/fmt, never hand-edited, always rebuilt
  before browser verification.
- **Passwordless `sudo` exists in this sandbox** for setup steps (`apt-get install`, port release,
  service restarts).

## Engine invariants (break these and tests / AI / web all break)

- **AI information boundary (sacred):** `GameAI.chooseMove(view, legal, ctx)` never receives a
  `GameState`. Hypothetical states come only from `determinize(view, ctx, rng)`, which sets
  `drawMode: "random"` on hypotheses (real games use `"top"`; the hidden-zone multiset in `ctx` is
  the accepted concession). Decision seeds derive only from `decisionSeedFor(view)` — never from
  `state.rngState`.
- **AIs are pure functions of (view, legal, ctx):** no `Date.now()`, no unseeded randomness. EvalAI
  is a deliberately *fun* opponent (1-ply determinized eval + softmax); `infoSetKey(view)` in
  `src/ai/context.ts` is the future ISMCTS tree key — don't weaken either.
- **`applyMove` never mutates the caller's state** (it copies, or mutates only under `mutate: true`
  which AI playouts own). Read results from `result.state`.
- **The settle loop is the only phase driver; prompts are the only decision points.** If a phase
  should pause for a player, `settle` must be able to park there — a legal move that `settle` never
  waits for is unreachable (see the jack-out entry in `docs/rules-gotchas.md`).
- **Views are a redaction contract:** `getPlayerView(determinized, viewer)` must deep-equal the
  input view (events excepted). `public-status.ts` is the both-players intersection.
- **Rules citations:** engine comments cite rules like "rule 7.1.6". When touching rule logic, read
  the cited section in `docs/rules-v26.03.txt` — see `docs/rules-gotchas.md` for known trip-hazards.
  Never edit `docs/rules-v26.03.txt`; recorded interpretations live in `docs/rules-questions.md`.

## Secrets & releases

All local credentials live in `secrets/` (SSH key `orange` + `orange.pub`, GitHub PAT
`gh_fine_grained_key.txt`), and the whole directory is gitignored — never commit it.
`secrets/orange` is the SSH key for `matty@192.168.0.2` and is passed via `ssh -i` only.

`opencode.json` stays at the repo root (the harness loads it from there) and is gitignored on its
own line. `core` crash dumps are gitignored too — delete them, they are never useful.

`release/` holds the docker tarballs used by `deno task publish`. They stay on disk only.

The GitHub CLI is permanently logged in as MatthewRobertDunn using that PAT. After a sandbox
rebuild, re-run:

```sh
cat secrets/gh_fine_grained_key.txt | tr -d '[:space:]' | gh auth login --with-token
gh auth setup-git
```

`gh auth status` should show the account with an active token. Never echo the token value into logs
or commits.

## Mistakes I keep repeating

1. **Forgetting to rebuild `public/dist/app.js` after engine changes.** The dev server serves the
   committed bundle, so a code change is invisible until `deno run --allow-all scripts/build-web.ts`
   runs. Always rebuild before opening the browser.
2. **`findCardIn` vs `findCard`.** The engine's `findCard(state, id)` returns `{ card, side }`; the
   UI's `findCardIn(state, id)` in `src/web/ui/util.ts` returns the `CardInstance` directly. Do not
   write `found.card.cardId` when using the UI helper — it's `found.cardId`. This crashed the render
   once.
3. **`deno task check` covers both entry points** (`src/mod.ts` + `src/web/entry.ts`). The bare
   `/usr/local/bin/deno check src/mod.ts` form only checks the engine.
4. **Forgetting that the browser tool's `browser_snapshot` returns a string,** not an object — regex
   it directly, don't `JSON.stringify` first.
5. **Clicking a card tile in the discard picker opens the zoom popup**, which intercepts pointer
   events and blocks the next click. Close it with `browser_press_key({ key: "Escape" })` (or click
   the ✕ Close button) before interacting with anything behind it.
6. **The Corp AI sometimes never installs in a remote** on a given seed, so browser tests that need
   a remote server must fast-forward several turns until one appears. Seed 3 reliably produces one
   by turn 11.
7. **`deno fmt` then `deno check`.** Format first, then check — formatting can change how errors
   line up.
8. **`applyMove` works on a copy and returns the new state.** It never mutates the caller's object.
   Tests that check the result must read `result.state`, not the original.
9. **The AI must not know the opponent's deck order.** Simulations run on states built by
   `determinize(view, ctx, rng)`, which sets `drawMode: "random"` on the hypothesis, so every draw
   pulls a random card from the remaining deck instead of the top one. The real game always uses
   `"top"`. Don't shuffle the deck — the flag is O(1) per draw.
10. **Rez-cost arithmetic has three calculators** (`rezCostFor`, `rezSafeCost`, printed cost) and
    the rez window has paid twice — see `docs/rules-gotchas.md` before touching any cost path.
