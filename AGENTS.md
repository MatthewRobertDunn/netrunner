# AGENTS.md

Guide for AI agents working on this repo. The full README covers features and usage; this file is
the build/verify loop plus the mistakes I keep repeating.

## Build & verify loop

```sh
# Type-check (prints nothing and exits 0 on success)
/usr/local/bin/deno check src/mod.ts
/usr/local/bin/deno check src/web/entry.ts   # the Vue UI; src/mod.ts does not import it

# Format and lint (both should be completely clean)
deno fmt
deno task lint

# Test suite (107 tests, ~11s)
deno task test

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
- `deno` is at `/usr/local/bin/deno` (2.9.8, Debian/glibc aarch64). `deno
  check src/mod.ts` prints
  nothing and exits 0 on success.
- Vue is imported as the bare specifier `vue`, mapped once in `deno.json`
  (`"imports": { "vue": "npm:vue@3.5.13/dist/vue.esm-bundler.js" }`). Never inline an `npm:`
  specifier in a source file — `no-import-prefix` fails the lint and the import map keeps the
  version in one place. `deno bundle` (scripts/build-web.ts) resolves the map too.
- `deno lint` with no arguments used to flag the generated `public/dist/app.js` (~950 errors, none
  of them real). `deno.json` now excludes it from both `lint` and `fmt`; the bundle is build output,
  never hand-edited.
- Lint is part of the loop, not decoration: it had been silently rotting (`deno task lint` was
  already failing on 10 unused-variable/prefer-const errors) because nothing ran it. Run it before
  claiming green.
- Publish needs `ssh` (openssh-client) and `crane` in the sandbox; install via
  `apt-get install -y openssh-client` and the crane release tarball if missing.
- **Passwordless `sudo` exists in this sandbox** for setup steps (`apt-get install`, port release,
  service restarts).

## Secrets

All local credentials live in `secrets/` (SSH key `orange` + `orange.pub`, GitHub PAT
`gh_fine_grained_key.txt`), and the whole directory is gitignored — never commit it.
`secrets/orange` is the SSH key for `matty@192.168.0.2` and is passed via `ssh -i` only.

`opencode.json` stays at the repo root (the harness loads it from there) and is gitignored on its
own line. `core` crash dumps are gitignored too — delete them, they are never useful.

The GitHub CLI is permanently logged in as MatthewRobertDunn using that PAT. After a sandbox
rebuild, re-run:

```sh
cat secrets/gh_fine_grained_key.txt | tr -d '[:space:]' | gh auth login --with-token
gh auth setup-git
```

`gh auth status` should show the account with an active token. Never echo the token value into logs
or commits.

## Release tarballs

`release/` holds the docker tarballs used by `deno task publish`. They are gitignored and stay on
disk only — never commit them.

## Mistakes I keep repeating

1. **Forgetting to rebuild `public/dist/app.js` after engine changes.** The dev server serves the
   committed bundle, so a code change is invisible until `deno run --allow-all scripts/build-web.ts`
   runs. Browser verification of a recent engine change failed silently because of this — always
   rebuild before opening the browser.

2. **`findCardIn` vs `findCard`.** The engine's `findCard(state, id)` returns `{ card, side }`; the
   UI's `findCardIn(state, id)` in `src/web/ui/util.ts` returns the `CardInstance` directly. Do not
   write `found.card.cardId` when using the UI helper — it's `found.cardId`. This crashed the render
   once.

3. **`deno check` vs `deno task check`.** `deno check src/mod.ts` is the right form;
   `deno task check` does something else. Use the full path.

4. **Forgetting that the browser tool's `browser_snapshot` returns a string,** not an object — regex
   it directly, don't `JSON.stringify` first (quoting gets escaped and refs don't match).

5. **Clicking a card tile in the discard picker opens the zoom popup**, which intercepts pointer
   events and blocks the next click. Close it with `browser_press_key({ key: "Escape" })` (or click
   the ✕ Close button) before interacting with anything behind it.

6. **The Corp AI sometimes never installs in a remote** on a given seed, so browser tests that need
   a remote server must fast-forward several turns (spending runner clicks, discarding at the
   discard phase) until one appears. Seed 3 reliably produces one by turn 11.

7. **`deno fmt` then `deno check`.** Format first, then check — formatting can change how errors
   line up.

8. **`applyMove` works on a copy and returns the new state.** It never mutates the caller's object.
   Tests that check the result must read `result.state`, not the original.

9. **The AI must not know the opponent's deck order.** Simulations run on states built by
   `determinize(view, ctx, rng)`, which sets `drawMode: "random"` on the hypothesis, so every draw
   pulls a random card from the remaining deck instead of the top one. The real game always uses
   `"top"`. The multiset of cards in hidden zones is visible to the AI via `ctx` (the accepted
   concession). Don't shuffle the deck — that's O(n) per playout; the flag is O(1) per draw.
