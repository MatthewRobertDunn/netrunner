/**
 * Shared hash primitives — generic integer/string mixing with no game or AI
 * knowledge, so they live in the engine and the dependency arrows point away
 * from it (`src/ai/*` imports this module; the engine never imports `src/ai`).
 *
 * These are deliberately separate from the PRNG in `rng.ts`: a hash mixes
 * values that are already fixed, it holds no stream state.
 */

/**
 * Mix two 32-bit values into a well-distributed seed. The AI's per-decision
 * seed (from `decisionSeedFor`) is blended with per-world salts through this
 * so related seeds produce unrelated PRNG streams.
 */
export function hashSeed(h1: number, h2: number): number {
  let h = (h1 | 0) ^ Math.imul(h2 | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 32-bit FNV-1a hash of a string, as 8 lowercase hex digits. */
export function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
