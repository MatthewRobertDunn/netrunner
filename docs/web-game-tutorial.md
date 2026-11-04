# Netrunner: a web-game tutorial for agents

Adapted from the Null Signal Games Learn-to-Play guides (Corp + Runner), minus everything that
doesn't apply to this web game. This file is the strategy and rules orientation for browser agents;
the annotation scheme and per-button selectors live in
`.opencode/skills/play-browser-netrunner/SKILL.md`.

Originals:

- https://nullsignal.games/players/learn-to-play/learn-to-play-corp/
- https://nullsignal.games/players/learn-to-play/learn-to-play-runner/

Differences from the physical game (read this first):

- This web game uses the full starter decks and plays to **7 agenda points**, not the teaching
  game's 6. There is no "STOP HERE" divider, no booster pack, no colored card backs.
- There is no action reference card, no physical credit/click tracker, and no flipping a card to end
  your turn: the turn ends when your clicks reach zero (the engine advances automatically).
- Both players start with **5 credits and a 5-card hand** (rule 1.6.4, 1.6.6). The Corp gets **3
  clicks** per turn, the Runner gets **4 clicks**.
- Card art and flavor text are present on tiles but never drive decisions; the `data-*` attributes
  in SKILL.md carry the same information in readable form.
- For the authoritative wording of any rule, see `docs/rules-v26.03.txt` (the Netrunner
  Comprehensive Rules v26.03); interpretations live in `docs/rules-questions.md`.

## The goal

Two asymmetric sides. The **Corp** advances agendas and scores them; the **Runner** runs the Corp's
servers to steal those agendas. The first side to **7 agenda points** wins immediately. The Runner
also loses if they must trash a card from an empty grip ("flatline"); the Corp loses if forced to
draw from an empty deck ("decking").

- An **agenda** with enough advancement counters (see "Advancing" below) is **scored** by the Corp
  into their score area, or **stolen** by the Runner when accessed during a run. Either way the side
  gains the agenda's printed points (1, 2, or 3 per card in the starter decks).
- Accessing a Corp card you don't want to leave active is not free: assets and upgrades may be
  **trashed by paying their printed trash cost** (bottom-right of the card). Cards already in
  Archives cannot be trashed.

## The board

Everything is organized into **servers**. Both players can always see how many servers exist, how
many cards install each, and which ice protect them.

- **HQ** — the Corp's hand. **R&D** — the Corp's deck. **Archives** — the Corp's discard pile. These
  are the three **central servers**.
- **Remote servers** — created when the Corp installs an agenda or asset. Each remote holds at most
  one agenda or asset in its root, plus any number of upgrades. The Runner cannot tell which kind of
  card is installed until it is rezzed or accessed.
- **Ice** sits in front of a server in a column ("positions"), innermost first. The Runner meets the
  outermost ice first and works inward. Installing ice to an empty server is free; each ice already
  protecting it adds 1 to the cost.

### The Corp's cards

- **Identity** (The Syndicate): marks the seat. No ability in this build.
- **Operations**: one-shot effects, played faceup from HQ, then trashed faceup to Archives. (Hedge
  Fund: gain 9; Seamless Launch: place 2 advancement counters on an already-installed card — not an
  "advance", but the counters count the same for agendas.)
- **Assets**: installed facedown into a (usually new) remote server. Rezzed by paying the printed
  cost at almost any time. Examples: Nico Campaign (loads 9 hosted credits, take 3 per action,
  trashed when empty); Regolith Mining License (loads 15, take 3 per action); Urtica Cipher —
  advanceable, and deals net damage equal to its hosted counters + 2 when ACCESSED, rezzed or not.
- **Agendas**: installed facedown into a remote, then advanced (one action + 1 credit per counter,
  or Seamless Launch). Scored from hand only on the Corp's own turn, counters removed, moved to the
  score area. Starter agendas: Superconducting Hub (1 pt, draw 2 on score, +2 hand size); Offworld
  Office (2 pts); Send a Message (3 pts — and its ability fires for the CORP even when the RUNNER
  steals it: the Corp may rez one installed ice for free).
- **Upgrades**: installed facedown into the root of ANY server (central or remote), any number.
  Manegarm Skunkworks: the Runner reaching the server must pay 2 clicks, pay 5 credits, or end the
  run.
- **Ice**: installed facedown in front of a server. Rezzed (paid for) only during a run, at the
  approach step. Starter ice: Palisade (barrier, End the run), Tithe (sentry, Corp gains 1),
  Whitespace (code gate, tax + conditional ETR), Brân 1.0 (bioroid: spend clicks to break, no
  strength needed; its first subroutine installs ice from HQ/Archives for free), Karunā (sentry: 2
  net damage twice, with a jack-out offer between the two), Diviner (net damage + conditional ETR on
  odd-cost trash).

### The Runner's cards

All Runner cards install faceup and are paid for upfront.

- **Identity** (The Catalyst): marks the seat. 4 memory units in this build. No ability.
- **Programs (icebreakers)**: break subroutines on ice of a matching subtype, provided the breaker's
  strength is at least the ice's current strength. Pump first (`pumpIcebreaker`), then break
  (`breakSubroutine`). Strength resets after each encounter. Starters: Cleaver (fracter, vs
  barriers, starts 1 str, 2 credits per +1, breaks 1-2 subs per credit); Carmen (killer, vs
  sentries, starts 2 str, 2 credits per +3, cheaper to install after a successful run); Unity
  (decoder, vs code gates, starts 1 str, +1 str per installed icebreaker per credit — the more
  breakers installed, the cheaper the pump); Mayfly (AI, works on anything, 2 MU instead of 1,
  trashes itself when the run ends).
