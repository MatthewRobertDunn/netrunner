# UI gotchas — traps for future developers

This file records the layout/component traps that have bitten this web UI (or nearly have), so they
are not reintroduced. Rule-text traps live in `docs/rules-gotchas.md`; this file is for CSS
structure, Vue reactivity, and human-vs-AI presentation issues. Every entry names the files involved
and the test that pins the fix.

1. **Side docks must never drive page height; the play grid must not absorb it.** `.log-dock` once
   grew with the game log (its inner panel's `overflow: auto` never engaged because no ancestor had
   a capped height), and `.game { align-items: stretch }` forced `.game-main` to the same height.
   The grid's default row stretching then inflated `.servers`, `.action-row`, and `.hand-area` far
   beyond their content — a tall black void opened between the action panel and the hand (the void
   sat _inside_ `.action-row`, whose panel is only as tall as its buttons). The 50/50 status-dock
   split had the same disease: the halves divided a log-driven page height instead of the viewport.
   Now: `.game` aligns to `flex-start`, and `.game-main` hands its leftover height to `.servers`
   (`flex: 1 0 auto` with `min-height: 340px` — the play area grows, while the action panel and hand
   keep their content sizes). Both docks are `position: sticky` capped to `100vh - 24px` with
   internal scroll. **Manual check only — no `deno test` pins this.** Confirm the servers/board
   fills the play column, and that no dock drives the page height (see entry 2 for the dock that
   replaced the action row). Files: `public/css/style.css`.

2. **The card dock replaced the action row; it lives beside the board, not inside `.game-main`.**
   The vertical sidebar (opponent sheet on top, own sheet at the bottom, splitting the viewport
   50/50 like the status dock) is a direct child of `.game`, between the play column and the log
   dock. Written first inside `.game-main`, the play column's `flex: 1` absorbed it and the dock
   collapsed into a 250px black strip under the board. The own sheet carries the ActionPanel through
   an `#actions` slot; the panel's chrome is suppressed inside the sheet
   (`.sheet-body > .action-panel`), so the Actions area reads as a section heading, not a box inside
   a box. The old `actionRowH == actionPanelH` measurement above is superseded: re-measure the two
   sheets' equal heights and the dock's bottom line against the other docks instead. Files:
   `src/web/ui/game.ts`, `src/web/ui/card-sheet.ts`, `public/css/style.css`. Tests:
   `tests/ui/game_screen_test.ts` ("card dock: sheets, per-card actions, no duplicates").

