/**
 * Component tests for CardZoom.
 */

import "./setup.ts";
import { mount } from "@vue/test-utils";
import { assert, assertEquals } from "../helpers/assert.ts";
import CardZoom from "../../src/web/ui/card-zoom.ts";

const finishMove = { kind: "runner.finishAccess" } as const;

Deno.test("CardZoom: actions, move emission, and the Close fallback", async (t) => {
  await t.step("renders the card title and its action buttons", () => {
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
    // Annotation contract: zoom action buttons carry the move's attributes
    // (data-action + parameters), same as every other move button.
    assertEquals(buttons[0]!.attributes("data-action"), "runner.trashAccessed");
    assertEquals(buttons[1]!.attributes("data-action"), "runner.finishAccess");
    // With actions shown there is no Close button.
    assertEquals(
      wrapper.findAll('[data-action="close"]').length,
      0,
      "no Close button while actions are shown",
    );
  });

  await t.step("clicking an action emits `move` with that move", () => {
    const wrapper = mount(CardZoom, {
      props: { cardId: "palisade", actions: [{ label: "Finish access", move: finishMove }] },
    });
    wrapper.findAll(".zoom-actions button")[0]!.trigger("click");
    const emitted = (wrapper.emitted()["move"] as unknown[][] | undefined) ?? [];
    assertEquals(emitted.length, 1, "one move emitted");
    assertEquals(emitted[0]![0], finishMove);
  });

  await t.step("without actions shows a single Close button that emits `close`", () => {
    const wrapper = mount(CardZoom, { props: { cardId: "palisade" } });
    const close = wrapper.findAll('[data-action="close"]');
    assertEquals(close.length, 1, "exactly one Close button");
    close[0]!.trigger("click");
    const closed = (wrapper.emitted()["close"] as unknown[][]) ?? [];
    assertEquals(closed.length, 1, "close event emitted");
  });
});

Deno.test("CardZoom: the focus trap keeps Tab inside the dialog", () => {
  // Structural DOM typing: this repo typechecks without the DOM lib (see
  // tests/ui/setup.ts, which bridges the same happy-dom globals).
  const doc = globalThis as unknown as {
    document?: { activeElement?: { focus(): void } | null };
  };
  const active = () => doc.document?.activeElement ?? null;

  const wrapper = mount(CardZoom, {
    props: { cardId: "palisade" },
    // Attached to the document so the autofocus actually lands: happy-dom
    // does not move focus to elements in a detached tree.
    attachTo: "body",
  });
  const backdrop = wrapper.find('[data-modal="zoom"]');
  const close = wrapper.find('[data-action="close"]');
  assertEquals(active(), backdrop.element, "the backdrop takes focus on mount");

  // Tab from the backdrop reaches the Close button (the only other stop)...
  backdrop.trigger("keydown", { key: "Tab" });
  assertEquals(active(), close.element, "Tab moves to the Close button");
  // ...and Tab from the Close button wraps back — never out into the page.
  close.trigger("keydown", { key: "Tab" });
  assertEquals(active(), backdrop.element, "Tab from the last stop wraps to the backdrop");

  // Shift+Tab from the backdrop wraps forward to the last stop.
  backdrop.trigger("keydown", { key: "Tab", shiftKey: true });
  assertEquals(active(), close.element, "Shift+Tab wraps to the last stop");

  // With access actions the dialog has several stops: Tab cycles through all
  // of them and wraps at the end.
  const multi = mount(CardZoom, {
    props: {
      cardId: "palisade",
      actions: [
        { label: "Trash (3 [credit])", move: { kind: "runner.trashAccessed" } },
        { label: "Finish access", move: { kind: "runner.finishAccess" } },
      ],
    },
    attachTo: "body",
  });
  const modal = multi.find('[data-modal="zoom"]');
  const stops = multi.findAll("button");
  assertEquals(stops.length, 2, "two action buttons, no Close");
  modal.trigger("keydown", { key: "Tab" });
  assertEquals(active(), stops[0]!.element, "first action button");
  stops[0]!.trigger("keydown", { key: "Tab" });
  assertEquals(active(), stops[1]!.element, "second action button");
  stops[1]!.trigger("keydown", { key: "Tab" });
  assertEquals(active(), modal.element, "wrap back to the backdrop after the last action");

  // Escape still closes, and focus returns to the previously focused element
  // on unmount.
  modal.trigger("keydown", { key: "Escape" });
  const closed = (multi.emitted()["close"] as unknown[][]) ?? [];
  assertEquals(closed.length, 1, "Escape emits close");
  multi.unmount();
  wrapper.unmount();
});
