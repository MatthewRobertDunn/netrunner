/**
 * Component + regression tests for GameScreen.
 *
 * Runs under `deno test` with happy-dom installed on `globalThis` (see
 * tests/ui/setup.ts), so no browser or network is needed.
 */

import "./setup.ts";
import { mount } from "@vue/test-utils";
import { assert, assertEquals } from "../helpers/assert.ts";
import { createTestFixture, publicStatusFor } from "./fixture.ts";
import GameScreen from "../../src/web/ui/game.ts";

Deno.test("GameScreen renders the public status and the human hand", () => {
  const { state, humanSide } = createTestFixture(42, "corp");
  const wrapper = mount(GameScreen, { props: { state, humanSide } });

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

Deno.test("GameScreen regression: duplicated Palisades yield one Install → HQ button per tile", () => {
  // Seed 42 opens with the Corp to act and two Palisades already in hand.
  const { state, humanSide } = createTestFixture(42, "corp");
  const wrapper = mount(GameScreen, { props: { state, humanSide } });
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

Deno.test("GameScreen regression: popup shows a single action row, no duplicates", async () => {
  const { state, humanSide } = createTestFixture(42, "corp");
  const wrapper = mount(GameScreen, { props: { state, humanSide } });

  // Popup on a grip card: shows its install actions, exactly one "Install →
  // HQ", and no Close button while actions are present.
  const palisadeTile = wrapper
    .findAll('[data-testid="human-hand"] .hand-card')
    .find((t) => t.findAll(".card-actions button").some((b) => b.text() === "Install → HQ"));
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

Deno.test("GameScreen panel/order: corp perspective and central columns", () => {
  const { state, humanSide } = createTestFixture(42, "corp");
  const wrapper = mount(GameScreen, { props: { state, humanSide } });

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
  const status = publicStatusFor(state, humanSide);
  assertEquals(status.servers.map((s: { id: string }) => s.id).sort(), [
    "archives",
    "hq",
    "rd",
  ]);
});

Deno.test("GameScreen side panel: opponent on top, own on bottom per seat", () => {
  for (const humanSide of ["corp", "runner"] as const) {
    const { state } = createTestFixture(42, humanSide);
    const wrapper = mount(GameScreen, { props: { state, humanSide } });
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

Deno.test("GameScreen side panel: both statuses render values, Archives/Heap labels", () => {
  for (const humanSide of ["corp", "runner"] as const) {
    const { state } = createTestFixture(42, humanSide);
    const wrapper = mount(GameScreen, { props: { state, humanSide } });
    const status = publicStatusFor(state, humanSide);
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

Deno.test("GameScreen side panel: own credits tile takes the gain-credit action", async () => {
  for (const humanSide of ["corp", "runner"] as const) {
    // Seed 42 opens on the Corp turn: three gains spend its clicks, then a
    // one-card discard clears the discard phase to reach the Runner turn.
    // (Corp opens over max hand size after the mandatory draw.)
    let fx = createTestFixture(42, humanSide);
    if (humanSide === "runner") {
      const gains = [{ kind: "corp.gainCredits" }, { kind: "corp.gainCredits" }, {
        kind: "corp.gainCredits",
      }];
      fx = createTestFixture(42, humanSide, gains as never[]);
      const drop = fx.state.corp.hand[0]!.id;
      fx = createTestFixture(
        42,
        humanSide,
        [...gains, { kind: "discard", player: "corp", cardInstanceIds: [drop] }] as never[],
      );
    }
    const { state } = fx;
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

Deno.test("GameScreen side panel: acting-side highlight follows state.turn.player", () => {
  const { state, humanSide } = createTestFixture(42, "corp");
  const acting = state.turn.player;
  const idle = acting === "corp" ? "runner" : "corp";
  const wrapper = mount(GameScreen, { props: { state, humanSide } });
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

Deno.test("GameScreen access popup: only the human's own access decision pops the zoom", async () => {
  const { state } = createTestFixture(42, "corp");
  // A runner access-decision prompt on a real card (corp grip card resolves
  // via findCardIn for the test; the engine always sets player: "runner").
  const accessedId = state.corp.hand[0]!.id;
  const withAccess = (player: "corp" | "runner") => {
    const s = structuredClone(state);
    s.prompts = [{ kind: "access-decision", id: 999, player, cardId: accessedId } as never];
    return s;
  };

  // Human is corp, AI runner is accessing: no notice, and transitioning into
  // the access must not auto-open the zoom (the old flash-then-close).
  const opp = mount(GameScreen, { props: { state, humanSide: "corp" } });
  await opp.setProps({ state: withAccess("runner") });
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
  await own.setProps({ state: withAccess("runner") });
  assert(
    own.find('[data-testid="access-notice"]').exists(),
    "access notice for the human's own access",
  );
  assert(
    own.find('[data-testid="card-zoom"]').exists(),
    "auto zoom for the human's own access",
  );
});
