# Rules gotchas — traps for future developers

This file records the rule traps that have bitten this engine (or nearly have), so they are not
reintroduced. `docs/rules-v26.03.txt` is the authoritative rules text; every entry below lists the
rule numbers involved, so you can re-read the cited section in the rules doc rather than trusting
this summary. Where an entry says the engine "was wrong / now correct", an earlier version got it
wrong and the current code handles it correctly — don't reintroduce the old behavior. Where an entry
is listed under "documented simplifications", it is a deliberate, safe-to-keep deviation.

## Test coverage is authoritative

Every bug listed below as "was wrong / now correct" is pinned by a test, and the test is the
regression record — the prose is a pointer to the test, not a duplicate of it. If a behavior is
covered by a test, the test is the thing that catches a reintroduction; re-reading this file instead
of running the suite is how it goes stale. The two entries that survive here are the ones with
**no** test:

1. **Rule citations in comments go stale — re-grep the rules file, don't trust the number.**
   Known-fixed list, each arrow verified against the rules text: "4.6.10"/"4.6.10b" (→ 4.6.8e,
   8.5.8, 10.3.1h — an emptied remote server ceases to exist at the checkpoint, and a run against
   it ends neither successful nor unsuccessful), "4.6.7d/e" (→ 4.6.6d/e; 4.6.7d is the
   Archives-zone rule and 4.6.7e does not exist), "1.16.6b as rez cost" (→ 1.16.8; 1.16.6b is the
   ice *install* cost), eval.ts "1.15.2" (→ 1.17.1, agenda points), "8.6" (→ 10.5, tags), "6.4"
   (→ 1.20 + 3.9.3, memory). Fixed in the same changeset as this file — don't reintroduce. When
   you touch a rule, re-read the cited section in the rules doc, not the comment.

   Beware when re-grepping: the rules dump is formatted one fragment per line, so a sub-item
   citation like `4.6.8e` never matches a contiguous grep (`grep "4.6.8e"` returns 0 even though
   rule 4.6.8 item e exists). Grep the section number with its trailing dot
   (`grep -n "^4\.6\.8\." docs/rules-v26.03.txt`) and read the lettered items below it; a
   0-match grep on a sub-item is a false positive, not proof that a citation is phantom.

2. **Documented simplifications that are safe to keep (do not "fix" casually):** no faceup/facedown
   Archives split (whole pile hidden from the Runner); installing over a like card is forbidden
   rather than forcing the trash (8.5.6a); no ice-trash-during-install discount (8.5.6b); memory
   over-limit is prevented rather than resolved by trashing (3.9.3b); `drawMode: "random"` in AI
   hypotheses only. The corp's in-run non-ice rez window exists at BOTH rule timing points: the ice
   approach (6.9.2b — offers the approached ice plus the attacked server's root) and the server
   approach (6.9.4e — offers the attacked server's root, opening after the jack-out chance of
   6.9.4c-d and before the approach toll of 6.9.4g, so a facedown Manegarm Skunkworks on an
   ice-less server can be rezzed in time for its toll). Both offer only those cards, whereas the
   `(R)` window permits rezzing any installed unrezzed non-ice card; and each timing point is one
   prompt (one rez, or pass) rather than a window the players can return to — no starter card needs
   the wider or re-openable window.

## Pinned by tests (no entry kept here)

The following were all "was wrong / now correct" and are each covered by a named test with explicit
assertions. They live in the test files as the authoritative regression record:

- Ice install cost vs. printed rez cost, charged once — `tests/rules_costs_test.ts`
- "Advance" ≠ "place advancement counters" — `tests/corp_actions_test.ts`,
  `tests/prompts_dispatch_test.ts`
- Jack-out window parks in the Movement Phase — `tests/runs_movement_test.ts`
- Run success declared only at the Success Phase — `tests/runs_movement_test.ts`
- One break window per encounter (6.9.3b — a mid-encounter choice does not re-open it), and the
  Corp rez window at the server approach (6.9.4e) — `tests/run_timing_test.ts`
- Prompt options don't double-charge a cost — `tests/toll_test.ts`
- Paid-ability strength pumps expire — `tests/pump_expiry_test.ts`
- `hqBreachesThisTurn` counts HQ breaches only — `tests/corp_actions_test.ts`
- Events that create runs state the whole package — `tests/event_texts_test.ts`
- Upgrades can create remotes — `tests/corp_actions_test.ts`
- Dead triggers exercised through `applyMove` — `tests/triggers_test.ts`
- `choose-one` options mean what their `effect` says — `tests/prompts_dispatch_test.ts`
- `data/cards.json` text is the specification — `tests/event_texts_test.ts`
- "If you have any [click] remaining, lose [click]" is conditional — `tests/event_texts_test.ts`
- Run-creating abilities count toward the same-central-twice restriction — `tests/redteam_test.ts`
- Remote rendering is viewer-agnostic CSS — `tests/ui/game_screen_test.ts`
- Card effects gain the printed amount, not the net delta — `tests/event_texts_test.ts`
- Announced Runner actions are open info; the heap is public (10.2, 4.4.7b) —
  `tests/visibility_test.ts`
- Trash affordability counts the run fund, not pool credits alone — `tests/event_texts_test.ts`
