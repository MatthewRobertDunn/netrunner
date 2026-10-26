/**
 * Headless check: play a full game with the UCT AI on both sides and dump the
 * distribution of move kinds the Corp picks. Verifies the AI explores moves
 * beyond "gain credits".
 *
 *   deno run --allow-read scripts/check-ai.ts
 */

import { engine, starterDeckConfigs, UctAI } from "../src/mod.ts";
import type { Move, PlayerSide } from "../src/types.ts";

const ai = new UctAI({ iterations: 60, timeBudgetMs: 1200 });
const decks = starterDeckConfigs();
let state = engine.startGame({
  corp: decks.corp,
  runner: decks.runner,
  mode: "starter-decks",
  seed: 7,
});

const corpKinds = new Map<string, number>();
const runnerKinds = new Map<string, number>();
let moves = 0;

while (!state.winner && moves < 2000) {
  const actor: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
  const legal = engine.getLegalMoves(state, actor);
  if (legal.length === 0) break;
  const move: Move = legal.length === 1 ? legal[0]! : ai.chooseMove(state, actor, legal);
  const tally = actor === "corp" ? corpKinds : runnerKinds;
  tally.set(move.kind, (tally.get(move.kind) ?? 0) + 1);
  const result = engine.applyMove(state, actor, move);
  if (result.kind === "illegal-move") {
    console.error("unexpected illegal move:", move, result.reason);
    break;
  }
  state = result.state;
  moves++;
}

console.log(
  `moves played: ${moves}, winner: ${state.winner ?? "none (cap)"} — ${state.winReason ?? ""}`,
);
console.log("last log events:");
for (const e of state.log.slice(-8)) {
  console.log("  ", e.type, JSON.stringify(e).slice(0, 120));
}
for (const [side, tally] of [["corp", corpKinds], ["runner", runnerKinds]] as const) {
  console.log(`\n${side} move distribution:`);
  for (const [kind, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(24)} ${n}`);
  }
}
