/**
 * Component + regression tests for GameScreen.
 *
 * Runs under `deno test` with happy-dom installed on `globalThis` (see
 * tests/ui/setup.ts), so no browser or network is needed.
 */

import { installRealCss } from "./setup.ts"; // also bridges happy-dom onto globalThis
import { mount } from "@vue/test-utils";
import { assert, assertDefined, assertEquals, deepClone } from "../helpers/assert.ts";
import { accessDecisionFixture, createTestFixture, publicStatusFor } from "./fixture.ts";
import { cardDef, engine } from "../../src/mod.ts";
import type { GameState, Move, PlayerSide } from "../../src/types.ts";
import GameScreen from "../../src/web/ui/game.ts";
import {
  continueRun,
  corpDeckStartingWith,
  endCorpTurn,
  installInNewRemoteAndEndTurn,
  newGameWithCorpHand,
  play,
  rezWindowState,
  runnerDeckStartingWith,
  starterDeckPair,
} from "../helpers/fixtures.ts";

/**
 * Mount GameScreen on a seed fixture (Corp perspective by default), optionally
 * after playing `moves`. Returns the state, the viewer-aware public status DTO,
 * and the mounted wrapper so each step can assert against one shared setup.
 */
function mountGame(seed = 42, humanSide: PlayerSide = "corp", moves: Move[] = []) {
  const { state } = createTestFixture(seed, humanSide, moves);
  const wrapper = mount(GameScreen, { props: { state, humanSide } });
  return { state, humanSide, wrapper, status: publicStatusFor(state, humanSide) };
}

Deno.test("GameScreen renders the board layout", async (t) => {
  await t.step("public status and the human hand", () => {
    const { state, wrapper } = mountGame(42, "corp");

    assertEquals(wrapper.text().includes("CORP"), true, "shows the corp status");
    assert(wrapper.find('[data-dock="status"]').exists(), "status dock present");
    assertEquals(
      wrapper.findAll(".player-strip").length,
      0,
      "no in-flow player strips remain",
    );
    assertEquals(
      wrapper.findAll('[data-panel="hand"] .hand-card').length,
      state.corp.hand.length,
      "renders one hand-card tile per card in the human hand",
    );
    // The action panel offers corp's legal basic moves (install/play/draw/…).
    assert(
      wrapper.find('[data-panel="actions"] > .moves').exists(),
      "action moves panel rendered",
    );
  });

  await t.step("corp perspective and central columns", () => {
    const { wrapper, status } = mountGame(42, "corp");

    const main = wrapper.find(".game-main");
    assert(main.exists(), "game-main column present");

    const servers = wrapper.find(".servers.corp-seat");
    assert(servers.exists(), ".servers.corp-seat present");
    const central = servers.findAll(".server.central");
    assertEquals(central.length, 3, "HQ, R&D and Archives columns");

    // Each central column carries the fixed stack: server card and ice stack
    // (the root row renders only when a root card is installed — seed 42 has
    // none yet — but its container is always present via the v-if/v-else-if).
    for (const col of central) {
      assert(col.find(".server-card").exists(), "server card present");
      assert(col.find(".server-ice-stack").exists(), "ice stack present");
    }

    // Statuses live in the left dock now, not in the main column.
    assert(wrapper.find('[data-dock="status"]').exists(), "status dock present");
    assertEquals(wrapper.findAll(".player-strip").length, 0, "old strips removed");
    assert(
      wrapper.find(".game-main > .hand-area [data-panel='hand']").exists(),
      "hand area present",
    );

    // Cross-check against the viewer-aware public status DTO.
    assertEquals(status.servers.map((s: { id: string }) => s.id).sort(), [
      "archives",
      "hq",
      "rd",
    ]);
  });
});

Deno.test("GameScreen install actions: one row per tile and a single-row popup", async (t) => {
  await t.step("duplicated Palisades yield one Install → HQ button per tile", () => {
    // Seed 42 opens with the Corp to act and two Palisades already in hand.
    const { wrapper } = mountGame(42, "corp");
    const hand = wrapper.find('[data-panel="hand"]');

    let palisadeTiles = 0;
    let totalHqButtons = 0;
    for (const tile of hand.findAll(".hand-card")) {
      const hq = tile
        .findAll(".card-actions button")
        .filter((b) => b.text() === "Install → HQ");
      if (hq.length) {
        palisadeTiles += 1;
        totalHqButtons += hq.length;
        assertEquals(hq.length, 1, "exactly one Install → HQ button per Palisade tile");
        // Annotation contract: the button names its verb and both parameters
        // (see docs/ui-gotchas.md).
        assertEquals(hq[0]!.attributes("data-action"), "corp.install");
        assertEquals(hq[0]!.attributes("data-card-id"), "palisade");
        assertEquals(hq[0]!.attributes("data-server"), "hq");
      }
    }
    assertEquals(palisadeTiles, 2, "two Palisade tiles in the hand");
    assertEquals(totalHqButtons, 2, "one Install → HQ button per tile, not doubled");
    // Sanity: each Palisade tile also shows one button per legal server (HQ,
    // R&D, Archives, new remote) and no other card gets an "Install → HQ" button.
    const allHq = hand
      .findAll(".card-actions button")
      .filter((b) => b.text() === "Install → HQ");
    assertEquals(allHq.length, 2);
  });

  await t.step("popup shows a single action row, no duplicates", async () => {
    const { wrapper } = mountGame(42, "corp");

    // Popup on a grip card: shows its install actions, exactly one "Install →
    // HQ", and no Close button while actions are present.
    const palisadeTile = wrapper
      .findAll('[data-panel="hand"] .hand-card')
      .find((tile) =>
        tile.findAll(".card-actions button").some((b) => b.text() === "Install → HQ")
      );
    assert(palisadeTile, "found a Palisade hand tile");
    await palisadeTile!.find(".card-tile.clickable").trigger("click");
    const popup = wrapper.find('[data-modal="zoom"]');
    assert(popup.exists(), "popup opened on the clicked tile");
    const actions = popup.findAll(".zoom-actions button");
    const hqActions = actions.filter((b) => b.text() === "Install → HQ");
    assertEquals(hqActions.length, 1, "popup shows a single Install → HQ action");
    assertEquals(
      popup.findAll('[data-action="close"]').length,
      0,
      "no Close button while install actions are shown",
    );

    // Dismiss via the backdrop (popup root is the backdrop itself).
    await popup.trigger("click");
    assertEquals(
      wrapper.find('[data-modal="zoom"]').exists(),
      false,
      "popup dismissed",
    );

    // Popup on a card with no actions (the HQ identity card): single Close
    // button and no install buttons leaked into it.
    await wrapper.find(".servers.corp-seat .server-card").trigger("click");
    const identityPopup = wrapper.find('[data-modal="zoom"]');
    assert(identityPopup.exists(), "identity popup opened");
    assertEquals(
      identityPopup.findAll('[data-action="close"]').length,
      1,
      "exactly one Close button",
    );
    assertEquals(
      identityPopup.findAll(".zoom-actions button").length,
      0,
      "no install buttons in the Close-only popup",
    );
  });
});

