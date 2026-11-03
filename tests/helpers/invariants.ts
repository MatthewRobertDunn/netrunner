/**
 * Whole-game invariant checkers: the checks the behavioral review ran as
 * scratch drivers, committed as reusable code.
 *
 * Three families, in increasing cost:
 *
 * 1. `checkStructural` — per state: card instances exist in exactly one place
 *    with a matching zone, resources never go negative, the run/breach/position
 *    triple is mutually consistent, and a won game is fully cleaned up (no live
 *    run/breach/prompts — the game-over shape that used to leak, rule 10.4).
 * 2. `checkViewLeaks` — per state, both viewers: no hidden card id (opponent
 *    hand/deck) appears anywhere in the player view's serialized form. The
 *    sanctioned `hidden` placeholder keeps facedown installs unnameable while
 *    their instance ids stay available for highlight tracking.
 * 3. `checkMoveCost` — per applied move, for the kinds whose cost is a fixed
 *    constant (basic actions, advance, bioroid break): the exact clicks/credits
 *    were charged. Formula-priced kinds (installs' per-ice surcharge, rez
 *    discounts, event fund effects, prompt option costs) are pinned by the
 *    unit suite instead — this sweep is for drift, not for pricing.
 *
 * `walkInvariantGames` drives full RandomAI-vs-RandomAI games (through the
 * sanctioned AI-boundary helpers: view → decision context → chooseMove)
 * applying all three families after every move. Deterministic: fixed seeds,
 * `decisionSeedFor` per decision, no wall clock.
 */

import { decisionSeedFor, engine, makeAIDecisionContext, RandomAI } from "../../src/mod.ts";
import { starterDeckConfigs } from "../../src/decks/starter-decks-cyberclick-v1.ts";
import type { GameState, Move, PlayerSide } from "../../src/types.ts";

/** One invariant failure. */
export interface InvariantFailure {
  readonly tag: string;
  readonly message: string;
}

function fail(tag: string, message: string): InvariantFailure {
  return { tag, message };
}

/** The acting player, mirroring the engine's actor rule (prompts own turns). */
export function actorOf(state: GameState): PlayerSide {
  return state.prompts[0]?.player ?? state.turn.player;
}

/**
 * Structural invariants (family 1). Returns a failure description instead of
 * throwing, so a walk can report a precise finding.
 */
export function checkStructural(state: GameState, tag: string): InvariantFailure | null {
  // Instances exist in exactly one place, and the zone field agrees with the
  // container the card was found in.
  const seen = new Map<string, string>();
  const put = (c: { id: string }, where: string): InvariantFailure | null => {
    const prev = seen.get(c.id);
    if (prev) return fail(tag, `instance ${c.id} in two places: ${prev} and ${where}`);
    seen.set(c.id, where);
    return null;
  };
  for (const side of ["corp", "runner"] as PlayerSide[]) {
    const p = state[side];
    for (
      const [zone, list] of [
        ["hand", p.hand],
        ["deck", p.deck],
        ["discard", p.discard],
        ["score", p.score],
      ] as const
    ) {
      for (const c of list) {
        if (c.zone !== zone) {
          return fail(tag, `${c.id} is in ${side}.${zone} but its zone field says ${c.zone}`);
        }
        const dup = put(c, `${side}.${zone}`);
        if (dup) return dup;
      }
    }
    if (p.identity.zone !== "identity") {
      return fail(tag, `${side} identity zone is ${p.identity.zone}, not "identity"`);
    }
    for (const c of p.installed) {
      if (c.zone !== "play-area") {
        return fail(tag, `${side} installed card ${c.id} has zone ${c.zone}, not "play-area"`);
      }
      const dup = put(c, `${side}.installed`);
      if (dup) return dup;
    }
    if (p.credits < 0) return fail(tag, `${side} credits went negative (${p.credits})`);
    if (p.clicks < 0) return fail(tag, `${side} clicks went negative (${p.clicks})`);
  }
  for (const server of state.servers) {
    for (const c of [...server.root, ...server.ice]) {
      if (c.zone !== "play-area" || c.server !== server.id) {
        return fail(
          tag,
          `corp card ${c.id} in ${server.id} has zone=${c.zone}, server=${c.server ?? "none"}`,
        );
      }
      const dup = put(c, `server.${server.id}`);
      if (dup) return dup;
    }
  }

  // Run/breach/position consistency.
  if (state.run) {
    const run = state.run;
    const server = state.servers.find((s) => s.id === run.server);
    if (!server) return fail(tag, `run targets nonexistent server ${run.server}`);
    if (run.position !== null) {
      const ice = server.ice[run.position];
      if (run.phase === "approach-ice" || run.phase === "encounter-ice") {
        // In an approach/encounter the position must name a real ice.
        if (!ice) {
          return fail(tag, `run.position ${run.position} is out of range on ${run.server}`);
        }
        if (run.currentIceId !== ice.id) {
          return fail(
            tag,
            `currentIceId ${run.currentIceId} does not name the ice at position ${run.position}`,
          );
        }
      } else {
        // In other phases the position may persist while currentIceId is
        // already cleared (e.g. the movement phase after an encounter where
        // every subroutine was broken).
        if (run.currentIceId !== undefined && ice && run.currentIceId !== ice.id) {
          return fail(
            tag,
            `currentIceId ${run.currentIceId} does not name the ice at position ${run.position}`,
          );
        }
      }
    } else if (run.currentIceId !== undefined) {
      return fail(tag, "run.position is null but currentIceId is set");
    }
    if (state.breach && state.breach.server !== run.server) {
      return fail(
        tag,
        `breach server ${state.breach.server} differs from run server ${run.server}`,
      );
    }
  } else if (state.breach) {
    return fail(tag, "a breach is open without a run");
  }

  // Game-over shape (the 10.4 cleanup that used to leak a live run/breach).
  if (state.winner) {
    if (state.run) return fail(tag, "winner set but the run is still active");
    if (state.breach) return fail(tag, "winner set but the breach is still active");
    if (state.prompts.length > 0) {
      return fail(tag, `winner set but ${state.prompts.length} prompt(s) pending`);
    }
    if (!state.winReason) return fail(tag, "winner set without a reason");
    if (state.turn.phase !== "game-over") {
      return fail(tag, `winner set but turn.phase is ${state.turn.phase}`);
    }
  } else if (state.winReason) {
    return fail(tag, `winReason "${state.winReason}" set without a winner`);
  }

  // An agenda target reached must end the game (rule 1.7.1).
  if (
    !state.winner &&
    (state.corp.agendaPoints >= state.agendaPointTarget ||
      state.runner.agendaPoints >= state.agendaPointTarget)
  ) {
    return fail(
      tag,
      `agenda target reached (corp ${state.corp.agendaPoints}, runner ${state.runner.agendaPoints}) but the game continues`,
    );
  }
  return null;
}

