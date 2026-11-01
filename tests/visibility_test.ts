/**
 * Visibility: what each projection may reveal to each player.
 *
 * Rules of record (v26.03): hidden/open information is 10.2.2/10.2.3; card
 * visibility is 1.21; hand secrecy/counts are 4.3.2/4.3.4; installed cards are
 * 4.6.2/4.6.3.
 *
 * Each top-level test covers one visibility subject; the distinct cases are
 * isolated `t.step`s so a regression still reports the exact behavior.
 */

import { cardDef, engine } from "../src/mod.ts";
import {
  continueRun,
  CORP_FILLER,
  endCorpTurn,
  installInNewRemoteAndEndTurn,
  newGameWithCorpHand,
  newStarterGame,
  orderedCorpDeck,
  play,
  rezWindowState,
  runnerDeckStartingWith,
} from "./helpers/fixtures.ts";
import type { GameEvent, GameState, Move } from "../src/types.ts";
import { describeMove } from "../src/web/ui/util.ts";
import { assert, assertDefined, assertEquals, deepClone } from "./helpers/assert.ts";

// ---------------------------------------------------------------------------
// Scenario builders (deterministic via ordered corp decks)
// ---------------------------------------------------------------------------

function installedIce(state: GameState, serverId: string) {
  const server = state.servers.find((s) => s.id === serverId);
  const ice = server?.ice[0];
  return assertDefined(ice, `ice installed in ${serverId}`);
}

/** Install the first legal Corp install in a brand-new remote. */
function installInNewRemote(seed: number): GameState {
  const state = newStarterGame(seed);
  const install = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.install" && m.server === "new-remote",
  );
  assert(install && install.kind === "corp.install", "corp can install in a new remote");
  return play(state, "corp", install);
}

/**
 * The runner is encountering a rezzed piece of ice: the corp rezzes it in the
 * approach rez window.
 */
function rezzedIceEncounterState(seed = 3): GameState {
  const state = rezWindowState(seed);
  const prompt = state.prompts[0];
  assert(prompt && prompt.kind === "rez-window", "the corp rez window is pending");
  const rezOption = prompt.options.find((o) => o.targetId !== undefined);
  assert(rezOption !== undefined, "a rez option is offered");
  const answer = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "prompt.answer" && m.optionId === rezOption.id,
  );
  assert(answer && answer.kind === "prompt.answer", "corp can choose the rez option");
  const after = play(state, "corp", answer);
  assert(after.run !== null, "a run is in progress");
  assert(after.run!.currentIceId !== undefined, "ice is approached/encountered");
  assert(installedIce(after, "remote-1").rezzed === true, "the ice is now rezzed");
  return after;
}

/**
 * A remote root with one rezzed (nico) and one unrezzed (manegarm) card, and
 * the runner breaching it: two specific access candidates.
 */
function accessChoiceState(seed = 3): GameState {
  let state = newGameWithCorpHand(["nico_campaign", "manegarm_skunkworks"], seed);
  const installNico = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.install" && m.cardId === "nico_campaign" && m.server === "new-remote",
  );
  assert(installNico && installNico.kind === "corp.install", "corp can install nico");
  state = play(state, "corp", installNico);
  const installManegarm = engine.getLegalMoves(state, "corp").find(
    (m) =>
      m.kind === "corp.install" && m.cardId === "manegarm_skunkworks" &&
      m.server === "remote-1",
  );
  assert(installManegarm && installManegarm.kind === "corp.install", "corp can add the upgrade");
  state = play(state, "corp", installManegarm);
  const nico = assertDefined(
    state.servers.find((s) => s.id === "remote-1")?.root.find((c) => c.cardId === "nico_campaign"),
  );
  const rez = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.rez" && m.targetId === nico.id,
  );
  assert(rez && rez.kind === "corp.rez", "corp can rez nico");
  state = play(state, "corp", rez);
  state = endCorpTurn(state);
  const run = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "runner.run" && m.server === "remote-1",
  );
  assert(run && run.kind === "runner.run", "runner can run the remote");
  const after = continueRun(play(state, "runner", run));
  assert(after.breach !== null, "the run breaches the remote");
  return after;
}

// ---------------------------------------------------------------------------
// Installed-card identity (rules 10.2.2, 4.6.2/4.6.3)
// ---------------------------------------------------------------------------

