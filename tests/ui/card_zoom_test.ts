/**
 * Component tests for CardZoom.
 */

import "./setup.ts";
import { mount } from "@vue/test-utils";
import { assert, assertEquals } from "../helpers/assert.ts";
import CardZoom from "../../src/web/ui/card-zoom.ts";

const finishMove = { kind: "runner.finishAccess" } as const;

Deno.test("CardZoom renders the card title and its action buttons", () => {
  const wrapper = mount(CardZoom, {
    props: {
      cardId: "palisade",
      actions: [
        { label: "Trash (3 [credit])", move: { kind: "runner.trashAccessed" } },
        { label: "Finish access", move: finishMove },
      ],
    },
  });
  assert(wrapper.text().includes("Palisade"), "renders the zoomed card title");
  const buttons = wrapper.findAll(".zoom-actions button");
  assertEquals(buttons.length, 2);
  assertEquals(buttons[0]!.text(), "Trash (3 [credit])");
  assertEquals(buttons[1]!.text(), "Finish access");
  // With actions shown there is no Close button.
  assertEquals(
    wrapper.findAll('[data-testid="zoom-close"]').length,
    0,
    "no Close button while actions are shown",
  );
});

Deno.test("CardZoom clicking an action emits `move` with that move", () => {
  const wrapper = mount(CardZoom, {
    props: { cardId: "palisade", actions: [{ label: "Finish access", move: finishMove }] },
  });
  wrapper.findAll(".zoom-actions button")[0]!.trigger("click");
  const emitted = (wrapper.emitted()["move"] as unknown[][] | undefined) ?? [];
  assertEquals(emitted.length, 1, "one move emitted");
  assertEquals(emitted[0]![0], finishMove);
});

Deno.test("CardZoom without actions shows a single Close button that emits `close`", () => {
  const wrapper = mount(CardZoom, { props: { cardId: "palisade" } });
  const close = wrapper.findAll('[data-testid="zoom-close"]');
  assertEquals(close.length, 1, "exactly one Close button");
  close[0]!.trigger("click");
  const closed = (wrapper.emitted()["close"] as unknown[][]) ?? [];
  assertEquals(closed.length, 1, "close event emitted");
});
