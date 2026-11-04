/**
 * ArchivesBreachDialog + the advance driver (rules 7.3.2-7.3.4, 7.4.1d).
 *
 * A successful run on Archives must access EVERY card in the pile, agendas
 * stolen automatically (7.1.6) and nothing trashable (7.1.5b). The dialog is
 * the human Runner's single surface for that: all cards faceup in one row,
 * agendas leftmost, one click per card, "Access remaining" sweeping the rest,
 * and no way to close it until the breach ends.
 *
 * Two layers are pinned here:
 *   - the GameScreen DOM contract (dialog renders, ordering, suppression of
 *     the per-card zoom and the action panel while it is open, emitted
 *     intents), and
 *   - the real advance loop against the real engine (single-click semantics,
 *     the never-silently-answered auto-chosen final card, the bulk sweep and
 *     the resulting steal).
 */

// Bare import for its side effect (bridges happy-dom onto globalThis): a named
// import whose binding is never referenced is elided, silently dropping the bridge.
import "./setup.ts";
import { mount } from "@vue/test-utils";
import { assert, assertDefined, assertEquals } from "../helpers/assert.ts";
import { cardDef, engine } from "../../src/mod.ts";
import type { GameState, Move, PlayerSide } from "../../src/types.ts";
import GameScreen from "../../src/web/ui/game.ts";
import {
  advanceArchives,
  type ArchivesAdvanceIntent,
  archivesBreachEntries,
} from "../../src/web/ui/archives-breach.ts";
import { continueRun, newGameWithCorpHand, play, setHand } from "../helpers/fixtures.ts";

/**
 * Drive the Corp turn with gain-credit clicks only (nothing that could play
 * or install the hand away) until the mandatory discard prompt, then discard
 * exactly `dropIds` into Archives. Requires `dropIds.length` to equal the
 * mandatory count (hand size 8 against a max hand of 5).
 */
function corpTurnDiscarding(state: GameState, dropIds: string[]): GameState {
  let cur = state;
  for (let i = 0; i < 30 && cur.turn.player === "corp" && !cur.winner; i++) {
    if (cur.prompts[0]?.kind === "discard") {
      assertEquals(dropIds.length, cur.prompts[0].count, "discard count mismatch");
      return play(cur, "corp", { kind: "discard", cardInstanceIds: dropIds } as Move);
    }
    const gain = engine.getLegalMoves(cur, "corp").find((m) => m.kind === "gainCredits");
    if (!gain) break;
    cur = play(cur, "corp", gain);
  }
  throw new Error("the Corp turn never reached its discard phase");
}

/**
 * A runner-side state parked inside an Archives breach over a three-card pile:
 * an agenda (send_a_message), an asset and an operation — discarded by the
 * Corp's mandatory discard, then breached. No prompts: the engine is waiting
 * for the Runner's first candidate choice.
 */
function archivesBreachState(): {
  state: GameState;
  ids: { agenda: string; asset: string; operation: string };
} {
  // The corp is dealt 6 cards, so top the hand up to 8 with the scenario
  // setter: three clicks of gain-credit then force a mandatory discard of 3.
  const state = setHand(
    newGameWithCorpHand([
      "send_a_message",
      "nico_campaign",
      "hedge_fund",
      "hedge_fund",
      "hedge_fund",
      "hedge_fund",
    ]),
    "corp",
    [
      "send_a_message",
      "nico_campaign",
      "hedge_fund",
      "hedge_fund",
      "hedge_fund",
      "hedge_fund",
      "hedge_fund",
      "hedge_fund",
    ],
  );
  const byId = (cardId: string): string => {
    const card = state.corp.hand.find((c) => c.cardId === cardId);
    return assertDefined(card, `${cardId} in the corp hand`).id;
  };
  const ids = {
    agenda: byId("send_a_message"),
    asset: byId("nico_campaign"),
    operation: byId("hedge_fund"),
  };
  let cur = corpTurnDiscarding(state, [ids.agenda, ids.asset, ids.operation]);
  assertEquals(
    cur.corp.discard.map((c) => c.cardId).sort(),
    ["hedge_fund", "nico_campaign", "send_a_message"],
    "the three discarded cards are in Archives",
  );

  // Run Archives: run → (movement jack-out) continueRun → breach, parked.
  const run = assertDefined(
    engine.getLegalMoves(cur, "runner").find((m) => m.kind === "run" && m.server === "archives"),
    "the Runner can run Archives",
  );
  cur = play(cur, "runner", run);
  cur = continueRun(cur);
  assertEquals(cur.breach?.server, "archives", "the run breaches Archives");
  assertEquals(cur.breach?.chosen.length, 0, "nothing chosen yet");
  assertEquals(cur.prompts.length, 0, "no prompt: waiting for the candidate choice");
  return { state: cur, ids };
}