Deno.test("visibility: installed cards are redacted by viewer and rez state", async (t) => {
  await t.step("Corp sees its own unrezzed installed cards", () => {
    const view = engine.getPlayerView(installInNewRemote(1), "corp");
    const installed = view.corp.installed;
    assert(installed.length > 0, "Corp should see its installed card");
    assert(installed.every((c) => c.cardId !== "hidden"), "Corp should see its own card id");
  });

  await t.step("Runner does not see unrezzed Corp installed cards", () => {
    const view = engine.getPlayerView(installInNewRemote(1), "runner");
    const installed = view.corp.installed;
    assert(installed.length > 0, "Runner should see the server exists");
    assert(
      installed.every((c) => c.cardId === "hidden"),
      "Runner should not see unrezzed Corp card ids",
    );
  });

  await t.step("rezzed Corp cards are visible to the Runner", () => {
    // A rez window has been answered: the approached ice is now rezzed, and the
    // Runner may read its id from the installed-card list.
    const state = rezzedIceEncounterState();
    const view = engine.getPlayerView(state, "runner");
    assert(
      view.corp.installed.some((c) => c.cardId !== "hidden"),
      "Runner should see rezzed card ids",
    );
  });

  await t.step("an unrezzed card's strength is hidden along with its id", () => {
    // Most starter ice are uniquely fingerprinted by printed strength, so the
    // strength must be suppressed together with the card id (rule 10.2.2).
    const state = installInNewRemoteAndEndTurn("tithe");
    const ice = installedIce(state, "remote-1");

    const runnerView = engine.getPlayerView(state, "runner");
    const seen = assertDefined(runnerView.corp.installed.find((c) => c.id === ice.id));
    assertEquals(seen.cardId, "hidden", "Runner must not see the unrezzed ice's id");
    assertEquals(seen.strength, undefined, "strength must be hidden with the id");

    const corpView = engine.getPlayerView(state, "corp");
    const own = assertDefined(corpView.corp.installed.find((c) => c.id === ice.id));
    assertEquals(own.cardId, "tithe");
    assertEquals(own.strength, cardDef("tithe").strength);
  });
});

Deno.test("visibility: hand and discard zone visibility", async (t) => {
  await t.step("hand counts are open, card identities are not", () => {
    const state = newStarterGame(1);
    const corpView = engine.getPlayerView(state, "corp");
    const runnerView = engine.getPlayerView(state, "runner");

    // The number of cards in a hand is open information (rule 4.3.4) — and
    // the counts must match the true zones exactly.
    assertEquals(corpView.runner.handCount, state.runner.hand.length);
    assertEquals(corpView.runner.deckCount, state.runner.deck.length);
    assertEquals(runnerView.corp.handCount, state.corp.hand.length);
    assertEquals(runnerView.corp.deckCount, state.corp.deck.length);

    // Rule 4.3.2: the Runner's own hand is visible to the Runner and not to the
    // Corp; the Corp's own hand is visible to the Corp and not to the Runner.
    assert(runnerView.runner.hand.length > 0, "the runner sees its own hand");
    assert(
      runnerView.runner.hand.every((c) => c.cardId !== "hidden"),
      "own hand cards carry real ids",
    );
    assertEquals(corpView.runner.hand, [], "the corp must not see the runner's hand");
    assert(corpView.corp.hand.length > 0, "the corp sees its own hand");
    assert(
      corpView.corp.hand.every((c) => c.cardId !== "hidden"),
      "own hand cards carry real ids",
    );
    assertEquals(runnerView.corp.hand, [], "the runner must not see the corp's hand");
  });

  await t.step("the runner's heap is open information, Archives is not", () => {
    // Script a real discard first: the corp opens over max hand size, so
    // ending its turn deterministically puts exactly one card in Archives.
    const withDiscard = endCorpTurn(newStarterGame(3));
    assertEquals(withDiscard.corp.discard.length, 1, "test setup: one card was discarded");
    const discardedId = withDiscard.corp.discard[0]!.id;

    // A fresh starter game has empty zones on both sides — assert against the
    // live state so the case stays honest even if the setup ever changes.
    const state = newStarterGame(1);
    const corpView = engine.getPlayerView(state, "corp");
    const runnerView = engine.getPlayerView(state, "runner");

    // Rule 4.4.7b: the heap (runner discard) is public to every viewer — the
    // ids are real for both, even before anything is discarded.
    assertEquals(
      corpView.runner.discard.map((c) => c.cardId),
      state.runner.discard.map((c) => c.cardId),
      "the corp sees the runner's heap",
    );
    assertEquals(
      runnerView.runner.discard.map((c) => c.cardId),
      state.runner.discard.map((c) => c.cardId),
      "the runner sees its own heap",
    );

    // Rule 4.4.6c/1.21.2a: the corp examines its own facedown Archives; the
    // engine does not yet model the faceup/facedown split, so the runner
    // conservatively sees only "hidden" entries.
    const forCorp = engine.getPlayerView(withDiscard, "corp");
    const forRunner = engine.getPlayerView(withDiscard, "runner");
    assertEquals(
      forCorp.corp.discard.map((c) => c.cardId),
      withDiscard.corp.discard.map((c) => c.cardId),
      "the corp sees its own Archives",
    );
    assertEquals(
      forCorp.corp.discard.map((c) => c.id),
      [discardedId],
      "the corp's own discard is the scripted card",
    );
    assertEquals(
      forRunner.corp.discard.map((c) => c.cardId),
      withDiscard.corp.discard.map(() => "hidden"),
      "the runner cannot read facedown Archives (conservative deviation)",
    );
    assertEquals(forRunner.corp.discard.length, withDiscard.corp.discard.length);
  });
});

