/**
 * The hand-written evaluation function behind EvalAI — the decision loop that
 * consumes it lives in `./policy.ts`.
 *
 * Corp credit management is the tuning focus: a flat credit rate makes
 * spending down every turn look free, so assets end up behind ice the corp
 * cannot afford to rez and runs sail through. The eval therefore prices a
 * rez-reserve (a soft credit floor set by what the cheapest live defense
 * would cost to raise) and makes protection affordability-aware (content
 * behind ice the corp cannot afford to rez counts as unguarded — see the
 * `RESERVE` weights below).
 *
 * Eval scale (so the temperature is meaningful): one agenda point is worth
 * ~13 units and a credit 0.35, so a typical non-terminal position scores in
 * the -60..+60 range and two competing moves usually differ by 1-6 units.
 * The win bonus (10_000) dwarfs everything and is applied as a terminal
 * short-circuit.
 */

import { cardDef } from "../cards/catalogue.ts";
import { behavior, behaviors } from "../cards/effects.ts";
import { rezCostFor } from "../engine/runs.ts";
import { isIcebreaker } from "../engine/state.ts";
import type { CardInstance, CardInstanceId, GameState, PlayerSide } from "../types.ts";

/** Terminal bonus: the eval short-circuits to ±WIN when a winner exists. */
export const WIN = 10_000;

/** Terminal draw. */
const DRAW = 0;
/** Closing on the agenda-point target is worth disproportionately more: the
 * last two points in front of a win are worth a season of setup (rule 1.7.2). */
const W_TARGET_PROXIMITY = 2;

// ---------------------------------------------------------------------------
// Eval term weights — the tuning surface. Scale anchors: 1 scored agenda
// point = 13, 1 credit = 0.35 (see the file header for what that means for
// the temperature). Grouped by concern: resources, corp board, runner board,
// run pressure, pending access. Every constant below is a hand-tuned knob.
// ---------------------------------------------------------------------------

/** Agenda points already banked (rule 1.17.1): the road to the win. Scored
 * points are permanent, so they outvalue the same points sitting in a server. */
const W_AGENDA_POINT = 13;
/** Credits, including anything banked or loaded onto your own cards. */
const W_CREDIT = 0.35;
/** A click left is half a granted action still on the table (rule 5.5). */
const W_CLICK = 0.9;
/** Corp hand cards: options and fuel for econ turns. */
const W_CORP_HAND = 0.65;
/** Runner hand cards: options AND life vs net/meat damage. The life value
 * dominates: a flatline is instant loss, so cards outnumber raw options here. */
const W_RUNNER_HAND = 1.6;
/** Per missing deck card once the stack is nearly empty (decking loss). */
const W_DECK_DANGER = 3;
/** An agenda sitting in the corp's hand: potential points it can install once
 * a server is guarded (the unstated alternative to a naked remote install). */
const W_AGENDA_IN_HAND = 0.6;

// Corp credit management. A flat W_CREDIT makes spending the last credits
// look free, so assets end up behind ice the corp can never rez (runs then
// sail through). Two fixes: a rez RESERVE (a soft credit floor priced by
// what the cheapest live defense would cost to raise) and affordability-aware
// protection (content behind ice the corp cannot afford to rez counts as
// unguarded).
/** Per credit of shortfall below the rez reserve: a credit under the floor is
 * worth W_CREDIT + this, so econ/advance moves that strip the corp's last
 * defense money stop looking free. */
const W_RESERVE_SHORTFALL = 0.9;
/** Cap on the shortfall penalty: a big unrezzed ice must not warp the whole
 * eval — being one Hedge Fund away from affording it is legitimate. */
const RESERVE_SHORTFALL_CAP = 4;
/** Ceiling on the rez-reserve target itself: the pool covers the first wall
 * per content server, not an endless war chest. */
const RESERVE_TARGET_CAP = 6;

