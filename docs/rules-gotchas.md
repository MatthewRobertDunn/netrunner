# Rules gotchas — traps for future developers

This file records the rule traps that have bitten this engine (or nearly have), so they are not
reintroduced. `docs/rules-v26.03.txt` is the authoritative rules text; every entry below lists the
rule numbers involved, so you can re-read the cited section in the rules doc rather than trusting
this summary. Where an entry says the engine "was wrong / now correct", an earlier version got it
wrong and the current code handles it correctly — don't reintroduce the old behavior. Where an entry
is listed under "documented simplifications", it is a deliberate, safe-to-keep deviation.

1. **Ice has two different costs (2.3.4a, 2.3.5, 3.4.3, 1.16.6b, 8.5.11a).** The install cost of ice
   is 1 credit per ice already protecting the destination server and is never printed; the rez cost
   is the printed number on the card. The engine once charged the install-count as the rez cost AND
   charged it twice in the rez window — Tithe's printed cost (1) coincidentally equals "1 ice
   protecting", which hid the bug in the most-tested card. Was wrong / now correct — don't
   reintroduce.
2. **"Advance" ≠ "place advancement counters" (1.18.2, 1.18.3, 5.2.6f).** Only agendas can be
   _advanced_ (plus cards whose text says so — Urtica Cipher qualifies, no starter ice does), the
   basic action costs **a click and 1 credit**, and directly-placed counters (Seamless Launch)
   bypass the eligibility rule entirely. Was wrong / now correct — don't reintroduce.
3. **The Runner's jack-out window (6.1.5, 6.6.3, 6.9.4c) happens inside the Movement Phase.** If
   `settle` never parks in `movement` waiting for a decision, the move list can offer
   `runner.jackOut` all it wants — it will never be reachable.
4. **A run becomes successful at the Success Phase (6.9.5a), and only there.** Passing the last
   (unrezzed) ice must still route through `declareSuccess`. If a shortcut sets `phase = "success"`
   directly, `run.successful`, the `run-successful` log event, and `successfulRunThisTurn` silently
   never happen. "If successful" triggers (6.7.4) key off the declaration, not the phase name. Was
   wrong / now correct — don't reintroduce.
5. **Prompt options must not carry both a cost and an effect that spends the same cost (1.16.1,
   9.5.7b).** The Manegarm toll was written as `creditCost: 5` + effect `pay-toll-credits`, and both
   paths spent; the affordability guard swallowed the second spend and skipped its bookkeeping
   (`tollPaid`), so the visible amount looked right while the flag never stuck. Pick one
   representation for "cost" across all prompt kinds.
6. **Paid-ability strength pumps expire with the encounter (3.9.5b) or at the next checkpoint
   outside one (3.9.5d, 9.10.4a).** Any `strengthBoost` write needs a matching expiry in the
   encounter/run teardown. A pump with no reset site is permanent.
7. **Per-turn counters must count what they're named for.** `hqBreachesThisTurn` was incremented for
   _every_ breach, so "first time each turn you breach HQ" (Docklands Pass) broke whenever another
   server was breached first. Increment after the server check, and only for HQ.
8. **Events that create runs state the whole package (Overclock, Jailbreak, Tread Lightly).** If the
   engine splits "bank credits" from "run", "that run" (Overclock) and "during that run" (+3 rez
   cost, Tread Lightly) become unenforceable. Model the run as part of the event's resolution.
9. **Upgrades can create remotes (8.5.2c, 4.6.8b).** A remote is created by _declaring it as the
   install destination_ — for any installable corp card type, upgrades included. Was wrong / now
   correct — don't reintroduce.
10. **Dead triggers are worse than unsupported ones.** `fireRez` (Nico/Regolith load-on-rez) and
    `trashMayfly` (run-end trash) existed but were never called, while `supportStatus` reported
    "supported". If a trigger kind exists in `cards/effects.ts`, a test must exercise it through
    `applyMove`.
11. **Rule citations in comments go stale.** Known-fixed list: "4.6.10" (→ 4.6.8e/8.5.8/10.3.1h),
    "4.6.7d/e" (→ 4.6.6d/e), "1.16.6b as rez cost", eval.ts "1.15.2"/"8.6"/"6.4". Fixed in the same
    changeset as this file — don't reintroduce. When you touch a rule, re-read the cited section in
    the rules doc, not the comment.
12. **Documented simplifications that are safe to keep (do not "fix" casually):** no faceup/facedown
    Archives split (whole pile hidden from the Runner); installing over a like card is forbidden
    rather than forcing the trash (8.5.6a); no ice-trash-during-install discount (8.5.6b); memory
    over-limit is prevented rather than resolved by trashing (3.9.3b); `drawMode: "random"` in AI
    hypotheses only; the corp's rez window during runs is the only in-run rez opportunity (rule
    6.9.4e nuance not modelled).
13. **Remote-server rendering is viewer-agnostic CSS, not code.** The corp area renders the same
    template for both viewers (no `humanSide` branch), so "ice grows toward the Corp" was a CSS
    illusion: the old `.ice-slot` was a 92×66 landscape slot with `rotate(90deg)`, which laid the
    ice out _horizontally_ and made the column read as growing toward the corp edge. The direction
    fix is in CSS only (portrait slots, no rotation) — don't "fix" it by branching the template on
    `humanSide`. Also: an empty remote is pruned by the engine (`pruneEmptyRemotes`), so the UI only
    ever sees it when the state is hand-built; the "draw nothing" branch is defensive. And a remote
    with only unrezzed ice must still render — the public status redacts the card identities but
    keeps `unrezzedIceCount`, so visibility must key on that count too, not just `s.ice.length`.