- **Memory**: the total memory cost of installed programs can never exceed the limit (4 to start;
  Consoles like Pennyshaver add +1). Over-capacity installs are blocked (rule 1.20.3) — trash a
  program first.
- **Hardware / Resources**: persistent economy and support. Telework Contract (take 3 per action
  until empty), Smartware Distributor, Pennyshaver (console: +1 MU, banks a credit on each
  successful run, then take-all as an action), Red Team (run a central you haven't run this turn as
  an action: +3 on success), Docklands Pass (extra HQ access on first HQ breach), Tread Lightly (run
  event: Corp pays 3 extra per ice rezzed on that server), Creative Commission (+5 then lose a click
  if any remain), VRCation (draw 4), Sure Gamble (economy event), Verbal Plasticity (first draw each
  turn draws one extra), Overclock (run event: 5-credit run fund pays trash / break costs during the
  run), Jailbreak (run HQ or R&D: draw 1 on success, +1 access on breach).
- **Events**: one-shot effects from hand, often run-sourcing, then trashed to the heap: Jailbreak,
  Overclock, Tread Lightly, Sure Gamble, Creative Commission, VRCation.

### Damage and tags

- **Net damage**: trash that many cards from the grip at random. Empty grip + more damage =
  flatline, Runner loses. Urtica Cipher (accessed) and Karunā / Diviner (subroutines) are the
  starter sources.
- **Tags / bad publicity** exist on the status blocks, but no starter-pool card in this build moves
  them — they are display-only for now.

## A Corp turn

1. Mandatory draw from R&D.
2. Three clicks of basic and card actions: `gainCredits`, `draw`, `playOperation`, `install` (into
   `new-remote` / an existing remote / a central), `advance` (agenda or advanceable card), `score`,
   `rez`, paid `ability`s (each names its `data-target`).
3. Discard phase if hand > hand size (5, more with scored Superconducting Hub). Discarded cards go
   to Archives facedown.

Good first turns: money (Hedge Fund or gain), ice on HQ, ice on R&D. Then install an agenda or asset
in a new remote, advance it, and score before the Runner gets in. Keep credits ahead of your
unrezzed ice's rez costs so a run threatens a real rez.

## A Runner turn

1. No mandatory draw. Four clicks: `gainCredits`, `draw`, `install`, `playEvent`, and
   `run <server>`.
2. Mid-run: choose `continueRun` or `jackOut` at each movement window (the jack option disappears
   once you commit to the server); pump and break at each rezzed ice; answer whatever prompt the
   encounter leaves (`rez-window` is the Corp's, prompt `pass` on it when testing).
3. On breach: access everything the server offers (HQ: one random card; R&D: top card; Archives:
   every card; remote root: each card). Steal agendas automatically; optionally pay trash costs for
   assets/upgrades. The turn ends when clicks reach zero (there is no End Turn button).

Good first turns: economy (Telework, Sure Gamble), install one icebreaker of each needed subtype,
then run the emptiest server. Early HQ runs are cheap information; Archives becomes worth it once
cards accumulate.

## Runs, in the order they happen

1. **Initiation** (`run <server>`): the run starts.
2. **Approach**: the Corp may rez the approached ice. Unrezzed ice is passed without effect.
3. **Encounter**: for rezzed ice, pump then break subroutines (or take them). Brân costs clicks,
   everything else costs credits. Unbroken subroutines resolve: ETR ends the run, damage trashes
   grip cards, tax drains credits. Karunā offers a jack-out between its two damage subroutines.
4. **Movement**: between ice and before the server, `continueRun` or `jackOut`. Manegarm Skunkworks
   (if rezzed) taxes 2 clicks or 5 here.
5. **Success + breach**: access every candidate (HQ random / R&D top / ALL of Archives / the remote
   root), steal agendas, optionally trash.
6. **Run ends**: win or lose, Mayfly self-trashes here if used.

## What each side is watching

- **Corp**: credits vs unrezzed rez costs (the skill's status blocks read `data-player-credits`);
  which remote holds the agenda vs the trap; the Runner's credit pool and installed breakers before
  deciding to rez; hand size before ending the turn.
- **Runner**: ice strength vs breaker strength before running (pump first); subroutine text before
  breaking (ETR > damage > tax in danger); grip size before face-planting unknown ice; Archives
  contents before spending a click on the run.

## Where the rules get subtle (starter cards edition)

- Send a Message helps the Corp even when stolen (free rez).
- Seamless Launch "places" counters: counts for agendas, isn't an "advance".
- Brân 1.0 breaks with clicks, no strength; its subroutine installs ice free.
- Urtica Cipher damages on access even unrezzed; counters + 2.
- Karunā offers a jack-out between its two net-damage subroutines; taking it skips the second.
- Manegarm taxes AFTER the last ice, BEFORE success: 2 clicks, 5 credits, or the run ends.
- Mayfly trashes itself when the run ends, not when its break resolves.
- Cards entering Archives facedown stay facedown to the Runner until accessed; this build shows
  every Archives card faceup at breach time.