Deno.test("GameScreen status dock side panel", async (t) => {
  await t.step("opponent on top, own on bottom per seat", () => {
    for (const humanSide of ["corp", "runner"] as const) {
      const { wrapper } = mountGame(42, humanSide);
      const dock = wrapper.find('[data-dock="status"]');
      assert(dock.exists(), `dock present (${humanSide})`);

      const opponent = dock.find('.status-block[data-own="false"]');
      const own = dock.find('.status-block[data-own="true"]');
      assert(opponent.exists() && own.exists(), `both blocks present (${humanSide})`);

      const expectedOpp = humanSide === "corp" ? "runner" : "corp";
      assertEquals(
        opponent.attributes("data-side"),
        expectedOpp,
        `opponent block shows ${expectedOpp} when human is ${humanSide}`,
      );
      assertEquals(own.attributes("data-side"), humanSide, `own block shows ${humanSide}`);

      // DOM order: opponent block precedes the own block (top vs bottom half).
      const html = dock.html();
      assert(
        html.indexOf('data-own="false"') < html.indexOf('data-own="true"'),
        `opponent block above own block (${humanSide})`,
      );
    }
  });

  await t.step("both statuses render values, Archives/Heap labels", () => {
    for (const humanSide of ["corp", "runner"] as const) {
      const { wrapper, status } = mountGame(42, humanSide);
      const dock = wrapper.find('[data-dock="status"]');

      for (const side of ["corp", "runner"] as const) {
        const block = dock.find(`[data-side="${side}"]`);
        assert(block.exists(), `${side} block present`);
        const expected = status.players[side];
        const text = block.text();
        assert(text.includes(String(expected.credits)), `${side} credits ${expected.credits}`);
        assert(
          text.includes(`${expected.agendaPoints}/${status.agendaPointTarget}`),
          `${side} agenda points prominent`,
        );
        assert(text.includes(String(expected.handCount)), `${side} hand count`);
        assert(text.includes(String(expected.deckCount)), `${side} deck count`);
        assert(text.includes(String(expected.discardCount)), `${side} discard count`);
        // Credits + agenda points are the prominent tiles (the hand tile
        // shares their look but lives in the secondary grid).
        assertEquals(
          block.find(".status-primary").findAll(".primary-stat").length,
          2,
          `${side} has prominent credits + agenda tiles`,
        );
        // The clicks counter shares the primary tile look but stays an inert
        // div in its usual secondary-grid slot (no action attaches to it).
        const clicksTile = block.find(".primary-stat.clicks");
        assert(clicksTile.exists(), `${side} clicks tile present`);
        assertEquals(
          clicksTile.element.tagName.toLowerCase(),
          "div",
          `${side} clicks tile is inert`,
        );
        assert(
          clicksTile.element.parentElement?.classList.contains("status-secondary"),
          `${side} clicks tile keeps its secondary-grid slot`,
        );
      }

      // Correct zone names: Corp Archives, Runner Heap (never "heap" for corp).
      const corpBlock = dock.find('[data-side="corp"]');
      const runnerBlock = dock.find('[data-side="runner"]');
      assert(corpBlock.text().includes("Archives"), "corp discard labeled Archives");
      assert(!corpBlock.text().toLowerCase().includes("heap"), "corp block never says heap");
      assert(runnerBlock.text().includes("Heap"), "runner discard labeled Heap");
    }
  });

  await t.step("own credits tile takes the gain-credit action", async () => {
    for (const humanSide of ["corp", "runner"] as const) {
      const { state } = dockActionFixture(humanSide);
      assertEquals(state.turn.player, humanSide, `it is ${humanSide}'s turn`);
      const wrapper = mount(GameScreen, { props: { state, humanSide } });
      const dock = wrapper.find('[data-dock="status"]');
      const own = dock.find('.status-block[data-own="true"]');

      // The gain-credit move left the action panel for the credits tile.
      const moves = wrapper.find('[data-panel="actions"] > .moves');
      if (moves.exists()) {
        assertEquals(
          moves.findAll("button").filter((b) => b.text() === "Gain 1 credit").length,
          0,
          `no Gain button in the action panel (${humanSide})`,
        );
      }

      // The tile is the move: its annotation is moveActionAttrs' output, so
      // the agent finds it by the action kind, not by layout.
      const gain = own.find(`[data-action="${humanSide}.gainCredits"]`);
      assert(gain.exists(), `own credits tile is the gain button (${humanSide})`);
      assertEquals(gain.element.tagName.toLowerCase(), "button", "gain tile is a real button");

      assertEquals(gain.attributes("disabled"), undefined, "gain enabled on the human turn");

      await gain.trigger("click");
      const emitted = wrapper.emitted("move") as unknown[][] | undefined;
      assert(emitted && emitted.length === 1, `click emits one move (${humanSide})`);
      const move = emitted[0]![0] as { kind: string };
      assertEquals(move.kind, `${humanSide}.gainCredits`, "emits the gain-credit move");
    }
  });

  await t.step("own hand tile takes the draw action", async () => {
    for (const humanSide of ["corp", "runner"] as const) {
      const { state } = dockActionFixture(humanSide);
      assertEquals(state.turn.player, humanSide, `it is ${humanSide}'s turn`);
      assert(
        engine.getLegalMoves(state, humanSide).some((m) => m.kind === `${humanSide}.draw`),
        `the ${humanSide}.draw move is legal (clicks + deck left)`,
      );
      const wrapper = mount(GameScreen, { props: { state, humanSide } });
      const dock = wrapper.find('[data-dock="status"]');
      const own = dock.find('.status-block[data-own="true"]');
      const opp = dock.find('.status-block[data-own="false"]');

      // The draw move left the action panel for the hand tile.
      const moves = wrapper.find('[data-panel="actions"] > .moves');
      if (moves.exists()) {
        assertEquals(
          moves.findAll("button").filter((b) => b.text() === "Draw 1 card").length,
          0,
          `no Draw button in the action panel (${humanSide})`,
        );
      }

      const draw = own.find(`[data-action="${humanSide}.draw"]`);
      assert(draw.exists(), `own hand tile is the draw button (${humanSide})`);
      assertEquals(draw.element.tagName.toLowerCase(), "button", "hand tile is a real button");
      assert(draw.classes().includes("primary-stat"), "hand tile shares the primary tile look");
      assert(
        draw.element.parentElement?.classList.contains("status-secondary"),
        "hand tile keeps its slot in the secondary grid",
      );
      assert(draw.classes().includes("clickable"), "hand tile is clickable while legal");
      assertEquals(draw.attributes("disabled"), undefined, "draw enabled on the human turn");
      assertEquals(draw.attributes("title"), "Draw 1 card", "tooltip names the action");
      assert(/^\d+\/\d+$/.test(draw.text().trim()), "hand tile shows count/hand-size");

      // Only the OWN block converts: the opponent's hand tile stays an inert div.
      const oppHand = opp.find(".primary-stat.hand");
      assert(oppHand.exists(), "opponent block shows its hand tile");
      assertEquals(
        oppHand.element.tagName.toLowerCase(),
        "div",
        "opponent hand stays an inert div",
      );
      assertEquals(
        oppHand.find("[data-action]").exists(),
        false,
        "opponent hand tile has no draw button",
      );

      await draw.trigger("click");
      const emitted = wrapper.emitted("move") as unknown[][] | undefined;
      assert(emitted && emitted.length === 1, `click emits one move (${humanSide})`);
      const move = emitted[0]![0] as { kind: string };
      assertEquals(move.kind, `${humanSide}.draw`, "emits the draw move");
    }
  });

  await t.step("scored-agenda mini-cards open the zoom", async () => {
    for (const humanSide of ["corp", "runner"] as const) {
      const { state } = createTestFixture(42, humanSide);
      // Stamp a scored agenda onto the fixture: move a corp agenda from the
      // deck into score (the strip renders the public status DTO of it).
      const deckAt = state.corp.deck.findIndex((c) => cardDef(c.cardId).type === "agenda");
      assert(deckAt >= 0, "fixture corp deck contains an agenda");
      const agenda = assertDefined(state.corp.deck.splice(deckAt, 1)[0], "agenda card");
      state.corp.score = [{ ...agenda, zone: "score" }];
      const wrapper = mount(GameScreen, { props: { state, humanSide } });

      const strip = wrapper.find('[data-panel="score-corp"]');
      assert(strip.exists(), `corp score strip renders (${humanSide})`);
      const card = strip.find("button.mini-card");
      assert(card.exists(), "the scored agenda mini-card is a button");
      assertEquals(
        card.attributes("data-action"),
        "zoom",
        "the mini-card's action is the zoom verb",
      );
      assertEquals(
        card.attributes("data-card-id"),
        agenda.cardId,
        "the mini-card names the scored agenda",
      );
      assert(
        (card.attributes("title") ?? "").startsWith("View "),
        "the mini-card tooltips the zoom",
      );

      await card.trigger("click");
      const zoom = wrapper.find('[data-modal="zoom"]');
      assert(zoom.exists(), `the zoom popup opened from the strip (${humanSide})`);
      assert(
        zoom.text().includes(cardDef(agenda.cardId).title),
        "the popup shows the scored agenda",
      );
    }
  });

  await t.step("acting-side highlight follows state.turn.player", () => {
    const { state, humanSide, wrapper } = mountGame(42, "corp");
    const acting = state.turn.player;
    const idle = acting === "corp" ? "runner" : "corp";
    const dock = wrapper.find('[data-dock="status"]');
    assert(
      dock.find(`[data-side="${acting}"]`).classes().includes("active"),
      `${acting} block highlighted while acting`,
    );
    assertEquals(
      dock.find(`[data-side="${idle}"]`).classes().includes("active"),
      false,
      `${idle} block not highlighted`,
    );

    // Flip the actor: the highlight must follow.
    const flipped = structuredClone(state);
    flipped.turn.player = idle;
    const wrapper2 = mount(GameScreen, { props: { state: flipped, humanSide } });
    const dock2 = wrapper2.find('[data-dock="status"]');
    assert(
      dock2.find(`[data-side="${idle}"]`).classes().includes("active"),
      `highlight follows turn flip to ${idle}`,
    );
  });
});

