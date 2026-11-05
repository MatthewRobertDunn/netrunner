/**
 * Headless AI match: plays a batch of full games of EvalAI (v1) vs EvalAI2 (v2)
 * through the information boundary and prints per-side win tables.
 *
 * Each seed produces two games with the sides swapped, so neither matchup
 * inherits the other's seed luck and each AI plays both seats equally.
 *
 *   deno task ai-match              # default: 30 seeds x 2 sides = 60 games
 *   deno task ai-match -- 100 64    # 100 seeds, 64 samples per decision
 *
 * The report also splits by seat, because the two AIs play different roles:
 * a corp-side improvement (credit management) shows up as v2 winning more as
 * corp, while runner-side regressions show in the runner row.
 */

import {
  decisionSeedFor,
  engine,
  EvalAI,
  EvalAI2,
  makeAIDecisionContext,
  starterDeckConfigs,
} from "../src/mod.ts";
import type { GameAI, PlayerSide } from "../src/types.ts";

interface GameResult {
  /** Which seat each AI played. */
  v1Side: PlayerSide;
  seed: number;
  winner: PlayerSide | "draw" | null;
  moves: number;
  /** v2's final credits when it was the corp (credit-management telemetry). */
  v2CorpCredits: number | null;
  /** Rezzed vs unrezzed ice count for v2's corp at game end. */
  v2CorpIceRezzed: number | null;
  v2CorpIceUnrezzed: number | null;
  /** Agenda points the runner stole off v2's corp (defense-leak telemetry). */
  v2CorpLeaked: number | null;
  /** Rez moves v2's corp made across the whole game (defense telemetry). */
  v2CorpRezMoves: number | null;
}

function playOne(seed: number, v1Side: PlayerSide, samples: number): GameResult {
  const v1 = new EvalAI({ samples });
  const v2 = new EvalAI2({ samples });
  const v2CorpSide: PlayerSide = v1Side === "corp" ? "runner" : "corp";
  const ais = new Map<PlayerSide, GameAI>([
    [v1Side, v1],
    [v1Side === "corp" ? "runner" : "corp", v2],
  ]);
  const decks = starterDeckConfigs();
  let state = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
  let moves = 0;
  let v2CorpRezMoves = 0;
  while (!state.winner && moves < 2000) {
    const side: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
    const ai = ais.get(side)!;
    const legal = engine.getLegalMoves(state, side);
    if (legal.length === 0) throw new Error(`no legal moves for ${side} on move ${moves}`);
    let move = legal[0]!;
    if (legal.length > 1) {
      const view = engine.getPlayerView(state, side);
      const ctx = makeAIDecisionContext(state, side, decisionSeedFor(view));
      move = ai.chooseMove(view, legal, ctx);
    }
    if (side === v2CorpSide && move.kind === "rez") v2CorpRezMoves++;
    const result = engine.applyMove(state, side, move);
    if (result.kind === "illegal-move") {
      throw new Error(
        `${ai.name} (${side}) played illegal ${JSON.stringify(move)}: ${result.reason}`,
      );
    }
    state = result.state;
    moves++;
  }

  const v2IsCorp = v2CorpSide === "corp";
  let rezzed = 0;
  let unrezzed = 0;
  for (const server of state.servers) {
    for (const ice of server.ice) ice.rezzed === true ? rezzed++ : unrezzed++;
  }
  return {
    v1Side,
    seed,
    winner: state.winner,
    moves,
    v2CorpCredits: v2IsCorp ? state.corp.credits : null,
    v2CorpIceRezzed: v2IsCorp ? rezzed : null,
    v2CorpIceUnrezzed: v2IsCorp ? unrezzed : null,
    v2CorpLeaked: v2IsCorp ? state.runner.agendaPoints : null,
    v2CorpRezMoves: v2IsCorp ? v2CorpRezMoves : null,
  };
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${(100 * n / d).toFixed(0)}%`;
}

// --- CLI args: [seeds] [samples] -------------------------------------------
const argSeeds = parseInt(Deno.args[0] ?? "", 10);
const argSamples = parseInt(Deno.args[1] ?? "", 10);
const SEED_COUNT = Number.isFinite(argSeeds) && argSeeds > 0 ? argSeeds : 30;
const SAMPLES = Number.isFinite(argSamples) && argSamples > 0 ? argSamples : 32;

const results: GameResult[] = [];
for (let seed = 1; seed <= SEED_COUNT; seed++) {
  for (const v1Side of ["corp", "runner"] as const) {
    results.push(playOne(seed, v1Side, SAMPLES));
  }
}

let v2Wins = 0;
let v1Wins = 0;
let draws = 0;
console.log(
  `EvalAI (v1) vs EvalAI2 (v2) — ${SEED_COUNT} seeds x 2 sides = ${results.length} games`,
);
console.log(`(samples per decision: ${SAMPLES})\n`);

for (const v2Side of ["corp", "runner"] as const) {
  const games = results.filter((r) => r.v1Side !== v2Side);
  const wins = games.filter((r) => r.winner === v2Side).length;
  const losses = games.filter(
    (r) => r.winner === (v2Side === "corp" ? "runner" : "corp"),
  ).length;
  const ds = games.filter((r) => r.winner === "draw" || r.winner === null).length;
  v2Wins += wins;
  v1Wins += losses;
  draws += ds;
  const avgMoves = games.reduce((s, r) => s + r.moves, 0) / games.length;
  const corpGames = games.filter((r) => r.v2CorpCredits !== null);
  const avgCredits = corpGames.length
    ? (corpGames.reduce((s, r) => s + (r.v2CorpCredits ?? 0), 0) / corpGames.length).toFixed(1)
    : "—";
  const avgRezzed = corpGames.length
    ? (corpGames.reduce((s, r) => s + (r.v2CorpIceRezzed ?? 0), 0) / corpGames.length).toFixed(1)
    : "—";
  const avgUnrezzed = corpGames.length
    ? (corpGames.reduce((s, r) => s + (r.v2CorpIceUnrezzed ?? 0), 0) / corpGames.length).toFixed(1)
    : "—";
  const avgLeaked = corpGames.length
    ? (corpGames.reduce((s, r) => s + (r.v2CorpLeaked ?? 0), 0) / corpGames.length).toFixed(1)
    : "—";
  const avgRezMoves = corpGames.length
    ? (corpGames.reduce((s, r) => s + (r.v2CorpRezMoves ?? 0), 0) / corpGames.length).toFixed(1)
    : "—";
  console.log(
    `== v2 as ${v2Side.padEnd(6)} (${games.length} games): wins ${wins} (${
      pct(wins, games.length)
    }) · v1 wins ${losses} · draws ${ds} · avg ${avgMoves.toFixed(1)} moves`,
  );
  console.log(
    `   v2-corp endgame: credits ${avgCredits} · ice rezzed ${avgRezzed} · unrezzed ${avgUnrezzed} · leaked ${avgLeaked} pts · rez-moves ${avgRezMoves}`,
  );
}

console.log(
  `\nTOTAL: v2 ${v2Wins} (${pct(v2Wins, results.length)}) · v1 ${v1Wins} (${
    pct(v1Wins, results.length)
  }) · draws ${draws}`,
);
