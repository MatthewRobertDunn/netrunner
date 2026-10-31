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
   internal scroll. Don't reintroduce stretch-driven heights — re-measure
   `actionRowH == actionPanelH` in the browser after touching this layout. Files:
   `public/css/style.css`. Tests: browser measurement (action row hugs its panel, action→hand gap is
   exactly the 10px grid gap).

2. **The access zoom is the human's decision prompt, not any access.** `accessedCard` in
   `src/web/ui/game.ts` resolved every `access-decision` prompt, so during the AI Runner's turn the
   zoom auto-opened on each access and closed ~60ms later when the AI answered — a dialog flashing
   with no possible input. It now only resolves prompts with `player === humanSide` (same gate in
   `accessActions`), so opponent accesses surface via the breach banner and log only. Files:
   `src/web/ui/game.ts`. Tests: `tests/ui/game_screen_test.ts` ("only the human's own access
   decision pops the zoom").
