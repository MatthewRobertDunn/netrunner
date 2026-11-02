/**
 * Deep whole-game invariant sweep — the same checkers as
 * `tests/invariants_test.ts` (structural + redaction + move-cost families,
 * `tests/helpers/invariants.ts`) over a larger corpus.
 *
 * Run on demand (not part of `deno task verify`):
 *
 *   deno task check-invariants             # 48 games (24 seeds × both seats)
 *   deno task check-invariants -- --games 120
 *   deno task check-invariants -- --seeds 1,2,3
 *
 * Deterministic: fixed seeds, `decisionSeedFor` per decision, no wall clock —
 * any failure reproduces exactly with the printed seed/seat/step/move.
 */

import { walkInvariantGames } from "../tests/helpers/invariants.ts";

const args = Deno.args;
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const gameCount = Math.max(1, Number(flag("games") ?? 48));
const seedArg = flag("seeds");
const seeds: number[] = seedArg
  ? seedArg.split(",").map((s) => Number(s))
  : Array.from({ length: gameCount }, (_, i) => i + 1);

const started = Date.now();
console.log(
  `check-invariants: ${seeds.length} seeds × 2 seats, cap ${400} moves/game ` +
    `(structural + redaction + move-cost after every move)`,
);
try {
  walkInvariantGames({ seeds, stepCap: 400, tag: "check-invariants" });
} catch (error) {
  console.error(String(error));
  Deno.exit(1);
}
console.log(
  `check-invariants: OK — ${seeds.length * 2} games walked clean in ` +
    `${((Date.now() - started) / 1000).toFixed(1)}s`,
);