/**
 * The fixture for the two status-dock action steps: the CORP seat mounts the
 * seed-42 opening board directly; the RUNNER seat needs the corp turn burned
 * first (three gains spend its clicks, the mandatory one-card discard clears
 * the discard phase), so the runner holds the turn with clicks to act.
 */
function dockActionFixture(humanSide: PlayerSide) {
  if (humanSide === "corp") return createTestFixture(42, "corp");
  const gains: Move[] = [
    { kind: "corp.gainCredits" },
    { kind: "corp.gainCredits" },
    { kind: "corp.gainCredits" },
  ];
  const spent = createTestFixture(42, "corp", gains);
  const drop = spent.state.corp.hand[0]!.id;
  return createTestFixture(42, "corp", [
    ...gains,
    { kind: "discard", player: "corp", cardInstanceIds: [drop] },
  ]);
}

Deno.test("GameScreen remotes: ice sits on the runner side in both seats", () => {
  // Structural DOM types: this repo typechecks without the DOM lib (see
  // tests/ui/setup.ts, which bridges the same happy-dom globals).
  interface TestWindow {
    getComputedStyle(el: unknown): { order: string };
  }
  const testDom = globalThis as unknown as { window: TestWindow };

  // One <style> with the real shipped CSS, so computed `order` reflects what
  // the browser does (happy-dom resolves stylesheet rules into
  // getComputedStyle). Shared with tests/ui/setup.ts so every UI test that
  // needs computed styles calls the same idempotent helper.
  installRealCss();

  // Corp installs Palisade then Send a Message in a new remote: remote-1
  // ends up with ice plus a root card.
  const { state } = createTestFixture(42, "corp", [
    { kind: "corp.install", cardId: "palisade", server: "new-remote" },
    { kind: "corp.install", cardId: "send_a_message", server: "remote-1" },
  ]);

  for (const humanSide of ["corp", "runner"] as const) {
    const wrapper = mount(GameScreen, {
      props: { state, humanSide },
      attachTo: "body",
    });
    try {
      const servers = wrapper.find(".servers");
      assertEquals(
        servers.classes().includes("corp-seat"),
        humanSide === "corp",
        `corp-seat only in the corp seat (${humanSide})`,
      );
      const remote = wrapper.find(".server.remote");
      assert(remote.exists(), `remote column renders (${humanSide})`);

      // The template keeps one DOM order in both seats: label, root, ice.
      // (Run buttons never render here: corp moves hold no runner.run, and
      // on the corp turn the runner has no legal moves.)
      const domOrder = [...remote.element.children].map((c) => c.className.split(" ")[0]);
      assertEquals(
        domOrder,
        ["server-label", "server-root-row", "server-ice-stack"],
        `remote DOM order is label, root, ice (${humanSide})`,
      );

      const order = (sel: string) =>
        testDom.window.getComputedStyle(remote.find(sel).element).order;
      if (humanSide === "corp") {
        // Runner side is the top: ice above root above label.
        assertEquals(order(".server-ice-stack"), "1", "corp seat: ice first");
        assertEquals(order(".server-root-row"), "2", "corp seat: root second");
        assertEquals(order(".server-label"), "3", "corp seat: label third");
      } else {
        // Runner side is the bottom, which is already DOM order: no flips.
        // (happy-dom reports an unset `order` as "", i.e. the initial 0.)
        assertEquals(order(".server-ice-stack"), "", "runner seat: no ice flip");
        assertEquals(order(".server-root-row"), "", "runner seat: no root flip");
        assertEquals(order(".server-label"), "", "runner seat: no label flip");
      }

      // Central columns flip the same way (HQ: ice above the identity card
      // in the corp seat, below it as runner).
      const hq = wrapper.findAll(".server.central")[0]!;
      const hqOrder = (sel: string) => testDom.window.getComputedStyle(hq.find(sel).element).order;
      assertEquals(
        hqOrder(".server-ice-stack"),
        humanSide === "corp" ? "1" : "",
        `HQ ice (${humanSide})`,
      );
      assertEquals(
        hqOrder(".server-card"),
        humanSide === "corp" ? "3" : "",
        `HQ card (${humanSide})`,
      );
    } finally {
      wrapper.unmount();
    }
  }
});