// ---------------------------------------------------------------------------
// Run.currentIce (rules 1.21.1a, 4.6.3)
// ---------------------------------------------------------------------------

Deno.test("visibility: run.currentIce respects the ice's rez state", async (t) => {
  await t.step("rezzed ice being run is visible to the Runner", () => {
    const state = rezzedIceEncounterState();
    const ice = installedIce(state, "remote-1");
    assert(ice.rezzed === true, "test assumes the ice was rezzed");

    const runnerView = engine.getPlayerView(state, "runner");
    const currentIce = assertDefined(runnerView.run?.currentIce);
    assertEquals(currentIce.cardId, "tithe", "rezzed ice is public to the Runner");
    assertEquals(currentIce.strength, cardDef("tithe").strength);

    const corpView = engine.getPlayerView(state, "corp");
    assertEquals(corpView.run?.currentIce?.cardId, "tithe");
  });

  await t.step("unrezzed ice being approached is hidden from the Runner", () => {
    const state = rezWindowState();
    const ice = installedIce(state, "remote-1");
    assert(ice.rezzed !== true, "test assumes the ice is unrezzed");

    const runnerView = engine.getPlayerView(state, "runner");
    const currentIce = assertDefined(runnerView.run?.currentIce);
    assertEquals(currentIce.cardId, "hidden");
    assertEquals(currentIce.strength, undefined);

    // The Corp is always entitled to its own cards (rule 4.6.3).
    const corpView = engine.getPlayerView(state, "corp");
    assertEquals(corpView.run?.currentIce?.cardId, "tithe");
  });
});

// ---------------------------------------------------------------------------
// Prompts (rules 10.2.2, 1.21.3: option labels name hidden cards)
// ---------------------------------------------------------------------------

Deno.test("visibility: prompt options are redacted for the non-owner", async (t) => {
  await t.step("prompts are visible to both players, options only to the owner", () => {
    const state = rezWindowState();
    const corpView = engine.getPlayerView(state, "corp");
    const runnerView = engine.getPlayerView(state, "runner");

    assert(corpView.prompts.length > 0, "a prompt is pending");
    // Both viewers see that a decision is pending, with kind + player.
    const stubsOf = (prompts: typeof corpView.prompts) =>
      prompts.map((p) => ({ kind: p.kind, id: p.id, player: p.player }));
    assertEquals(stubsOf(runnerView.prompts), stubsOf(corpView.prompts));

    // The owner (corp) sees the full prompt with its options...
    const corpPrompt = corpView.prompts[0]!;
    assert(corpPrompt.kind === "rez-window", "the pending prompt is the corp rez window");
    assert("options" in corpPrompt, "the owner sees options");
    assert(
      corpPrompt.options.some((o) => o.label.includes("Tithe")),
      "the owner sees labels naming its own facedown card",
    );
    // ...the Runner sees only a stub.
    const runnerPrompt = runnerView.prompts[0]!;
    assertEquals(runnerPrompt, { kind: "rez-window", id: corpPrompt.id, player: "corp" });
    assert(!("options" in runnerPrompt), "no options leak to the non-owner");
  });

  await t.step("the shared public status redacts every prompt to a stub", () => {
    const state = rezWindowState();
    const shared = engine.getPublicGameStatus(state);
    for (const prompt of shared.prompts) {
      assertEquals(prompt, { kind: prompt.kind, id: prompt.id, player: prompt.player });
      assert(!("options" in prompt), "no options in the shared DTO");
    }
    assertEquals(
      engine.getPublicGameStatusFor(state, "corp").prompts,
      shared.prompts,
      "prompt stubs are viewer-agnostic",
    );
  });
});