// Corp board.
/** Rezzed ice on a central server (HQ/R&D): it actually blocks runs. */
const W_ICE_REZZED_CENTRAL = 2.2;
/** Rezzed ice over a remote: usually guards one card's worth of value. */
const W_ICE_REZZED_REMOTE = 1.5;
/** Unrezzed ice: still a threat, but it commits nothing yet. */
const W_ICE_UNREZZED_CENTRAL = 1.0;
const W_ICE_UNREZZED_REMOTE = 0.6;
/** Per point of printed ice strength (capped: past 8 is fear, not value). */
const W_ICE_STRENGTH = 0.3;
const ICE_STRENGTH_CAP = 8;
/** An installed (unscored) agenda: a base plus its printed points. Kept below
 * the scored-points value (13/point) so scoring is always the right tempo move
 * once it is available — the root form must not be worth more than scoring it. */
const W_ROOT_AGENDA_BASE = 1;
const W_ROOT_AGENDA_PER_POINT = 2.5;
/** Advancement progress on an agenda (ratio 0..1 toward its requirement):
 * a forward-leaning term that pushes the corp to keep advancing toward score. */
const W_ROOT_AGENDA_PROGRESS = 5;
/** Bonus when the agenda is at its requirement: one click from points. */
const W_ROOT_AGENDA_READY = 1;
/** An installed asset (econ engine or ambush): scales with hosted credits. */
const W_ROOT_ASSET = 1.6;
const W_ROOT_PER_CREDIT = 0.3;
/** An installed upgrade: multiform utility, usually small. */
const W_ROOT_UPGRADE = 0.8;
/** Advancement counters on an installed AMBUSH asset (urtica cipher): each
 * counter means one more net damage when the runner opens that chest — real,
 * mechanical value that makes wall-rezding an actual weapon. */
const W_TRAP_PER_ADVANCE = 1.8;
/** Cap on the trap-damage counting. */
const TRAP_ADVANCE_CAP = 5;
/** Advancement counters on any OTHER non-agenda card (ice, assets, upgrades):
 * pure bluff weight — visible counters make the runner sweat, but the engine
 * has no mechanics behind them, so it prices just under the click+credit cost. */
const W_BLUFF_PER_ADVANCE = 0.3;
const BLUFF_ADVANCE_CAP = 2;
/** Facility spread: several non-empty servers dilute the runner's attention. */
const W_SERVER_SPREAD = 0.5;
/** Rezzed ice standing guard over server-root content pays extra: it is the
 * only thing actually stopping a run from cashing that content in. */
const W_ICE_GUARD_REZZED = 1.4;
/** Unrezzed ice still threatens it — roughly, once the runner prices the rez. */
const W_ICE_GUARD_UNREZZED = 0.7;
/** Max root cards one stack of ice can prettily claim to guard. */
const ICE_GUARD_ROOTS_CAP = 2;
/** A root agenda with NO rezzed ice in front of it: the very first breach
 * transfers it, so its value is discounted hard until protected. Unrezzed ice
 * gets a milder discount (the corp can still rez it when the run shows up). */
const ROOT_AGENDA_UNPROTECTED_FACTOR = 0.08;
const ROOT_AGENDA_HALED_FACTOR = 0.55;

// Runner board.
const W_PROGRAM = 2.2;
const W_ICEBREAKER = 2.6;
const W_HARDWARE = 1.4;
const W_RESOURCE = 1.0;
const W_INSTALLED_PER_CREDIT = 0.3;
/** Memory units committed past the limit: dead weight, no sharding. */
const W_MEMORY_OVERFLOW = 2;
/** Each tag: a damage magnet the corp can cash in (rule 10.5). */
const W_TAG = 2.5;

// Run pressure (runner only).
/** Just having a run in progress: the corp must make rez decisions NOW. */
const W_RUN_BASE = 2;
/** Per accessible root card in the run's target (an agenda may sit there). */
const W_RUN_PER_ROOT = 1;
const W_RUN_ROOT_CAP = 3;
/** Flat toll per piece of ice still between the runner and the server. */
const W_RUN_ICE_ENTRY = 0.55;
/** Extra bill for ice without a matching breaker installed: the runner
 * eats every subroutine (damage, corp credits, end-run) — no way to stop it
 * mid-encounter, so the entry price has to carry that weight. */
