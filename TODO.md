# TODO

## Paid-ability windows during the opponent's action phase (rules 5.7.1e/f) — deferred

**Status: documented gap, zero impact with the current card pool. Found 2026-11-09 while fixing the
end-of-turn window (rule 5.6.2a, see `docs/rules-gotchas.md` entry 7).**

Rule 5.7.1e/f open paid ability windows during the RUNNER's action phase (before/after each Runner
action), and they are `(P)(R)`: players may use paid abilities AND the Corp may rez non-ice cards.
The engine only surfaces Corp rez options during the Runner's turn inside run approach windows
(6.9.2b/6.9.4e) — the Corp cannot rez an asset/upgrade outside the attacked server while the Runner
is taking actions. With the starter pool this costs nothing (no reason to rez another server's
asset mid-turn), but the same trigger conditions as the run-window TODO below apply. If
implemented, the natural shape is the same as the 5.6.2a window fix: a settle-parked prompt or a
window in the Runner's action phase whose options come from the shared generator in
`src/engine/window.ts` (`endOfTurnWindowMoves` already enumerates corp rez + paid abilities; it
would need a runner-turn variant that yields only the CORP's `(R)` options).

## Paid-ability windows during a run (rules 6.9.1e / 6.9.3b / 6.9.4b) — deferred

**Status: documented gap, zero impact with the current card pool. Revisit when the first card lands
that needs it. Reviewed 2026-11-05.**

### The gap

Rules 6.9.1e, 6.9.3b, and 6.9.4b open paid ability windows mid-run: players may use paid abilities,
and the `(R)`-marked ones (6.9.1e, 6.9.4e) also let the Corp rez **non-ice** cards. The engine
surfaces Corp decisions mid-run only as rez-window prompts (`settle.ts` `approachIceStep` for
6.9.2b, `runs.ts` `approachServerStep` for 6.9.4e). Concretely, three things are missing:

1. **6.9.1e (initiation)** — no window when the run is announced. Delta vs the 6.9.2b window that
   immediately follows: only rezzing non-ice cards in _other_ servers before the first approach.
2. **Non-ice rez scope** — `corpRezOptions` lists only the attacked server's root cards. The rules
   allow rezzing any non-ice card (e.g. an upgrade in another server's root) at any `(R)` window.
3. **`(P)`-only windows (6.9.3b encounter, 6.9.4b after passing ice)** — no options are surfaced at
   all; `runMoves` returns `[]` for the Corp (`src/engine/legal-moves.ts`, "Corp decisions during a
   run come through prompts").

### Why it is safe today

- Every paid ability in the starter pool costs `[click]` (Regolith Mining License, pennyshaver,
  red_team, smartware_distributor, telework_contract), and clicks are zeroed at end-of-turn
  (`src/engine/turns.ts`, logged as `lose-clicks`) — so the Corp has 0 clicks on the Runner's turn
  and no paid ability is payable mid-run.
- Ice-rez timing (approach window only) and the absence of operations/advancing/ scoring mid-run are
  **correct**, not gaps: operations and advancing are basic actions (1.16.4d, 5.6.2b), and `(S)`
  scoring windows exist only in the Corp's own turn steps (5.6.1b, 5.6.2a). Confirmed against the
  standard rules ("the Corporation can only rez ice when it is approached").
- No dead-end risk is currently reachable: the Corp AI is only consulted when it holds a prompt
  (`actorOf`), `playGame` throws on an empty legal list, and `deno task check-invariants` sweeps
  every move across 96 games.

### Also reachable, Runner-side

The Runner _does_ have clicks during their own run, so pennyshaver's "place 1 credit, then take all
credits from it" (net +1 per click) is legal at every mid-run window and is never offered. Small (a
credit top-up), but genuinely reachable — include it when this is implemented.

### Implementation sketch (when triggered)

- Generalize the `rez-window` prompt into a window prompt that lists, besides rez options, the legal
  paid abilities of active cards (both sides).
- Windows must **stay open until both players decline**: currently answering a rez-window closes it
  and calls `finishCurrentApproach` (`apply.ts` `answerPrompt`). Each window use must re-park the
  prompt instead.
- Add the 6.9.1e window in `completeInitiation` (park once before the first approach), and `(P)`
  windows at 6.9.3b / 6.9.4b in `settle.ts`.
- Stub the new prompt in `determinize.ts` (like `rez-window` at line ~198), extend the AI policy to
  value the options, and let the UI ride the existing `[data-prompt]` machinery.
- Pin with tests (window re-opens after each use; closes on pass) and add a `docs/rules-gotchas.md`
  entry in the same commit.

**Trigger:** adding any card with a free paid ability, a paid ability payable on the opponent's
turn, or a click-granting effect usable mid-run.