Deno.test("GameScreen access popup: only the human's own access decision pops the zoom", async () => {
  const { state } = createTestFixture(42, "corp");
  // A runner access-decision prompt on a real card (corp grip card resolves
  // via findCardIn for the test; the engine always sets player: "runner").
  const accessedId = state.corp.hand[0]!.id;
  const withAccess = () => accessDecisionFixture(state, accessedId);

  // Human is corp, AI runner is accessing: no notice, and transitioning into
  // the access must not auto-open the zoom (the old flash-then-close).
  const opp = mount(GameScreen, { props: { state, humanSide: "corp" } });
  await opp.setProps({ state: withAccess() });
  assertEquals(
    opp.find('[data-action="open-access"]').exists(),
    false,
    "no access notice for the opponent's access",
  );
  assertEquals(
    opp.find('[data-modal="zoom"]').exists(),
    false,
    "no auto zoom for the opponent's access",
  );

  // Human is the runner accessing: the notice shows and the zoom auto-opens.
  const own = mount(GameScreen, { props: { state, humanSide: "runner" } });
  await own.setProps({ state: withAccess() });
  assert(
    own.find('[data-action="open-access"]').exists(),
    "access notice for the human's own access",
  );
  assert(
    own.find('[data-modal="zoom"]').exists(),
    "auto zoom for the human's own access",
  );
});

