/**
 * Engine-vs-engine match harness.
 *
 * Plays N games between two `GameAI` plugins through the trusted game loop
 * (`playGame`) and reports the scores. The harness knows nothing about how an
 * AI decides — it only reads `name`/`version` for the score table, so any
 * `GameAI` (built-in or third-party) plugs in as-is:
 *
 * ```ts
 * import { runMatch } from "./src/match/harness.ts";
 * import { EvalAI } from "./src/ai/policy.ts";
 * import { RandomAI } from "./src/ai/random.ts";
 *
 * const summary = runMatch({
 *   engineA: new EvalAI(),
 *   engineB: new RandomAI(),
 *   games: 40,
 *   alternate: true,   // swap sides every game (default)
 *   seed: 1,
 * });
 * console.log(summary.table.join("\n"));
 * ```
 *
 * Import cost for a new engine: one line (the `engineA`/`engineB` value).
 *
 * Fairness: with `alternate: true` the sides swap every game in matched PAIRS
 * that share a seed, so neither side inherits the other's seed luck — the same
 * scheme `scripts/check-ai.ts` uses. Both AIs see identical decks; nothing
 * about the matchup depends on which engine is which side.
 *
 * The harness never hands a `GameState` to an AI: it delegates every decision
 * to `playGame`, the reference trusted shell, which derives sanitized views
 * and decision contexts per move.
 */

import { type GameOutcome, playGame } from "../ai/play.ts";
import { engine } from "../engine/facade.ts";
import { starterDeckConfigs } from "../decks/starter-decks-cyberclick-v1.ts";
import type { DeckConfig, GameAI, PlayerSide } from "../types.ts";

/** Re-exported so harness consumers can type game results without importing ai/play.ts. */
export type { GameOutcome };

// ---------------------------------------------------------------------------
// Plugin surface
// ---------------------------------------------------------------------------

/**
 * One entrant of a match. Usually a `GameAI` directly; wrap one in
 * `{ make: () => new EvalAI({ samples: 48 }) }` when a fresh instance per game
 * matters. Either way the harness builds (or reuses) one instance per game —
 * a stateful engine must not carry memory between games.
 */
export interface EnginePlugin {
  /** Instance(s) for the games. The harness calls this once per game. */
  make: () => GameAI;
  /** Display label; defaults to the AI's own name(+version). */
  label?: string;
}

/** Anything with `make` or a `chooseMove` is accepted as a plugin. */
export type EnginePluginLike = EnginePlugin | GameAI;

function toPlugin(like: EnginePluginLike): EnginePlugin {
  if (typeof (like as GameAI).chooseMove === "function") {
    const ai = like as GameAI;
    return { make: () => ai, label: displayName(ai) };
  }
  const plugin = like as EnginePlugin;
  return { make: plugin.make, label: plugin.label ?? displayName(plugin.make()) };
}

/** "Eval 0.4.0" when the engine exports a version, else just "Eval". */
export function displayName(ai: GameAI): string {
  return ai.version ? `${ai.name} ${ai.version}` : ai.name;
}

// ---------------------------------------------------------------------------
// Match configuration
// ---------------------------------------------------------------------------

