/**
 * Guards `fastCloneState` (src/ai/fast-clone.ts) against drift from the
 * GameState type. Two checks at every state of five full random games:
 *
 * 1. Equality — fastCloneState output is deep-equal to a JSON round-trip.
 *    Catches wrong or missing values (optional fields included; random games
 *    exercise every prompt kind, run/breach state, and optional card field).
 * 2. Isolation — after deep-mutating the clone (a sentinel pushed into every
 *    array, a tag added to every object, recursively), the original state is
 *    byte-identical. Catches shared references in any nested field.
 */

import { assertEquals } from "./helpers/assert.ts";
import { engine, randomAI, starterDeckConfigs, startGame } from "../src/mod.ts";
import { fastCloneState } from "../src/ai/fast-clone.ts";
import type { GameState, Move, PlayerSide } from "../src/types.ts";

/** Deep equality that treats own keys holding `undefined` as absent. */
function deepEqual(a: unknown, b: unknown, path: string): string | null {
  if (a === b) return null;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: length ${a.length} != ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const r = deepEqual(a[i], b[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    const ka = Object.keys(a as object).filter(
      (k) => (a as Record<string, unknown>)[k] !== undefined,
    );
    const kb = Object.keys(b as object).filter(
      (k) => (b as Record<string, unknown>)[k] !== undefined,
    );
    if (ka.length !== kb.length) {
      const missing = ka.filter((k) => !kb.includes(k));
      const extra = kb.filter((k) => !ka.includes(k));
      return `${path}: keys differ (fastClone missing: ${missing}, extra: ${extra})`;
    }
    for (const k of ka) {
      const r = deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${path}.${k}`,
      );
      if (r) return r;
    }
    return null;
  }
  return `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
}

/**
 * Recursively push a sentinel into every array and tag every plain object,
 * so any reference shared with the original state is visibly mutated.
 */
function deepMutate(value: unknown): void {
  if (Array.isArray(value)) {
    value.push("__isolation_sentinel__");
    for (const v of value) deepMutate(v);
    return;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    obj.__isolation_tag__ = true;
    for (const v of Object.values(obj)) deepMutate(v);
  }
}

function checkState(state: GameState, seed: number, move: number): void {
  const clone = fastCloneState(state);
  const mismatch = deepEqual(clone, JSON.parse(JSON.stringify(state)), "$");
  assertEquals(mismatch, null, `seed ${seed}, move ${move}: ${mismatch}`);

  const before = JSON.stringify(state);
  deepMutate(clone);
  assertEquals(
    JSON.stringify(state),
    before,
    `seed ${seed}, move ${move}: clone shares structure with the original`,
  );
}

function playGame(seed: number, maxMoves: number): void {
  const decks = starterDeckConfigs();
  let state = startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
  let moves = 0;
  while (!state.winner && moves < maxMoves) {
    checkState(state, seed, moves);
    const actor: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
    const legal = engine.getLegalMoves(state, actor);
    if (legal.length === 0) break;
    const move: Move = legal.length === 1 ? legal[0]! : randomAI.chooseMove(state, actor, legal);
    const result = engine.applyMove(state, actor, move);
    if (result.kind === "illegal-move") break;
    state = result.state;
    moves++;
  }
  checkState(state, seed, moves);
}

Deno.test("fastClone matches JSON round-trip and stays isolated at every state", () => {
  for (const seed of [1, 2, 3, 7, 42]) playGame(seed, 2000);
});

Deno.test("fastClone copies optional card fields the engine sets during play", () => {
  const decks = starterDeckConfigs();
  const state = startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed: 7,
  });

  // Force every optional CardInstance field onto the Corp identity (always
  // present), then compare. Game semantics don't matter to the clone.
  const card = state.corp.identity;
  card.rezzed = true;
  card.advancement = 2;
  card.hostedCredits = 3;
  card.strengthBoost = 1;
  card.brokenSubroutines = [0, 1];
  card.faceup = true;
  card.server = state.servers[0]!.id;
  card.iceIndex = 0;
  checkState(state, 7, -1);
});