Deno.test("GameScreen run-sourcing events label their target server", () => {
  // A scripted runner deck puts Jailbreak (run HQ or R&D, rule 5.2.2b) on
  // top; the engine emits ONE runner.playEvent move PER target server, so
  // the hand tile must show one distinct button per run target — bare
  // "Play" would leave the human picking the run target blind.
  const decks = starterDeckPair();
  const scripted = engine.startGame({
    corp: decks.corp,
    runner: runnerDeckStartingWith(["jailbreak"]),
    mode: "starter-decks",
    seed: 42,
  });
  const state = endCorpTurn(scripted);
  assertEquals(state.turn.player, "runner", "test setup: the runner holds the turn");

  const wrapper = mount(GameScreen, { props: { state, humanSide: "runner" } });
  const jailbreakTile = wrapper
    .findAll('[data-panel="hand"] .hand-card')
    .find((tile) =>
      tile.findAll(".card-actions button").some((b) => b.text().startsWith("Play →"))
    );
  assertDefined(jailbreakTile, "the Jailbreak hand tile carries per-server play buttons");
  assertEquals(
    jailbreakTile!.findAll(".card-actions button").map((b) => b.text()),
    ["Play → HQ", "Play → R&D"],
    "one distinct label per run target, mirroring the corp.install branch",
  );
  // The per-target buttons distinguish themselves by data-server, not by
  // label text — the agent can run HQ's event without parsing "Play → HQ".
  assertEquals(
    jailbreakTile!.findAll('.card-actions button[data-action="runner.playEvent"]')
      .map((b) => b.attributes("data-server")),
    ["hq", "rd"],
    "one data-server per run target",
  );
});

Deno.test("GameScreen multi-ice stack renders outermost farthest in both seats", () => {
  // The engine lists ice innermost-first (ServerState.ice, types.ts). The
  // runner seat renders the stack top-down under the server card, which is
  // already correct; the corp seat flips the stack to the runner side (top)
  // via CSS `order`, so ServerColumn must reverse the array there — the run
  // badge otherwise starts glued to the server card and moves AWAY as the
  // run deepens.
  installRealCss();

  const decks = starterDeckPair();
  let state = engine.startGame({
    corp: corpDeckStartingWith(["tithe", "palisade"]),
    runner: decks.runner,
    mode: "starter-decks",
    seed: 42,
  });
  const installs: [string, string][] = [
    ["tithe", "new-remote"],
    ["palisade", "remote-1"],
  ];
  for (const [cardId, server] of installs) {
    const install = assertDefined(
      engine.getLegalMoves(state, "corp").find(
        (m) => m.kind === "corp.install" && m.cardId === cardId && m.server === server,
      ),
    );
    state = play(state, "corp", install);
  }
  const ice = state.servers.find((s) => s.id === "remote-1")!.ice;
  assertEquals(
    ice.map((c) => c.cardId),
    ["tithe", "palisade"],
    "test setup: Tithe innermost, Palisade outermost",
  );

  // CORP seat: the stack renders top-down on the runner side, so the
  // reversed array must put the OUTER ice first (farthest from the server
  // card below). The corp viewer sees both unrezzed faces.
  const corpView = mount(GameScreen, { props: { state, humanSide: "corp" } });
  try {
    const slots = corpView.find(".server.remote").findAll(".server-ice-stack .ice-slot");
    assertEquals(slots.length, 2, "two ice slots render");
    // Tiles name their card (data-card-id) and engine position
    // (data-card-pos, innermost = 1) — the annotation contract's answer to
    // "which ice is which" that used to require scraping the title text.
    const tiles = slots.map((slot) => slot.find(".card-tile"));
    assertEquals(
      tiles.map((tile) => tile.attributes("data-card-id")),
      ["palisade", "tithe"],
      "corp seat: outermost ice renders farthest from the server card",
    );
    assertEquals(
      tiles.map((tile) => tile.attributes("data-card-pos")),
      ["2", "1"],
      "corp seat: DOM order flips, engine positions do not",
    );
  } finally {
    corpView.unmount();
  }

  // RUNNER seat after the corp rezzes the outer ice (the normal mid-run
  // mixed-rez state): the rezzed face renders in its true OUTER position and
  // the inner unrezzed ice stays in place as a facedown tile — never the
  // inverse, and never a facedown count appended after the rezzed cards.
  state = endCorpTurn(state);
  const run = assertDefined(
    engine.getLegalMoves(state, "runner").find(
      (m) => m.kind === "runner.run" && m.server === "remote-1",
    ),
  );
  state = play(state, "runner", run);
  const prompt = state.prompts[0]!;
  assert(prompt.kind === "rez-window", "a corp rez window is pending on the outer ice");
  const option = assertDefined(
    prompt.options.find((o) => {
      if (o.targetId === undefined) return false;
      const card = state.servers.find((s) => s.id === "remote-1")!.ice
        .find((c) => c.id === o.targetId);
      return card?.cardId === "palisade";
    }),
  );
  const answer = assertDefined(
    engine.getLegalMoves(state, "corp").find(
      (m) => m.kind === "prompt.answer" && m.optionId === option.id,
    ),
  );
  state = play(state, "corp", answer);
  assert(
    state.servers.find((s) => s.id === "remote-1")!.ice[1]!.rezzed === true,
    "test setup: the outer ice is rezzed",
  );

  const runnerView = mount(GameScreen, { props: { state, humanSide: "runner" } });
  try {
    const slots = runnerView.find(".server.remote").findAll(".server-ice-stack .ice-slot");
    assertEquals(slots.length, 2, "two ice slots render");
    const tiles = slots.map((slot) => slot.find(".card-tile"));
    const names = tiles.map((tile) => (tile.attributes("title") ?? "").split("\n")[0]);
    assertEquals(
      names,
      ["Facedown card", "Palisade"],
      "runner seat: inner ice facedown in place, rezzed outer ice outermost",
    );
    // The facedown tile carries position but no identity (redaction); the
    // rezzed tile names itself and keeps its outer position.
    assertEquals(tiles[0]!.attributes("data-card-id"), undefined, "facedown ice stays hidden");
    assertEquals(tiles[0]!.attributes("data-card-pos"), "1", "facedown ice keeps its position");
    assertEquals(tiles[1]!.attributes("data-card-id"), "palisade", "rezzed ice names itself");
    assertEquals(tiles[1]!.attributes("data-card-pos"), "2", "rezzed ice keeps its position");
    assertEquals(
      slots[1]!.find(".badge-counter").text(),
      "RUN",
      "the RUN badge follows the approached outer ice in its true position",
    );
  } finally {
    runnerView.unmount();
  }
});

