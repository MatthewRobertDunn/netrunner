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

  assertEquals(wrapper.text().includes("CORP"), true, "shows the corp strip");
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

Deno.test("GameScreen strip/order: corp perspective and central columns", () => {
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

  // Flattened panels: both strips and the hand render as direct .game-main
  // children; under perspective-corp the runner strip orders just below the
  // header and the corp strip to the bottom (CSS order rules in style.css).
  assert(wrapper.find(".game-main > .player-strip.runner").exists(), "runner strip present");
  assert(wrapper.find(".game-main > .player-strip.corp").exists(), "corp strip present");
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
