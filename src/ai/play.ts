/**
 * Game loop: lets a pair of AIs play a full game on the engine.
 *
 * The loop is deliberately AI-agnostic: it only talks to `GameAI`, so any
 * pair of AIs can face each other. Every move is validated through
 * `engine.applyMove`, and an AI returning an illegal move aborts the game
 * with an `AiGameError` (a broken AI should never be papered over).
 *
 * Decisions are routed by *who may act*, not by whose turn it is: prompts
 * (mulligans, rez windows, access decisions) belong to the prompted player
 * even during the opponent's turn (rules 5.3-5.7, 6.9.2, 7.5).
 */

import { engine } from "../mod.ts";
import type { GameAI } from "./types.ts";
import type { ApplyMoveResult, GameState, Move, PlayerSide } from "../types.ts";

export interface GameConfig {
  corp: GameAI;
  runner: GameAI;
  /** Initial game state, e.g. from `engine.startGame({...})`. */
  state: GameState;
  /** Abort after this many moves to bound runaway games. */
  maxMoves?: number;
}

export interface GameOutcome {
  /** Final state (`winner` is set unless the game hit the move limit). */
  state: GameState;
  winner: PlayerSide | "draw" | null;
  winReason: string | null;
  /** Total moves applied. */
  moves: number;
  /** True if the loop stopped because of maxMoves without a winner. */
  timedOut: boolean;
}

export class AiGameError extends Error {
  constructor(
    message: string,
    readonly side: PlayerSide,
    readonly move: Move | null,
  ) {
    super(message);
    this.name = "AiGameError";
  }
}

/** The player who may act in `state` (turn player, or the prompted player). */
function actorOf(state: GameState): PlayerSide {
  const prompt = state.prompts[0];
  if (prompt) return prompt.player;
  return state.turn.player;
}

/** Play a complete game with one AI per side. */
export function playGame(config: GameConfig): GameOutcome {
  const { corp, runner, state: initial } = config;
  const maxMoves = config.maxMoves ?? 10_000;

  let state = initial;
  let moves = 0;
  while (!state.winner && moves < maxMoves) {
    const side = actorOf(state);
    const ai = side === "corp" ? corp : runner;
    const legal = engine.getLegalMoves(state, side);
    if (legal.length === 0) {
      throw new AiGameError(
        `no legal moves for ${side} on turn ${state.turn.number} (${state.turn.phase})`,
        side,
        null,
      );
    }
    const move = ai.chooseMove(state, side, legal);
    const result = engine.applyMove(state, side, move);
    if (result.kind === "illegal-move") {
      throw new AiGameError(
        `${ai.name} (${side}) played an illegal move: ${result.reason}`,
        side,
        move,
      );
    }
    state = (result as ApplyMoveResult).state;
    moves++;
  }

  return {
    state,
    winner: state.winner,
    winReason: state.winReason,
    moves,
    timedOut: state.winner === null,
  };
}
