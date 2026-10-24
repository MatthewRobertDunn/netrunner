/**
 * Determinism: same seed + same moves => same state.
 */

import { engine } from "../src/mod.ts";
import { newStarterGame } from "../src/testing/fixtures.ts";
import { assert, assertEquals } from "./helpers/assert.ts";

function pickFirst(state: ReturnType<typeof newStarterGame>, side: "corp" | "runner") {
  const moves = engine.getLegalMoves(state, side);
  return moves.length > 0 ? moves[0] : null;
}

Deno.test("determinism: same seed produces identical states", () => {
  const a = newStarterGame(42);
  const b = newStarterGame(42);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

Deno.test("determinism: different seeds differ", () => {
  const a = newStarterGame(1);
  const b = newStarterGame(2);
  assert(JSON.stringify(a) !== JSON.stringify(b));
});

Deno.test("determinism: replaying a greedy sequence is reproducible", () => {
  const apply = (seed: number) => {
    let cur = newStarterGame(seed);
    for (let i = 0; i < 10; i++) {
      const side = cur.turn.player;
      const m = pickFirst(cur, side);
      if (!m) break;
      const result = engine.applyMove(cur, side, m);
      if (result.kind === "illegal-move") break;
      cur = result.state;
      if (cur.winner) break;
    }
    return cur;
  };
  const a = apply(99);
  const b = apply(99);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

Deno.test("determinism: illegal moves never mutate the original state", () => {
  const state = newStarterGame(5);
  const before = JSON.stringify(state);
  const result = engine.applyMove(state, "corp", { kind: "runner.run", server: "hq" });
  assert(result.kind === "illegal-move");
  assertEquals(JSON.stringify(state), before);
});