Deno.test("visibility: access decisions and labels stay anonymous for facedown cards", async (t) => {
  await t.step("an access decision is stubbed for the Corp", () => {
    const state = accessChoiceState();
    const manegarm = assertDefined(
      state.servers.find((s) => s.id === "remote-1")?.root.find(
        (c) => c.cardId === "manegarm_skunkworks",
      ),
    );
    const access = engine.getLegalMoves(state, "runner").find(
      (m) => m.kind === "runner.accessCard" && m.targetId === manegarm.id,
    );
    assert(access && access.kind === "runner.accessCard", "the upgrade is offered for access");
    const after = play(state, "runner", access);

    const runnerView = engine.getPlayerView(after, "runner");
    const prompt = runnerView.prompts[0]!;
    assert(prompt.kind === "access-decision", "the runner owns the access decision");
    assert("cardId" in prompt, "the runner sees which card it is accessing");

    const corpView = engine.getPlayerView(after, "corp");
    const stub = corpView.prompts[0]!;
    assertEquals(stub, { kind: "access-decision", id: prompt.id, player: "runner" });
    assert(!("cardId" in stub), "the accessed hand/root card id does not leak");
  });

  await t.step("access labels name only cards visible to the Runner", () => {
    const state = accessChoiceState();
    const root = assertDefined(state.servers.find((s) => s.id === "remote-1"))!.root;
    const rezzed = root.find((c) => c.rezzed === true);
    const unrezzed = root.find((c) => c.rezzed !== true);
    assert(rezzed !== undefined && unrezzed !== undefined, "one rezzed + one unrezzed root card");

    const legal = engine.getLegalMoves(state, "runner");
    const rezzedMove = legal.find(
      (m): m is Extract<Move, { kind: "runner.accessCard" }> =>
        m.kind === "runner.accessCard" && m.targetId === rezzed.id,
    );
    const hiddenMove = legal.find(
      (m): m is Extract<Move, { kind: "runner.accessCard" }> =>
        m.kind === "runner.accessCard" && m.targetId === unrezzed.id,
    );
    assert(rezzedMove !== undefined && hiddenMove !== undefined, "both candidates are offered");

    assertEquals(
      describeMove(state, rezzedMove),
      "Access Nico Campaign",
      "a rezzed card is named",
    );
    assertEquals(
      describeMove(state, hiddenMove),
      "Access a card",
      "a facedown candidate stays anonymous",
    );
  });
});

// ---------------------------------------------------------------------------
// Event log redaction (rule 10.2.2)
// ---------------------------------------------------------------------------

Deno.test("visibility: the event log is redacted per viewer", async (t) => {
  await t.step("a facedown install event carries no real card id to the Runner", () => {
    const state = installInNewRemoteAndEndTurn("tithe");
    const ice = installedIce(state, "remote-1");

    const installEvents = state.log.filter((e) => e.type === "install");
    assert(installEvents.length > 0, "an install event was logged");

    const runnerView = engine.getPlayerView(state, "runner");
    const redacted = runnerView.events.filter((e) => e.type === "install");
    assertEquals(redacted.length, installEvents.length, "the event shape is preserved");
    const last = redacted[redacted.length - 1]!;
    assert(last.type === "install");
    assertEquals(last.cardId, "hidden", "the facedown card id must not reach the Runner");
    assertEquals(last.server, "remote-1", "the server placement stays public");

    const corpView = engine.getPlayerView(state, "corp");
    const own = corpView.events.filter((e) => e.type === "install");
    const ownLast = own[own.length - 1]!;
    assert(ownLast.type === "install");
    assertEquals(ownLast.cardId, ice.id, "the corp sees its own install");
  });

  await t.step("a rez event names the card once it is public", () => {
    const state = rezzedIceEncounterState();
    const ice = installedIce(state, "remote-1");
    for (const viewer of ["corp", "runner"] as const) {
      const view = engine.getPlayerView(state, viewer);
      const rezEvent = view.events.find((e) => e.type === "rez");
      assert(rezEvent && rezEvent.type === "rez", "a rez event was logged");
      assertEquals(rezEvent.cardId, ice.id, `rezzed cards are public to ${viewer}`);
    }
  });
});

