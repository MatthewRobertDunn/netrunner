/**
 * UCT (Upper Confidence bounds applied to Trees) AI.
 *
 * Monte-Carlo tree search over the engine's move graph. The tree is grown
 * with UCB1 selection, uniformly random playouts, and back-propagated scores.
 * Hidden information (both players' hands/decks, unrezzed Corp cards) is
 * sampled from the state's own PRNG for playout purposes; the search itself
 * is deterministic given the game seed and iteration budget.
 *
 * Evaluation: a terminal position scores +1 for a win, 0 for a draw, and -1
 * for a loss from the *searching* player's perspective. Non-terminal playouts
 * that hit the playout move cap are scored heuristically by agenda points and
 * credits, scaled to (-1, 1).
 */

import { rngInt } from "../engine/rng.ts";
import { engine } from "../mod.ts";
import type { GameState, Move, PlayerSide } from "../types.ts";
import type { GameAI } from "./types.ts";

export interface UctOptions {
  /** Number of MCTS iterations per decision. Higher = stronger, slower. */
  iterations?: number;
  /** UCB1 exploration constant (sqrt(2) is the classic default). */
  exploration?: number;
  /** Move cap for a single playout (a full game from the current position). */
  playoutDepth?: number;
  /** Hard wall-clock budget per decision, in milliseconds. */
  timeBudgetMs?: number;
}

interface Node {
  /** How many times this node has been visited. */
  visits: number;
  /** Cumulative reward from the perspective of `playerJustMoved`. */
  totalReward: number;
  moves: Move[];
  children: (Child | null)[];
  /** The side that made the move leading *into* this node. */
  playerJustMoved: PlayerSide | null;
}

interface Child {
  move: Move;
  node: Node;
}

export class UctAI implements GameAI {
  readonly name = "uct";
  private readonly iterations: number;
  private readonly exploration: number;
  private readonly playoutDepth: number;
  private readonly timeBudgetMs: number;

  constructor(options: UctOptions = {}) {
    this.iterations = options.iterations ?? 60;
    this.exploration = options.exploration ?? Math.SQRT2;
    this.playoutDepth = options.playoutDepth ?? 200;
    this.timeBudgetMs = options.timeBudgetMs ?? 2_000;
  }

  chooseMove(state: GameState, side: PlayerSide, legal: Move[]): Move {
    if (legal.length === 1) return legal[0]!;

    // Working copy: MCTS mutates its simulation states freely.
    const rootState = structuredClone(state);
    const root: Node = {
      visits: 0,
      totalReward: 0,
      moves: legal,
      children: legal.map(() => null),
      playerJustMoved: other(side),
    };

    const deadline = Date.now() + this.timeBudgetMs;
    for (let i = 0; i < this.iterations && Date.now() < deadline; i++) {
      const sim = structuredClone(rootState);
      this.iterate(sim, root, side);
    }

    // Pick the most-visited child (robust child in UCT practice).
    let best = -1;
    let bestIndex = 0;
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i];
      const visits = child?.node.visits ?? 0;
      if (visits > best) {
        best = visits;
        bestIndex = i;
      }
    }
    return legal[bestIndex] ?? legal[0]!;
  }

  /** One MCTS iteration: select, expand, simulate, back-propagate. */
  private iterate(sim: GameState, root: Node, me: PlayerSide): void {
    const path: { node: Node; childIndex: number }[] = [];
    let node: Node = root;

    // --- Selection: descend fully-expanded nodes with UCB1 -----------------
    while (node.moves.length > 0 && node.children.every((c) => c !== null)) {
      let bestScore = -Infinity;
      let bestIndex = 0;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]!;
        const score = ucb1(
          child.node.totalReward,
          child.node.visits,
          node.visits,
          this.exploration,
        );
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      const child = node.children[bestIndex]!;
      path.push({ node, childIndex: bestIndex });
      // Moves stored at a node belong to the player to move there, which is
      // the opponent of `playerJustMoved`.
      const result = engine.applyMove(sim, other(node.playerJustMoved ?? "corp"), child.move);
      if (result.kind === "illegal-move") return; // tree is stale; skip iteration
      Object.assign(sim, result.state);
      node = child.node;
      if (sim.winner) break;
    }

    // --- Expansion: add one unexpanded child --------------------------------
    let expanded = false;
    for (let i = 0; i < node.children.length; i++) {
      if (node.children[i] !== null) continue;
      const move = node.moves[i]!;
      const result = engine.applyMove(sim, other(node.playerJustMoved ?? "corp"), move);
      if (result.kind === "illegal-move") continue; // tree is stale; skip
      Object.assign(sim, result.state);
      const side = sim.turn.player;
      const legal = engine.getLegalMoves(sim, side);
      const child: Child = {
        move,
        node: {
          visits: 0,
          totalReward: 0,
          moves: legal,
          children: legal.map(() => null),
          playerJustMoved: other(side),
        },
      };
      node.children[i] = child;
      path.push({ node, childIndex: i });
      node = child.node;
      expanded = true;
      break;
    }
    void expanded;

    // --- Simulation: uniform-random playout ---------------------------------
    const reward = this.playout(sim, me);

    // --- Back-propagation ----------------------------------------------------
    // `reward` is from `me`'s perspective. A node's `playerJustMoved` is the
    // side that made the move leading *into* that node, so a node is "good for
    // me" exactly when its player is `me`. Store the reward in that player's
    // frame (positive = good for them), so UCB1's mean is directly comparable.
    node.visits += 1;
    node.totalReward += node.playerJustMoved === me ? reward : -reward;
    for (let i = path.length - 1; i >= 0; i--) {
      const step = path[i]!;
      step.node.visits += 1;
      step.node.totalReward += step.node.playerJustMoved === me ? reward : -reward;
    }
  }

  /** Uniform-random playout; returns the terminal reward from `me`'s view. */
  private playout(sim: GameState, me: PlayerSide): number {
    for (let depth = 0; depth < this.playoutDepth; depth++) {
      if (sim.winner) break;
      const side = sim.turn.player;
      const legal = engine.getLegalMoves(sim, side);
      if (legal.length === 0) break;
      const move = legal[rngInt(sim, legal.length)]!;
      const result = engine.applyMove(sim, side, move);
      if (result.kind === "illegal-move") break;
      Object.assign(sim, result.state);
    }
    return terminalReward(sim, me);
  }
}

/** Reward from `me`'s perspective: win=+1, draw=0, loss=-1, heuristic otherwise. */
function terminalReward(sim: GameState, me: PlayerSide): number {
  if (sim.winner === "draw") return 0;
  if (sim.winner === me) return 1;
  if (sim.winner !== null) return -1;
  // Non-terminal (playout cap): heuristic in (-1, 1).
  const mine = sim[me];
  const theirs = sim[me === "corp" ? "runner" : "corp"];
  const pointDiff = (mine.agendaPoints - theirs.agendaPoints) / sim.agendaPointTarget;
  const creditDiff = (mine.credits - theirs.credits) / 20;
  const raw = pointDiff * 0.8 + creditDiff * 0.2;
  return Math.max(-0.99, Math.min(0.99, raw));
}

function ucb1(reward: number, visits: number, parentVisits: number, c: number): number {
  if (visits === 0) return Infinity;
  const mean = reward / visits;
  return mean + c * Math.sqrt(Math.log(parentVisits + 1) / visits);
}

function other(side: PlayerSide): PlayerSide {
  return side === "corp" ? "runner" : "corp";
}

export const uctAI = new UctAI();
