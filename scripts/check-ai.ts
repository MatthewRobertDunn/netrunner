/**
 * Headless AI check: plays a batch of full games of EvalAI vs RandomAI through
 * the information boundary and prints a summary — per-side win rates, average
 * game length, and how "varied" EvalAI's choices are across the games.
 *
 * Each seed produces two games with the sides swapped (EvalAI as corp, then
 * EvalAI as runner) so neither matchup inherits the other's seed luck.
 *
 *   deno run --allow-read scripts/check-ai.ts
 */

import {
  decisionSeedFor,
  engine,
  EvalAI,
  makeAIDecisionContext,
  RandomAI,
  starterDeckConfigs,
} from "../src/mod.ts";
import type { GameAI, Move, PlayerSide } from "../src/types.ts";

interface MatchupResult {
  /** EvalAI's side in this game. */
  evalSide: PlayerSide;
  seed: number;
  winner: PlayerSide | "draw" | null;
  moves: number;
  /** Move kinds EvalAI picked, in order. */
  picks: Move["kind"][];
  /** How often EvalAI's pick was forced (exactly one legal move). */
  forced: number;
  /** The first few non-forced EvalAI decisions, across games: does a repeated
   *  early-game situation produce a single deterministic move or a spread? */
  firstDecisions: { ordinal: number; turn: number; label: string }[];
}

function playOne(seed: number, evalSide: PlayerSide): MatchupResult {
  const random = new RandomAI();
  const evalAI = new EvalAI();
  const decks = starterDeckConfigs();
  let state = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
  let moves = 0;
  let forced = 0;
  let evalDecisions = 0;
  const picks: Move["kind"][] = [];
  const firstDecisions: { ordinal: number; turn: number; label: string }[] = [];

  while (!state.winner && moves < 2000) {
    const side: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
    const ai: GameAI = side === evalSide ? evalAI : random;
    const legal = engine.getLegalMoves(state, side);
    if (legal.length === 0) throw new Error(`no legal moves for ${side} on move ${moves}`);
    const isEval = side === evalSide;
    let move: Move;
    if (legal.length === 1) {
      move = legal[0]!;
      if (isEval) forced++;
    } else {
      const view = engine.getPlayerView(state, side);
      const ctx = makeAIDecisionContext(state, side, decisionSeedFor(view));
      move = ai.chooseMove(view, legal, ctx);
      if (isEval) {
        picks.push(move.kind);
        evalDecisions++;
        if (evalDecisions <= 3) {
          firstDecisions.push({
            ordinal: evalDecisions,
            turn: state.turn.number,
            label: describeMove(move),
          });
        }
      }
    }
    const result = engine.applyMove(state, side, move);
    if (result.kind === "illegal-move") {
      throw new Error(
        `${ai.name} (${side}) played illegal ${JSON.stringify(move)}: ${result.reason}`,
      );
    }
    state = result.state;
    moves++;
  }

  return { evalSide, seed, winner: state.winner, moves, picks, forced, firstDecisions };
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${(100 * n / d).toFixed(0)}%`;
}

/** Compact pick label for the variety report. */
function describeMove(move: Move): string {
  const m = move as {
    cardId?: string;
    server?: string;
    targetId?: string;
    programId?: string;
    optionId?: string;
    cardInstanceIds?: string[];
  };
  switch (move.kind) {
    case "discard":
      return `discard (${m.cardInstanceIds?.length ?? "?"} card${
        m.cardInstanceIds?.length === 1 ? "" : "s"
      })`;
    case "prompt.answer":
      return `prompt:${m.optionId ?? "?"}`;
    case "corp.install":
    case "runner.install":
      return `${move.kind} ${m.cardId}→${m.server ?? "rig"}`;
    case "corp.advance":
      return `advance ${m.targetId}`;
    case "runner.pumpIcebreaker":
      return `pump ${m.programId}`;
    case "runner.run":
      return `run ${m.server}`;
    default:
      return move.kind;
  }
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const results: MatchupResult[] = [];
for (const seed of SEEDS) {
  for (const evalSide of ["corp", "runner"] as const) {
    results.push(playOne(seed, evalSide));
  }
}

// Per-side win rates (from EvalAI's point of view and overall).
for (const side of ["corp", "runner"] as const) {
  const games = results.filter((r) => r.evalSide === side);
  const evalWins = games.filter((r) => r.winner === side).length;
  const oppWins = games.filter((r) => r.winner === (side === "corp" ? "runner" : "corp")).length;
  const draws = games.filter((r) => r.winner === "draw" || r.winner === null).length;
  const avgMoves = games.reduce((s, r) => s + r.moves, 0) / games.length;
  console.log(`\n== EvalAI as ${side} (vs RandomAI, ${games.length} games) ==`);
  console.log(
    `evalWins ${evalWins} (${pct(evalWins, games.length)}) · RandomAI wins ${oppWins} (${
      pct(oppWins, games.length)
    }) · draws ${draws} · avg game length ${avgMoves.toFixed(1)} moves`,
  );
  // Move-kind variety: how many distinct picks and the shape of the distribution.
  const kinds = new Map<string, number>();
  for (const r of games) for (const p of r.picks) kinds.set(p, (kinds.get(p) ?? 0) + 1);
  const total = [...kinds.values()].reduce((a, b) => a + b, 0);
  const distinct = kinds.size;
  console.log(
    `EvalAI decisions: ${total} (${(games.reduce(
      (s, r) => s + r.forced,
      0,
    ))} forced) · distinct picks: ${distinct}`,
  );
  for (const [kind, n] of [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${kind.padEnd(60)} ${n} (${pct(n, total)})`);
  }
}

// ---------------------------------------------------------------------------
// Variety: do repeated early-game situations produce a single deterministic
// move, or a spread? The first three non-forced EvalAI decisions per game are
// bucketed by ordinal, so a "decision #1" that is the same kind in every game
// would mean the eval + softmax collapsed to one move — the thing we are here
// to show does NOT happen.
// ---------------------------------------------------------------------------
for (const side of ["corp", "runner"] as const) {
  const games = results.filter((r) => r.evalSide === side);
  const byOrdinal = new Map<number, Map<string, number>>();
  for (const r of games) {
    for (const d of r.firstDecisions) {
      let m = byOrdinal.get(d.ordinal);
      if (!m) {
        m = new Map<string, number>();
        byOrdinal.set(d.ordinal, m);
      }
      m.set(d.label, (m.get(d.label) ?? 0) + 1);
    }
  }
  console.log(`\n== EvalAI as ${side}: first non-forced decisions per game ==`);
  for (const [ordinal, counts] of [...byOrdinal.entries()].sort((a, b) => a[0] - b[0])) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const distinct = counts.size;
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    console.log(
      `  decision #${ordinal} (${games.length} games): ${distinct} distinct picks · top: ${
        top[0]
      } (${pct(top[1], total)})`,
    );
    for (const [label, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      console.log(`    ${label.padEnd(48)} ${n} (${pct(n, total)})`);
    }
  }
}
