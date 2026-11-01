/**
 * EvalAI: a "fun" opponent built from determinization + a hand-written eval
 * (the evaluation function and its weights live in `./eval.ts`).
 *
 * Algorithm (per decision):
 *   1. Sample K hypothetical worlds with `determinize(view, ctx, rng)` — one
 *      PRNG stream per world, all seeded from mixtures of `ctx.seed` (the AI
 *      never sees the game's `rngState`).
 *   2. In each world, apply every legal move on a cheap clone and score the
 *      resulting position with `evaluate` FROM `ctx.side`'S perspective.
 *   3. Average each move's score across worlds BEFORE doing anything else —
 *      that averaging is the whole point: a trap remote reads as agenda in
 *      ~30% of worlds, so the runner runs it ~30% of the time instead of
 *      committing to one paranoid reading.
 *   4. Pick with a root softmax over the averages (temperature in eval units),
 *      sampled from a separate ctx-seeded stream. Deterministic given
 *      (view, legal, ctx): same inputs, same pick.
 *
 * No depth search, no neural anything, no randomness in the eval itself —
 * variety comes only from determinization and the softmax.
 *
 * Eval scale (so the temperature is meaningful): one agenda point is worth
 * ~13 units and a credit 0.35, so a typical non-terminal position scores in
 * the -60..+60 range and two competing moves usually differ by 1-6 units.
 * The win bonus (10_000) dwarfs everything and is applied as a terminal
 * short-circuit. Default temperature is 2 units: a 2-unit favourite is picked
 * ~73% of the time — usually right, sometimes not, which is the requested
 * "fun" blend.
 */

import { applyMove } from "../engine/apply.ts";
import { fastCloneState } from "../engine/clone.ts";
import { hashSeed } from "../engine/hash.ts";
import { determinize } from "../engine/determinize.ts";
import { makeRng } from "../engine/rng.ts";
import { evaluate, WIN } from "./eval.ts";
import type { AIDecisionContext, GameAI, GameState, Move, PlayerView } from "../types.ts";

export interface EvalAIOptions {
  /** Worlds (determinizations) sampled per decision. */
  samples?: number;
  /** Root softmax temperature, in eval units (see the file header). */
  temperature?: number;
  /** Extra entropy mixed into the PRNG seeds; defaults to 0. */
  seedSalt?: number;
}

const DEFAULT_SAMPLES = 32;
const DEFAULT_TEMPERATURE = 2;

/** Score for a move that turned out illegal in a hypothetical world. */
const FLOOR = -0.9 * WIN;

// ---------------------------------------------------------------------------
// The AI player
// ---------------------------------------------------------------------------

export class EvalAI implements GameAI {
  readonly name = "eval";
  readonly samples: number;
  readonly temperature: number;
  readonly seedSalt: number;

  constructor(opts: EvalAIOptions = {}) {
    this.samples = opts.samples ?? DEFAULT_SAMPLES;
    this.temperature = opts.temperature ?? DEFAULT_TEMPERATURE;
    this.seedSalt = opts.seedSalt ?? 0;
  }

  chooseMove(view: PlayerView, legal: Move[], ctx: AIDecisionContext): Move {
    // Jack-out judgment (pricing the ice still ahead against what the server
    // might hold) is future work: until the eval can weigh it, a movement
    // phase that offers `runner.continueRun` should just continue — keeping
    // `runner.jackOut` in the mix would make the fun AI randomly abandon runs
    // it already priced as good.
    const moves = legal.some((m) => m.kind === "runner.continueRun")
      ? legal.filter((m) => m.kind !== "runner.jackOut")
      : legal;
    if (moves.length === 1) return moves[0]!;
    const baseSeed = hashSeed(ctx.seed, this.seedSalt);

    // World loop: AVERAGE FIRST (step 3 above). Every move is scored in every
    // world, so a move's number is its expected value across the opponent's
    // possible hidden configurations.
    const sums = new Float64Array(moves.length);
    let worlds = 0;
    for (let k = 1; k <= this.samples; k++) {
      const worldRng = makeRng(hashSeed(baseSeed, k));
      let world: GameState;
      try {
        world = determinize(view, ctx, worldRng);
      } catch {
        // An inconsistent context (never the case from a trusted shell):
        // skip the whole world so every move misses it together.
        continue;
      }
      worlds++;
      for (let i = 0; i < moves.length; i++) {
        const clone = fastCloneState(world);
        const result = applyMove(clone, ctx.side, moves[i]!, { mutate: true });
        // Legal on the real state but not here (determinize drift): the
        // guarded floor score keeps a bad hypothesis from winning.
        const score = result.kind === "applied" ? evaluate(result.state, ctx.side) : FLOOR;
        sums[i] = sums[i]! + score;
      }
    }
    if (worlds === 0) {
      // No world survived: uniform over the real legal moves.
      const rng = makeRng(baseSeed ^ 0x5bf03635);
      const idx = Math.floor(rng.next() * moves.length) % moves.length;
      return moves[idx] ?? moves[0]!;
    }

    // Softmax root selection over the per-move averages.
    const avgs = new Float64Array(moves.length);
    for (let i = 0; i < moves.length; i++) avgs[i] = sums[i]! / worlds;
    const pickRng = makeRng(hashSeed(baseSeed, 7919));
    return moves[softmaxIndex(avgs, this.temperature, pickRng)]!;
  }
}

/** Index sampled from p(i) ∝ exp((avg[i] - max) / temperature). */
export function softmaxIndex(
  avgs: Float64Array,
  temperature: number,
  rng: { next(): number },
): number {
  let max = -Infinity;
  for (const a of avgs) if (a > max) max = a;
  let total = 0;
  const weights = new Float64Array(avgs.length);
  for (let i = 0; i < avgs.length; i++) {
    const w = Math.exp((avgs[i]! - max) / Math.max(temperature, 1e-9));
    weights[i] = w;
    total += w;
  }
  const roll = rng.next() * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]!;
    if (roll < acc) return i;
  }
  return weights.length - 1; // float safety
}
