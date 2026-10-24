/**
 * Smoke test: can the engine play a full turn of each starter deck?
 */

import { assert, assertEquals } from "./helpers/assert.ts";
import { engine, starterDeckConfigs } from "../src/mod.ts";
import type { GameState } from "../src/types.ts";

const decks = starterDeckConfigs();

function startGame(seed = 7): GameState {
  return engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
}

Deno.test("setup: starter decks start the Corp's turn with 6 cards (5 starting hand + mandatory draw)", () => {
  const state = startGame();
  assertEquals(state.turn.player, "corp");
  assertEquals(state.turn.number, 1);
  // Rule 1.6.6: each player draws 5 for the starting hand. Rule 5.3.1/5.3.2:
  // the Corp's first turn has a draw phase and the Corp performs their mandatory
  // draw before the action phase, so the Corp has 6 cards at the start of turn 1.
  assertEquals(state.corp.hand.length, 6);
  assertEquals(state.corp.credits, 5);
  assertEquals(state.runner.credits, 5);
  assertEquals(state.runner.hand.length, 5);
  assertEquals(state.winner, null);
});

Deno.test("corp legal actions in the opening action phase", () => {
  const state = startGame();
  const moves = engine.getLegalMoves(state, "corp");
  const kinds = new Set(moves.map((m) => m.kind));
  assert(kinds.has("corp.gainCredits"));
  assert(kinds.has("corp.draw"));
  assert(kinds.has("corp.install"));
});

Deno.test("corp takes a click and gains a credit", () => {
  const state = startGame();
  const result = engine.applyMove(state, "corp", { kind: "corp.gainCredits" });
  assert(result.kind !== "illegal-move");
  assertEquals(result.state.corp.credits, 6);
  assertEquals(result.state.corp.clicks, 2);
});

Deno.test("illegal moves never mutate state", () => {
  const state = startGame();
  const before = JSON.stringify(state);
  const result = engine.applyMove(state, "corp", { kind: "runner.run", server: "hq" });
  assertEquals(result.kind, "illegal-move");
  assertEquals(JSON.stringify(state), before);
});
