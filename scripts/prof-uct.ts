import { engine, starterDeckConfigs, UctAI } from "/workspace/src/mod.ts";
import type { Move, PlayerSide } from "/workspace/src/types.ts";
const ai = new UctAI({ iterations: 60, timeBudgetMs: 1200 });
const decks = starterDeckConfigs();
let state = engine.startGame({
  corp: decks.corp,
  runner: decks.runner,
  mode: "starter-decks",
  seed: 7,
});
let moves = 0;
const start = performance.now();
while (!state.winner && moves < 2000) {
  const actor: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
  const legal = engine.getLegalMoves(state, actor);
  if (legal.length === 0) break;
  const move: Move = legal.length === 1 ? legal[0]! : ai.chooseMove(state, actor, legal);
  const result = engine.applyMove(state, actor, move);
  if (result.kind === "illegal-move") break;
  state = result.state;
  moves++;
}
const wall = performance.now() - start;
console.log(
  `moves: ${moves}, wall: ${wall.toFixed(0)}ms, ${(moves * 1000 / wall).toFixed(1)} moves/s, ${
    (60 * moves * 1000 / wall).toFixed(0)
  } iterations/s`,
);
