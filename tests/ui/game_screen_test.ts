/**
 * Component + regression tests for GameScreen.
 *
 * Runs under `deno test` with happy-dom installed on `globalThis` (see
 * tests/ui/setup.ts), so no browser or network is needed.
 */

import { installRealCss } from "./setup.ts"; // also bridges happy-dom onto globalThis
import { mount } from "@vue/test-utils";
import { assert, assertEquals } from "../helpers/assert.ts";
import { accessDecisionFixture, createTestFixture, publicStatusFor } from "./fixture.ts";
import { engine } from "../../src/mod.ts";
import type { Move, PlayerSide } from "../../src/types.ts";
import GameScreen from "../../src/web/ui/game.ts";

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
    assert(wrapper.find('[data-testid="status-dock"]').exists(), "status dock present");
    assertEquals(
      wrapper.findAll(".player-strip").length,
      0,
      "no in-flow player strips remain",
    );
    assertEquals(
      wrapper.findAll('[data-testid="human-hand"] .hand-card').length,
      state.corp.hand.length,
      "renders one hand-card tile per card in the human hand",
    );
    // The action panel offers corp's legal basic moves (install/play/draw/…).
    assert(wrapper.find('[data-testid="action-moves"]').exists(), "action moves panel rendered");
  });

  await t.step("corp perspective and central columns", () => {
    const { wrapper, status } = mountGame(42, "corp");

    const main = wrapper.find(".game-main");
    assert(main.classes().includes("perspective-corp"), "perspective-corp class applied");

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
    assert(wrapper.find('[data-testid="status-dock"]').exists(), "status dock present");
    assertEquals(wrapper.findAll(".player-strip").length, 0, "old strips removed");
    assert(
      wrapper.find(".game-main > .hand-area [data-testid='human-hand']").exists(),
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
    const hand = wrapper.find('[data-testid="human-hand"]');

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
      .findAll('[data-testid="human-hand"] .hand-card')
      .find((tile) =>
        tile.findAll(".card-actions button").some((b) => b.text() === "Install → HQ")
      );
    assert(palisadeTile, "found a Palisade hand tile");
    await palisadeTile!.find(".card-tile.clickable").trigger("click");
    const popup = wrapper.find('[data-testid="card-zoom"]');
    assert(popup.exists(), "popup opened on the clicked tile");
    const actions = popup.findAll(".zoom-actions button");
    const hqActions = actions.filter((b) => b.text() === "Install → HQ");
    assertEquals(hqActions.length, 1, "popup shows a single Install → HQ action");
    assertEquals(
      popup.findAll('[data-testid="zoom-close"]').length,
      0,
      "no Close button while install actions are shown",
    );

    // Dismiss via the backdrop (popup root is the backdrop itself).
    await popup.trigger("click");
    assertEquals(
      wrapper.find('[data-testid="card-zoom"]').exists(),
      false,
      "popup dismissed",
    );

    // Popup on a card with no actions (the HQ identity card): single Close
    // button and no install buttons leaked into it.
    await wrapper.find(".servers.corp-seat .server-card").trigger("click");
    const identityPopup = wrapper.find('[data-testid="card-zoom"]');
    assert(identityPopup.exists(), "identity popup opened");
    assertEquals(
      identityPopup.findAll('[data-testid="zoom-close"]').length,
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
      const dock = wrapper.find('[data-testid="status-dock"]');
      assert(dock.exists(), `dock present (${humanSide})`);

      const opponent = dock.find('[data-testid="status-opponent"]');
      const own = dock.find('[data-testid="status-own"]');
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
        html.indexOf('data-testid="status-opponent"') < html.indexOf('data-testid="status-own"'),
        `opponent block above own block (${humanSide})`,
      );
    }
  });

  await t.step("both statuses render values, Archives/Heap labels", () => {
    for (const humanSide of ["corp", "runner"] as const) {
      const { wrapper, status } = mountGame(42, humanSide);
      const dock = wrapper.find('[data-testid="status-dock"]');

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
        // Credits + agenda points are the prominent stats.
        assertEquals(
          block.findAll(".primary-stat").length,
          2,
          `${side} has prominent credits + agenda stats`,
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
      const dock = wrapper.find('[data-testid="status-dock"]');
      const own = dock.find('[data-testid="status-own"]');

      // The gain-credit move left the action panel for the credits tile.
      const moves = wrapper.find('[data-testid="action-moves"]');
      if (moves.exists()) {
        assertEquals(
          moves.findAll("button").filter((b) => b.text() === "Gain 1 credit").length,
          0,
          `no Gain button in the action panel (${humanSide})`,
        );
      }

      const gain = own.find('[data-testid="gain-credit"]');
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

  await t.step("own hand stat takes the draw action", async () => {
    for (const humanSide of ["corp", "runner"] as const) {
      const { state } = dockActionFixture(humanSide);
      assertEquals(state.turn.player, humanSide, `it is ${humanSide}'s turn`);
      assert(
        engine.getLegalMoves(state, humanSide).some((m) => m.kind === `${humanSide}.draw`),
        `the ${humanSide}.draw move is legal (clicks + deck left)`,
      );
      const wrapper = mount(GameScreen, { props: { state, humanSide } });
      const dock = wrapper.find('[data-testid="status-dock"]');
      const own = dock.find('[data-testid="status-own"]');
      const opp = dock.find('[data-testid="status-opponent"]');

      // The draw move left the action panel for the hand tile.
      const moves = wrapper.find('[data-testid="action-moves"]');
      if (moves.exists()) {
        assertEquals(
          moves.findAll("button").filter((b) => b.text() === "Draw 1 card").length,
          0,
          `no Draw button in the action panel (${humanSide})`,
        );
      }

      const draw = own.find('[data-testid="draw-card"]');
      assert(draw.exists(), `own hand stat is the draw button (${humanSide})`);
      assertEquals(draw.element.tagName.toLowerCase(), "button", "hand stat is a real button");
      assert(draw.classes().includes("clickable"), "hand stat is clickable while legal");
      assertEquals(draw.attributes("disabled"), undefined, "draw enabled on the human turn");
      assertEquals(draw.attributes("title"), "Draw 1 card", "tooltip names the action");
      assert(/^hand \d+\/\d+$/.test(draw.text().trim()), "visible hand text kept");

      // Only the OWN block converts: the opponent's hand stat stays a span.
      const oppHand = opp.findAll(".stat").filter((s) => s.text().trim().startsWith("hand"));
      assertEquals(oppHand.length, 1, "opponent block shows its hand stat");
      assertEquals(oppHand[0]!.element.tagName.toLowerCase(), "span", "opponent hand stays a span");

      await draw.trigger("click");
      const emitted = wrapper.emitted("move") as unknown[][] | undefined;
      assert(emitted && emitted.length === 1, `click emits one move (${humanSide})`);
      const move = emitted[0]![0] as { kind: string };
      assertEquals(move.kind, `${humanSide}.draw`, "emits the draw move");
    }
  });

  await t.step("acting-side highlight follows state.turn.player", () => {
    const { state, humanSide, wrapper } = mountGame(42, "corp");
    const acting = state.turn.player;
    const idle = acting === "corp" ? "runner" : "corp";
    const dock = wrapper.find('[data-testid="status-dock"]');
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
    const dock2 = wrapper2.find('[data-testid="status-dock"]');
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
    opp.find('[data-testid="access-notice"]').exists(),
    false,
    "no access notice for the opponent's access",
  );
  assertEquals(
    opp.find('[data-testid="card-zoom"]').exists(),
    false,
    "no auto zoom for the opponent's access",
  );

  // Human is the runner accessing: the notice shows and the zoom auto-opens.
  const own = mount(GameScreen, { props: { state, humanSide: "runner" } });
  await own.setProps({ state: withAccess() });
  assert(
    own.find('[data-testid="access-notice"]').exists(),
    "access notice for the human's own access",
  );
  assert(
    own.find('[data-testid="card-zoom"]').exists(),
    "auto zoom for the human's own access",
  );
});