/**
 * Redaction sweep (family 2): for both viewers, no hidden card id may appear
 * anywhere in the player view's serialized form. A hidden id is one in the
 * opponent's hand or deck that the viewer cannot also see in one of their own
 * open zones (the same printing can sit in both players' decks).
 */
export function checkViewLeaks(state: GameState, tag: string): InvariantFailure | null {
  for (const viewer of ["corp", "runner"] as PlayerSide[]) {
    const other: PlayerSide = viewer === "corp" ? "runner" : "corp";
    const open = new Set<string>();
    for (
      const list of [
        state[viewer].hand,
        state[viewer].deck,
        state[viewer].discard,
        state[viewer].score,
        state[viewer].installed,
      ]
    ) {
      for (const c of list) open.add(c.cardId);
    }
    // Ids that are open information to the viewer: their own zones, plus the
    // opponent's open zones — the Runner's heap and installed cards (4.4.7b,
    // 4.6.2), scored agendas and rezzed Corp cards (10.2.3, 1.21). The Corp's
    // discard pile (Archives) stays hidden from the Runner: the documented
    // no-faceup/facedown-split simplification.
    for (const c of state[other].score) open.add(c.cardId);
    if (other === "runner") {
      for (const c of [...state[other].discard, ...state[other].installed]) open.add(c.cardId);
    } else {
      for (
        const c of [
          ...state[other].installed,
          ...state.servers.flatMap((s) => [...s.root, ...s.ice]),
        ]
      ) {
        if (c.rezzed === true) open.add(c.cardId);
      }
    }
    // Secret ids: the opponent's hand and deck, plus (from the Corp side)
    // facedown installs — provided the same printing is not open somewhere
    // (two copies of a card: one in the Runner's heap names the id openly).
    // Also open: ids the runner has already accessed this breach (7.3.1a).
    const secretCards = [
      ...state[other].hand,
      ...state[other].deck,
      ...(other === "corp"
        ? [...state[other].installed, ...state.servers.flatMap((s) => [...s.root, ...s.ice])]
          .filter((c) => c.rezzed !== true)
        : []),
    ];
    // Ids the runner has already accessed stay named for the breach (7.3.1a),
    // and the card being accessed is open while accessed (7.2.1) — the engine
    // keeps the instance in its zone (e.g. the Corp's hand) during the access,
    // so scan every Corp zone for the accessed instance's cardId.
    for (
      const id of [
        ...state.breach?.chosen ?? [],
        ...(state.breach?.accessing ? [state.breach.accessing] : []),
      ]
    ) {
      for (
        const list of [
          state.corp.hand,
          state.corp.deck,
          state.corp.discard,
          state.corp.score,
          state.corp.installed,
          ...state.servers.map((s) => [...s.root, ...s.ice]),
        ]
      ) {
        const hit = list.find((c) => c.id === id);
        if (hit) {
          open.add(hit.cardId);
          break;
        }
      }
    }
    const hidden = new Set(
      secretCards.map((c) => c.cardId).filter((id) => !open.has(id)),
    );
    const view = engine.getPlayerView(state, viewer);
    const serialized = JSON.stringify(view);
    for (const id of hidden) {
      if (serialized.includes(`"${id}"`)) {
        return fail(tag, `the ${viewer} view leaks hidden card id "${id}"`);
      }
    }
  }
  return null;
}

