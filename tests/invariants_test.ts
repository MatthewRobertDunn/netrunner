/**
 * Whole-game invariant sweep (structural + redaction + move-cost families, in
 * `tests/helpers/invariants.ts`).
 *
 * The suite-sized corpus: 12 RandomAI-vs-RandomAI games (6 seeds × both
 * seats), invariant-checked after every move. This is the fast end of the
 * sweep — `deno task check-invariants` runs the deep corpus (48 games) via
 * `scripts/check-invariants.ts`, which reuses the same checkers.
 *
 * History: the scratch versions of these checks caught the game-over state
 * carrying a live run/breach (24/120 games), and the sweep pins the redaction
 * contract and payment constants against future drift.
 */

import { walkInvariantGames } from "./helpers/invariants.ts";

const SUITE_SEEDS = [1, 2, 3, 7, 11, 42];

Deno.test("invariants: 12 full random games keep every whole-game invariant", () => {
  walkInvariantGames({ seeds: SUITE_SEEDS, stepCap: 400, tag: "invariants" });
});
