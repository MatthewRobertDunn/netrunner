---
name: play-browser-netrunner
description: Drive the Netrunner web UI (this repo's `public/serve.ts` app) with a Playwright-style browser agent using only data-* composite selectors. Use when a browser agent needs to start a game, play Corp or Runner turns, answer prompts, discard, run servers, or read game state from the DOM.
---

# Playing Netrunner through the browser

Every control in this UI is findable by **composite `data-*` attributes** — never by
position, art alt text, or button label. Build selectors as CSS conjunctions
(`[data-action="run"][data-server="hq"]`); don't parse visible text.

## Rules of the scheme

- `data-action` is the verb: the **engine move kind** when the button plays a move
  (`run`, `prompt.answer`, `install`, `ability`, …), otherwise a
  UI verb (`zoom`, `close`, `discard-pick`, `discard-submit`, `open-access`,
  `show-result`, `new-game`, `toggle-log`, `pick-side`, `pick-preset`,
  `random-seed`, `set-seed`, `start`).
- **A move kind carries no actor.** `install`, `draw`, `gainCredits`, `ability` are the
  same verb on both seats — a move is verb + parameters, never `runner.run`. The seat
  comes from scope (`[data-own="true"]`) and, for the shared `install` verb, from the
  payload: `[data-action="install"][data-server="hq"]` is the Corp's install,
  `[data-action="install"]` with no `data-server` is the Runner's.
- Each parameter lives in its own attribute (below). Two copies of a card differ
  only by `data-instance` (e.g. `runner-2005` vs `runner-2007`); `data-card-id`
  names the card definition (`unity`).
- `data-sub` and `data-ability` are **1-based** to match visible labels.
- There are zero `data-testid` attributes in the DOM, and the UI never reads any
  `data-*` attribute.
- **Scoping attributes are not unique selectors.** `data-server` marks both a server's column
  container and (when a run is legal) its Run button — `[data-server="hq"]` alone matches TWO
  elements. `data-card-id` is the same kind of thing (hand cards, board tiles, sheet rows, scored
  mini-cards all carry it). Always pair a scoping attribute with `data-action`
  (`[data-action="run"][data-server="hq"]`) or use it to scope a descendant
  (`[data-server="hq"] .server-root-row .card-tile`).
- The contract is pinned by `tests/ui/game_screen_test.ts` and
  `tests/ui/card_zoom_test.ts`, and documented in `docs/ui-gotchas.md` (entry 8).
  If a selector below stops matching, fix the source, not the skill.

## Attribute catalog

| Attribute | Meaning | Example |
|---|---|---|
| `data-action` | verb (move kind or UI verb) | `prompt.answer` |
| `data-server` | server id — **not unique**: marks both the server's column container and, when a run is legal, its Run button | `hq`, `rd`, `archives`, `remote-1`, `new-remote` |
| `data-card-id` | card definition id | `unity`, `palisade` |
| `data-instance` | copy/instance id | `runner-12` |
| `data-target` | target instance id | `corp-33` |
| `data-sub` | 1-based subroutine index | `2` |
| `data-ability` | 1-based ability index | `1` |
| `data-option` | engine optionId on prompt answers | `rez-corp-12`, `pass` |
| `data-preset` | AI strength preset | `casual`, `normal`, `strong` |
| `data-card-pos` | ice position, **innermost = 1** | `2` |
| `data-card-effective-strength` | printed strength + the live pump — the number a run is decided on; **absent on a face-down tile** (strength would reveal the card) | `5` |
| `data-hosted-advancement` | advancement counters on the card — **open information (rule 10.2.3)**, so it rides even a face-down tile whose identity is hidden | `2` |
| `data-hosted-credits` | credit counters hosted on the card — likewise open, likewise present face-down | `9` |
| `data-player-credits` | a player's credit pool | `5` |
| `data-player-clicks` | clicks left this turn | `3` |
| `data-player-hand` | cards in hand | `6` |
| `data-player-hand-size` | hand limit | `5` |
| `data-player-deck` | cards left in R&D / stack | `27` |
| `data-player-discard` | cards in Archives / heap | `0` |
| `data-player-agenda-points` | scored agenda points | `0` |
| `data-player-tags` (Runner) / `data-player-bad-publicity` (Corp) | tags / bad publicity — different things, different names | `2` |
| `data-agenda-target` | points needed to win (status dock, game-wide) | `7` |
| `data-side` | `corp` \| `runner` | |
| `data-own` | `true` = this seat's interface, `false` = mirror | |
| `data-dock` | region: `status`, `card`, `log` | |
| `data-panel` | region: `setup`, `turn`, `servers`, `hand`, `warnings`, `actions`, `log`, `score-<side>` | |
| `data-modal` | dialog: `zoom` (card popup + access decisions), `win`, `archives-breach` | |
| `data-banner` | run context: `run` \| `breach` | |
| `data-state` | `thinking` / `waiting` (AI acting); inside `[data-modal="archives-breach"]` per-tile: `remaining` \| `accessing` \| `accessed` \| `stolen` | |
| `data-breach-accessed` | archives dialog status: "Accessed X of N" | |
| `data-breach-remaining` | archives dialog status: N cards left to access | |
| `data-breach-stolen-points` | present only when agendas were stolen this breach: "+N agenda points" | |
| `data-prompt` | prompt kind on the prompt box | `mulligan`, `discard`, `rez-window`, `choose-one`, `access-decision` |

## Setup loop

```css
[data-action="pick-side"][data-side="runner"]   /* or corp */
[data-action="pick-preset"][data-preset="normal"]
[data-action="set-seed"]                        /* the <input> */
[data-action="random-seed"]
[data-action="start"]
```

`[data-panel="setup"]` scopes the whole setup screen. After clicking `start`,
wait for `[data-dock="status"]` to exist.

## Reading game state (no engine access needed)

- **Accessibility snapshots show ROLES and NAMES, not `data-*` attributes.** A
  snapshot of the Archives dialog renders `dialog "Accessing Archives"` /
  `button "Finish access"` / `generic "Hedge Fund Gain 9 credits."` — the
  attributes are on those elements but the snapshot tree omits them. Never
  conclude a control "has no data-* attributes" from a snapshot: the scheme is
  on the DOM. Two ways to read/act on it:
  - **Act by selector**: the click/find tools accept a unique CSS selector, so
    click straight from this skill's catalog (e.g.
    `[data-modal="archives-breach"] [data-action="access-remaining"]`) — no
    snapshot ref needed.
  - **Read by evaluate**: `document.querySelector(sel)?.getAttribute("data-x")`,
    or dump a whole attribute map, e.g.
    `[...document.querySelectorAll('[data-modal="archives-breach"] [data-state]')].map(e => ({state: e.getAttribute('data-state'), id: e.getAttribute('data-instance')}))`.
  Only fall back to button NAMES when an element genuinely has no selector —
  and then prefer the names this app guarantees: breach tiles are
  `"Access <Card Title> (<instance-id>)"` (unique even for duplicate cards),
  plus `"Access remaining"` / `"Finish access"`.