/**
 * Move-cost sweep (family 3) for the kinds whose cost is a fixed constant.
 * Formula-priced kinds (installs' per-ice surcharge, rez discounts, event fund
 * effects, prompt option costs) are pinned by the unit suite instead.
 */
/**
 * Move-cost sweep (family 3) for the kinds whose cost is a fixed constant.
 * Only action kinds with no trigger side effects qualify: transition moves
 * (`continueRun`, `resolveSubroutines`, `finishAccess`) can complete a run or
 * resolve a subroutine, firing success triggers (Red Team's take-3, Pennyshaver
 * placements) whose credit effects depend on the board — they are covered by
 * the unit suite's exact-charge pins instead. Formula-priced kinds (installs'
 * per-ice surcharge, rez discounts, event fund effects, prompt option costs)
 * likewise live in the unit suite.
 */
export function checkMoveCost(
  before: GameState,
  after: GameState,
  side: PlayerSide,
  move: Move,
  tag: string,
): InvariantFailure | null {
  const dc = after[side].credits - before[side].credits;
  const dcl = after[side].clicks - before[side].clicks;
  const bad = (want: string): InvariantFailure =>
    fail(tag, `${move.kind} charged credits ${dc}, clicks ${dcl}; expected ${want}`);
  switch (move.kind) {
    case "gainCredits":
      if (dc !== 1 || dcl !== -1) return bad("credits +1, clicks -1");
      break;
    case "draw":
      if (dcl !== -1) return bad("clicks -1");
      break;
    case "advance":
      // Rule 5.2.6f: "[click], 1[credit]: Advance 1 installed card."
      if (dc !== -1 || dcl !== -1) return bad("credits -1, clicks -1");
      break;
    case "bioroidBreak":
      // Brân's bioroid break: exactly one click (rules-questions.md §7).
      if (dcl !== -1) return bad("clicks -1");
      break;
    case "jackOut":
      if (dc !== 0 || dcl !== 0) return bad("no cost");
      break;
    default:
      break;
  }
  return null;
}

export interface WalkOptions {
  /** Seeds to walk (each played once per seat assignment). */
  readonly seeds: readonly number[];
  /** Move cap per game (random games can drift long). */
  readonly stepCap?: number;
  /** Tag prefix for failure messages. */
  readonly tag?: string;
}

/**
 * Drive full RandomAI-vs-RandomAI games, applying all three checker families
 * after every move. Deterministic. Throws on the first invariant failure with
 * a reproducible description (seed, seat, step, move).
 */
export function walkInvariantGames(options: WalkOptions): void {
  const { seeds, stepCap = 400, tag = "invariants" } = options;
  for (const seed of seeds) {
    for (const evalSide of ["corp", "runner"] as PlayerSide[]) {
      const decks = starterDeckConfigs();
      let state: GameState = engine.startGame({
        corp: decks.corp,
        runner: decks.runner,
        mode: "starter-decks",
        seed,
      });
      const ais: Record<PlayerSide, RandomAI> = { corp: new RandomAI(), runner: new RandomAI() };
      for (let step = 0; step < stepCap && !state.winner; step++) {
        const where = `${tag} seed ${seed} (${evalSide} seat) step ${step}`;
        const structural = checkStructural(state, where);
        if (structural) throw new Error(structural.message);
        const leaks = checkViewLeaks(state, where);
        if (leaks) throw new Error(leaks.message);

        const side = actorOf(state);
        const legal = engine.getLegalMoves(state, side);
        if (legal.length === 0) {
          throw new Error(`${where}: dead end — ${side} must act but has no legal moves`);
        }
        const view = engine.getPlayerView(state, side);
        const move = ais[side].chooseMove(
          view,
          legal,
          makeAIDecisionContext(state, side, decisionSeedFor(view)),
        );
        if (!legal.some((m) => JSON.stringify(m) === JSON.stringify(move))) {
          throw new Error(`${where}: the AI returned a move that is not legal`);
        }
        const result = engine.applyMove(state, side, move);
        if (result.kind === "illegal-move") {
          throw new Error(
            `${where}: offered move ${JSON.stringify(move)} was rejected: ${result.reason}`,
          );
        }
        const cost = checkMoveCost(state, result.state, side, move, where);
        if (cost) {
          console.log(
            `  context: run=${JSON.stringify(state.run)} runnerCredits=${state.runner.credits}` +
              ` corpCredits=${state.corp.credits} log-tail=${JSON.stringify(state.log.slice(-3))}`,
          );
          throw new Error(cost.message);
        }
        state = result.state;
      }
    }
  }
}