Deno.test("visibility: announced Runner actions are open to the Corp (rules 10.2, 4.4.7b)", async (t) => {
  await t.step("a Runner install event names the installed card to the Corp viewer", () => {
    // Carmen costs exactly the runner's 5 starting credits, so the install is
    // offered on a fresh runner turn without any fixture tweak.
    const state = endCorpTurn(newStarterGame(1, { runner: runnerDeckStartingWith(["carmen"]) }));
    const install = engine.getLegalMoves(state, "runner").find(
      (m) => m.kind === "runner.install" && m.cardId === "carmen",
    );
    assert(install && install.kind === "runner.install", "the runner can install carmen");
    const after = play(state, "runner", install);

    for (const viewer of ["corp", "runner"] as const) {
      const view = engine.getPlayerView(after, viewer);
      const listed = assertDefined(
        view.runner.installed.find((c) => c.cardId === "carmen"),
        `${viewer} sees the installed card in runner.installed`,
      );
      const installEvents = view.events.filter((e) => e.type === "install");
      assert(
        installEvents.some((e) => e.cardId === listed.id),
        `the ${viewer} log names the announced install (rule 10.2)`,
      );
    }
  });

  await t.step("a play event names the card once it sits in the open heap", () => {
    // Jailbreak costs 0 credits: playable on a fresh runner turn; when played
    // it lands in the Runner's heap, which is open information (rule 4.4.7b).
    const state = endCorpTurn(newStarterGame(1, { runner: runnerDeckStartingWith(["jailbreak"]) }));
    const eventMove = engine.getLegalMoves(state, "runner").find(
      (m) => m.kind === "runner.playEvent" && m.cardId === "jailbreak",
    );
    assert(eventMove && eventMove.kind === "runner.playEvent", "the runner can play jailbreak");
    const after = play(state, "runner", eventMove);
    const inHeap = assertDefined(
      after.runner.discard.find((c) => c.cardId === "jailbreak"),
      "test setup: the played event is in the heap",
    );

    const corpView = engine.getPlayerView(after, "corp");
    const listed = assertDefined(
      corpView.runner.discard.find((c) => c.id === inHeap.id),
      "the corp reads the heap's real ids (rule 4.4.7b)",
    );
    const playEvents = corpView.events.filter((e) => e.type === "play");
    assert(
      playEvents.some((e) => e.cardId === listed.id),
      "the Corp's log names the played event from the open heap",
    );
  });

  await t.step("the Corp's Archives discard event stays hidden from the Runner", () => {
    // Negative control: opening the Runner's zones must not over-open the
    // Corp's facedown Archives (the documented conservative deviation).
    const withDiscard = endCorpTurn(newStarterGame(3));
    assertEquals(withDiscard.corp.discard.length, 1, "test setup: one card was discarded");

    const forRunner = engine.getPlayerView(withDiscard, "runner");
    const discardEvents = forRunner.events.filter(
      (e): e is Extract<GameEvent, { type: "discard" }> =>
        e.type === "discard" && e.player === "corp",
    );
    assertEquals(discardEvents.length, 1, "the discard event was logged");
    assertEquals(
      discardEvents.map((e) => e.cardId),
      ["hidden"],
      "the facedown Archives entry stays hidden from the Runner",
    );
  });
});

/**
 * A breach of HQ whose only candidates are the unrezzed root card and the
 * Runner's hand. Jailbreak gives +1 access, so two random hand accesses are
 * available after the breach — the runner can access two hand cards in one
 * breach. The Corp's hand has 5 cards after the mandatory draw, so the root
 * card is never a candidate here (it stays in `chosen` as a non-hand card).
 */
function twoAccessBreachState(seed = 3): GameState {
  const state = newStarterGame(seed, {
    corp: orderedCorpDeck(["manegarm_skunkworks", ...CORP_FILLER]),
    runner: runnerDeckStartingWith(["jailbreak"]),
  });
  const install = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.install" && m.cardId === "manegarm_skunkworks",
  );
  assert(install && install.kind === "corp.install", "the corp can install manegarm");
  const after = endCorpTurn(play(state, "corp", install));
  const jailbreak = engine.getLegalMoves(after, "runner").find(
    (m) => m.kind === "runner.playEvent" && m.cardId === "jailbreak",
  );
  assert(jailbreak && jailbreak.kind === "runner.playEvent", "the runner can play jailbreak");
  return continueRun(play(after, "runner", jailbreak));
}

/**
 * Run one access (random hand) to completion: apply `runner.accessRandom`,
 * then `runner.finishAccess`. Settle may auto-select the next candidate, so
 * the returned state may still have a breach open with a pending access.
 */
