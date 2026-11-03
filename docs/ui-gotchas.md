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

5. **Installed-card actions are routed by a shared kind table, not by hand-maintained lists.**
   `INSTALLED_ACTION_KINDS` in `src/web/ui/card-sheet.ts` (`runner.ability`,
   `runner.breakSubroutine`, `runner.pumpIcebreaker`) is the single place that decides which moves
   render under a card; GameScreen's `generalMoves` filters the same set out of the Actions list.
   Adding a new under-card action kind updates exactly one table — duplicating the filter in two
   places is how duplicates (the same "Break sub 1" button under the program AND in the Actions
   list) get introduced. Files: `src/web/ui/card-sheet.ts`, `src/web/ui/game.ts`.

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
   `[data-action="runner.run"][data-server="hq"]`,
   `[data-action="prompt.answer"][data-option="pass"]`,
   `[data-action="discard-pick"][data-card-id="unity"]`. The older scheme baked parameters into
   positional testid strings (`run-remote-2`), and that is exactly why coverage rotted: a control
   whose identity needed a second or third dimension (which subroutine? which option? which copy?)
   had nowhere to put it, so instead of breaking the convention it got NO annotation — pick-slots,
   hand-card buttons, prompt answers, zoom action buttons, and presets were all unreachable by
   attribute. Composite attributes fix the cause: each dimension gets its own named attribute, so a
   new capability is a new attribute, not a new string format. The vocabulary:
   - Clickables: `data-action` = the engine move kind (`runner.run`, `prompt.answer`,
     `corp.install`, `runner.ability`, …) when the button plays a move, else a UI verb (`zoom`,
     `close`, `discard-pick`, `discard-submit`, `open-access`, `show-result`, `new-game`,
     `toggle-log`, `pick-side`, `pick-preset`, `random-seed`, `set-seed`, `start`).
   - Move parameters (own attributes): `data-server`, `data-card-id` (definition id, e.g. `unity`),
     `data-instance` (copy/instance id), `data-target` (target instance), `data-sub` and
     `data-ability` (1-based, matching the visible label), `data-option` (engine optionId; the
     reserved decline is `data-option="pass"`), `data-preset`.
   - Scoping: `data-side` (`corp|runner`), `data-own` (`true|false` — `[data-own="true"]` is this
     seat's interface, `false` the mirror), `data-card-pos` (ice position, innermost = 1; DOM order
     flips with the corp-seat CSS flip, positions do not), `data-group` (sheet group).
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