const W_RUN_UNBREAKABLE = 2.4;
/** Small toll for breakable ice (break credits, pumps). */
const W_RUN_BREAKABLE_BILL = 0.4;
/** Discount when the ice is still dormant: the corp might not rez it. */
const RUN_UNREZZED_ICE_FACTOR = 0.8;

// Pending access (rule 7.2.1 — the accessed card's identity is public): a
// 1-ply eval sees the steal/trash about to happen, so running a server that
// plausibly holds an agenda pays off. Averaged across worlds this is exactly
// the "run even though it might be a trap" psychology.
const W_ACCESS_AGENDA_PER_POINT = 0.8;
const W_ACCESS_ASSET = 0.6;
const W_ACCESS_UPGRADE = 0.3;
/** Accessing an ambush asset (urtica cipher): it hits for its printed 2 net
 * plus one per advancement counter — being on it is dangerous sitting duck. */
const W_ACCESS_AMBUSH = 3;
const W_ACCESS_AMBUSH_PER_ADVANCE = 1.2;

// ---------------------------------------------------------------------------
// The evaluation function. It runs ONLY on determinized worlds, where every
// hidden identity was already resolved — so it may read anything in `state`.
// ---------------------------------------------------------------------------

/**
 * Score `state` from `side`'s perspective, in eval units. Weighted sum of
 * legible, monotone terms (see header): more agenda points, credits, or
 * board presence never lowers a side's own term. No randomness.
 */
export function evaluate(state: GameState, side: PlayerSide): number {
  if (state.winner === side) return WIN;
  if (state.winner === "draw") return DRAW;
  if (state.winner) return -WIN;
  const opponent: PlayerSide = side === "corp" ? "runner" : "corp";
  return playerTerm(state, side) - playerTerm(state, opponent);
}

/** A per-player term; `evaluate` subtracts them into a zero-sum score. */
function playerTerm(state: GameState, side: PlayerSide): number {
  const me = side === "corp" ? state.corp : state.runner;
  let s = 0;

  // Game progress: agenda points banked — the strongest term by far.
  s += W_AGENDA_POINT * me.agendaPoints;
  // ...and the stretch run: the last points before the target are gold.
  const toGo = state.agendaPointTarget - me.agendaPoints;
  if (toGo >= 1 && toGo <= 2) s += W_TARGET_PROXIMITY * (3 - toGo);

  // Resources.
  s += W_CREDIT * me.credits;
  s += W_CLICK * me.clicks;
  s += (side === "corp" ? W_CORP_HAND : W_RUNNER_HAND) * me.hand.length;
  if (me.deck.length <= 3) s -= W_DECK_DANGER * (4 - me.deck.length);

  // Unscored agendas in hand: points the corp can still install later.
  if (side === "corp") {
    for (const card of me.hand) {
      const def = cardDef(card.cardId);
      if (def.type === "agenda") s += W_AGENDA_IN_HAND * (def.agendaPoints ?? 0);
    }
    // Rez reserve: credits below the cost of the cheapest live defense are
    // worth more than W_CREDIT each — they are the pool the corp needs when a
    // run shows up (rule 6.9.2b: the approach window is the only chance to
    // rez the approached ice).
    const reserve = rezReserve(state);
    const shortfall = Math.min(reserve - me.credits, RESERVE_SHORTFALL_CAP);
    if (shortfall > 0) s -= W_RESERVE_SHORTFALL * shortfall;
  }

  // Side-specific boards.
  s += side === "corp" ? corpBoardTerm(state) : runnerBoardTerm(state);

  return s;
}

