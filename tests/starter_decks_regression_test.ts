/**
 * Regression: the checked-in starter-deck snapshot matches the fixture
 * loader, and the engine can start a game from both.
 */

import {
  starterDeckConfigs,
  starterDeckSupport,
  verifyFixtureAgainstSnapshot,
} from "../src/mod.ts";
import { newStarterGame } from "../src/testing/fixtures.ts";
import { assert, assertEquals } from "./helpers/assert.ts";

Deno.test("regression: fixture matches the checked-in snapshot", () => {
  const problems = verifyFixtureAgainstSnapshot();
  assert(problems.length === 0, `fixture/snapshot mismatch: ${JSON.stringify(problems)}`);
});

Deno.test("regression: starter decks start a full game", () => {
  const state = newStarterGame(1);
  assert(state.turn.player === "corp");
  assert(state.winner === null);
});

Deno.test("regression: every starter-pool card id appears in a deck", () => {
  const decks = starterDeckConfigs();
  const all = new Set<string>([decks.runner.identity, decks.corp.identity]);
  for (const e of decks.runner.cards) all.add(e.cardId);
  for (const e of decks.corp.cards) all.add(e.cardId);
  // Spot-check the expected identities and a few key cards.
  assert(all.has("the_catalyst_convention_breaker"));
  assert(all.has("the_syndicate_profit_over_principle"));
  assert(all.has("offworld_office"));
  assert(all.has("superconducting_hub"));
  assert(all.has("urtica_cipher"));
  assert(all.has("seamless_launch"));
  assert(all.has("jailbreak"));
  assert(all.has("overclock"));
  assert(all.has("red_team"));
  assert(all.has("mayfly"));
  assert(all.has("unity"));
  assert(all.has("cleaver"));
  assert(all.has("carmen"));
  assert(all.has("tread_lightly"));
  assert(all.has("verbal_plasticity"));
  assert(all.has("vrcation"));
  assert(all.has("bran_1_0"));
  assert(all.has("karuna"));
  assert(all.has("diviner"));
  assert(all.has("whitespace"));
  assert(all.has("palisade"));
  assert(all.has("tithe"));
  assert(all.has("manegarm_skunkworks"));
  assert(all.has("nico_campaign"));
  assert(all.has("regolith_mining_license"));
  assert(all.has("pennyshaver"));
  assert(all.has("smartware_distributor"));
  assert(all.has("docklands_pass"));
  assert(all.has("creative_commission"));
  assert(all.has("sure_gamble"));
  assert(all.has("telework_contract"));
  assert(all.has("hedge_fund"));
  assert(all.has("government_subsidy"));
  assert(all.has("send_a_message"));
});

Deno.test("regression: starter deck support report has no unsupported cards", () => {
  const report = starterDeckSupport();
  assertEquals(report.unsupported.length, 0);
  assert(report.supported.length > 0);
});
