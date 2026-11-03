/**
 * Shared test-drive helpers: advance a game past scripted turns.
 *
 * These are the small "burn the opponent's turn" loops that several test
 * files used to copy verbatim. They are pure functions of the engine facade
 * and the `play`/`orderedCorpDeck` primitives in `fixtures.ts`, so they import
 * that module rather than re-implementing it.
 *
 * Where two copies differed, the version the majority of callers already
 * expected wins; the one outlier (`prompts_dispatch_test.ts` used a wider
 * burn window) is covered by the optional `maxIters` parameter.
 */

import { decide } from "./boundary.ts";
import { engine } from "../../src/engine/facade.ts";
import type { DeckConfig, GameAI, GameState, PlayerSide } from "../../src/types.ts";
import { deepClone } from "./assert.ts";
import { orderedCorpDeck, play } from "./fixtures.ts";
import { starterDeckConfigs } from "../../src/decks/starter-decks-cyberclick-v1.ts";

/**
 * Play first-legal moves for whoever holds the turn until it is `side`'s turn
 * (or the game ends). Returns the state at that moment — never past it.
 */
export function burnUntil(
  state: GameState,
  side: PlayerSide,
  maxIters = 60,
): GameState {
  let cur = state;
  for (let i = 0; i < maxIters; i++) {
    if (cur.winner || cur.turn.player === side) return cur;
    const active = cur.turn.player;
    const moves = engine.getLegalMoves(cur, active);
    if (moves.length === 0) return cur;
    cur = play(cur, active, moves[0]!);
  }
  return cur;
}

/**
 * Finish the current turn, then burn until it is `side`'s turn again.
 *
 * This is the "advance to my next turn" primitive: spend the active player's
 * remaining clicks (first-legal moves) until the turn flips, then keep going
 * until `side` holds the turn.
 */
export function nextTurnOf(state: GameState, side: PlayerSide, maxIters = 60): GameState {
  let cur = state;
  const starter = cur.turn.player;
  for (let i = 0; i < maxIters && !cur.winner && cur.turn.player === starter; i++) {
    const moves = engine.getLegalMoves(cur, starter);
    if (moves.length === 0) break;
    cur = play(cur, starter, moves[0]!);
  }
  return burnUntil(cur, side, maxIters);
}

/**
 * Resolve an in-progress run/breach until it ends (or the game ends).
 *
 * Prefers run-progression moves (continueRun, access, finishAccess), then
 * resolves subroutines, then answers any pending prompt; falls back to the
 * Corp's first-legal move when the Runner has nothing to do.
 */
export function resolveRun(state: GameState, maxIters = 80): GameState {
  let cur = state;
  for (let i = 0; i < maxIters; i++) {
    if (!cur.run || cur.winner) return cur;
    const moves = engine.getLegalMoves(cur, "runner");
    const m = moves.find((x) => x.kind === "continueRun") ??
      moves.find((x) => x.kind === "finishAccess") ??
      moves.find((x) => x.kind === "accessCard" || x.kind === "accessRandom") ??
      moves.find((x) => x.kind === "prompt.answer");
    if (m) {
      cur = play(cur, "runner", m);
      continue;
    }
    const corpMoves = engine.getLegalMoves(cur, "corp");
    if (corpMoves.length > 0) {
      cur = play(cur, "corp", corpMoves[0]!);
      continue;
    }
    return cur;
  }
  return cur;
}

/**
 * A corp deck whose opening hand starts with `hand` (in order).
 *
 * Pulls each requested card from the front of the starter pool, leaving the
 * rest in its original order, so the scripted hand is deterministic.
 * (`corpDeckStartingWith` in fixtures.ts is the same primitive exposed for
 * direct deck-config use.)
 */
export function corpDeckWithHand(hand: string[]): DeckConfig {
  const cfg = starterDeckConfigs().corp;
  const rest = cfg.cards.flatMap((e) => Array<string>(e.count).fill(e.cardId));
  const front: string[] = [];
  for (const id of hand) {
    const i = rest.indexOf(id);
    if (i < 0) throw new Error(`${id} is not in the corp starter pool`);
    front.push(rest.splice(i, 1)[0]!);
  }
  return orderedCorpDeck([...front, ...rest]);
}

// ---------------------------------------------------------------------------
// AI-boundary helpers (shared by the hidden-info / determinize / eval tests)
// ---------------------------------------------------------------------------

/**
 * Advance a game `steps` decisions with `ai` (through the information boundary).
 *
 * `decisionSeed` maps each decision index to the seed handed to the AI; every
 * caller passes its own (the RandomAI/determinize callers use `(i) => i`, the
 * EvalAI perf/boundary callers use `(i) => i * 131 + 7` to keep their
 * established playouts byte-identical).
 */
export function randomGame(
  ai: GameAI,
  seed: number,
  steps: number,
  decisionSeed: (i: number) => number,
): GameState {
  const decks = starterDeckConfigs();
  let state = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
  for (let i = 0; i < steps && !state.winner; i++) {
    const actor: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
    const legal = engine.getLegalMoves(state, actor);
    if (legal.length === 0) break;
    const result = engine.applyMove(state, actor, decide(ai, state, actor, legal, decisionSeed(i)));
    if (result.kind === "illegal-move") break;
    state = result.state;
  }
  return state;
}

/**
 * Permute an array in place with a fixed xorshift stream (order-only change).
 *
 * The stream is a pure function of `streamSeed`, so the same seed always
 * produces the same permutation — callers can diff two states' hidden zones
 * deterministically.
 */
export function permute<T>(list: T[], streamSeed: number): void {
  let s = streamSeed | 0;
  for (let i = list.length - 1; i > 0; i--) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const j = Math.abs(s) % (i + 1);
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
  }
}

/**
 * A copy of `state` that differs ONLY in hidden card order: the opponent's
 * deck, the opponent's hand, and the deciding player's own deck are permuted.
 * Everything visible is untouched.
 */
export function reorderHidden(state: GameState, side: PlayerSide, streamSeed: number): GameState {
  const s = deepClone(state) as GameState;
  const opponent: PlayerSide = side === "corp" ? "runner" : "corp";
  permute(s[opponent].deck, streamSeed);
  permute(s[opponent].hand, streamSeed + 1);
  permute(s[side].deck, streamSeed + 2);
  return s;
}
