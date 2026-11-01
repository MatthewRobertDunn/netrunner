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

/**
 * One mulberry32 step: advance the 32-bit generator state and return the new
 * state plus the output float in [0, 1). This is the single arithmetic core
 * for every mulberry32 use in the engine — `rngNext` (state resident in
 * `GameState`) and `makeRng` (standalone closures handed to AIs) both delegate
 * here, so the two forms cannot drift apart: their numeric outputs are
 * byte-identical by construction.
 */
export function mulberry32Step(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

/** Returns a float in [0, 1) and advances the state's PRNG. */
export function rngNext(state: GameState): number {
  const [s, out] = mulberry32Step(state.rngState);
  state.rngState = s;
  return out;
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
      const [ns, out] = mulberry32Step(s);
      s = ns;
      return out;
    },
    get state() {
      return s;
    },
  };
}