/** The advance loop's test context: bare engine, no AI (all breach parks are
 *  Runner decisions; the Corp never acts mid-breach). */
function driverCtx(holder: { value: GameState | null }) {
  return {
    getState: () => holder.value,
    apply: (actor: PlayerSide, move: Move) => {
      const result = engine.applyMove(holder.value!, actor, move);
      if (result.kind === "illegal-move") {
        throw new Error(`illegal move ${JSON.stringify(move)}: ${result.reason}`);
      }
      holder.value = result.state;
    },
    humanSide: "runner" as const,
  };
}

/** The Corp passes its pending optional prompt (Send a Message's free-rez
 *  choice fires on steal; the AI owns it in the app, so tests answer it). */
function passCorpPrompt(holder: { value: GameState | null }): void {
  const pass = assertDefined(
    engine.getLegalMoves(holder.value!, "corp").find(
      (m) => m.kind === "prompt.answer" && m.optionId === "pass",
    ),
    "the Corp can pass its prompt",
  );
  const result = engine.applyMove(holder.value!, "corp", pass);
  if (result.kind === "illegal-move") throw new Error(result.reason);
  holder.value = result.state;
}

Deno.test("Archives breach dialog: the DOM contract", async (t) => {
  await t.step("renders the whole pile faceup, agenda leftmost", () => {
    const { state, ids } = archivesBreachState();
    const wrapper = mount(GameScreen, { props: { state, humanSide: "runner" } });

    const dialog = wrapper.find('[data-modal="archives-breach"]');
    assert(dialog.exists(), "the breach dialog is mounted");
    const slots = dialog.findAll("[data-state]");
    assertEquals(slots.length, 3, "one slot per card in Archives");

    // Agendas sort leftmost so stealing them is the first thing on offer.
    const first = slots[0]!;
    assertEquals(first.attributes("data-state"), "remaining");
    assertEquals(first.attributes("data-instance"), ids.agenda);
    assertEquals(
      first.attributes("data-action"),
      "accessCard",
      "remaining tiles are accessCard buttons",
    );
    assertEquals(first.attributes("data-target"), ids.agenda);
    // The accessible name carries the action, the title AND the instance id —
    // a name-based snapshot (which does not show data-* attributes) can still
    // target one specific copy.
    assertEquals(first.attributes("aria-label"), `Access Send a Message (${ids.agenda})`);
    assert(
      wrapper.find('[data-modal="archives-breach"] [data-card-id="send_a_message"]').exists(),
      "the agenda tile shows its real card id (faceup, rule 7.3.2)",
    );

    // Status counters and the bulk button.
    assertEquals(dialog.find("[data-breach-accessed]")?.text().trim(), "Accessed 0 of 3");
    assertEquals(dialog.find("[data-breach-remaining]")?.text().trim(), "3 remaining");
    assert(
      dialog.find('[data-action="access-remaining"]').exists(),
      "the Access remaining button is present",
    );
  });

  await t.step("suppresses the per-card zoom and the action panel", () => {
    const { state } = archivesBreachState();
    const wrapper = mount(GameScreen, { props: { state, humanSide: "runner" } });
    assertEquals(wrapper.findComponent({ name: "CardZoom" }).exists(), false, "no zoom popup");
    assertEquals(
      wrapper.find(".banner-access").exists(),
      false,
      "no access notice while the dialog owns the breach",
    );
    const accessMoves = wrapper
      .findAll('[data-panel="actions"] [data-action]')
      .filter((b) =>
        ["accessCard", "finishAccess", "accessRandom"].includes(b.attributes("data-action")!)
      );
    assertEquals(accessMoves.length, 0, "the action panel lists no access moves");
  });

  await t.step("card clicks emit access intents; finish emits the move", () => {
    const { state, ids } = archivesBreachState();
    const wrapper = mount(GameScreen, { props: { state, humanSide: "runner" } });
    wrapper.findAll('[data-action="accessCard"]')[0]!.trigger("click");
    assertEquals(wrapper.emitted("archives-advance")?.length, 1);
    assertEquals(
      (wrapper.emitted("archives-advance")?.[0]?.[0] as ArchivesAdvanceIntent).type,
      "card",
    );
    assertEquals(
      ((wrapper.emitted("archives-advance")?.[0]?.[0] as ArchivesAdvanceIntent) as {
        instanceId: string;
      }).instanceId,
      ids.agenda,
    );
    wrapper.unmount();

    // Drive the real loop to the auto-chosen final card: its pending finish
    // decision is the dialog's Finish button, which emits a plain engine move.
    const holder: { value: GameState | null } = { value: archivesBreachState().state };
    advanceArchives({ type: "card", instanceId: ids.asset }, driverCtx(holder));
    advanceArchives({ type: "card", instanceId: ids.operation }, driverCtx(holder));
    const accessingState = holder.value!;
    assertDefined(accessingState.prompts[0], "the auto-chosen decision is pending");
    const w2 = mount(GameScreen, { props: { state: accessingState, humanSide: "runner" } });
    const finish = w2.find('[data-action="finishAccess"]');
    assert(finish.exists(), "the Finish access button is present while a decision pends");
    finish.trigger("click");
    assertEquals(w2.emitted("move")?.length, 1);
    assertEquals((w2.emitted("move")?.[0]?.[0] as Move).kind, "finishAccess");
    w2.unmount();
  });

  await t.step("gone once the breach ends", () => {
    const { state } = archivesBreachState();
    const holder: { value: GameState | null } = { value: state };
    advanceArchives({ type: "remaining" }, driverCtx(holder));
    // Stealing send_a_message queues the Corp's optional free-rez choice
    // (choose-one, player "corp") — the loop stops there and never answers a
    // Corp decision. Pass it, then resume the sweep.
    const pending = assertDefined(
      holder.value!.prompts[0],
      "the Corp's free-rez decision is pending",
    );
    assertEquals(pending.player, "corp", "the loop left the Corp's decision alone");
    passCorpPrompt(holder);
    advanceArchives({ type: "remaining" }, driverCtx(holder));
    const done = holder.value!;
    assertEquals(done.breach, null, "the breach completed");
    const wrapper = mount(GameScreen, { props: { state: done, humanSide: "runner" } });
    assertEquals(
      wrapper.find('[data-modal="archives-breach"]').exists(),
      false,
      "no dialog without an active breach",
    );
  });
});