Deno.test("GameScreen approached facedown ice carries the RUN badge", () => {
  // Unrezzed ice stays IN POSITION as a redacted entry with its real instance
  // id (rule 4.6.2: stack order open; 4.6.3: identity hidden), so the RUN
  // badge/highlight follows the approached facedown tile instead of dying on
  // the old separate facedown-count loop.
  const state0 = installInNewRemoteAndEndTurn("tithe", 42);
  const run = assertDefined(
    engine.getLegalMoves(state0, "runner").find(
      (m) => m.kind === "runner.run" && m.server === "remote-1",
    ),
  );
  const state = play(state0, "runner", run);
  assert(state.run?.currentIceId, "the run parks on the approached ice");

  const wrapper = mount(GameScreen, { props: { state, humanSide: "runner" } });
  const slot = wrapper.find(".server.remote .server-ice-stack .ice-slot");
  assert(slot.exists(), "the facedown ice renders inside the ice stack");
  assert(
    slot.classes().includes("facedown"),
    "the hidden ice slot keeps the facedown marker class",
  );
  const tile = slot.find(".card-tile");
  assert(
    tile.classes().includes("highlight"),
    "the approached facedown ice is highlighted",
  );
  assertEquals(tile.find(".badge-counter").text(), "RUN", "RUN badge on the facedown ice");
});

Deno.test("GameScreen truthful labels, banner wording, and hosted counters", async (t) => {
  await t.step("turn badge labels the phase instead of the raw enum", () => {
    const { wrapper } = mountGame(42, "corp");
    assertEquals(
      wrapper.find(".turn-player").text().trim(),
      "Corp · acting",
      "the action phase reads 'acting', not the raw 'action' enum",
    );
  });

  await t.step("a loaded Nico Campaign shows its hosted-credit counter", () => {
    // The Nico fixture (see tests/toll_test.ts): install in a new remote and
    // rez it — the on-rez trigger loads 9 credits onto the asset.
    let state = newGameWithCorpHand(["nico_campaign", "manegarm_skunkworks"], 3);
    const install = assertDefined(
      engine.getLegalMoves(state, "corp").find(
        (m) =>
          m.kind === "corp.install" && m.cardId === "nico_campaign" && m.server === "new-remote",
      ),
    );
    state = play(state, "corp", install);
    const nico = assertDefined(
      state.servers.find((s) => s.id === "remote-1")?.root.find((c) =>
        c.cardId === "nico_campaign"
      ),
    );
    const rez = assertDefined(
      engine.getLegalMoves(state, "corp").find(
        (m) => m.kind === "corp.rez" && m.targetId === nico.id,
      ),
    );
    state = play(state, "corp", rez);
    const loaded = state.servers.find((s) => s.id === "remote-1")!.root
      .find((c) => c.id === nico.id)!;
    assertEquals(loaded.hostedCredits, 9, "test setup: the rez loaded 9 credits");

    const wrapper = mount(GameScreen, { props: { state, humanSide: "corp" } });
    const counter = wrapper.find(".server.remote .server-root-row .credit-counter");
    assert(counter.exists(), "the hosted-credits counter renders on the Nico tile");
    assertEquals(counter.text(), "9", "the counter shows the loaded total");
  });

  await t.step("the run banner uses the board's server labels and facedown wording", () => {
    // Approaching facedown remote ice: the banner must say "remote 1" (the
    // board label's form) and "a facedown card" — never the raw server id,
    // and never the `cardId: "hidden"` redaction sentinel (rule 4.6.3).
    const state0 = installInNewRemoteAndEndTurn("tithe", 42);
    const run = assertDefined(
      engine.getLegalMoves(state0, "runner").find(
        (m) => m.kind === "runner.run" && m.server === "remote-1",
      ),
    );
    const state = play(state0, "runner", run);
    assert(state.run?.currentIceId, "test setup: the run parks on the approached ice");

    const wrapper = mount(GameScreen, { props: { state, humanSide: "runner" } });
    const banner = wrapper.find('[data-banner="run"]');
    assert(banner.exists(), "run banner renders");
    const text = banner.text();
    assert(text.includes("RUN"), "run tag present");
    assert(text.includes("on remote 1"), `board label form, got: ${text}`);
    assertEquals(text.includes("remote-1"), false, "no raw server id in the banner");
    assert(text.includes("approached a facedown card"), `facedown wording, got: ${text}`);
    assertEquals(text.includes("hidden"), false, "no redaction sentinel in the banner");
  });

  await t.step("the breach banner names HQ and counts real candidates", () => {
    // No ice protects HQ in the opening board, so a run breaches immediately.
    const { state: base } = createTestFixture(42, "corp");
    let state = endCorpTurn(base);
    const run = assertDefined(
      engine.getLegalMoves(state, "runner").find(
        (m) => m.kind === "runner.run" && m.server === "hq",
      ),
    );
    state = play(state, "runner", run);
    // The run parks in the movement phase (rule 6.9.4c) before reaching HQ.
    state = continueRun(state);
    assert(state.breach !== null, "test setup: the run breaches HQ");

    const wrapper = mount(GameScreen, { props: { state, humanSide: "runner" } });
    const text = wrapper.find('[data-banner="breach"]').text();
    assert(text.includes("BREACH HQ"), `server label form, got: ${text}`);
    assertEquals(text.includes("hq"), false, "no raw server id in the banner");
    // The old "limit - used access(es) left" overstated HQ: the real
    // candidate pool is the corp's unchosen hand cards (rule 7.3.4a).
    const expected = state.corp.hand.length;
    assert(
      text.includes(`${expected} of ${state.breach!.randomAccessLimit} accesses`),
      `real candidate count, got: ${text}`,
    );
  });

  await t.step("the rez-window decline answer is sentence-case", () => {
    // The reserved "pass" answer (rule: see PASS_OPTION_ID) is enumerated for
    // rez windows without an option entry, so it used to render the raw
    // lowercase id as the button text.
    const state = rezWindowState(3);
    const wrapper = mount(GameScreen, { props: { state, humanSide: "corp" } });
    const texts = wrapper.findAll(".prompt-box .moves button").map((b) => b.text());
    assert(texts.includes("Decline"), `a Decline button renders, got: ${texts.join(" | ")}`);
    assertEquals(texts.includes("pass"), false, "the raw reserved id never renders");
    // The prompt box names its kind, and every answer carries its engine
    // optionId as data-option — the annotation contract's answer to "which
    // option is which" that used to require matching button text.
    const box = wrapper.find(".prompt-box");
    assertEquals(box.attributes("data-prompt"), "rez-window", "prompt kind annotated");
    const decline = box
      .findAll("button")
      .find((b) => b.text() === "Decline");
    assert(decline, "found the Decline button");
    assertEquals(
      decline!.attributes("data-action"),
      "prompt.answer",
      "prompt answers are prompt.answer actions",
    );
    assertEquals(
      decline!.attributes("data-option"),
      "pass",
      "the reserved decline optionId is data-option",
    );
  });
});

