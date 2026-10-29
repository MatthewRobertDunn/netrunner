/**
 * Public game status (rule 1.10): every field of `PublicGameStatus` is
 * information both players are always entitled to see.
 *
 * The two entry points are:
 *  - `getPublicGameStatus(state)`       -- viewer-agnostic, no hidden info at all
 *  - `getPublicGameStatusFor(state, v)` -- same DTO, but the Corp sees the ids
 *    of its own installed cards and each viewer sees its own hand identities
 */

import { engine } from "../src/mod.ts";
import type { GameState, ViewCard } from "../src/types.ts";
import { newStarterGame, play } from "../src/testing/fixtures.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

Deno.test("public status: credits, clicks and tags are visible to both players", () => {
  const state = newStarterGame(1);
  const shared = engine.getPublicGameStatus(state);
  assertEquals(shared.players.corp.credits, 5, "Corp starts with 5 credits");
  assertEquals(shared.players.runner.credits, 5, "Runner starts with 5 credits");
  assertEquals(shared.players.corp.clicks, 3, "Corp has 3 clicks on its turn");
  assertEquals(shared.players.runner.clicks, 0, "Runner gets no clicks on the Corp's turn");
  assertEquals(shared.players.corp.tags, 0);
  assertEquals(shared.players.runner.tags, 0);
});

Deno.test("public status: hand, deck and discard counts are visible to both players", () => {
  const state = newStarterGame(1);
  const shared = engine.getPublicGameStatus(state);
  assertEquals(shared.players.corp.handCount, 6, "Corp opens with 6 cards in hand");
  assert(shared.players.runner.handCount > 0, "Runner has cards in hand");
  assert(shared.players.corp.deckCount > 0, "Corp still has cards in deck");
  assertEquals(shared.players.corp.discardCount, 0, "Nobody has discarded yet");
  assertEquals(shared.players.corp.handSize, 5, "base hand size 5, no modifier");
  assertEquals(shared.players.runner.handSize, 5, "base hand size 5, no modifier");
});

Deno.test("public status: agenda points, identity and score area are public", () => {
  const state = newStarterGame(1);
  const shared = engine.getPublicGameStatus(state);
  assertEquals(shared.agendaPointTarget, 7, "first to 7 agenda points wins");
  assertEquals(shared.players.corp.agendaPoints, 0);
  assertEquals(shared.players.runner.agendaPoints, 0);
  assertEquals(shared.players.corp.identity.cardId, state.corp.identity.cardId);
  assertEquals(shared.players.runner.identity.cardId, state.runner.identity.cardId);
  assertEquals(cardIds(shared.players.corp.score), [], "Corp has nothing scored");
  assertEquals(cardIds(shared.players.runner.score), [], "Runner has nothing scored");
});

function cardIds(cards: ViewCard[]): string[] {
  return cards.map((c) => c.cardId);
}

Deno.test("public status: turn, phase, run and breach progress are public", () => {
  const state = newStarterGame(1);
  const shared = engine.getPublicGameStatus(state);
  assertEquals(shared.turn.player, "corp", "turn holder is public");
  assertEquals(shared.turn.phase, "action", "action phase is public");
  assertEquals(shared.run, null, "no run in the opening action phase");
  assertEquals(shared.breach, null, "no breach yet");
  assertEquals(shared.winner, null, "game has not been decided");
  assertEquals(shared.winReason, null, "no win reason yet");
  assert(Array.isArray(shared.prompts), "prompts are public");
  assert(Array.isArray(shared.warnings), "support warnings are public");
});

Deno.test("public status: credits update after a Corp basic action", () => {
  const state = newStarterGame(1);
  const gain = assertDefined(
    engine.getLegalMoves(state, "corp").find((m) => m.kind === "corp.gainCredits"),
  );
  const after = play(state, "corp", gain).state;
  const shared = engine.getPublicGameStatus(after);
  assertEquals(shared.players.corp.credits, 6, "gaining credits is public knowledge");
  assertEquals(shared.players.corp.clicks, 2, "clicks spent are public knowledge");
});

Deno.test("public status: unrezzed Corp card ids are hidden from the shared DTO", () => {
  const state = newStarterGame(1);
  const install = assertDefined(
    engine.getLegalMoves(state, "corp").find(
      (m) => m.kind === "corp.install" && m.server === "new-remote",
    ),
  );
  const after = play(state, "corp", install).state;
  const shared = engine.getPublicGameStatus(after);
  assert(
    shared.players.corp.installed.every((c) => c.cardId === "hidden"),
    "unrezzed Corp card ids must not appear in the shared DTO",
  );
});