function accessRandomToCompletion(state: GameState): GameState {
  const access = engine.getLegalMoves(state, "runner").find((m) =>
    m.kind === "runner.accessRandom"
  );
  assert(access && access.kind === "runner.accessRandom", "a random access is offered");
  const afterAccess = play(state, "runner", access);
  const finish = engine.getLegalMoves(afterAccess, "runner").find((m) =>
    m.kind === "runner.finishAccess"
  );
  assert(finish && finish.kind === "runner.finishAccess", "the runner can finish the access");
  return play(afterAccess, "runner", finish);
}

Deno.test("visibility: accessed cards stay visible for the remainder of the breach (rule 7.3.1a)", async (t) => {
  await t.step(
    "accessed cards stay named while the breach is open, even after later accesses finish",
    () => {
      const state = twoAccessBreachState();
      assert(state.breach !== null, "the run has breached HQ");
      assert(state.breach!.randomAccessLimit === 2, "jailbreak grants 2 random accesses");

      // Two random hand accesses, each finished. After the second finish the
      // breach is still open: settle auto-selects the unrezzed root card next.
      const after = accessRandomToCompletion(accessRandomToCompletion(state));
      assert(after.breach !== null, "the breach is still open after two accesses");

      // The Corp's own log names every access (control).
      const logIds = after.log.filter((e) => e.type === "access").map((e) => e.cardId);
      assertEquals(logIds.length, 3, "two hand accesses + the auto-selected root card");

      const runnerView = engine.getPlayerView(after, "runner");
      const runnerIds = runnerView.events.filter((e) => e.type === "access").map((e) => e.cardId);
      assertEquals(
        runnerIds,
        logIds,
        "the Runner's own log names every access for the remainder of the breach (7.3.1a)",
      );
      assert(
        runnerIds.every((id) => id !== "hidden"),
        "no accessed card is redacted while the breach is open",
      );
      // The FIRST access event in particular still names its card — the case the
      // rule is about: a redaction that only re-hides after the breach closes.
      assert(runnerIds[0] !== "hidden", "the first access event names its card");
    },
  );

  await t.step("the events re-redact once the breach ends", () => {
    const state = twoAccessBreachState();
    const after = accessRandomToCompletion(accessRandomToCompletion(state));
    // Finish the auto-selected root card: the breach is now complete.
    const finish = engine.getLegalMoves(after, "runner").find((m) =>
      m.kind === "runner.finishAccess"
    );
    assert(finish && finish.kind === "runner.finishAccess", "the final access is finishable");
    const ended = play(after, "runner", finish);
    assert(ended.breach === null, "the breach is complete");

    const runnerIds = engine.getPlayerView(ended, "runner").events
      .filter((e) => e.type === "access").map((e) => e.cardId);
    assertEquals(
      runnerIds,
      ["hidden", "hidden", "hidden"],
      "access events redact again once the breach is over (7.3.1a scopes to the breach)",
    );
  });
});

// ---------------------------------------------------------------------------
// Fidelity of the projection
// ---------------------------------------------------------------------------

Deno.test("fidelity: projection fields", async (t) => {
  await t.step("handSize is the maximum hand size, not the hand length", () => {
    const state = newStarterGame(1);
    const view = engine.getPlayerView(state, "corp");
    assertEquals(view.corp.handCount, 6, "corp opens with 6 cards in hand");
    assertEquals(view.corp.handSize, 5, "max hand size is 5");
    assertEquals(view.runner.handCount, 5);
    assertEquals(view.runner.handSize, 5);

    // A hand-size modifier widens the maximum, not the current count.
    const modded = deepClone(state) as GameState;
    modded.corp.maxHandSizeMod = 2;
    const moddedView = engine.getPlayerView(modded, "corp");
    assertEquals(moddedView.corp.handSize, 7);
    assertEquals(moddedView.corp.handCount, 6);
  });

  await t.step("winReason and warnings are public and present", () => {
    const state = newStarterGame(1);
    const view = engine.getPlayerView(state, "corp");
    assertEquals(view.winReason, state.winReason);
    assertEquals(view.warnings, [...state.supportWarnings]);

    const finished = deepClone(state) as GameState;
    finished.winner = "runner";
    finished.winReason = "Runner reached the agenda point target";
    const finishedView = engine.getPlayerView(finished, "corp");
    assertEquals(finishedView.winner, "runner");
    assertEquals(finishedView.winReason, "Runner reached the agenda point target");
  });
});
