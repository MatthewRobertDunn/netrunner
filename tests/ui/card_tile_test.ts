/**
 * Component tests for CardTile.
 *
 * Runs under `deno test` with happy-dom installed on `globalThis` (see
 * tests/ui/setup.ts), so no browser or network is needed.
 */

import "./setup.ts";
import { mount } from "@vue/test-utils";
import { assert, assertEquals } from "../helpers/assert.ts";
import CardTile from "../../src/web/ui/card-tile.ts";

const palisade = { id: "corp-3", cardId: "palisade", rezzed: true };

/** Mount CardTile on the shared Palisade fixture with a given clickability. */
function mountTile(clickable: boolean) {
  return mount(CardTile, { props: { card: palisade, clickable } });
}

Deno.test("CardTile: face, zoom events, and the facedown guard", async (t) => {
  await t.step("renders the card title and a clickable face", () => {
    const wrapper = mountTile(true);
    const img = wrapper.find(".card-img");
    assert(img.exists(), "renders the card image");
    assertEquals(img.element.getAttribute("alt"), "Palisade", "alt text is the card title");
    assert(
      wrapper.find(".card-tile").classes().includes("clickable"),
      "applies the clickable class",
    );
  });

  await t.step("click emits `zoom` with the card id", () => {
    const wrapper = mountTile(true);
    wrapper.find(".card-tile").trigger("click");
    const zoom = (wrapper.emitted()["zoom"] as unknown[][] | undefined) ?? [];
    assertEquals(zoom.length, 1, "one zoom event emitted");
    assertEquals(zoom[0]![0], "palisade");
  });

  await t.step("without clickable emits nothing on click", () => {
    const wrapper = mountTile(false);
    wrapper.find(".card-tile").trigger("click");
    assertEquals(wrapper.emitted()["zoom"], undefined, "no zoom event without clickable");
  });

  await t.step("facedown card renders the back and does not zoom", () => {
    const wrapper = mount(CardTile, {
      props: { card: { id: "corp-1", cardId: "hidden", rezzed: false }, facedown: true },
    });
    const tile = wrapper.find(".card-tile");
    assertEquals(
      tile.element.getAttribute("title"),
      "Facedown card",
      "title is the facedown label",
    );
    assert(wrapper.find(".facedown-label").exists(), "renders the facedown ? label");
    tile.trigger("click");
    assertEquals(
      wrapper.emitted()["zoom"] as unknown[][] | undefined,
      undefined,
      "facedown hidden card never zooms",
    );
  });
});

Deno.test("CardTile: hosted-credit and strength counters", async (t) => {
  await t.step("renders hosted credits on a loaded card (Nico Campaign)", () => {
    const loaded = { id: "corp-9", cardId: "nico_campaign", rezzed: true, hostedCredits: 9 };
    const wrapper = mount(CardTile, { props: { card: loaded } });
    const counter = wrapper.find(".credit-counter");
    assert(counter.exists(), "renders the hosted-credits counter");
    assertEquals(counter.text(), "9", "shows the loaded credit total");
    assertEquals(
      wrapper.attributes("data-hosted-credits"),
      "9",
      "hosted counters are readable as data-hosted-credit (not data-card-credits, the card's cost)",
    );
  });

  await t.step("no hosted-credit counter without hosted credits", () => {
    const wrapper = mountTile(true);
    assertEquals(
      wrapper.find(".credit-counter").exists(),
      false,
      "Palisade carries no hosted credits",
    );
  });

  await t.step("strength counter shows printed + boost during a pump", () => {
    // Cleaver: printed 3, its pump adds +1 for the encounter (rule 3.9.5b).
    const pumped = { id: "runner-4", cardId: "cleaver", strength: 3, strengthBoost: 1 };
    const wrapper = mount(CardTile, { props: { card: pumped } });
    const counter = wrapper.find(".str-counter");
    assertEquals(counter.text(), "4", "effective strength, not the printed value");
    assert(counter.classes().includes("boosted"), "boost marker class while the pump is live");
    assert(
      (counter.attributes("title") ?? "").includes("+1"),
      "tooltip explains the boost",
    );
    assertEquals(
      wrapper.attributes("data-card-effective-strength"),
      "4",
      "data-card-effective-strength is printed + boost (not the printed 3)",
    );
  });

  await t.step("strength counter shows the printed strength unboosted", () => {
    const wrapper = mount(CardTile, {
      props: { card: { id: "corp-3", cardId: "palisade", rezzed: true, strength: 2 } },
    });
    const counter = wrapper.find(".str-counter");
    assertEquals(counter.text(), "2", "printed strength when no pump is live");
    assertEquals(counter.classes().includes("boosted"), false, "no boost marker");
    assertEquals(counter.attributes("title"), undefined, "no boost tooltip");
  });

  await t.step("the unrezzed flag keeps its own glyph with a tooltip", () => {
    const wrapper = mount(CardTile, {
      props: { card: { id: "corp-5", cardId: "manegarm_skunkworks", rezzed: false } },
    });
    const flag = wrapper.find(".unrezzed-flag");
    assert(flag.exists(), "unrezzed flag renders");
    assertEquals(flag.text(), "D");
    assertEquals(flag.attributes("title"), "installed facedown");
  });
});
