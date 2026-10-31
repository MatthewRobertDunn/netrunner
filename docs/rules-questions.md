# Rules questions

Questions raised while implementing the CyberClick starter-deck rules engine against the Netrunner
Comprehensive Rules **v26.03** (see [`docs/sources.md`](sources.md) for provenance).

---

## 1. Corp hand size at the start of turn 1

**Question.** After setup each player draws 5 cards (rule 1.6.6). The Corp's first turn has a draw
phase (rule 5.3.1) and the Corp performs their mandatory draw (rule 5.3.2). Does the Corp have 5 or
6 cards in hand at the start of turn 1?

**Answer.** **6 cards.** The draw phase is the first phase of the Corp's turn and the mandatory draw
is not an action and does not cost a click. The engine therefore has the Corp draw a sixth card when
`beginCorpTurn` is called for turn 1, before the action phase. The Runner has 5 cards because the
Runner's turn has no draw phase (rule 5.3.3).

**Consequence.** `tests/smoke_test.ts` asserts `corp.hand.length === 6` and
`runner.hand.length === 5` after `startGame`.

---

## 2. Mayfly "when this run ends"

**Question.** Mayfly says "Trash this program when this run ends." Does the run end during the
access phase (after the Runner breaches), or only after the Runner finishes accessing?

**Answer.** **At the end of the run, after the access phase.** The engine trashes Mayfly in
`finishRun` (`src/engine/runs.ts`), which every run end funnels through: after the access phase
completes, when the Runner jacks out, or when the run is otherwise ended. (If the game ends
mid-run, `settle` clears the run without calling `finishRun`, so the delayed ability never
resolves — the game is already over.) This is the conservative reading and matches the "trash this
program when this run ends" trigger timing: per rule 9.6.13 the ability is a delayed conditional
ability that resolves when the run ends, and per rule 6.8.5 conditions related to a run ending are
met at step 6.9.6d, when the run timing structure is complete — not as soon as an "end the run"
effect resolves.

---

## 3. Timing of Corp rez of non-ice cards during a run

**Question.** Can the Corp rez an installed unrezzed asset/upgrade during the Runner's action phase,
or only during a rez window opened by an encounter?

**Answer.** **Any time during the Corp's action phase, and during any rez window opened by an
encounter.** The engine offers `corp.rez` moves for any installed unrezzed asset/upgrade during the
Corp's action phase (rule 1.12.3), and additionally offers rez options in the `rez-window` prompts
that appear when the Runner approaches or encounters ice.

---

## 4. Seamless Launch target interpretation

**Question.** "Place 2 advancement counters on 1 installed card that was not installed this turn."
Can the target be an agenda, asset, or ice?

**Answer.** **Agenda, asset, or ice.** The engine allows all three types as targets, and only
excludes cards installed this turn. If there is exactly one legal target the counters are placed
automatically; if there are several the Corp is prompted to choose.

---

## 5. Urtica Cipher "while it is installed"

**Question.** Urtica Cipher says "While Urtica Cipher is installed, the Runner suffers 2 net damage
when accessing it, plus 1 additional net damage for each advancement counter on it." Does this apply
during the access phase only, or also during the encounter phase?

**Answer.** **Access phase only.** The trigger is "when accessing it", so the damage is dealt during
the breach/access step (rule 7.5), not during the encounter. The engine applies it in
`doAccessChoice`.

---

## 6. No tag purge in this pool

**Question.** Several Corp assets trash resources or purge tags. Are any of those mechanics required
for the starter pool?

**Answer.** **No.** The starter decks contain no tags, no virus counters, and no cards that trash
resources or purge tags. The engine therefore deliberately omits the trash-resource and purge basic
actions; their absence is a documented simplification, not a bug.

---

## 7. Bran 1.0 subroutine breaking

**Question.** Bran 1.0's subroutines say "lose [click]: Break 1 subroutine." Does the Runner need an
icebreaker installed to break them, or can they break them with any icebreaker (or even with no
icebreaker)?

**Answer.** **Any icebreaker.** The bioroid-style breaking requires the Runner to have at least one
icebreaker installed and to spend a click, but does not require strength matching. The engine allows
breaking Bran 1.0 subroutines with any installed icebreaker by spending a click.

---

## 8. Red Team run restriction

**Question.** Red Team says "You cannot run the same central server twice in a turn." Does this
apply to the first run of the turn?

**Answer.** **Yes.** The restriction applies to every run made while Red Team is installed. The
engine tracks `runner.ranServersThisTurn` and forbids a second run at the same central server.