3. **The access zoom is the human's decision prompt, not any access.** `accessedCard` in
   `src/web/ui/game.ts` resolved every `access-decision` prompt, so during the AI Runner's turn the
   zoom auto-opened on each access and closed ~60ms later when the AI answered — a dialog flashing
   with no possible input. It now only resolves prompts with `player === humanSide` (same gate in
   `accessActions`), so opponent accesses surface via the breach banner and log only. Files:
   `src/web/ui/game.ts`. Tests: `tests/ui/game_screen_test.ts` ("only the human's own access
   decision pops the zoom").

4. **A sheet card row has exactly one button (the title) on opponent sheets.** The title is a zoom
   button; token chips and per-card actions are `<span>`/`<button>` children of the row, but the row
   itself is not a button container. The opponent sheet must never render actions — another player's
   decisions are not this seat's interface — so the row's only button is the title. A test asserting
   `row.findAll("button").length === 1` pins this. Files: `src/web/ui/card-sheet.ts`. Tests:
   `tests/ui/game_screen_test.ts`.

5. **The no-duplicates rule is derived from the sheet's own rows, not a parallel kind table.**
   `buildSheetGroups` in `src/web/ui/card-sheet.ts` is the single place that decides which moves
   render under a card; GameScreen's `generalMoves` excludes exactly the moves those rows hold
   (`sheetHostedKeys`, built from `ownGroups`), so the two can never drift. The old
   `INSTALLED_ACTION_KINDS` kind set was deleted when moves stopped carrying their actor: a kind can
   no longer distinguish `runner.ability` from `corp.ability` (both are now `ability`), and a
   kind-only set would have silently dropped the Corp's installed-asset paid abilities (e.g.
   Regolith Mining License's "[click]: take 3 credits") out of the Actions list — the Corp sheet
   renders no card rows because its cards live on the board, so the Actions list is their ONLY
   surface. Deriving from the rows keeps them reachable and adapts for free if the Corp sheet ever
   gains groups. Duplicating the filter by kind is how the same action appears twice (under the
   program AND in the Actions list). Files: `src/web/ui/card-sheet.ts`, `src/web/ui/game.ts`.

6. **Game over is a modal, not a sidebar banner.** The win announcement lived in the action panel
   when that was a full-width row; once the panel moved into the card dock's own sheet (a narrow
   per-card sidebar), the banner read as a stray control half its width. The announcement is now
   WinModal (a dialog over the play surface, same focus-trap contract as CardZoom) that opens
   automatically on `state.winner` and is dismissible — Esc/backdrop reveal the final board, and the
   status dock's Winner chip (`data-action="show-result"`, a real `<button>`) reopens it. Don't move
   the announcement back into ActionPanel on the next "the modal is annoying" pass; make the modal
   less intrusive instead. Files: `src/web/ui/win-modal.ts`, `src/web/ui/game.ts`. Tests:
   `tests/ui/game_screen_test.ts` ("win modal").

