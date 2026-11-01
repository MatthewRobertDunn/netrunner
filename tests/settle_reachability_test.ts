/**
 * Settle-reachability invariant (AGENTS.md): "The settle loop is the only
 * phase driver; prompts are the only decision points — a legal move that
 * `settle` never waits for is unreachable."
 *
 * Two pins, walked over deterministic seeds:
 *
 * 1. No dead ends: after ANY offered move applies, the successor must still
 *    present a decision to someone — a prompt, the acting player's continued
 *    action phase, or the other player's turn — or the game ended. A settle
 *    loop that strands the state machine (auto-resolving a phase it must park
 *    on, the historical jack-out bug) produces a state nobody can act on.
 * 2. Parks are surfaced: whenever the state holds a decision point (a pending
 *    prompt, a run parked in the movement phase, an encounter, a breach
 *    awaiting the access choice), the engine must enumerate moves for the
 *    player who owns it — the park is real, not theoretical. Movement must
 *    always offer BOTH jack-out and continue (rules 6.9.4c, 6.6.3).
 *
 * The walk drives first-legal moves for depth; every OTHER offered move is
 * fork-applied once for the assertions and discarded, so the cost stays linear
 * in the states walked. Deterministic: fixed seeds, no wall clock.
 */

import { engine, RandomAI, starterDeckConfigs } from "../src/mod.ts";
import type { GameState, Move, PlayerSide } from "../src/types.ts";
import { decide } from "./helpers/boundary.ts";
import { assert } from "./helpers/assert.ts";

const SEEDS = [1, 2, 3, 7, 42];
const MAX_STEPS = 600;

function actorOf(state: GameState): PlayerSide {
  return state.prompts[0]?.player ?? state.turn.player;
}

function legalFor(state: GameState, side: PlayerSide): Move[] {
  return engine.getLegalMoves(state, side);
}

function hasMove(moves: Move[], kind: Move["kind"]): boolean {
  return moves.some((m) => m.kind === kind);
}

/**
 * Pin 1: `successor` must present a decision to someone (or the game ended).
 * Returns a failure description, or null when the invariant holds.
 */
function deadEndIn(
  successor: GameState,
  appliedKind: string,
  actor: PlayerSide,
  seed: number,
  step: number,
): string | null {
  if (successor.winner) return null;
  if (successor.prompts.length > 0) return null; // a prompt appeared for someone
  if (legalFor(successor, actor).length > 0) return null; // the actor keeps deciding
  const now = successor.turn.player;
  if (now !== actor && legalFor(successor, now).length > 0) return null; // turn handed over
  return (
    `seed ${seed} step ${step}: after ${appliedKind} by ${actor} the game waits on nobody ` +
    `(phase=${successor.turn.phase} player=${successor.turn.player} ` +
    `run=${JSON.stringify(successor.run)} breach=${JSON.stringify(successor.breach)})`
  );
}

