/**
 * EvalAI: an opponent built from determinization + a hand-written eval (the
 * evaluation function and its weights live in `./eval.ts`).
 *
 * Algorithm (per decision):
 *   1. Sample K hypothetical worlds with `determinize(view, ctx, rng)` — one
 *      PRNG stream per world, all seeded from mixtures of `ctx.seed` (the AI
 *      never sees the game's `rngState`).
 *   2. In each world, apply every legal move on a cheap clone and score the
 *      resulting position with `evaluate` FROM `ctx.side`'S perspective.
 *   3. Average each move's score across worlds BEFORE doing anything else.
 *   4. Pick with a root softmax over the averages, sampled from a separate
 *      ctx-seeded stream. Deterministic given (view, legal, ctx).
 *
 * The information boundary: the AI only ever sees (view, legal, ctx), and the
 * eval runs only on determinized worlds.
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
/** A 1-unit favourite is picked ~73% of the time, and a 2-unit favourite
 * ~88%: the tuned strength setting trusts the eval. */
const DEFAULT_TEMPERATURE = 1;

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
    // Movement phases that offer `runner.continueRun` keep `runner.jackOut` in
    // the mix: the eval's run-pressure terms (ice ahead, unbreakable
    // subroutines) are exactly the information a jack-out decision needs, so
    // the softmax prices both options.
    if (legal.length === 1) return legal[0]!;
    const baseSeed = hashSeed(ctx.seed, this.seedSalt);

    // World loop: AVERAGE FIRST (step 3 above). Every move is scored in every
    // world, so a move's number is its expected value across the opponent's
    // possible hidden configurations.
    const sums = new Float64Array(legal.length);
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
      for (let i = 0; i < legal.length; i++) {
        const clone = fastCloneState(world);
        const result = applyMove(clone, ctx.side, legal[i]!, { mutate: true });
        // Legal on the real state but not here (determinize drift): the
        // guarded floor score keeps a bad hypothesis from winning.
        const score = result.kind === "applied" ? evaluate(result.state, ctx.side) : FLOOR;
        sums[i] = sums[i]! + score;
      }
    }
    if (worlds === 0) {
      // No world survived: uniform over the real legal moves.
      const rng = makeRng(baseSeed ^ 0x5bf03635);
      const idx = Math.floor(rng.next() * legal.length) % legal.length;
      return legal[idx] ?? legal[0]!;
    }

    // Softmax root selection over the per-move averages.
    const avgs = new Float64Array(legal.length);
    for (let i = 0; i < legal.length; i++) avgs[i] = sums[i]! / worlds;
    const pickRng = makeRng(hashSeed(baseSeed, 7919));
    return legal[softmaxIndex(avgs, this.temperature, pickRng)]!;
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
