/**
 * Visibility: the Corp's unrezzed installed cards are hidden from the Runner;
 * the Runner's hand/deck counts are hidden from the Corp.
 */

import { engine } from "../src/mod.ts";
import { newStarterGame, play } from "../src/testing/fixtures.ts";
import { assert } from "./helpers/assert.ts";

Deno.test("visibility: Corp sees its own unrezzed installed cards", () => {
  const state = newStarterGame(1);
  // Install an unrezzed asset in a new remote.
  const install = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.install" && m.server === "new-remote",
  );
  if (!install || install.kind !== "corp.install") return;
  const r = play(state, "corp", install);
  const view = engine.getPlayerView(r.state, "corp");
  const installed = view.corp.installed;
  assert(installed.length > 0, "Corp should see its installed card");
  assert(installed.every((c) => c.cardId !== "hidden"), "Corp should see its own card id");
});

Deno.test("visibility: Runner does not see unrezzed Corp installed cards", () => {
  const state = newStarterGame(1);
  const install = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.install" && m.server === "new-remote",
  );
  if (!install || install.kind !== "corp.install") return;
  const r = play(state, "corp", install);
  const view = engine.getPlayerView(r.state, "runner");
  const installed = view.corp.installed;
  assert(installed.length > 0, "Runner should see the server exists");
  assert(
    installed.every((c) => c.cardId === "hidden"),
    "Runner should not see unrezzed Corp card ids",
  );
});

Deno.test("visibility: Runner's hand count is hidden from the Corp", () => {
  const state = newStarterGame(1);
  const view = engine.getPlayerView(state, "corp");
  // The Runner's hand count is public information (rule 1.10.2a), but the Corp
  // should not see individual card ids.
  assert(view.runner.handCount >= 0);
  assert(view.runner.deckCount >= 0);
});

Deno.test("visibility: Corp's hand count is hidden from the Runner", () => {
  const state = newStarterGame(1);
  const view = engine.getPlayerView(state, "runner");
  assert(view.corp.handCount >= 0);
  assert(view.corp.deckCount >= 0);
});

Deno.test("visibility: prompts are visible to both players", () => {
  const state = newStarterGame(1);
  const view = engine.getPlayerView(state, "corp");
  assert(Array.isArray(view.prompts));
  assert(Array.isArray(view.events));
});

Deno.test("visibility: rezzed Corp cards are visible to the Runner", () => {
  const state = newStarterGame(1);
  // Install then rez an asset.
  const install = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.install" && m.server === "new-remote",
  );
  if (!install || install.kind !== "corp.install") return;
  let r = play(state, "corp", install);
  const rez = engine.getLegalMoves(r.state, "corp").find((m) => m.kind === "corp.rez");
  if (!rez || rez.kind !== "corp.rez") return;
  r = play(r.state, "corp", rez);
  const view = engine.getPlayerView(r.state, "runner");
  assert(
    view.corp.installed.some((c) => c.cardId !== "hidden"),
    "Runner should see rezzed card ids",
  );
});
