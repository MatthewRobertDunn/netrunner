/**
 * Corp-action regression tests.
 *
 *  - Advance eligibility (rule 1.18.3): agendas can always be advanced; other
 *    cards only when their printed text says so (Urtica Cipher: "You can
 *    advance this asset."). Ice is never advanceable.
 *  - Advance cost (rule 5.2.6f): "[click], 1[credit]: Advance 1 installed card."
 *  - Upgrades may create a new remote server (rules 8.5.2a / 8.5.2c / 4.6.8b).
 *  - Docklands Pass: "The first time each turn you breach HQ, access 1
 *    additional card" — a prior non-HQ breach must not consume the bonus.
 *  - Seamless Launch: "Place 2 advancement counters on 1 installed card that
 *    you did not install this turn" — any installed card, including upgrades.
 *  - Overclock: "Place 5 credit on this event, then run any server. You can
 *    spend hosted credits during that run" — the run is part of the event's
 *    resolution (rule 5.2.2b), so the 5 hosted credits ride on THE run the
 *    event starts and never become banked credits for a later turn.
 *
 * Hands are scripted deterministically via `orderedCards` (see
 * `orderedCorpDeck` in src/testing/fixtures.ts).
 */

import { engine } from "../src/mod.ts";
import type { CardId, GameState } from "../src/types.ts";
import { isCorpInstall } from "../src/types.ts";
import { continueRun, findInstalled, play, runnerDeckStartingWith } from "./helpers/fixtures.ts";
import { burnUntil, corpDeckWithHand, nextTurnOf, resolveRun } from "./helpers/drive.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

