/**
 * Rez-cost regression tests (rules 1.16.8, 3.4.3, 6.9.2b, 8.1.2d).
 *
 * An ice's REZ cost is its PRINTED cost — the one-credit-per-existing-ice
 * number is the INSTALL cost (rules 1.16.6b / 8.5.11a) and is charged by
 * `installCorpCard`, not by rezzing. The corp rez window must display exactly
 * what rezzing charges, and rezzing through the window must charge that cost
 * exactly once. Tread Lightly raises the rez cost of each ice by 3 during its
 * run, on both the displayed and the charged side.
 */

import { cardDef, engine, starterDeckConfigs } from "../src/mod.ts";
import type { CardId, DeckConfig, GameState, Move, ServerId } from "../src/types.ts";
import { endCorpTurn, play } from "../src/testing/fixtures.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Corp deck config with `iceId` as the first card of the opening hand. */
function corpDeckWith(iceId: CardId): DeckConfig {
  const cfg = starterDeckConfigs().corp;
  const rest = cfg.cards.flatMap((e) => Array<CardId>(e.count).fill(e.cardId));
  const ordered = [iceId, ...rest.filter((id) => id !== iceId)];
  const counts = new Map<CardId, number>();
  for (const id of ordered) counts.set(id, (counts.get(id) ?? 0) + 1);
  return {
    identity: cfg.identity,
    cards: [...counts].map(([cardId, count]) => ({ cardId, count })),
    orderedCards: ordered,
  };
}

/** Runner deck config with `hand` as the opening hand (in order). */
function runnerDeckWith(hand: CardId[]): DeckConfig {
  const cfg = starterDeckConfigs().runner;
  const rest = cfg.cards.flatMap((e) => Array<CardId>(e.count).fill(e.cardId));
  const remaining = new Map<CardId, number>();
  for (const id of rest) remaining.set(id, (remaining.get(id) ?? 0) + 1);
  const keep: CardId[] = [];
  for (const id of rest) {
    if (hand.includes(id) && (remaining.get(id) ?? 0) > 0) {
      remaining.set(id, remaining.get(id)! - 1);
      continue;
    }
    keep.push(id);
  }
  const ordered = [...hand, ...keep];
  const counts = new Map<CardId, number>();
  for (const id of ordered) counts.set(id, (counts.get(id) ?? 0) + 1);
  return {
    identity: cfg.identity,
    cards: [...counts].map(([cardId, count]) => ({ cardId, count })),
    orderedCards: ordered,
  };
}

function startGameWith(corp: DeckConfig, runner: DeckConfig, seed = 3): GameState {
  return engine.startGame({ corp, runner, mode: "starter-decks", seed });
}

/**
 * Corp installs `iceId` protecting `installServer` as its first action, ends
 * its turn, and the Runner runs `runServer`. The corp rez window for the
 * approached (unrezzed) ice is then pending.
 */
function rezWindowForIce(
  iceId: CardId,
  installServer: ServerId | "new-remote",
  runServer: ServerId,
  seed = 3,
): GameState {
  let state = startGameWith(corpDeckWith(iceId), starterDeckConfigs().runner, seed);
  const install = engine.getLegalMoves(state, "corp").find((m) =>
    m.kind === "corp.install" && m.cardId === iceId && m.server === installServer
  );
  assertDefined(install, `corp can install ${iceId} protecting ${installServer}`);
  state = play(state, "corp", install!).state;
  state = endCorpTurn(state);
  assertEquals(state.turn.player, "runner");
  const run = engine.getLegalMoves(state, "runner").find((m) =>
    m.kind === "runner.run" && m.server === runServer
  );
  assertDefined(run, `runner can run ${runServer}`);
  state = play(state, "runner", run!).state;
  const prompt = state.prompts[0];
  assert(
    prompt && prompt.kind === "rez-window",
    `expected a pending corp rez window for ${runServer}`,
  );
  return state;
}

/** Rez window after the Corp installs `iceId` in a brand-new remote. */
function rezWindowInNewRemote(iceId: CardId, seed = 3): GameState {
  return rezWindowForIce(iceId, "new-remote", "remote-1", seed);
}

/** The rez-window option targeting the ice at the Runner's current position. */
function iceRezOption(state: GameState) {
  const prompt = state.prompts[0];
  assert(prompt && prompt.kind === "rez-window", "expected a pending corp rez window");
  assert(state.run && state.run.position !== null, "runner is approaching ice");
  const server = state.servers.find((s) => s.id === state.run!.server)!;
  const ice = server.ice[state.run!.position!]!;
  const option = prompt.options.find((o) => o.targetId === ice.id);
  assertDefined(option, `rez window offers an option for ${cardDef(ice.cardId).title}`);
  return { prompt, ice, option: option! };
}