/** Corp board: ice over servers, root cards, bluff advancement, spread. */
function corpBoardTerm(state: GameState): number {
  let s = 0;
  const accessed = accessedId(state);
  for (const server of state.servers) {
    const central = server.id === "hq" || server.id === "rd";

    // Count the accessible root cards first: ice guarding real content
    // (asset/agenda) is worth much more than ice over an empty remote.
    let rootCount = 0;
    for (const card of server.root) {
      if (card.id === accessed) continue;
      rootCount += 1;
    }

    // Ice: rezzed ice genuinely blocks runs; unrezzed ice only threatens a
    // future rez, which still shapes the runner's whole threat model. Ice
    // guarding content adds a guard bonus per protected root card, and its
    // own advancement counters read as bluff weight.
    for (const ice of server.ice) {
      const printed = Math.min(cardDef(ice.cardId).strength ?? 0, ICE_STRENGTH_CAP);
      const rezzed = ice.rezzed === true;
      s += (rezzed
        ? (central ? W_ICE_REZZED_CENTRAL : W_ICE_REZZED_REMOTE)
        : (central ? W_ICE_UNREZZED_CENTRAL : W_ICE_UNREZZED_REMOTE)) +
        W_ICE_STRENGTH * printed +
        (rootCount > 0
          ? Math.min(rootCount, ICE_GUARD_ROOTS_CAP) *
            (rezzed ? W_ICE_GUARD_REZZED : W_ICE_GUARD_UNREZZED)
          : 0) +
        respectTerm(ice, cardDef(ice.cardId));
    }

    // Root cards skip the one being accessed (it is about to move out); the
    // agenda discount follows the ice actually standing in front of this
    // server: rezzed ice = full value, unrezzed ice = half, nothing exposed.
    let hasRezzedIce = false;
    let hasAnyIce = false;
    for (const ice of server.ice) {
      hasAnyIce = true;
      if (ice.rezzed === true) hasRezzedIce = true;
    }
    const agendaGuard = hasRezzedIce
      ? 1
      : (hasAnyIce ? rootGuardFactor(state, server) : ROOT_AGENDA_UNPROTECTED_FACTOR);
    if (server.root.length > 0) {
      if (!central) s += W_SERVER_SPREAD;
      for (const card of server.root) {
        if (card.id === accessed) continue;
        s += rootValue(card, agendaGuard);
      }
    }
  }
  return s;
}

/** Runner board: programs, memory discipline, tags, run pressure, access. */
function runnerBoardTerm(state: GameState): number {
  let s = 0;
  const me = state.runner;
  const accessed = accessedId(state);

  let memory = 0;
  let consoles = 0;
  for (const card of me.installed) {
    const def = cardDef(card.cardId);
    switch (def.type) {
      case "program":
        s += def.subtypes.includes("icebreaker") ? W_ICEBREAKER : W_PROGRAM;
        break;
      case "hardware":
        s += W_HARDWARE;
        break;
      case "resource":
        s += W_RESOURCE;
        break;
      default:
        break;
    }
    s += W_INSTALLED_PER_CREDIT * (card.hostedCredits ?? 0);
    memory += def.memoryCost ?? 0;
    if (def.subtypes.includes("console")) consoles += 1;
  }
  // Memory discipline (rules 1.20, 3.9.3): installing past the limit is not
  // allowed and cheats the runner of nothing — keep a gentle pressure not to
  // jam MU.
  const over = memory - (4 + me.memoryLimitMod + consoles);
  if (over > 0) s -= W_MEMORY_OVERFLOW * over;

  s -= W_TAG * me.tags;

  // Run pressure: an active run forces the corp to price its rez options.
  const run = state.run;
  if (run) {
    let rootCards = 0;
    let iceAhead = 0;
    for (const server of state.servers) {
      if (server.id !== run.server) continue;
      for (const card of server.root) {
        if (card.id !== accessed) rootCards += 1;
      }
      if (run.position !== null) {
        for (let i = 0; i <= run.position; i++) {
          const ice = server.ice[i];
          if (!ice) continue;
          // In a determinized world the ice identity is known; whether it is
          // rezzed already only decides when the bill arrives.
          const weight = ice.rezzed === true ? 1 : RUN_UNREZZED_ICE_FACTOR;
          iceAhead += weight * iceAheadPenalty(state, ice, server);
        }
      }
    }
    s += W_RUN_BASE + W_RUN_PER_ROOT * Math.min(rootCards, W_RUN_ROOT_CAP) - iceAhead;
  }

  // Pending access: the runner is one click from stealing or trashing.
  s += pendingAccessTerm(state, accessed);

  return s;
}