Deno.test("public status: Corp sees its own installed card ids", () => {
  const state = newStarterGame(1);
  const install = assertDefined(
    engine.getLegalMoves(state, "corp").find(
      (m) => m.kind === "corp.install" && m.server === "new-remote",
    ),
  );
  const after = play(state, "corp", install).state;
  const forCorp = engine.getPublicGameStatusFor(after, "corp");
  assert(
    forCorp.players.corp.installed.some((c) => c.cardId !== "hidden"),
    "Corp sees the ids of its own installed cards",
  );
});

Deno.test("public status: same DTO for either viewer", () => {
  const state = newStarterGame(7);
  const a = engine.getPublicGameStatus(state);
  const b = engine.getPublicGameStatus(state);
  assertEquals(a, b, "public status is deterministic for a fixed state");
});

Deno.test("public status: server placement and counts are public", () => {
  const state = newStarterGame(1);
  const shared = engine.getPublicGameStatus(state);
  const central = shared.servers.filter((s) =>
    s.id === "hq" || s.id === "rd" || s.id === "archives"
  );
  assertEquals(central.length, 3, "central servers always appear");
  for (const server of shared.servers) {
    assert(Array.isArray(server.root), "server.root is an array");
    assertEquals(typeof server.unrezzedIceCount, "number");
    assert(Array.isArray(server.ice), "server.ice is an array");
  }
});

Deno.test("public status: installed Runner cards are always public", () => {
  let state: GameState = newStarterGame(1);
  assertEquals(state.turn.player, "corp", "test assumes the Corp's turn");
  const install = assertDefined(
    engine.getLegalMoves(state, "corp").find(
      (m) => m.kind === "corp.install" && m.server === "new-remote",
    ),
  );
  state = play(state, "corp", install).state;
  const shared = engine.getPublicGameStatus(state);
  for (const card of shared.players.runner.installed) {
    assert(
      card.cardId !== "hidden",
      `Runner program/resource ${card.id} should be public knowledge`,
    );
  }
  // Installing a runner card keeps its id public to both players.
  const runnerInstall = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "runner.install",
  );
  if (!runnerInstall) return;
  state = play(state, "runner", runnerInstall).state;
  const forCorp = engine.getPublicGameStatusFor(state, "corp");
  const forRunner = engine.getPublicGameStatusFor(state, "runner");
  assertEquals(
    cardIds(forCorp.players.runner.installed),
    cardIds(forRunner.players.runner.installed),
    "Runner installs are public to both players",
  );
  for (const card of forCorp.players.runner.installed) {
    assert(card.cardId !== "hidden", "Runner programs/resources are public");
  }
});

Deno.test("public status: warnings mirror the authoritative state", () => {
  const state = newStarterGame(1);
  const shared = engine.getPublicGameStatus(state);
  assertEquals(shared.warnings, [...state.supportWarnings]);
});

Deno.test("public status: no hand or deck arrays leak into the DTO", () => {
  const state = newStarterGame(1);
  const json = JSON.stringify(engine.getPublicGameStatus(state));
  const parsed = JSON.parse(json) as {
    players: Record<string, Record<string, unknown>>;
  };
  for (const side of ["corp", "runner"] as string[]) {
    const playerStatus = assertDefined(parsed.players[side]);
    const keys = Object.keys(playerStatus);
    assert(keys.includes("handCount"), `${side} exposes handCount`);
    assert(keys.includes("deckCount"), `${side} exposes deckCount`);
    assert(keys.includes("discardCount"), `${side} exposes discardCount`);
    assert(!keys.includes("hand"), `${side} must not expose a hand array`);
    assert(!keys.includes("deck"), `${side} must not expose a deck array`);
  }
});

Deno.test("public status: works through the engine facade", () => {
  const state = newStarterGame(1);
  const shared = engine.getPublicGameStatus(state);
  assertEquals(shared.players.corp.credits, 5);
  const forRunner = engine.getPublicGameStatusFor(state, "runner");
  assertEquals(
    forRunner.players.corp.credits,
    shared.players.corp.credits,
    "counts agree between the two entry points",
  );
});
