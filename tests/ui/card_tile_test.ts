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

Deno.test("CardTile renders the card title and a clickable face", () => {
  const wrapper = mount(CardTile, { props: { card: palisade, clickable: true } });
  const img = wrapper.find(".card-img");
  assert(img.exists(), "renders the card image");
  assertEquals(img.element.getAttribute("alt"), "Palisade", "alt text is the card title");
  assert(
    wrapper.find(".card-tile").classes().includes("clickable"),
    "applies the clickable class",
  );
});

Deno.test("CardTile click emits `zoom` with the card id", () => {
  const wrapper = mount(CardTile, { props: { card: palisade, clickable: true } });
  wrapper.find(".card-tile").trigger("click");
  const zoom = (wrapper.emitted()["zoom"] as unknown[][] | undefined) ?? [];
  assertEquals(zoom.length, 1, "one zoom event emitted");
  assertEquals(zoom[0]![0], "palisade");
});

Deno.test("CardTile without clickable emits nothing on click", () => {
  const wrapper = mount(CardTile, { props: { card: palisade, clickable: false } });
  wrapper.find(".card-tile").trigger("click");
  assertEquals(wrapper.emitted()["zoom"], undefined, "no zoom event without clickable");
});

Deno.test("CardTile facedown card renders the back and does not zoom", () => {
  const wrapper = mount(CardTile, {
    props: { card: { id: "corp-1", cardId: "hidden", rezzed: false }, facedown: true },
  });
  const tile = wrapper.find(".card-tile");
  assertEquals(tile.element.getAttribute("title"), "Facedown card", "title is the facedown label");
  assert(wrapper.find(".facedown-label").exists(), "renders the facedown ? label");
  tile.trigger("click");
  assertEquals(
    wrapper.emitted()["zoom"] as unknown[][] | undefined,
    undefined,
    "facedown hidden card never zooms",
  );
});