/** Value of one root card to its corp owner (never negative). `agendaGuard`
 * follows the ice standing in front of the card's server (1 rezzed, half for
 * unrezzed ice, a sliver for bare servers). */
function rootValue(card: CardInstance, agendaGuard: number): number {
  const def = cardDef(card.cardId);
  switch (def.type) {
    case "agenda": {
      const points = def.agendaPoints ?? 0;
      const req = def.advancementRequirement ?? 0;
      const progress = req > 0 ? Math.min(advancementOf(card) / req, 1) : 1;
      // An exposed agenda is a pinata — the very first breach transfers it,
      // so its value follows how well the server is guarded.
      const worth = W_ROOT_AGENDA_BASE + W_ROOT_AGENDA_PER_POINT * points +
        W_ROOT_AGENDA_PROGRESS * progress +
        (advancementOf(card) >= req ? W_ROOT_AGENDA_READY : 0);
      return worth * agendaGuard;
    }
    case "asset": {
      // A plain econ asset's value follows the same guard factor as an
      // agenda — an asset the first breach trashes (hosted credits and all)
      // is worth its unguarded value only. Ambush assets are exempt: being
      // accessed is their whole point.
      const base = W_ROOT_ASSET + W_ROOT_PER_CREDIT * (card.hostedCredits ?? 0);
      const guardedBase = def.subtypes.includes("ambush") ? base : base * agendaGuard;
      return guardedBase + respectTerm(card, def);
    }
    case "upgrade":
      return W_ROOT_UPGRADE + respectTerm(card, def);
    default:
      // Operations can never be installed into a server root.
      return 0;
  }
}

/** Advancement counter value of a non-agenda card (root or ice): an ambush
 * asset's counters are real gotcha damage; everything else is bluff weight. */
function respectTerm(card: CardInstance, def: ReturnType<typeof cardDef>): number {
  const advancement = Math.max(advancementOf(card), 0);
  if (def.type === "asset" && (def.subtypes.includes("ambush"))) {
    return W_TRAP_PER_ADVANCE * Math.min(advancement, TRAP_ADVANCE_CAP);
  }
  return W_BLUFF_PER_ADVANCE * Math.min(advancement, BLUFF_ADVANCE_CAP);
}

/** Guard factor for a server whose ice is all unrezzed. The half-price
 * "threat" value only holds if the corp could actually pay the rez when a run
 * shows up (rule 6.9.2b) — ice it cannot afford is decoration, so the content
 * behind it is priced as unguarded. */
function rootGuardFactor(state: GameState, server: GameState["servers"][number]): number {
  // Outermost unrezzed ice is the first one a run meets.
  for (let i = server.ice.length - 1; i >= 0; i--) {
    const ice = server.ice[i]!;
    if (ice.rezzed !== true) {
      return state.corp.credits >= rezCostFor(state, ice)
        ? ROOT_AGENDA_HALED_FACTOR
        : ROOT_AGENDA_UNPROTECTED_FACTOR;
    }
  }
  return ROOT_AGENDA_HALED_FACTOR; // only rezzed ice: unreachable here
}

/** The credit pool the corp should keep to be able to raise its walls —
 * the sum over content-bearing servers of the first (outermost) unrezzed ice's
 * rez cost, capped: rezzing everything at once is never required, but the pool
 * must cover more than just the single cheapest wall. 0 when everything is
 * already rezzed or there is nothing to guard. */
function rezReserve(state: GameState): number {
  let need = 0;
  for (const server of state.servers) {
    if (server.root.length === 0) continue;
    for (let i = server.ice.length - 1; i >= 0; i--) {
      const ice = server.ice[i]!;
      if (ice.rezzed !== true) {
        need += rezCostFor(state, ice);
        break; // the outermost unrezzed ice is the one a run meets first
      }
    }
  }
  return Math.min(need, RESERVE_TARGET_CAP);
}

/** The card's advancement counters, 0 when absent. */
function advancementOf(card: CardInstance): number {
  return card.advancement ?? 0;
}

