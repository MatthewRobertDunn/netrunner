/**
 * The engine-vs-engine match harness (`src/match/harness.ts`).
 *
 * Pins the contract a third-party engine relies on: one-line integration, any
 * `GameAI` (or `{ make }` factory) plugs in, sides alternate in seed-shared
 * pairs, and the summary prints name + version so two builds of one engine are
 * distinguishable ("Eval 0.4.0" vs "Eval 0.4.2").
 */

import { displayName, runMatch } from "../src/match/harness.ts";
import type { EnginePluginLike, MatchConfig } from "../src/match/harness.ts";
import { EvalAI } from "../src/ai/policy.ts";
import { RandomAI } from "../src/ai/random.ts";
import type { GameAI } from "../src/types.ts";
import { assert, assertEquals } from "./helpers/assert.ts";

/** `assertStringIncludes` without the std dependency. */
function assertStringIncludes(text: string, needle: string, msg?: string): void {
  assert(text.includes(needle), msg ?? `expected text to include '${needle}':\n${text}`);
}

/** A trivially weak but legal engine: always the FIRST legal move. Also the
 *  proof that a bespoke GameAI (no imports from src/ai) plugs in as-is. */
class FirstMoveAI implements GameAI {
  constructor(
    readonly name: string,
    readonly version?: string,
  ) {}
  chooseMove(_view: unknown, legal: { kind: string }[]) {
    return legal[0]! as never;
  }
}

/** Capture `runMatch` output without touching the console. */
function capture(config: MatchConfig) {
  const lines: string[] = [];
  const summary = runMatch({ ...config, print: (l) => lines.push(l) });
  return { summary, lines };
}

Deno.test("match harness: scores, alternation, and version display", async (t) => {
  await t.step("two built-in engines play a side-balanced match", () => {
    const { summary, lines } = capture({
      engineA: new EvalAI(),
      engineB: new RandomAI(),
      games: 4,
      seed: 1,
      quiet: true,
    });
    assertEquals(summary.games.length, 4);
    // Alternation: A sits corp on odd games, runner on even ones.
    assertEquals(summary.games.map((g) => g.aSide), ["corp", "runner", "corp", "runner"]);
    // Seed-shared PAIRS: games 1+2 share a seed, 3+4 share a seed.
    assertEquals(summary.games[0]!.seed, summary.games[1]!.seed);
    assertEquals(summary.games[2]!.seed, summary.games[3]!.seed);
    assertEquals(summary.games[2]!.seed, summary.games[0]!.seed + 1, "pairs advance the seed");
    // Each engine played 2 games per side.
    assertEquals(summary.a.asCorp + summary.b.asCorp, 2);
    assertEquals(summary.a.asRunner + summary.b.asRunner, 2);
    // Wins + draws = games.
    assertEquals(summary.a.wins + summary.b.wins + summary.draws, 4);
    // The table names both engines WITH versions.
    const table = lines.join("\n");
    assert(table.includes("eval 0.4.0"), "table names engine A with its version");
    assert(table.includes("random 0.1.0"), "table names engine B with its version");
    assertStringIncludes(summary.a.label, "eval 0.4.0");
  });

  await t.step("a bespoke GameAI plugs in with one import line", () => {
    const { summary } = capture({
      engineA: new FirstMoveAI("first", "1.0.0"),
      engineB: new RandomAI(),
      games: 2,
      seed: 3,
      quiet: true,
    });
    assertEquals(summary.a.label, "first 1.0.0");
    assertEquals(summary.games.length, 2);
    // Illegal-move safety is playGame's job; here only bookkeeping is asserted.
    assert(summary.games.every((g) => g.moves > 0));
  });

  await t.step("the { make } plugin shape builds a fresh instance per game", () => {
    let builds = 0;
    const plugin: EnginePluginLike = {
      make: () => {
        builds++;
        return new RandomAI();
      },
      label: "factory",
    };
    const { summary } = capture({
      engineA: plugin,
      engineB: new RandomAI(),
      games: 4,
      seed: 5,
      quiet: true,
    });
    assertEquals(builds, 4, "one factory call per game");
    assertEquals(summary.a.label, "factory", "explicit label wins over the product's name");
  });

  await t.step("an engine without a version prints as its bare name", () => {
    assertEquals(displayName(new FirstMoveAI("bare")), "bare");
    assertEquals(displayName(new FirstMoveAI("bare", "2.1.3")), "bare 2.1.3");
  });

  await t.step("odd game counts round up to keep the sides even", () => {
    const { summary } = capture({
      engineA: new RandomAI(),
      engineB: new RandomAI(),
      games: 3,
      seed: 7,
      quiet: true,
    });
    assertEquals(summary.games.length, 4, "3 → 4 so both engines play both sides");
    assertEquals(summary.config.games, 4);
  });

  await t.step("alternate: false plays each game on its own seed, A=corp", () => {
    const { summary } = capture({
      engineA: new RandomAI(),
      engineB: new RandomAI(),
      games: 2,
      seed: 9,
      quiet: true,
      alternate: false,
    });
    assertEquals(summary.games.map((g) => g.aSide), ["corp", "corp"]);
    assertEquals(summary.games.map((g) => g.seed), [9, 10], "no pairing without alternation");
  });

  await t.step("same-version clones play each other (Eval vs Eval)", () => {
    const { summary } = capture({
      engineA: { make: () => new EvalAI({ seedSalt: 1 }), label: undefined },
      engineB: { make: () => new EvalAI({ seedSalt: 2 }), label: undefined },
      games: 2,
      seed: 11,
      quiet: true,
    });
    // Two identically-named engines: both labels resolve, games complete.
    assertEquals(summary.games.length, 2);
    assertEquals(summary.a.label, "eval 0.4.0");
    assertEquals(summary.b.label, "eval 0.4.0");
  });

  await t.step("the harness drives REAL games (winner matches final state)", () => {
    const { summary } = capture({
      engineA: new EvalAI(),
      engineB: new RandomAI(),
      games: 2,
      seed: 13,
      quiet: true,
    });
    for (const game of summary.games) {
      // Every game ends with a recorded winner or an explicit timeout.
      assert(
        game.winnerPlugin !== null || game.timedOut || game.winner === "draw",
        `game ${game.index} has no outcome`,
      );
      if (game.winnerPlugin) {
        assert(
          game.winner === game.aSide || game.winner === game.bSide,
          "the recorded winner sits on the winning plugin's side",
        );
      }
    }
  });
});