Deno.test("GameScreen card dock: sheets, per-card actions, no duplicates", async (t) => {
  /**
   * A runner-turn state with Smartware Distributor installed: the resource's
   * "[click]: Place 3 credits" paid ability becomes a per-card action button
   * on the runner's own sheet, and its hosted credits render as a token.
   */
  function runnerWithSmartware(plays: Move[] = []): GameState {
    const decks = starterDeckPair();
    let state = engine.startGame({
      corp: decks.corp,
      runner: runnerDeckStartingWith(["smartware_distributor"]),
      mode: "starter-decks",
      seed: 5,
    });
    state = endCorpTurn(state);
    const install = engine.getLegalMoves(state, "runner").find(
      (m) => m.kind === "runner.install" && m.cardId === "smartware_distributor",
    );
    if (!install || install.kind !== "runner.install") {
      throw new Error("the runner cannot install smartware_distributor on turn 1");
    }
    state = play(state, "runner", install);
    for (const m of plays) state = play(state, "runner", m);
    return state;
  }

  await t.step("opponent sheet renders on top, own sheet below, per seat", () => {
    for (const humanSide of ["corp", "runner"] as const) {
      const { state } = createTestFixture(42, humanSide);
      const wrapper = mount(GameScreen, { props: { state, humanSide } });
      const sheets = wrapper.findAll('[data-dock="card"] > .card-sheet');
      assertEquals(sheets.length, 2, `two sheets in the dock (${humanSide})`);
      assertEquals(
        sheets[0]!.attributes("data-side"),
        humanSide === "corp" ? "runner" : "corp",
        `the opponent sheet is first (${humanSide})`,
      );
      assertEquals(
        sheets[1]!.attributes("data-side"),
        humanSide,
        `own sheet is second (${humanSide})`,
      );
      // data-own is the seat selector: the interface vs the mirror.
      assertEquals(sheets[0]!.attributes("data-own"), "false", "opponent sheet not own");
      assertEquals(sheets[1]!.attributes("data-own"), "true", "own sheet is own");
    }
  });

  await t.step("the runner's own sheet lists installed cards with per-card actions", () => {
    const state = runnerWithSmartware();
    const wrapper = mount(GameScreen, { props: { state, humanSide: "runner" } });
    const own = wrapper.find('.card-sheet[data-own="true"]');
    const resourceGroup = own.find('.sheet-group[data-group="resource"]');
    assert(resourceGroup.exists(), "a Resources group renders on the own sheet");
    const row = resourceGroup.find('.sheet-card[data-card-id="smartware_distributor"]');
    assert(row.exists(), "the Smartware Distributor row renders");
    const instanceId = row.attributes("data-instance");
    assert(instanceId, "the row names its card copy (data-instance)");
    assertEquals(row.find(".sheet-card-title").text().trim(), "Smartware Distributor");
    const actions = row.findAll(".sheet-card-actions button");
    assertEquals(actions.length, 1, "one ability button under the card");
    assert(
      actions[0]!.text().includes("Place 3 credits"),
      `the printed ability title labels the button, got: ${actions[0]!.text()}`,
    );
    assertEquals(actions[0]!.attributes("data-action"), "runner.ability");
    // The ability button names which card copy and which ability: 1-based,
    // matching the label.
    assertEquals(actions[0]!.attributes("data-target"), instanceId);
    assertEquals(actions[0]!.attributes("data-ability"), "1");
  });

  await t.step("per-card actions never duplicate in the Actions list", () => {
    const state = runnerWithSmartware();
    const wrapper = mount(GameScreen, { props: { state, humanSide: "runner" } });
    const general = wrapper.find('[data-panel="actions"] > .moves');
    assert(general.exists(), "the Actions list renders");
    assertEquals(
      general.findAll('button[data-action="runner.ability"]').length,
      0,
      "no ability button in the general Actions list",
    );
  });

  await t.step("playing the ability loads a hosted-credit token on the card", () => {
    const state = runnerWithSmartware();
    const ability = engine.getLegalMoves(state, "runner").find((m) => m.kind === "runner.ability");
    if (!ability || ability.kind !== "runner.ability") throw new Error("no ability move offered");
    const loaded = play(state, "runner", ability);
    const wrapper = mount(GameScreen, { props: { state: loaded, humanSide: "runner" } });
    const row = wrapper.find('.sheet-card[data-card-id="smartware_distributor"]');
    const token = row.find(".sheet-token.credits");
    assert(token.exists(), "a hosted-credits token renders under the card");
    assertEquals(token.text().trim(), "3", "the token reads the hosted credit count");
  });

  await t.step("the opponent sheet shows cards and tokens but never actions", () => {
    // Same state, corp seat: the runner's installed resource is public, the
    // runner's decisions are not the corp's interface.
    const state = runnerWithSmartware();
    const wrapper = mount(GameScreen, { props: { state, humanSide: "corp" } });
    const opp = wrapper.find('.card-sheet[data-own="false"]');
    const row = opp.find('.sheet-card[data-card-id="smartware_distributor"]');
    assert(row.exists(), "the opponent runner's installed card is listed");
    assertEquals(
      row.findAll("button").length,
      1,
      "the row's only button is the title (zoom); no action buttons",
    );
    assertEquals(row.find(".sheet-card-actions").exists(), false, "no action row at all");
    // The corp's own sheet: actions only, no card groups (corp cards are on
    // the board).
    const own = wrapper.find('.card-sheet[data-own="true"]');
    assertEquals(
      own.findAll(".sheet-group").length,
      0,
      "the corp's own sheet lists no card groups",
    );
    assert(
      own.text().includes("Corp cards are on the board."),
      "the corp sheet explains its empty card area",
    );
  });

  await t.step("clicking a sheet card title opens the zoom popup", async () => {
    const state = runnerWithSmartware();
    const wrapper = mount(GameScreen, { props: { state, humanSide: "runner" } });
    const title = wrapper.find(
      '.sheet-card[data-card-id="smartware_distributor"] .sheet-card-title',
    );
    await title.trigger("click");
    const zoom = wrapper.find('[data-modal="zoom"]');
    assert(zoom.exists(), "the zoom popup opened from the sheet");
    assert(zoom.text().includes("Smartware Distributor"), "the popup shows the card");
  });
});

