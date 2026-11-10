/**
 * Engine-vs-engine match runner (CLI).
 *
 * Two `GameAI` plugins play N games through the trusted loop and the final
 * scores are printed. To field a NEW engine, change exactly ONE line below —
 * the `engineA`/`engineB` value — and run:
 *
 *   deno run --allow-read scripts/engine-match.ts
 *
 * Or configure the matchup with flags:
 *
 *   deno run --allow-read scripts/engine-match.ts --games 40 --seed 1
 *   deno run --allow-read scripts/engine-match.ts --a eval --b random --quiet
 *
 * The default matchup is the two built-ins (Eval 0.4.0 vs Random 0.1.0); it
 * doubles as a sanity check that the harness wiring is sound.
 */

import { runMatch } from "../src/match/harness.ts";
import { EvalAI } from "../src/ai/policy.ts";
import { RandomAI } from "../src/ai/random.ts";
import type { EnginePluginLike } from "../src/match/harness.ts";

// ---------------------------------------------------------------------------
// The registry: add a new engine here once, then reference it with --a/--b.
// The import above plus one entry below is the whole integration cost.
// ---------------------------------------------------------------------------
const ENGINES: Record<string, EnginePluginLike> = {
  eval: new EvalAI(),
  // Fresh instance per game (stateless anyway, but shows the plugin shape):
  // eval: { make: () => new EvalAI({ samples: 48, temperature: 1 }) },
  random: new RandomAI(),
};

function flag(name: string): string | undefined {
  const i = Deno.args.indexOf(`--${name}`);
  return i >= 0 ? Deno.args[i + 1] : undefined;
}

const has = (name: string) => Deno.args.includes(`--${name}`);

const keyA = flag("a") ?? "eval";
const keyB = flag("b") ?? "random";
const engineA = ENGINES[keyA];
const engineB = ENGINES[keyB];
if (!engineA) {
  console.error(`unknown engine '${keyA}' — available: ${Object.keys(ENGINES).join(", ")}`);
  Deno.exit(2);
}
if (!engineB) {
  console.error(`unknown engine '${keyB}' — available: ${Object.keys(ENGINES).join(", ")}`);
  Deno.exit(2);
}

runMatch({
  engineA,
  engineB,
  games: Number(flag("games") ?? 4),
  seed: Number(flag("seed") ?? 1),
  alternate: !has("no-alternate"),
  quiet: has("quiet"),
});
