/**
 * Match play: UctAI(iterationsA) vs UctAI(iterationsB), sides swapped each
 * pair so neither side's role bias affects the tally.
 *
 *   deno run --allow-read scripts/ai-match.ts --games 100 --a 1000 --b 10000
 *
 * Reports strong-side win rate over non-draw games and a chi-square test
 * (1 df) of the null hypothesis that the two AIs are equally strong.
 */

import { engine, starterDeckConfigs, UctAI } from "../src/mod.ts";
import type { GameState, Move, PlayerSide } from "../src/types.ts";

// --- args -------------------------------------------------------------------

let games = 20;
let itersA = 1000;
let itersB = 10000;
let baseSeed = 1000;
const args = [...Deno.args];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--games") games = Number(args[++i]);
  else if (args[i] === "--a") itersA = Number(args[++i]);
  else if (args[i] === "--b") itersB = Number(args[++i]);
  else if (args[i] === "--seed") baseSeed = Number(args[++i]);
}

// --- statistics (offline; Abramowitz-Stegun erf, |err| < 1.5e-7) -------------

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
        0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** Upper-tail probability of chi-square with 1 degree of freedom. */
function chiSquare1DfPValue(x: number): number {
  // P(X > x) = 2 * (1 - Phi(sqrt(x)))
  const z = Math.sqrt(x);
  return 2 * (1 - 0.5 * (1 + erf(z / Math.SQRT2)));
}

// --- match ------------------------------------------------------------------

const strong = new UctAI({ iterations: Math.max(itersA, itersB), timeBudgetMs: 60_000 });
const weak = new UctAI({ iterations: Math.min(itersA, itersB), timeBudgetMs: 60_000 });

interface Tally {
  strongWins: number;
  weakWins: number;
  draws: number;
  caps: number; // games hitting the move cap without a winner
  moves: number;
  errors: number;
}

function playGame(strongSide: PlayerSide, seed: number): "strong" | "weak" | "draw" | "cap" {
  const decks = starterDeckConfigs();
  let state: GameState = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
  let moves = 0;
  while (!state.winner && moves < 3000) {
    const actor: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
    const legal = engine.getLegalMoves(state, actor);
    if (legal.length === 0) break;
    const isStrong = actor === strongSide;
    const ai = isStrong ? strong : weak;
    const move: Move = legal.length === 1 ? legal[0]! : ai.chooseMove(state, actor, legal);
    const result = engine.applyMove(state, actor, move);
    if (result.kind === "illegal-move") {
      console.error(`illegal move offered: ${JSON.stringify(move).slice(0, 120)}`);
      return "cap"; // don't count a broken game either way
    }
    state = result.state;
    moves++;
  }
  if (state.winner === "draw") return "draw";
  if (state.winner === null) return "cap";
  return state.winner === strongSide ? "strong" : "weak";
}

const tally: Tally = { strongWins: 0, weakWins: 0, draws: 0, caps: 0, moves: 0, errors: 0 };
const t0 = performance.now();

for (let pair = 0; pair * 2 < games; pair++) {
  // Swap roles between the two games of a pair.
  for (const strongSide of ["corp", "runner"] as const) {
    const seed = baseSeed + pair * 2 + (strongSide === "corp" ? 0 : 1);
    const outcome = playGame(strongSide, seed);
    if (outcome === "strong") tally.strongWins++;
    else if (outcome === "weak") tally.weakWins++;
    else if (outcome === "draw") tally.draws++;
    else tally.caps++;
  }
  const done = (pair + 1) * 2;
  const elapsed = (performance.now() - t0) / 1000;
  console.error(
    `pair ${pair + 1}: strong ${tally.strongWins} - ${tally.weakWins} weak, ` +
      `${tally.draws} draws, ${tally.caps} caps (${(elapsed / done).toFixed(1)}s/game)`,
  );
}

// --- report -----------------------------------------------------------------

const decided = tally.strongWins + tally.weakWins;
const rate = decided > 0 ? tally.strongWins / decided : 0;
console.log(`\n=== UctAI(${Math.max(itersA, itersB)}) vs UctAI(${Math.min(itersA, itersB)}) ===`);
console.log(
  `games: ${
    decided + tally.draws + tally.caps
  } (decided ${decided}, draws ${tally.draws}, caps ${tally.caps})`,
);
console.log(
  `strong wins: ${tally.strongWins}, weak wins: ${tally.weakWins} → ` +
    `${(rate * 100).toFixed(1)}% for the stronger AI over decided games`,
);
if (decided === 0) {
  console.log("no decided games; no test");
  Deno.exit(0);
}
const expected = decided / 2;
const chi2 = (tally.strongWins - expected) ** 2 / expected +
  (tally.weakWins - expected) ** 2 / expected;
const p = chiSquare1DfPValue(chi2);
console.log(`chi-square (1 df): ${chi2.toFixed(3)}, p = ${p.toExponential(3)}`);
console.log(
  p < 0.05
    ? `→ REJECT equal strength at α=0.05 (stronger AI ${rate >= 0.5 ? "is" : "is NOT"} better; p=${
      p.toFixed(4)
    })`
    : `→ fail to reject equal strength at α=0.05 (p=${p.toFixed(4)})`,
);
// 95% normal-approximation CI on the win rate
const ci = 1.96 * Math.sqrt(rate * (1 - rate) / decided);
console.log(
  `95% CI on strong win rate: [${Math.max(0, rate - ci).toFixed(3)}, ${
    Math.min(1, rate + ci).toFixed(3)
  }]`,
);
console.log(`total wall: ${((performance.now() - t0) / 1000).toFixed(0)}s`);