Deno.test("GameScreen win modal", async (t) => {
  /** A finished game: the fixture state with the winner stamped on. */
  function wonGame(winner: "corp" | "runner" | "draw", reason: string) {
    const { state } = createTestFixture(42, "corp");
    const won = deepClone(state);
    won.winner = winner;
    won.winReason = reason;
    return won;
  }

  await t.step("a won game pops the dialog, not a sidebar banner", () => {
    const state = wonGame("corp", "agenda points");
    const wrapper = mount(GameScreen, { props: { state, humanSide: "corp" } });
    const modal = wrapper.find('[data-modal="win"]');
    assert(modal.exists(), "the win dialog renders over the board");
    assert(modal.text().includes("corp"), "the dialog names the winner");
    assert(modal.text().includes("agenda points"), "the dialog shows the win reason");
    assertEquals(
      wrapper.find(".banner-win").exists(),
      false,
      "no win banner in the card-dock sidebar",
    );
    const panel = wrapper.find('[data-panel="actions"]');
    if (panel.exists()) {
      assertEquals(panel.text().includes("Winner:"), false, "the Actions area stays an interface");
    }
  });

  await t.step("the dialog's New game button restarts", async () => {
    const state = wonGame("runner", "flatline");
    const wrapper = mount(GameScreen, { props: { state, humanSide: "corp" } });
    const button = wrapper.find('[data-modal="win"] [data-action="new-game"]');
    assert(button.exists(), "the dialog carries a New game button");
    await button.trigger("click");
    assert(wrapper.emitted("new-game"), "new-game bubbles to the root");
  });

  await t.step("Esc dismisses to the final board; the Winner chip reopens", async () => {
    const state = wonGame("corp", "agenda points");
    const wrapper = mount(GameScreen, { props: { state, humanSide: "corp" } });
    await wrapper.find('[data-modal="win"]').trigger("keydown.escape");
    assertEquals(wrapper.find('[data-modal="win"]').exists(), false, "dismissed");
    // The final board stays reviewable: the status dock keeps the winner chip.
    const chip = wrapper.find('[data-action="show-result"]');
    assert(chip.exists(), "the status dock keeps the Winner chip");
    await chip.trigger("click");
    assert(wrapper.find('[data-modal="win"]').exists(), "the chip reopens the dialog");
  });
});