/** Printed-strength bonus from the ice's static modifier hook, if any.
 * Palisade's +2 while protecting a remote is a `bonus-if-remote` hook; the
 * engine (legal-moves.ts) and the eval read the same shape, so the rule lives
 * once. */
function staticBonus(ice: CardInstance, server: GameState["servers"][number]): number {
  const ss = behavior(ice.cardId)?.staticStrength;
  if (ss?.kind === "bonus-if-remote") {
    return server.id.startsWith("remote-") ? (ss.amount ?? 0) : 0;
  }
  return 0;
}

/** Entry bill for one piece of ice still ahead on a run (positive number, it
 * is subtracted from the runner-own term by the caller). Determinized worlds
 * know the ice id, so breaker matching can be priced honestly. */
function iceAheadPenalty(
  state: GameState,
  ice: CardInstance,
  server: GameState["servers"][number],
): number {
  const def = cardDef(ice.cardId);
  let penalty = W_RUN_ICE_ENTRY;
  // Corridor strength: the engine's static modifier (Palisade's +2 on
  // remotes) is read from the registry hook — never by card id.
  const strength = Math.min(
    (def.strength ?? 0) + staticBonus(ice, server),
    ICE_STRENGTH_CAP,
  );
  penalty += 0.25 * strength;
  penalty += iceCovered(state, def) ? W_RUN_BREAKABLE_BILL : W_RUN_UNBREAKABLE;
  return penalty;
}

/** Does the runner's board cover breaking this ice? Printed data only. */
function iceCovered(state: GameState, def: ReturnType<typeof cardDef>): boolean {
  const iceSubtypes = def.subtypes;
  // Bran 1.0 breaks any ice with any icebreaker (clicks, not credits): the
  // `bioroid` flag on its breakAbility hook says so — no card id here.
  const targetBran = behavior(def.id)?.breakAbility?.bioroid === true;
  for (const program of state.runner.installed) {
    const pd = cardDef(program.cardId);
    if (!isIcebreaker(program)) continue;
    if (targetBran) return true;
    const breakDef = behaviors.get(program.cardId)?.breakAbility;
    if (!breakDef) continue;
    const match = breakDef.breaks.length === 0 ||
      iceSubtypes.some((s) => breakDef.breaks.includes(s));
    if (!match) continue;
    // Pumpable breakers can pay their way up, so being a bit weaker than the
    // ice still counts as strength cover.
    const effective = pd.strength ?? 0;
    const canPump = behaviors.get(program.cardId)?.pumpAbility !== undefined;
    if (effective >= (def.strength ?? 0) || canPump) return true;
  }
  return false;
}

/** What the card currently being accessed is worth to the accessing runner. */
function pendingAccessTerm(state: GameState, id: CardInstanceId | undefined): number {
  if (!id) return 0;
  // The accessed card can sit in a server root, HQ/R&D/archives, or a deck —
  // wherever it is, its identity is public (rule 7.2.1) and the runner may
  // steal (agenda) or trash (asset/upgrade) it in the very next decisions.
  const all = [state.corp.hand, state.corp.deck, state.corp.discard];
  for (const server of state.servers) all.push(server.root, server.ice);
  for (const zone of all) {
    for (const card of zone) {
      if (card.id !== id) continue;
      const def = cardDef(card.cardId);
      if (def.type === "agenda") return W_ACCESS_AGENDA_PER_POINT * (def.agendaPoints ?? 0);
      if (def.type === "asset") {
        return W_ACCESS_ASSET - (def.subtypes.includes("ambush")
          ? W_ACCESS_AMBUSH +
            W_ACCESS_AMBUSH_PER_ADVANCE * Math.max(advancementOf(card), 0)
          : 0);
      }
      if (def.type === "upgrade") return W_ACCESS_UPGRADE;
      // Ice encountered: no pending steal value.
      return 0;
    }
  }
  return 0;
}

/** The instance id of the card currently being accessed, if any. */
function accessedId(state: GameState): CardInstanceId | undefined {
  return state.breach?.accessing;
}
