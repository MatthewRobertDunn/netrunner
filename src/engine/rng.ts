/**
 * Deterministic seeded PRNG (mulberry32). The generator state lives in the
 * game state so games are reproducible from a seed and save/resume cleanly.
 */

import type { GameState } from "../types.ts";

/**
 * A seeded PRNG. `next()` returns a float in [0, 1) and advances this
 * generator's state; `state` exposes the current seed so a hypothetical
 * state can be seeded from it (see `determinize`).
 */
export interface Rng {
  next(): number;
  readonly state: number;
}

/** Returns a float in [0, 1) and advances the state's PRNG. */
export function rngNext(state: GameState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) | 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Random integer in [0, n). Advances the state's PRNG. */
export function rngInt(state: GameState, n: number): number {
  return Math.floor(rngNext(state) * n);
}

/** In-place Fisher-Yates shuffle using the state's PRNG. */
export function shuffle<T>(state: GameState, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rngInt(state, i + 1);
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
  }
  return list;
}

/**
 * Build a standalone mulberry32 PRNG from a seed. The trusted shell uses this
 * to hand an AI a per-decision generator seeded from `ctx.seed`; the AI never
 * sees the engine's `rngState`.
 */
export function makeRng(seed: number): Rng {
  let s = seed | 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) | 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get state() {
      return s;
    },
  };
}