export interface MatchConfig {
  /** Side A of the matchup for game 1 (sides alternate from there). */
  engineA: EnginePluginLike;
  engineB: EnginePluginLike;
  /** Total games to play. Rounded up to an even number with alternate on. */
  games?: number;
  /**
   * Swap sides every game (default true). With matched seed pairs each engine
   * plays equal games on each side, so side advantage cancels out of the score.
   */
  alternate?: boolean;
  /** First game seed; each subsequent PAIR of games uses seed + 1, +2, … */
  seed?: number;
  /** Abort each game after this many moves (default 2_000). */
  maxMoves?: number;
  /** Deck configuration; defaults to the CyberClick starter decks. */
  decks?: { corp: DeckConfig; runner: DeckConfig };
  /** Suppress the per-game log lines; only the summary is printed. */
  quiet?: boolean;
  /** Where output goes (defaults to console.log — injectable for tests). */
  print?: (line: string) => void;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** One finished game inside a match. */
export interface MatchGame {
  index: number;
  seed: number;
  /** Which plugin sat on which side for THIS game. */
  aSide: PlayerSide;
  bSide: PlayerSide;
  winner: PlayerSide | "draw" | null;
  winReason: string | null;
  /** Winning plugin, or null for a draw/timeout. */
  winnerPlugin: "A" | "B" | null;
  moves: number;
  timedOut: boolean;
}

export interface MatchSummary {
  config: { games: number; alternate: boolean; firstSeed: number };
  a: { label: string; wins: number; asCorp: number; asRunner: number };
  b: { label: string; wins: number; asCorp: number; asRunner: number };
  draws: number;
  games: MatchGame[];
  /** Ready-to-print score table (the same lines the harness printed). */
  table: string[];
}

// ---------------------------------------------------------------------------
// The harness
// ---------------------------------------------------------------------------

/** Run the match and print the summary. Returns the full result. */
export function runMatch(config: MatchConfig): MatchSummary {
  const print = config.print ?? ((line: string) => console.log(line));
  const alternate = config.alternate ?? true;
  const a = toPlugin(config.engineA);
  const b = toPlugin(config.engineB);

  let games = config.games ?? 2;
  if (alternate && games % 2 !== 0) games += 1; // keep the sides even

  const firstSeed = config.seed ?? 1;
  const decks = config.decks ?? starterDeckConfigs();
  const maxMoves = config.maxMoves ?? 2_000;

  const summary: MatchSummary = {
    config: { games, alternate, firstSeed },
    a: { label: a.label!, wins: 0, asCorp: 0, asRunner: 0 },
    b: { label: b.label!, wins: 0, asRunner: 0, asCorp: 0 },
    draws: 0,
    games: [],
    table: [],
  };

  for (let i = 0; i < games; i++) {
    // With alternating sides, games come in seed-shared PAIRS: (A=corp, B=runner)
    // then (A=runner, B=corp) on the SAME setup, so seed luck cancels.
    const gameSeed = firstSeed + (alternate ? Math.floor(i / 2) : i);
    const swap = alternate && i % 2 === 1;
    const aSide: PlayerSide = swap ? "runner" : "corp";
    const bSide: PlayerSide = swap ? "corp" : "runner";

    const outcome = playGame({
      corp: aSide === "corp" ? a.make() : b.make(),
      runner: aSide === "runner" ? a.make() : b.make(),
      state: engine.startGame({
        corp: decks.corp,
        runner: decks.runner,
        mode: "starter-decks",
        seed: gameSeed,
      }),
      maxMoves,
    });

    const game: MatchGame = {
      index: i + 1,
      seed: gameSeed,
      aSide,
      bSide,
      winner: outcome.winner,
      winReason: outcome.winReason,
      winnerPlugin: outcome.winner === null || outcome.winner === "draw"
        ? null
        : outcome.winner === aSide
        ? "A"
        : "B",
      moves: outcome.moves,
      timedOut: outcome.timedOut,
    };
    summary.games.push(game);

    if (game.winnerPlugin === "A") summary.a.wins++;
    else if (game.winnerPlugin === "B") summary.b.wins++;
    else summary.draws++;
    if (outcome.winner === "corp") {
      if (aSide === "corp") summary.a.asCorp++;
      else summary.b.asCorp++;
    } else if (outcome.winner === "runner") {
      if (aSide === "runner") summary.a.asRunner++;
      else summary.b.asRunner++;
    }

    if (!config.quiet) {
      const verdict = game.winnerPlugin
        ? `${game.winnerPlugin === "A" ? a.label : b.label} wins`
        : game.winner === "draw"
        ? "draw"
        : "no winner (move limit)";
      print(
        `game ${String(game.index).padStart(3)}  seed ${gameSeed}  ` +
          `A(${a.label})=${aSide}  B(${b.label})=${bSide}  →  ${verdict}  ` +
          `(${game.moves} moves)`,
      );
    }
  }

  summary.table = renderTable(summary, print);
  return summary;
}

// ---------------------------------------------------------------------------
// Summary rendering
// ---------------------------------------------------------------------------

function renderTable(summary: MatchSummary, print: (line: string) => void): string[] {
  const lines: string[] = [];
  const { a, b, draws } = summary;
  const total = a.wins + b.wins + draws;
  const pct = (n: number) => total === 0 ? "—" : `${Math.round(100 * n / total)}%`;
  const pad = Math.max(a.label.length, b.label.length, "draws".length);

  lines.push(`== Match: ${a.label} vs ${b.label} — ${total} games ==`);
  lines.push(
    `  ${a.label.padEnd(pad)} ${String(a.wins).padStart(3)} wins (${pct(a.wins)})  ` +
      `[corp ${a.asCorp} / runner ${a.asRunner}]`,
  );
  lines.push(
    `  ${b.label.padEnd(pad)} ${String(b.wins).padStart(3)} wins (${pct(b.wins)})  ` +
      `[corp ${b.asCorp} / runner ${b.asRunner}]`,
  );
  if (draws > 0) lines.push(`  ${"draws".padEnd(pad)} ${String(draws).padStart(3)}`);
  const avgMoves = total === 0 ? 0 : summary.games.reduce((s, g) => s + g.moves, 0) / total;
  lines.push(`  average game length: ${avgMoves.toFixed(1)} moves`);
  for (const line of lines) print(line);
  return lines;
}
