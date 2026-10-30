# AGENTS.md

Guide for AI agents working on this repo. The full README covers features and
usage; this file is the build/verify loop plus the mistakes I keep repeating.

## Build & verify loop

```sh
# Type-check (prints nothing and exits 0 on success)
/usr/local/bin/deno check src/mod.ts

# Format
deno fmt

# Test suite (67 tests, ~10s)
deno task test

# CPU profile the UCT AI (writes uct.cpuprofile + uct.md; md has top-10 + call tree)
deno run --allow-read --cpu-prof --cpu-prof-dir . --cpu-prof-name uct.cpuprofile \
  --cpu-prof-md scripts/prof-uct.ts

# Rebuild the web bundle (committed to git; the Docker image ships it as-is)
deno run --allow-all scripts/build-web.ts

# Restart the dev server after a rebuild
pkill -f "deno.*serve-web"; sleep 1
(deno task serve-web > /tmp/opencode/serve.log 2>&1 &)
sleep 3; deno eval "const r = await fetch('http://localhost:8000/'); console.log(r.status)"

# Publish to the host (rebuilds bundle, exports docker tarball, restarts systemd)
deno task publish
```

- Local git branch is `master`; the remote is `main`. Push with
  `git push origin master:main`.
- `deno` is at `/usr/local/bin/deno` (2.9.8, Debian/glibc aarch64). `deno
  check src/mod.ts` prints nothing and exits 0 on success.
- 9 pre-existing `no-import-prefix` lint errors from `npm:vue` imports are
  baseline — do not fix them.
- Publish needs `ssh` (openssh-client) and `crane` in the sandbox; install
  via `apt-get install -y openssh-client` and the crane release tarball if
  missing.

## Secrets

`opencode.json`, `core`, and `orange` are gitignored. Never commit them.
`orange` is the SSH key for `matty@192.168.0.2` and is passed via
`ssh -i` only. `gh_fine_grained_key.txt` holds the GitHub PAT — also
gitignored.

## Release tarballs

`release/` holds the docker tarballs used by `deno task publish`. They are
gitignored and stay on disk only — never commit them.

## Mistakes I keep repeating

1. **Forgetting to rebuild `public/dist/app.js` after engine changes.** The dev
   server serves the committed bundle, so a code change is invisible until
   `deno run --allow-all scripts/build-web.ts` runs. Browser verification of a
   recent engine change failed silently because of this — always rebuild
   before opening the browser.

2. **`findCardIn` vs `findCard`.** The engine's `findCard(state, id)` returns
   `{ card, side }`; the UI's `findCardIn(state, id)` in `src/web/ui/util.ts`
   returns the `CardInstance` directly. Do not write `found.card.cardId` when
   using the UI helper — it's `found.cardId`. This crashed the render once.

3. **`deno check` vs `deno task check`.** `deno check src/mod.ts` is the right
   form; `deno task check` does something else. Use the full path.

4. **Forgetting that the browser tool's `browser_snapshot` returns a string,**
   not an object — regex it directly, don't `JSON.stringify` first (quoting
   gets escaped and refs don't match).

5. **Clicking a card tile in the discard picker opens the zoom popup**, which
   intercepts pointer events and blocks the next click. Close it with
   `browser_press_key({ key: "Escape" })` (or click the ✕ Close button)
   before interacting with anything behind it.

6. **The Corp AI sometimes never installs in a remote** on a given seed, so
   browser tests that need a remote server must fast-forward several turns
   (spending runner clicks, discarding at the discard phase) until one
   appears. Seed 3 reliably produces one by turn 11.

7. **`deno fmt` then `deno check`.** Format first, then check — formatting can
   change how errors line up.

8. **`applyMove` works on a copy and returns the new state.** It never
   mutates the caller's object. Tests that check the result must read
   `result.state`, not the original.

9. **The AI must not know the opponent's deck order.** Simulations run with
   `drawMode: "random"` (set on the clone in `UctAI.chooseMove`), so every
   draw pulls a random card from the remaining deck instead of the top one.
   The real game always uses `"top"`. The multiset of cards in the
   opponent's deck is still visible to the AI, which is the accepted
   concession. Don't shuffle the deck — that's O(n) per playout; the flag is
   O(1) per draw.