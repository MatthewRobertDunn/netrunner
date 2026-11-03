---
name: play-browser-netrunner
description: Drive the Netrunner web UI (this repo's `public/serve.ts` app) with a Playwright-style browser agent using only data-* composite selectors. Use when a browser agent needs to start a game, play Corp or Runner turns, answer prompts, discard, run servers, or read game state from the DOM.
---

# Playing Netrunner through the browser

Every control in this UI is findable by **composite `data-*` attributes** — never by
position, art alt text, or button label. Build selectors as CSS conjunctions
(`[data-action="runner.run"][data-server="hq"]`); don't parse visible text.

## Rules of the scheme

- `data-action` is the verb: the **engine move kind** when the button plays a move
  (`runner.run`, `prompt.answer`, `corp.install`, `runner.ability`, …), otherwise a
  UI verb (`zoom`, `close`, `discard-pick`, `discard-submit`, `open-access`,
  `show-result`, `new-game`, `toggle-log`, `pick-side`, `pick-preset`,
  `random-seed`, `set-seed`, `start`).
- Each parameter lives in its own attribute (below). Two copies of a card differ
  only by `data-instance` (e.g. `runner-2005` vs `runner-2007`); `data-card-id`
  names the card definition (`unity`).
- `data-sub` and `data-ability` are **1-based** to match visible labels.
- There are zero `data-testid` attributes in the DOM, and the UI never reads any
  `data-*` attribute.
- The contract is pinned by `tests/ui/game_screen_test.ts` and
  `tests/ui/card_zoom_test.ts`, and documented in `docs/ui-gotchas.md` (entry 8).
  If a selector below stops matching, fix the source, not the skill.

## Attribute catalog

| Attribute | Meaning | Example |
|---|---|---|
| `data-action` | verb (move kind or UI verb) | `prompt.answer` |
| `data-server` | server id | `hq`, `rd`, `archives`, `remote-1`, `new-remote` |
| `data-card-id` | card definition id | `unity`, `palisade` |
| `data-instance` | copy/instance id | `runner-12` |
| `data-target` | target instance id | `corp-33` |
| `data-sub` | 1-based subroutine index | `2` |
| `data-ability` | 1-based ability index | `1` |
| `data-option` | engine optionId on prompt answers | `rez-corp-12`, `pass` |
| `data-preset` | AI strength preset | `casual`, `normal`, `strong` |
| `data-card-pos` | ice position, **innermost = 1** | `2` |
| `data-side` | `corp` \| `runner` | |
| `data-own` | `true` = this seat's interface, `false` = mirror | |
| `data-dock` | region: `status`, `card`, `log` | |
| `data-panel` | region: `setup`, `turn`, `servers`, `hand`, `warnings`, `actions`, `log`, `score-<side>` | |
| `data-modal` | dialog: `zoom` (card popup + access decisions), `win` | |
| `data-banner` | run context: `run` \| `breach` | |
| `data-state` | `thinking` / `waiting` (AI acting) | |
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

- Turn/phase: `[data-dock="status"] .turn-num` (text `Turn 3`) and
  `[data-dock="status"] .turn-player` (e.g. `Runner · acting`).
- Whose interface: `[data-own="true"]` is the human seat; `[data-own="false"]`
  mirrors the opponent (never has action buttons).
- Clicks/credits: `[data-own="true"] .primary-stat.clicks .primary-val`,
  `[data-own="true"] [data-action="<side>.gainCredits"] .primary-val`.
- Waiting on the AI: `[data-state="thinking"]` (status dock) or
  `[data-state="waiting"]` (action panel). Poll until they disappear.
- Winner: `[data-modal="win"]` auto-opens; after dismissal,
  `[data-action="show-result"]` reopens it.

## Runner loop

```css
/* Basic actions (tiles double as buttons): */
[data-own="true"] [data-action="runner.gainCredits"]
[data-own="true"] [data-action="runner.draw"]

/* Runs: one button per server, always names the server: */
[data-action="runner.run"][data-server="hq"]

/* Hand cards: tiles + per-card action buttons */
[data-panel="hand"] .hand-card[data-card-id="unity"]                    /* the copy */
[data-panel="hand"] .hand-card[data-instance="runner-12"]               /* exact copy */
[data-panel="hand"] .hand-card[data-card-id="unity"] [data-action="runner.install"]
[data-panel="hand"] .hand-card[data-card-id="jailbreak"] [data-action="runner.playEvent"][data-server="hq"]

/* Mid-run (in [data-banner="run"]): */
[data-action="runner.continueRun"]
[data-action="runner.jackOut"]

/* Icebreaker interactions (buttons under the installed program on the sheet): */
.card-sheet[data-own="true"] .sheet-card[data-instance="runner-12"] [data-action="runner.pumpIcebreaker"]
.card-sheet[data-own="true"] .sheet-card[data-instance="runner-12"] [data-action="runner.breakSubroutine"][data-sub="2"]
.card-sheet[data-own="true"] .sheet-card[data-instance="runner-12"] [data-action="runner.bioroidBreak"][data-sub="1"]

/* Breach (in [data-banner="breach"]): */
[data-action="runner.accessRandom"]              /* random access */
[data-action="open-access"]                      /* reopens the access zoom if closed */

/* Access decision lives INSIDE the zoom modal — the only place these appear: */
[data-modal="zoom"] [data-action="runner.trashAccessed"]
[data-modal="zoom"] [data-action="runner.finishAccess"]
```

Turn end: spend clicks with any legal moves; the turn auto-ends at 0 clicks
(there is no End Turn button). If hand > hand-size, the discard prompt appears.

## Corp loop

```css
[data-own="true"] [data-action="corp.gainCredits"]
[data-own="true"] [data-action="corp.draw"]
[data-panel="hand"] .hand-card[data-card-id="palisade"] [data-action="corp.install"][data-server="hq"]  /* or rd/archives/remote-N/new-remote */
[data-panel="hand"] .hand-card[data-card-id="hedge_fund"] [data-action="corp.playOperation"]
[data-server="hq"] .server-root-row .card-tile[data-card-id="nico_campaign"]  /* installed asset (click → zoom) */
/* Advance/Score/Rez: buttons under the card row on the corp's own sheet, or
   via the card's zoom actions; all carry data-target=<instance id>: */
[data-action="corp.advance"][data-target="corp-33"]
[data-action="corp.score"][data-target="corp-33"]
[data-action="corp.rez"][data-target="corp-33"]
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

- **The zoom popup intercepts clicks.** Clicking any card tile opens
  `[data-modal="zoom"]`; close it with `Escape` or
  `[data-modal="zoom"] [data-action="close"]` before touching anything behind it.
  The hand-card action row also hides while that card's zoom is open.
- **Two copies of a card** share `data-card-id` — always disambiguate by
  `data-instance` when it matters which copy.
- **DOM order of ice flips with the seat** (corp seat renders the stack
  reversed). Never use `nth` on ice slots; use `data-card-pos` (innermost = 1).
- **The AI opponent plays fast.** Between your turns, poll
  `[data-state]`/`[data-banner]` rather than assuming the board is static, and
  re-read the log (`[data-panel="log"]`) to reconstruct what happened.
- **`data-testid` selectors must not be reintroduced** — they failed exactly
  because positional strings couldn't carry extra parameters (see
  `docs/ui-gotchas.md` entry 8 for the history).

## Smoke test sequence (works on seed 42, runner side)

1. `[data-action="pick-side"][data-side="runner"]` → `[data-action="start"]`.
2. `[data-own="true"] [data-action="runner.gainCredits"]` twice → credits 5→7, clicks 4→2.
3. `[data-panel="hand"] .hand-card[data-card-id="unity"] [data-action="runner.install"]`
   → clicks 2→1 (a third click was spent here).
4. `[data-action="runner.run"][data-server="hq"]` → `[data-banner="run"]` appears.
5. `[data-action="runner.continueRun"]` (or jack out) → banner flips to
   `breach` on unprotected HQ.
6. `[data-action="runner.accessRandom"]` → `[data-modal="zoom"]` opens with
   `[data-action="runner.finishAccess"]` (and trash if affordable).
7. Click finish → run ends, clicks exhaust, turn auto-ends.
