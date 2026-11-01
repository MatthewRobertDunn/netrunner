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
   Now: `.game` aligns to `flex-start`, `.game-main` uses `align-content: start` (leftover space
   stays below the column), and both docks are `position: sticky` capped to `100vh - 24px` with
   internal scroll. **Manual check only — no `deno test` pins this.** Re-measure
   `actionRowH == actionPanelH` and confirm the action→hand gap is exactly the 10px grid gap in the
   browser after touching this layout. Files: `public/css/style.css`.

2. **The access zoom is the human's decision prompt, not any access.** `accessedCard` in
   `src/web/ui/game.ts` resolved every `access-decision` prompt, so during the AI Runner's turn the
   zoom auto-opened on each access and closed ~60ms later when the AI answered — a dialog flashing
   with no possible input. It now only resolves prompts with `player === humanSide` (same gate in
   `accessActions`), so opponent accesses surface via the breach banner and log only. Files:
   `src/web/ui/game.ts`. Tests: `tests/ui/game_screen_test.ts` ("only the human's own access
   decision pops the zoom").

3. **Ice stacks: order lives in TWO places, and unrezzed ice must stay IN POSITION.** The engine
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
