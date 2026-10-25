/**
 * UCT-vs-random strength test.
 *
 * The UCT AI is paired against RandomAI at the same seat (the Runner, which
 * has the most branching and so exercises MCTS the most). Across a handful of
 * seeds, UCT must win strictly more games than Random does from that seat -
 * a weak search is not "stronger" and the test fails loudly if it regresses.
 *
 * Iterations and time budget are kept low (10 iterations / 150 ms per
 * decision) so the whole suite runs in a few seconds; the relative margin is
 * large enough that this is stable.
 */

import { type GameAI, playGame, RandomAI, UctAI } from "../src/ai/mod.ts";
import { engine } from "../src/mod.ts";
import { starterFixtures } from "../src/testing/fixtures.ts";
import { assert, assertTruthy } from "./helpers/assert.ts";

const SEEDS = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46];
const UCT_OPTIONS = { iterations: 10, timeBudgetMs: 150 };

function playRunnerSeed(seed: number, runner: GameAI): number {
  const decks = starterFixtures();
  const state = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
  const outcome = playGame({
    corp: new RandomAI(),
    runner,
    state,
    maxMoves: 5_000,
  });
  assertTruthy(outcome.winner, `seed ${seed} game should end`);
  return outcome.winner === "runner" ? 1 : 0;
}

Deno.test("UCT AI is stronger than random at the runner seat", () => {
  const uct = new UctAI(UCT_OPTIONS);
  const random = new RandomAI();

  let uctWins = 0;
  let randomWins = 0;
  for (const seed of SEEDS) {
    uctWins += playRunnerSeed(seed, uct);
    randomWins += playRunnerSeed(seed, random);
  }

  assert(
    uctWins > randomWins,
    `UCT won ${uctWins}/${SEEDS.length} games vs Random's ${randomWins}/${SEEDS.length}`,
  );
  // A real margin, not a one-game fluke.
  assert(
    uctWins >= SEEDS.length * 0.5,
    `UCT should win at least half the games, got ${uctWins}/${SEEDS.length}`,
  );
});