/** Pin 2: every decision point present in the state is surfaced as moves. */
function assertParksSurfaced(state: GameState, seed: number, step: number): void {
  const label = `seed ${seed} step ${step}`;
  if (state.prompts.length > 0) {
    const owner = state.prompts[0]!.player;
    assert(
      legalFor(state, owner).length > 0,
      `${label}: a ${state.prompts[0]!.kind} prompt is pending for ${owner} but they have no moves`,
    );
  }
  // A pending prompt owns the decision and the prompt branch above already
  // asserted its owner has moves — the corp's rez windows (6.9.2b/6.9.4e)
  // and the runner's toll prompt park the run in the movement phase while
  // the runner must not act mid-prompt.
  if (state.run && state.run.phase === "movement" && state.prompts.length === 0) {
    const runnerMoves = legalFor(state, "runner");
    assert(
      hasMove(runnerMoves, "runner.continueRun") && hasMove(runnerMoves, "runner.jackOut"),
      `${label}: the run is parked in the movement phase but the runner is not offered ` +
        `both continueRun and jackOut (rules 6.9.4c, 6.6.3): ${JSON.stringify(runnerMoves)}`,
    );
  }
  if (
    state.run && state.run.phase === "encounter-ice" &&
    // A pending prompt owns the decision (e.g. Brân's on-break corp install
    // choice mid-encounter): the prompt branch above already asserted the
    // prompt owner has moves; the runner must not act mid-prompt.
    state.prompts.length === 0
  ) {
    const ice = state.run.currentIceId
      ? state.servers.find((s) => s.id === state.run!.server)?.ice.find(
        (c) => c.id === state.run!.currentIceId,
      )
      : undefined;
    if (ice && ice.rezzed === true) {
      assert(
        legalFor(state, "runner").length > 0,
        `${label}: the runner is in an encounter with rezzed ice but has no break/resolve moves`,
      );
    }
  }
  if (state.breach && !state.breach.accessing) {
    // Two or more remaining candidates must surface an access choice; a single
    // candidate is auto-selected by settle (rule 7.3.4). Mirror
    // `candidatesForBreach` exactly so the estimate cannot overcount.
    const breach = state.breach;
    const chosen = new Set(breach.chosen);
    const candidates: { id: string }[] = [];
    const server = state.servers.find((s) => s.id === breach.server);
    if (server) {
      for (const c of server.root) if (!chosen.has(c.id)) candidates.push(c);
    }
    if (breach.server === "hq" && breach.randomAccessesUsed < breach.randomAccessLimit) {
      for (const c of state.corp.hand) if (!chosen.has(c.id)) candidates.push(c);
    } else if (breach.server === "rd" && breach.randomAccessesUsed < breach.randomAccessLimit) {
      const top = state.corp.deck[0];
      if (top && !chosen.has(top.id)) candidates.push(top);
    } else if (breach.server === "archives") {
      for (const c of state.corp.discard) if (!chosen.has(c.id)) candidates.push(c);
    }
    if (candidates.length >= 2) {
      assert(
        legalFor(state, "runner").some((m) =>
          m.kind === "runner.accessCard" || m.kind === "runner.accessRandom"
        ),
        `seed ${seed} step ${step}: the breach has ${candidates.length} candidates but no ` +
          `access move is offered`,
      );
    }
  }
}

Deno.test("settle reachability: applying any offered move parks the game on a decision", () => {
  const ai = new RandomAI();
  for (const seed of SEEDS) {
    const decks = starterDeckConfigs();
    let state = engine.startGame({
      corp: decks.corp,
      runner: decks.runner,
      mode: "starter-decks",
      seed,
    });
    for (let step = 0; step < MAX_STEPS && !state.winner; step++) {
      assertParksSurfaced(state, seed, step);
      const actor = actorOf(state);
      const legal = legalFor(state, actor);
      assert(
        legal.length > 0,
        `seed ${seed} step ${step}: dead end — ${actor} must act (phase=${state.turn.phase}) ` +
          `but has no legal moves`,
      );

      // Fork-apply every offered move; keep walking on the AI's pick so the
      // walk reaches runs, encounters, rez windows and breaches.
      for (const move of legal) {
        const result = engine.applyMove(state, actor, move);
        if (result.kind === "illegal-move") {
          throw new Error(
            `seed ${seed} step ${step}: offered move ${JSON.stringify(move)} was rejected: ` +
              `${result.reason}`,
          );
        }
        const deadEnd = deadEndIn(result.state, move.kind, actor, seed, step);
        assert(deadEnd === null, deadEnd ?? "unreachable");
      }

      const picked = decide(ai, state, actor, legal, step);
      const head = engine.applyMove(state, actor, picked);
      if (head.kind === "illegal-move") {
        throw new Error(`seed ${seed} step ${step}: the walk move was rejected: ${head.reason}`);
      }
      state = head.state;
    }
  }
});