7. **Ice stacks: order lives in TWO places, and unrezzed ice must stay IN POSITION.** The engine
   lists ice innermost-first (`ServerState.ice`), but the corp seat renders the stack top-down on
   the runner side, so ServerColumn reverses the array there (`iceSlots` computed) — without it the
   corp seat draws mirrored stacks and the RUN badge runs the wrong way. Never "fix" this with
   `flex-direction: column-reverse`: it also flips the `.ice-slot + .ice-slot` negative-margin
   overlap. And the public DTO must keep unrezzed ice IN POSITION as `cardId: "hidden"` entries
   (`public-status.ts`); the old `unrezzedIceCount` + append-a-count-after render drew mixed-rez
   stacks inside-out (the exact inverse of the physical layout) and lost the RUN badge on approached
   facedown ice. Files: `src/engine/public-status.ts`, `src/web/ui/server-column.ts`,
   `public/css/style.css` (comments only). Tests: `tests/ui/game_screen_test.ts` ("multi-ice stack
   renders outermost farthest in both seats", "approached facedown ice carries the RUN badge"),
   `tests/public_status_test.ts` ("unrezzed ice stays in position as hidden entries").

8. **Every clickable carries `data-action` + parameter attributes — never `data-testid`.** The DOM
   contract for browser agents (and any scripted driving of the UI) is purely composite:
   `[data-action="run"][data-server="hq"]`, `[data-action="prompt.answer"][data-option="pass"]`,
   `[data-action="discard-pick"][data-card-id="unity"]`. The older scheme baked parameters into
   positional testid strings (`run-remote-2`), and that is exactly why coverage rotted: a control
   whose identity needed a second or third dimension (which subroutine? which option? which copy?)
   had nowhere to put it, so instead of breaking the convention it got NO annotation — pick-slots,
   hand-card buttons, prompt answers, zoom action buttons, and presets were all unreachable by
   attribute. Composite attributes fix the cause: each dimension gets its own named attribute, so a
   new capability is a new attribute, not a new string format. The vocabulary:
   - Clickables: `data-action` = the engine move kind (`run`, `prompt.answer`, `install`, `ability`,
     …) when the button plays a move, else a UI verb (`zoom`, `close`, `discard-pick`,
     `discard-submit`, `open-access`, `show-result`, `new-game`, `toggle-log`, `pick-side`,
     `pick-preset`, `random-seed`, `set-seed`, `start`).
   - Move parameters (own attributes): `data-server`, `data-instance` (copy/instance id),
     `data-target` (target instance), `data-sub` and `data-ability` (1-based, matching the visible
     label), `data-option` (engine optionId; the reserved decline is `data-option="pass"`),
     `data-preset`, `data-card-id` (the definition id the move is about, e.g. `unity`).
   - INFORMATION families, prefixed so a name can never mean two things:
     - `data-card-*` — properties of the card itself: `data-card-id`, `data-card-pos` (ice position,
       innermost = 1), `data-card-effective-strength` (printed + the live pump, rule 3.9.5b — the
       number a Runner computes an encounter with). Only the EFFECTIVE strength is emitted; an
       innate `data-card-strength` has room under the prefix but no consumer yet (YAGNI). Effective
       strength is hidden with the card id (strength fingerprints the card, 10.2.2/4.6.3), so it is
       absent on a face-down tile.
     - `data-hosted-*` — counters HOSTED on a card: `data-hosted-advancement`,
       `data-hosted-credits`. Open information (rule 10.2.3), so they ride the tile even when its
       identity is redacted. The prefix is what keeps `data-hosted-credits` (counters ON the card)
       distinct from a future `data-card-credits` (the card's printed cost).
     - `data-player-*` — a player's global status, on the `data-side` block: `data-player-credits`,
       `data-player-clicks`, `data-player-hand`, `data-player-hand-size`, `data-player-deck`,
       `data-player-discard`, `data-player-agenda-points`, and `data-player-tags` (Runner) /
       `data-player-bad-publicity` (Corp) — kept as separate names because tags and bad publicity
       are different things. The game-wide `data-agenda-target` sits on the status dock.
   - Moves carry no actor: `data-action` is the bare verb (`run`, `install`, `draw`, `ability`) — a
     move is verb + parameters, never `runner.run`. The seat comes from scope
     (`[data-own="true"] [data-action="gainCredits"]`) and, for the one shared verb with two shapes,
     from the payload: `[data-action="install"][data-server="hq"]` is the Corp's install,
     `[data-action="install"]` without a server is the Runner's. `isCorpInstall` / `isRunnerInstall`
     in `src/types.ts` are the single guard for that distinction.
   - Scoping: `data-side` (`corp|runner`), `data-own` (`true|false` — `[data-own="true"]` is this
     seat's interface, `false` the mirror), `data-group` (sheet group).
   - Non-interactive markers: `data-dock` (`status|card|log`), `data-panel`
     (`setup|turn|servers|
     hand|warnings|actions|log|score-<side>`), `data-modal` (`zoom|win`),
     `data-banner` (`run|breach`), `data-state` (`thinking|waiting`), `data-prompt` (prompt kind).
     The rules that keep it clean: there are no `data-testid` attributes in `src/web/` at all; and
     the UI never READS any of these attributes (no `querySelector`/`dataset` in `src/`, no CSS
     styled off `data-*`) — they are write-only test hooks, so renaming one can never change
     behavior. Move buttons get their attributes from `moveActionAttrs(move)` in
     `src/web/ui/util.ts` (a new parameter on a move kind flows through automatically); only
     genuinely non-move controls hand-write their attributes. Files: `src/web/ui/util.ts` (the
     helper), every `src/web/ui/*.ts` render site. Tests: `tests/ui/game_screen_test.ts`,
     `tests/ui/card_zoom_test.ts` (assert the attributes directly).

9. **`tests/ui/setup.ts` must be imported BARE — a named import with an unreferenced binding is
   elided, silently removing the happy-dom bridge.** `setup.ts` installs `globalThis.document` et
   al. as module-body side effects (and exports `installRealCss()` for CSS injection). TypeScript
   import elision drops an import specifier that is never referenced — and when no specifiers
   remain, the whole statement goes, side effects included. A new UI test file that copies
   `import { installRealCss } from "./setup.ts"` without CALLING the helper therefore compiles,
   lints, and fmts clean, then fails every `mount()` with
   `ReferenceError: document is not
   defined` — while sibling test files keep passing, so it looks
   like a per-file haunting rather than a missing module. The diagnostic signature: a module-top
   `typeof globalThis.document` is `"undefined"` only in the failing file, and Deno's transpile
   cache (`~/.cache/deno/gen/file/.../<file>.js`) shows the setup import absent. Rule: import it
   bare (`import "./setup.ts";` — the form `card_tile_test.ts`/`card_zoom_test.ts` already use); the
   named import is only legitimate in files that actually call `installRealCss()`
   (game_screen_test.ts does, twice). `docs/ui-gotchas.md` entry 10's dialog test is the regression
   that found this. Files: `tests/ui/setup.ts` (header warning),
   `tests/ui/archives_breach_dialog_test.ts` (bare import). Pin: none possible in `deno test` — the
   trap is invisible to fmt/lint/check — so the setup.ts header comment and this entry are the
   guard.

10. **The Archives breach dialog is the human Runner's single surface for the breach; the zoom and
    the action panel stand down while it is open.** A successful Archives run must access EVERY card
    in the discard pile (rules 7.3.2-7.3.4, 7.4.1d) — nothing is declinable — so the modal is not
    dismissible (no Esc, no backdrop click, no close button); it mounts while
    `state.breach.server === "archives"` for the human Runner and unmounts when the engine ends the
    breach. While open it OWNS the breach: `accessedCard` returns null (the per-card zoom does not
    pop) and the ActionPanel gets `prompt=null`/`generalMoves=[]` (the no-duplicates rule), so the
    DOM has exactly one `accessCard` path (the dialog's tiles), one `finishAccess` path, and one
    `access-remaining` button. One click per card: the driver (`advanceArchives` in
    `src/web/ui/archives-breach.ts`, parametrized over `{getState, apply}` so tests drive it bare)
    answers the FORCED finish decision (`rule 7.1.5b` removed the trash option for cards already in
    Archives) — but a decision the gesture did not request is never answered silently: when the
    engine auto-chooses the last remaining candidate (`stepBreach`'s one-candidate shortcut), the
    loop stops, the tile shows `data-state="accessing"`, and a Finish button appears. Corp prompts
    that fire mid-breach (Send a Message's free-rez choice on steal) park the loop untouched — the
    AI answers them and the human resumes; a runner-owned prompt the dialog cannot answer would hide
    the modal (defensive gate in game.ts's `archivesActive`). DOM contract (pinned by
    `tests/ui/archives_breach_dialog_test.ts`): `[data-modal="archives-breach"]` root; per-tile
    `data-state="remaining|accessing|accessed|stolen"` + `data-instance`; remaining tiles are
    `[data-action="accessCard"][data-target=…]` buttons (disabled while a decision pends);
    `[data-action="finishAccess"]`; `[data-action="access-remaining"]`; status counters
    `data-breach-accessed` / `data-breach-remaining` / `data-breach-stolen-points`. Cards render
    agendas leftmost (stealing them is the point of the run) with a horizontal-scroll row
    (`overflow-x: auto`, z-index 55 — above the card zoom, below the win modal). The template
    expressions are compiled by Vue's RUNTIME compiler in the browser: plain JS only — a TS
    annotation inside a template arrow ( `(id: string) => …` ) is a runtime SyntaxError that breaks
    EVERY GameScreen mount (entry 3's zoom test caught it). Files: `src/web/ui/archives-breach.ts`,
    `src/web/ui/archives-breach-dialog.ts`, `src/web/ui/game.ts`, `src/web/app.ts`,
    `public/css/style.css`. Tests: `tests/ui/archives_breach_dialog_test.ts`.