- Turn/phase: `[data-dock="status"] .turn-num` (text `Turn 3`) and
  `[data-dock="status"] .turn-player` (e.g. `Runner · acting`).
- Whose interface: `[data-own="true"]` is the human seat; `[data-own="false"]`
  mirrors the opponent (never has action buttons).
- Both players' status, straight off the block — no scraping of visible text:
  `[data-side="corp"][data-player-credits]`, `.data-player-clicks`,
  `-hand`, `-hand-size`, `-deck`, `-discard`, `-agenda-points`, plus `-tags`
  (Runner) / `-bad-publicity` (Corp). The win target is `[data-agenda-target]`.
  Add `[data-own="true"]` to get the human's own numbers.
- Waiting on the AI: `[data-state="thinking"]` (status dock) or
  `[data-state="waiting"]` (action panel). Poll until they disappear.
- Winner: `[data-modal="win"]` auto-opens; after dismissal,
  `[data-action="show-result"]` reopens it.
- On a card tile: `data-card-effective-strength` (printed + live pump — absent
  face-down), and `data-hosted-*` counters. `[data-hosted-advancement="<n>"]` is
  the most-read number on the board: combine it with `[data-card-id]` on a
  face-up card, or with the server scope (`[data-server="…"]`) / `[data-card-pos]`
  on a face-down one — the counter is open information (rule 10.2.3) even where
  the card's identity is hidden.

## Runner loop