/** Play the parked movement-phase decision (rule 6.9.4c), if pending. */
function continueMovement(state: GameState): GameState {
  return continueRun(state);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newGame(corpHand: CardId[], runnerFirst: CardId[] = []): GameState {
  return engine.startGame({
    corp: corpDeckWithHand(corpHand),
    runner: runnerDeckStartingWith(runnerFirst),
    mode: "starter-decks",
    seed: 3,
  });
}

function advanceTargetIds(state: GameState): string[] {
  return engine.getLegalMoves(state, "corp")
    .filter((m) => m.kind === "advance")
    .map((m) => (m as { targetId: string }).targetId);
}

// ---------------------------------------------------------------------------
// Rule 1.18.3: advance eligibility
// ---------------------------------------------------------------------------

Deno.test("corp actions: advance, install, breach, and event regressions", async (t) => {
  await t.step(
    "advance: ice cannot be advanced; Urtica Cipher and agendas can (rule 1.18.3)",
    () => {
      let s = newGame(["urtica_cipher", "palisade", "offworld_office"]);
      s = play(s, "corp", { kind: "install", cardId: "urtica_cipher", server: "new-remote" });
      s = play(s, "corp", { kind: "install", cardId: "palisade", server: "hq" });

      const urtica = assertDefined(findInstalled(s, "urtica_cipher"), "Urtica Cipher is installed");
      const palisade = assertDefined(findInstalled(s, "palisade"), "ice is installed");
      assert(urtica.rezzed !== true, "test setup: Urtica Cipher is installed unrezzed");
      const targets = advanceTargetIds(s);
      assert(
        targets.includes(urtica.id),
        "an UNREZZED 'You can advance this asset' card is advanceable (rule 1599: 'even while it is unrezzed')",
      );
      assert(!targets.includes(palisade.id), "ice is never advanceable");

      // Spend the last click advancing Urtica; next turn the agenda must also be advanceable.
      s = play(s, "corp", { kind: "advance", targetId: urtica.id });
      s = nextTurnOf(s, "corp");
      s = play(s, "corp", {
        kind: "install",
        cardId: "offworld_office",
        server: "new-remote",
      });
      const agenda = assertDefined(findInstalled(s, "offworld_office"), "the agenda is installed");
      assert(agenda.rezzed !== true, "test setup: the agenda is installed unrezzed");
      const targets2 = advanceTargetIds(s);
      assert(
        targets2.includes(agenda.id),
        "an UNREZZED agenda is always advanceable (rule 1.18.3)",
      );
      assert(targets2.includes(urtica.id), "Urtica Cipher remains advanceable");
      assert(!targets2.includes(palisade.id), "ice is still not advanceable");
    },
  );

  await t.step(
    "abilities: an unrezzed Corp card offers no paid ability (rule 1.8.6)",
    () => {
      // Rule 1.8.6: "Most abilities are active if and only if the card they
      // appear on is active." Corp assets/ice/upgrades become active only when
      // rezzed (rule 1.8.4), so an unrezzed Corp card must offer NO ability
      // move — the mirror of the advance rule above (which is explicitly
      // allowed unrezzed). Regolith Mining License's paid ability is
      // "[click]: take 3 credits".
      const abilityTargetIds = (state: GameState): string[] =>
        engine.getLegalMoves(state, "corp")
          .filter((m) => m.kind === "ability")
          .map((m) => (m as { targetId: string }).targetId);

      let s = newGame(["regolith_mining_license"]);
      s = play(s, "corp", {
        kind: "install",
        cardId: "regolith_mining_license",
        server: "new-remote",
      });
      const unrezzed = assertDefined(findInstalled(s, "regolith_mining_license"), "installed");
      assert(unrezzed.rezzed !== true, "test setup: the asset is installed unrezzed");
      assert(
        !abilityTargetIds(s).includes(unrezzed.id),
        "an unrezzed asset must not offer its paid ability (inactive, rule 1.8.6)",
      );

      // Positive control: rezzing activates the card, so the ability appears.
      s = play(s, "corp", { kind: "rez", targetId: unrezzed.id });
      const rezzed = assertDefined(findInstalled(s, "regolith_mining_license"), "still installed");
      assertEquals(rezzed.rezzed, true, "test setup: the asset is now active (rezzed)");
      assert(
        abilityTargetIds(s).includes(unrezzed.id),
        "a rezzed asset's paid ability IS offered",
      );
    },
  );

  await t.step(
    "abilities: an installed Runner card offers its ability without rezzing",
    () => { // Runner cards are installed faceup and are always active, so the Corp
      // gate above must not touch them.
      let s = newGame([], ["smartware_distributor"]);
      s = nextTurnOf(s, "runner");
      assertEquals(s.turn.player, "runner", "test setup: the runner holds the turn");
      s = play(s, "runner", { kind: "install", cardId: "smartware_distributor" });
      const sw = assertDefined(
        s.runner.installed.find((c) => c.cardId === "smartware_distributor"),
        "the resource is installed",
      );
      assert(sw.rezzed !== true, "test setup: Runner cards are never 'rezzed'");
      assert(
        engine.getLegalMoves(s, "runner").some((m) => m.kind === "ability" && m.targetId === sw.id),
        "an installed Runner card offers its paid ability while still 'unrezzed'",
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Rule 5.2.6f: advance costs 1 credit
  // ---------------------------------------------------------------------------

  await t.step(
    "advance: costs 1 click and 1 credit, and is not offered at 0 credits (rule 5.2.6f)",
    () => {
      let s = newGame(["urtica_cipher"]);
      s = play(s, "corp", { kind: "install", cardId: "urtica_cipher", server: "new-remote" });
      const urtica = assertDefined(findInstalled(s, "urtica_cipher"), "Urtica Cipher is installed");

      const creditsBefore = s.corp.credits;
      s = play(s, "corp", { kind: "advance", targetId: urtica.id });
      assertEquals(s.corp.credits, creditsBefore - 1, "advancing spent exactly 1 credit");
      assertEquals(
        findInstalled(s, "urtica_cipher")!.advancement ?? 0,
        1,
        "one counter was placed",
      );

      // Drain the corp to 0 credits by advancing across two more turns.
      s = play(s, "corp", { kind: "advance", targetId: urtica.id }); // turn 1, last click
      s = nextTurnOf(s, "corp"); // corp turn 2
      for (let i = 0; i < 3; i++) {
        s = play(s, "corp", { kind: "advance", targetId: urtica.id });
      }
      assertEquals(s.corp.credits, 0, "the corp is at 0 credits");
      s = nextTurnOf(s, "corp"); // corp turn 3: 3 clicks, 0 credits, action phase

      assertEquals(
        advanceTargetIds(s).length,
        0,
        "advance is not offered when the corp has 0 credits",
      );
      const rejected = engine.applyMove(s, "corp", { kind: "advance", targetId: urtica.id });
      assert(rejected.kind === "illegal-move", "advance is rejected at 0 credits");
    },
  );

  // ---------------------------------------------------------------------------
  // Rules 8.5.2a / 8.5.2c / 4.6.8b: upgrades may create a new remote
  // ---------------------------------------------------------------------------

  await t.step(
    "install: an upgrade may be installed into a new remote server (rules 8.5.2a/8.5.2c, 4.6.8b)",
    () => {
      const s = newGame(["manegarm_skunkworks"]);
      const install = engine.getLegalMoves(s, "corp").find((m) =>
        isCorpInstall(m) && m.cardId === "manegarm_skunkworks" && m.server === "new-remote"
      );
      assertDefined(install, "an upgrade is offered for a new remote server");
      const after = play(s, "corp", install!);
      const remote = after.servers.find((x) => x.id === "remote-1");
      assert(remote !== undefined, "installing the upgrade created remote-1");
      assert(
        remote!.root.some((c) => c.cardId === "manegarm_skunkworks"),
        "the upgrade sits in the new remote's root",
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Docklands Pass: first HQ breach of the turn (rule 7.3.5)
  // ---------------------------------------------------------------------------

  await t.step(
    "breach: Docklands Pass still applies to the first HQ breach after a non-HQ breach",
    () => {
      let s = newGame([], ["docklands_pass"]);
      s = burnUntil(s, "runner");
      s = play(s, "runner", { kind: "install", cardId: "docklands_pass" });

      // Breach a non-HQ server first (Archives): must not consume the bonus.
      s = play(s, "runner", { kind: "run", server: "archives" });
      assertEquals(
        s.runner.hqBreachesThisTurn,
        0,
        "a non-HQ breach does not count toward the once-per-turn HQ counter",
      );
      s = resolveRun(s);

      // Now breach HQ: Docklands Pass grants +1 access on the first HQ breach.
      s = play(s, "runner", { kind: "run", server: "hq" });
      s = continueMovement(s); // the run parks in movement (6.9.4c) before the breach
      assert(s.breach !== null && s.breach.server === "hq", "the HQ breach began");
      assertEquals(
        s.breach!.randomAccessLimit,
        2,
        "first HQ breach of the turn with Docklands Pass installed: access 2",
      );
      s = resolveRun(s);

      // A second HQ breach the same turn gets no bonus (once per turn).
      s = play(s, "runner", { kind: "run", server: "hq" });
      s = continueMovement(s);
      assert(s.breach !== null && s.breach.server === "hq", "the second HQ breach began");
      assertEquals(s.breach!.randomAccessLimit, 1, "second HQ breach of the turn: access 1 only");
    },
  );

  // ---------------------------------------------------------------------------
  // Seamless Launch printed text: any installed card, including upgrades
  // ---------------------------------------------------------------------------

  await t.step("seamless launch: places 2 advancement counters on an upgrade", () => {
    let s = newGame(["manegarm_skunkworks", "seamless_launch"]);
    // Turn 1: install the upgrade only (it must not count as "installed this turn"
    // for Seamless Launch on a later turn).
    s = play(s, "corp", { kind: "install", cardId: "manegarm_skunkworks", server: "hq" });
    s = nextTurnOf(s, "corp"); // corp turn 2 (the upgrade was not installed this turn)
    const playOp = engine.getLegalMoves(s, "corp").find((m) =>
      m.kind === "playOperation" && m.cardId === "seamless_launch"
    );
    assertDefined(playOp, "Seamless Launch is playable");
    s = play(s, "corp", playOp!);
    const upgrade = assertDefined(
      findInstalled(s, "manegarm_skunkworks"),
      "the upgrade is installed",
    );
    assertEquals(
      upgrade.advancement ?? 0,
      2,
      "Seamless Launch placed 2 counters on the upgrade ('1 installed card')",
    );
  });

  // ---------------------------------------------------------------------------
  // Overclock: the run is part of the event, so the fund is bound to that run
  // ---------------------------------------------------------------------------

  await t.step(
    "overclock: the event's own run carries the fund; a later turn's run does not",
    () => {
      const overclockMove = (state: GameState) =>
        engine.getLegalMoves(state, "runner").find((m) =>
          m.kind === "playEvent" && m.cardId === "overclock" && m.server === "hq"
        );

      // The premises of this test changed with the printed text: "Place 5[credit]
      // on this event, THEN RUN ANY SERVER" (rule 5.2.2b + docs/rules-gotchas.md #8)
      // makes the run part of the event's resolution, not a separate, click-cost
      // action. So the fund is never banked on the player waiting for a later
      // run — it is placed on the run the event starts, and no run can inherit
      // a fund from an earlier one, so it can never survive to a later turn.
      let s = newGame([], ["overclock"]);
      s = burnUntil(s, "runner");
      const clicksBefore = s.runner.clicks;
      const creditsBefore = s.runner.credits;
      const oc1 = assertDefined(overclockMove(s), "Overclock is playable");
      s = play(s, "runner", oc1);

      assertEquals(s.run?.server, "hq", "the event initiated the run itself");
      assertEquals(s.run?.source, "overclock", "the run's source is the event");
      assertEquals(s.run?.fundCredits, 5, "the event's run can spend the hosted credits");
      assertEquals(
        s.runner.credits,
        creditsBefore - 1,
        "the 5 credits are hosted on the run, not banked on the player for a later run",
      );
      assertEquals(
        s.runner.clicks,
        clicksBefore - 1,
        "only the event's click was spent — no extra click for a separate run",
      );

      // Finish the event's run, then take the runner's turn and the corp's turn.
      for (let i = 0; i < 20 && (s.run || s.breach) && !s.winner; i++) {
        const moves = engine.getLegalMoves(s, "runner");
        const next = moves.find((m) => m.kind === "accessRandom" || m.kind === "accessCard") ??
          moves.find((m) => m.kind === "finishAccess") ??
          moves.find((m) => m.kind === "continueRun");
        assertDefined(next, "the breach/run offers a decision");
        s = play(s, "runner", next!);
      }
      assertEquals(s.run, null, "the event's run has ended");

      let t = newGame([], ["overclock"]);
      t = burnUntil(t, "runner");
      t = play(t, "runner", overclockMove(t)!);
      assertEquals(t.run?.fundCredits, 5, "the same-turn event run carries the hosted credits");
      while (t.turn.player === "runner" && !t.winner) {
        const moves = engine.getLegalMoves(t, "runner");
        if (moves.length === 0) break;
        t = play(t, "runner", moves[0]!);
      }
      t = burnUntil(t, "corp");
      while (t.turn.player === "corp" && !t.winner) {
        const moves = engine.getLegalMoves(t, "corp");
        if (moves.length === 0) break;
        t = play(t, "corp", moves[0]!);
      }
      t = burnUntil(t, "runner");
      assertEquals(
        t.run?.fundCredits,
        undefined,
        "the Overclock host is cleared by the next runner turn (nothing to spend)",
      );
      t = play(t, "runner", { kind: "run", server: "archives" });
      assert(
        t.run?.fundCredits === undefined,
        "a run on a later turn has no Overclock fund ('during that run')",
      );
    },
  );
});