Deno.test("Archives breach advance loop (real engine)", async (t) => {
  await t.step("a single click accesses exactly the clicked card", () => {
    const { state, ids } = archivesBreachState();
    const holder: { value: GameState | null } = { value: state };
    advanceArchives({ type: "card", instanceId: ids.agenda }, driverCtx(holder));
    const s = holder.value!;
    assertEquals(s.breach?.chosen.includes(ids.agenda), true, "the agenda was chosen");
    assertEquals(
      s.runner.score.some((c) => c.id === ids.agenda),
      true,
      "the accessed agenda was stolen automatically (rule 7.1.6)",
    );
    assertEquals(s.breach?.chosen.length, 1, "exactly one card resolved");
    // Stealing send_a_message queues the Corp's free-rez choice — a real
    // decision the loop must not answer (the AI owns it in the app).
    const pending = assertDefined(s.prompts[0], "the Corp's steal decision is pending");
    assertEquals(pending.player, "corp");
    passCorpPrompt(holder);
    assertEquals(holder.value!.prompts.length, 0, "parked back at the candidate choice");
    const entries = archivesBreachEntries(holder.value!);
    assertEquals(entries.find((e) => e.card.id === ids.agenda)?.state, "stolen");
    assertEquals(entries.filter((e) => e.state === "remaining").length, 2);
  });

  await t.step("the auto-chosen final card is surfaced, never answered silently", () => {
    const { state, ids } = archivesBreachState();
    const holder: { value: GameState | null } = { value: state };
    const ctx = driverCtx(holder);
    // Two hand clicks; the engine auto-chooses the third card inside the
    // second finish — the loop must stop and leave its decision pending.
    advanceArchives({ type: "card", instanceId: ids.asset }, ctx);
    advanceArchives({ type: "card", instanceId: ids.operation }, ctx);
    const s = holder.value!;
    // Three chosen: two resolved + the engine's auto-chosen third.
    assertEquals(s.breach?.chosen.length, 3, "two resolved + the auto-chosen one");
    const pending = assertDefined(s.prompts[0], "the auto-chosen final decision is pending");
    if (pending.kind !== "access-decision") throw new Error("expected an access decision");
    assertEquals(
      s.breach!.chosen.includes(pending.cardId),
      true,
      "the pending decision is the engine's auto-chosen candidate",
    );
    // And "Access remaining" finishes it: the bulk gesture owns every
    // remaining decision. Stealing the agenda queues the Corp's free-rez
    // choice, where the sweep stops — pass it, and the breach completes.
    advanceArchives({ type: "remaining" }, ctx);
    const corpPrompt = assertDefined(holder.value!.prompts[0], "the Corp's steal decision pends");
    assertEquals(corpPrompt.player, "corp", "the sweep never answers a Corp decision");
    passCorpPrompt(holder);
    assertEquals(holder.value!.breach, null, "the breach completed");
  });

  await t.step("Access remaining sweeps the whole pile, agenda first", () => {
    const { state } = archivesBreachState();
    const holder: { value: GameState | null } = { value: state };
    const ctx = driverCtx(holder);
    // First sweep: steals the agenda, then stops at the Corp's steal-trigger
    // decision without answering it.
    advanceArchives({ type: "remaining" }, ctx);
    const stopped = holder.value!;
    assertEquals(stopped.prompts[0]?.player, "corp", "stopped at the Corp's decision");
    assertEquals(
      stopped.runner.score.map((c) => c.cardId),
      ["send_a_message"],
      "the agenda was stolen first (leftmost)",
    );
    // Pass the Corp prompt and resume: the sweep finishes the rest.
    passCorpPrompt(holder);
    advanceArchives({ type: "remaining" }, ctx);
    const s = holder.value!;
    assertEquals(s.breach, null, "the breach ended");
    assertEquals(archivesBreachEntries(s).length, 0, "no entries without an active breach");
  });

  await t.step("agendas sort leftmost in the display order", () => {
    const { state } = archivesBreachState();
    const entries = archivesBreachEntries(state);
    // The pile is most-recent-first (hedge_fund was discarded last), and the
    // agenda jumps the queue; the other two keep the pile's order.
    assertEquals(
      entries.map((e) => cardDef(e.card.cardId).type),
      ["agenda", "operation", "asset"],
      "agenda, then the pile's original order",
    );
  });
});
