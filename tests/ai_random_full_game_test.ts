/**
 * Full-game AI playthrough: two RandomAIs play an entire game to a terminal
 * state through the public `playGame` loop.
 */

import { playGame, RandomAI } from "../src/ai/mod.ts";
import { engine } from "../src/mod.ts";
import type { GameAI } from "../src/ai/mod.ts";
import { starterFixtures } from "../src/testing/fixtures.ts";
import { assert, assertEquals, assertTruthy } from "./helpers/assert.ts";

/** Two RandomAIs play one full starter game for `seed` through `playGame`. */
function randomFullGame(seed: number) {
  const decks = starterFixtures();
  const state = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
  const corp: GameAI = new RandomAI();
  const runner: GameAI = new RandomAI();
  return playGame({ corp, runner, state, maxMoves: 20_000 });
}

Deno.test("random AI vs random AI full games", async (t) => {
  await t.step("plays a full game to a winner", () => {
    const outcome = randomFullGame(42);

    assertTruthy(outcome.winner, `game should end; last turn ${outcome.state.turn.number}`);
    assertEquals(outcome.timedOut, false, "game must not hit the move cap");
    assert(outcome.moves > 0, "at least one move was applied");
    assert(
      outcome.winner === "corp" || outcome.winner === "runner" || outcome.winner === "draw",
      `winner is a terminal value (${String(outcome.winner)})`,
    );
    assertTruthy(outcome.winReason, "a terminal game records its win reason");
  });

  await t.step("is deterministic for a fixed seed", () => {
    function run(seed: number): { winner: string | null; moves: number } {
      const outcome = randomFullGame(seed);
      return { winner: outcome.winner, moves: outcome.moves };
    }
    const a = run(7);
    const b = run(7);
    assertEquals(a, b, "same seed produces the same game");
  });

  await t.step("different seeds can produce different games", () => {
    // Not a strict guarantee, but across many seeds move counts should differ.
    const counts = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) counts.add(randomFullGame(seed).moves);
    assert(counts.size > 1, `expected variety across seeds, got ${[...counts].join(",")}`);
  });
});