```css
/* Basic actions (tiles double as buttons): */
[data-own="true"] [data-action="gainCredits"]
[data-own="true"] [data-action="draw"]

/* Runs: one button per server, always names the server: */
[data-action="run"][data-server="hq"]

/* Hand cards: tiles + per-card action buttons */
[data-panel="hand"] .hand-card[data-card-id="unity"]                    /* the copy */
[data-panel="hand"] .hand-card[data-instance="runner-12"]               /* exact copy */
[data-panel="hand"] .hand-card[data-card-id="unity"] [data-action="install"]
[data-panel="hand"] .hand-card[data-card-id="jailbreak"] [data-action="playEvent"][data-server="hq"]

/* Mid-run (in [data-banner="run"]): */
[data-action="continueRun"]
[data-action="jackOut"]

/* Icebreaker interactions (buttons under the installed program on the sheet): */
.card-sheet[data-own="true"] .sheet-card[data-instance="runner-12"] [data-action="pumpIcebreaker"]
.card-sheet[data-own="true"] .sheet-card[data-instance="runner-12"] [data-action="breakSubroutine"][data-sub="2"]
.card-sheet[data-own="true"] .sheet-card[data-instance="runner-12"] [data-action="bioroidBreak"][data-sub="1"]

/* Breach (in [data-banner="breach"]): */
[data-action="accessRandom"]              /* random access */
[data-action="open-access"]                      /* reopens the access zoom if closed */

/* Access decision lives INSIDE the zoom modal — the only place these appear: */
[data-modal="zoom"] [data-action="trashAccessed"]
[data-modal="zoom"] [data-action="finishAccess"]

/* ARCHIVES breaches are different: a modal owns the whole breach, the zoom
   and the action panel stand down, and these are the ONLY controls: */
[data-modal="archives-breach"] [data-action="accessCard"][data-target="corp-33"]  /* click a remaining tile */
[data-modal="archives-breach"] [data-action="access-remaining"]                    /* sweep the rest, agenda-first */
[data-modal="archives-breach"] [data-action="finishAccess"]                        /* only while a tile is data-state="accessing" */
```

### The Archives breach dialog (rule 7.3.4: access EVERY card)

When a run on Archives succeeds, `[data-modal="archives-breach"]` opens (human
Runner only). It is **not dismissible** — no Esc, no backdrop click, no close
button; it unmounts by itself when every card is accessed. Cards render in one
horizontally scrolling row, agendas leftmost (stealing them is the win
condition). Access semantics:

- `[data-state="remaining"]` tiles are the clickable ones
  (`[data-action="accessCard"]`). Click them one at a time, or press
  `[data-action="access-remaining"]` once to sweep the pile left-to-right.
- After a click the tile flips to `data-state="accessed"` (or `stolen` for an
  agenda — badged "Stolen +N"; read `data-breach-stolen-points`). Agendas are
  stolen automatically (rule 7.1.6); nothing in Archives is trashable
  (rule 7.1.5b) — there are deliberately no Trash buttons here.
- If a tile shows `data-state="accessing"`, the engine auto-chose it and its
  forced finish decision is pending: click `[data-action="finishAccess"]` (or
  `access-remaining`, which also answers it).
- Progress: `[data-breach-accessed]` ("Accessed X of N"),
  `[data-breach-remaining]`. The dialog closes itself at X = N.

A one-card Archives (e.g. the Corp's first-turn mandatory discard on seed 42)
goes straight to that last case: the dialog opens with a single
`data-state="accessing"` tile and only `Finish access` / `Access remaining`
worth clicking — there is no `remaining` tile at all. That is correct, not a
missing scheme. Note also that the tile's snapshot name comes from its card
title tooltip (`"Hedge Fund Gain 9 credits."`); its `data-card-id` (the
definition id `hedge_fund`) is on the tile, and `data-instance` on the slot —
use those, not the name.

Turn end: spend clicks with any legal moves; the turn auto-ends at 0 clicks
(there is no End Turn button). If hand > hand-size, the discard prompt appears.

## Corp loop

```css
[data-own="true"] [data-action="gainCredits"]
[data-own="true"] [data-action="draw"]
[data-panel="hand"] .hand-card[data-card-id="palisade"] [data-action="install"][data-server="hq"]  /* or rd/archives/remote-N/new-remote */
[data-panel="hand"] .hand-card[data-card-id="hedge_fund"] [data-action="playOperation"]
[data-server="hq"] .server-root-row .card-tile[data-card-id="nico_campaign"]  /* installed asset (click → zoom) */

/* Advance / Score / Rez / installed-asset abilities: the Corp sheet renders NO
   card rows (its cards are on the board), so these live in the Actions list,
   each naming its target instance: */
[data-panel="actions"] > .moves [data-action="advance"][data-target="corp-33"]
[data-panel="actions"] > .moves [data-action="score"][data-target="corp-33"]
[data-panel="actions"] > .moves [data-action="rez"][data-target="corp-33"]
[data-panel="actions"] > .moves [data-action="ability"][data-target="corp-33"][data-ability="1"]
```

Corp cards live on the board (not as sheet rows) — locate installed cards by
`[data-server="…"] .card-tile[data-card-id="…"]`; rezzed/unrezzed ice by
`[data-server="…"] .server-ice-stack .card-tile[data-card-id="…"]` (unrezzed ice
is redacted: no `data-card-id`, only `data-card-pos`).

## Prompts (the decision points)

The prompt box is `[data-prompt="<kind>"]` inside `[data-panel="actions"]`. Every
answer is `[data-action="prompt.answer"][data-option="<optionId>"]` — answer by
option id, not button text:

```css
[data-action="prompt.answer"][data-option="pass"]     /* the reserved decline */
[data-action="prompt.answer"][data-option="rez-corp-12"]
```

Discard prompts replace the buttons with the picker:

```css
[data-action="discard-pick"][data-card-id="vrcation"]           /* first copy ambiguity! */
[data-action="discard-pick"][data-instance="runner-2005"]       /* exact copy */
[data-action="discard-submit"]                                  /* enabled when count met */
```

Picked state = `aria-pressed="true"` (+ the `.picked` class). Discard tiles are
plain buttons — do **not** click the tile art inside them (it opens the zoom and
blocks the next click).

## Known UI quirks

- **`[data-server="…"]` is not unique.** It sits on the server's column container *and* on its Run
  button, so it matches two elements whenever a run is legal (and one when it doesn't — the button
  disappears mid-run). Select the button as `[data-action="run"][data-server="…"]`, or use
  `data-server` purely as a scope for descendants (`[data-server="hq"] .server-root-row .card-tile`).
- **The zoom popup intercepts clicks.** Clicking any card tile opens
  `[data-modal="zoom"]`; close it with `Escape` or
  `[data-modal="zoom"] [data-action="close"]` before touching anything behind it.
  The hand-card action row also hides while that card's zoom is open.
- **A pending rez-window blocks mid-run moves.** Approaching ice (or the server)
  can park the run on the CORP's rez-window prompt (`[data-prompt="rez-window"]`,
  rule 6.9.4e). While it is pending, `[data-action="continueRun"]` may be absent
  or illegal — the AI Corp answers it within ~100ms. If a mid-run button you
  expect is missing, poll: check `[data-prompt]` / `[data-state="thinking"]`
  and re-read `[data-banner="run"]` before concluding the move is illegal.
