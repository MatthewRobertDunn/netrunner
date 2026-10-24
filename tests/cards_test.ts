/**
 * Card catalogue and behavior tests.
 */

import { cardDef, isIce, tryCardDef } from "../src/cards/catalogue.ts";
import { behaviors, cardSupportReport, supportStatus } from "../src/cards/effects.ts";
import { starterPoolCardIds } from "../src/decks/starter-decks-cyberclick-v1.ts";
import { assert, assertEquals } from "./helpers/assert.ts";

Deno.test("catalogue: every starter-pool card has a definition", () => {
  const ids = starterPoolCardIds();
  assert(ids.length >= 30, "expected at least 30 cards in the starter pool");
  for (const id of ids) {
    const def = tryCardDef(id);
    assert(def, `missing definition for ${id}`);
  }
});

Deno.test("catalogue: identities are unique and typed", () => {
  const runner = cardDef("the_catalyst_convention_breaker");
  const corp = cardDef("the_syndicate_profit_over_principle");
  assertEquals(runner.type, "runner_identity");
  assertEquals(corp.type, "corp_identity");
  assert(runner.side === "runner");
  assert(corp.side === "corp");
});

Deno.test("catalogue: ice is identified by type", () => {
  assert(isIce(cardDef("tithe")));
  assert(isIce(cardDef("palisade")));
  assert(isIce(cardDef("whitespace")));
  assert(isIce(cardDef("diviner")));
  assert(isIce(cardDef("karuna")));
  assert(isIce(cardDef("bran_1_0")));
  assert(!isIce(cardDef("offworld_office")));
  assert(!isIce(cardDef("the_syndicate_profit_over_principle")));
});

Deno.test("catalogue: agenda points and advancement requirements", () => {
  const offworld = cardDef("offworld_office");
  assertEquals(offworld.agendaPoints, 2);
  assertEquals(offworld.advancementRequirement, 4);
  const hub = cardDef("superconducting_hub");
  assertEquals(hub.agendaPoints, 1);
  assertEquals(hub.advancementRequirement, 3);
});

Deno.test("catalogue: icebreaker strength and memory", () => {
  const unity = cardDef("unity");
  assertEquals(unity.strength, 1);
  assertEquals(unity.memoryCost, 1);
  const carmen = cardDef("carmen");
  assertEquals(carmen.strength, 2);
  const cleaver = cardDef("cleaver");
  assertEquals(cleaver.strength, 3);
});

Deno.test("catalogue: starter pool has no tags or virus counters", () => {
  const ids = starterPoolCardIds();
  for (const id of ids) {
    const def = cardDef(id);
    assert(!def.subtypes.includes("tag"), `${def.title} has a tag subtype`);
    assert(!def.subtypes.includes("virus"), `${def.title} has a virus subtype`);
  }
});

Deno.test("effects: every starter-pool card has a behavior definition", () => {
  const ids = starterPoolCardIds();
  for (const id of ids) {
    const behavior = behaviors.get(id);
    assert(behavior, `missing behavior for ${id}`);
  }
});

Deno.test("effects: support status is supported for the starter pool", () => {
  const report = cardSupportReport(starterPoolCardIds());
  assert(report.unsupported.length === 0, `unsupported cards: ${report.unsupported.join(", ")}`);
  assert(report.supported.length > 0);
  assertEquals(report.supported.length + report.unsupported.length, starterPoolCardIds().length);
});

Deno.test("effects: cardSupport returns supported for known cards", () => {
  const s = supportStatus("offworld_office");
  assertEquals(s, "supported");
});