/** Answer the pending corp rez window with `optionId`. */
function answerRezWindow(state: GameState, optionId: string): GameState {
  const prompt = state.prompts[0];
  assert(prompt && prompt.kind === "rez-window", "expected a pending corp rez window");
  return play(state, "corp", {
    kind: "prompt.answer",
    player: "corp",
    promptId: prompt.id,
    optionId,
  } as Move).state;
}

/** Every ice definition in the starter corp pool. */
function starterCorpIceIds(): CardId[] {
  const ids: CardId[] = [];
  for (const entry of starterDeckConfigs().corp.cards) {
    if (cardDef(entry.cardId).type === "ice") ids.push(entry.cardId);
  }
  return [...new Set(ids)];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("costs: Brân 1.0's rez window offers its printed cost 6, not the ice count 1", () => {
  // Brân 1.0 has printed rez cost 6; as the only ice on the server the old
  // install-count logic offered 1.
  const iceId: CardId = "bran_1_0";
  assertEquals(cardDef(iceId).cost, 6, "fixture: Brân 1.0 prints a rez cost of 6");
  const state = rezWindowInNewRemote(iceId);
  const { ice, option } = iceRezOption(state);
  assertEquals(cardDef(ice.cardId).cost, 6);
  assertEquals(option.creditCost, 6, "rez-window option cost is the printed cost");
  assertEquals(option.label, "Rez Brân 1.0 (6[credit])", "label shows the printed cost");
});

Deno.test("costs: rezzing via the rez window charges the printed cost exactly once", () => {
  const iceId: CardId = "bran_1_0";
  const printed = cardDef(iceId).cost!;
  let state = rezWindowInNewRemote(iceId);
  const { option } = iceRezOption(state);
  const before = state.corp.credits;
  state = answerRezWindow(state, option.id);
  const charged = before - state.corp.credits;
  assertEquals(charged, printed, "corp pays the printed rez cost exactly once");
  const ice = state.servers.flatMap((s) => s.ice).find((c) => c.cardId === iceId);
  assert(ice !== undefined && ice.rezzed === true, "the ice is rezzed");
});

Deno.test("costs: Tread Lightly shows and charges printed+3 for the approached ice", () => {
  const iceId: CardId = "palisade"; // printed rez cost 3
  assertEquals(cardDef(iceId).cost, 3, "fixture: Palisade prints a rez cost of 3");
  let state = startGameWith(
    corpDeckWith(iceId),
    runnerDeckWith(["tread_lightly"]),
  );
  // Corp installs Palisade protecting HQ, then ends its turn.
  const install = engine.getLegalMoves(state, "corp").find((m) =>
    m.kind === "corp.install" && m.cardId === iceId && m.server === "hq"
  );
  assertDefined(install, "corp can install Palisade protecting HQ");
  state = play(state, "corp", install!).state;
  state = endCorpTurn(state);

  // Runner plays Tread Lightly (its enumerated run targets HQ).
  const tread = engine.getLegalMoves(state, "runner").find((m) =>
    m.kind === "runner.playEvent" && m.cardId === "tread_lightly"
  );
  assertDefined(tread, "runner can play Tread Lightly");
  state = play(state, "runner", tread!).state;
  assert(state.run !== null, "Tread Lightly started a run");
  assertEquals(state.run!.rezCostIncrease, 3, "the run carries the +3 rez-cost increase");

  const { option } = iceRezOption(state);
  assertEquals(option.creditCost, 6, "rez-window option shows printed 3 + 3");
  assertEquals(option.label, "Rez Palisade (6[credit])", "label shows printed+3");

  const before = state.corp.credits;
  state = answerRezWindow(state, option.id);
  assertEquals(before - state.corp.credits, 6, "rezzing charges printed+3 exactly once");
});

Deno.test("costs: every starter corp ice's rez-window option equals its printed cost", () => {
  const iceIds = starterCorpIceIds();
  assert(iceIds.length >= 5, `expected several starter corp ice, got ${iceIds.length}`);
  for (const iceId of iceIds) {
    const printed = cardDef(iceId).cost;
    assert(printed !== null && printed !== undefined, `${iceId} has a printed cost`);
    const state = rezWindowInNewRemote(iceId);
    const { option } = iceRezOption(state);
    assertEquals(
      option.creditCost,
      printed,
      `${cardDef(iceId).title}: rez-window cost must be the printed cost ${printed}`,
    );
    assertEquals(
      option.label,
      `Rez ${cardDef(iceId).title} (${printed}[credit])`,
      `${cardDef(iceId).title}: label shows the printed cost`,
    );
  }
});