- **Two copies of a card** share `data-card-id` — always disambiguate by
  `data-instance` when it matters which copy. This applies to ACTION BUTTONS
  too, not just tiles: with two icebreakers installed, every
  `breakSubroutine`/`pumpIcebreaker` button exists once per program, each
  carrying its own `data-instance` (the program's instance id) — pair
  `[data-action]` with `[data-instance]` to hit the breaker you mean.
- **DOM order of ice flips with the seat** (corp seat renders the stack
  reversed). Never use `nth` on ice slots; use `data-card-pos` (innermost = 1).
- **The AI opponent plays fast.** Between your turns, poll
  `[data-state]`/`[data-banner]` rather than assuming the board is static, and
  re-read the log (`[data-panel="log"]`) to reconstruct what happened.
- **The Corp's own sheet renders no card rows** (its cards live on the board), so
  every non-basic Corp move — `advance`, `score`, `rez`, and an installed asset's paid
  `ability` — appears in the Actions list (`[data-panel="actions"] > .moves`), each
  naming its target. The Runner's installed-card actions instead render under the
  card's row on the sheet. There is no table of "kind → surface" to consult: the
  exclusion is derived from what the own sheet actually drew.
- **The DOM is the contract — never reach past it.** The page holds the full
  engine state client-side (`window.__netrunner` exists for debugging, and Vue
  internals are inspectable), but an automation agent must not use them to read
  hidden information or to drive moves: the data-* annotations above are the
  sanctioned interface, and what they expose is exactly what the seat may know.
  Reading `window.__netrunner`'s raw state would leak the opponent's hand and
  deck order — treat it as off-limits the way a human peeking at the Corp's
  hand would be.
- **`data-testid` selectors must not be reintroduced** — they failed exactly
  because positional strings couldn't carry extra parameters (see
  `docs/ui-gotchas.md` entry 8 for the history).

## Smoke test sequence (works on seed 42, runner side)

1. `[data-action="pick-side"][data-side="runner"]` → `[data-action="start"]`.
2. `[data-own="true"] [data-action="gainCredits"]` twice → credits 5→7, clicks 4→2.
3. `[data-panel="hand"] .hand-card[data-card-id="unity"] [data-action="install"]`
   → clicks 2→1 (a third click was spent here).
4. `[data-action="run"][data-server="hq"]` → `[data-banner="run"]` appears.
5. `[data-action="continueRun"]` (or jack out) → banner flips to
   `breach` on unprotected HQ.
6. `[data-action="accessRandom"]` → `[data-modal="zoom"]` opens with
   `[data-action="finishAccess"]` (and trash if affordable).
7. Click finish → run ends, clicks exhaust, turn auto-ends.
