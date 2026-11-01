/**
 * Run phases: initiation, approach/encounter/movement progression and end
 * (rules 6.1–6.9). Functions here navigate phases and dispatch the run-scoped
 * triggers (rez-load, Mayfly); subroutine effects are resolved in `settle.ts`.
 *
 * This module must not import `effects.ts`: `effects.ts` resolves card effects
 * that themselves start/end runs, so it imports this module — keeping the
 * dependency one-way (`effects.ts → runs.ts`) is what keeps that cycle cut.
 */

import { cardDef, isIce } from "../cards/catalogue.ts";
import { behaviors, triggersOf } from "../cards/effects.ts";
import {
  addHostedCredits,
  expireIcebreakerPumps,
  serverById,
  spendCredits,
  toDiscard,
} from "./state.ts";
import type { CardInstance, GameState, PromptOption, ServerId } from "../types.ts";

export function iceAt(state: GameState, server: ServerId): CardInstance[] {
  return serverById(state, server).ice;
}

/**
 * Rez cost of a card (rule 1.16.8): the printed cost listed on the card.
 * Ice pay this printed rez cost when rezzed (rule 3.4.3) — the one-credit-per-
 * existing-ice number is the INSTALL cost (rule 1.16.6b/8.5.11a), which is
 * charged by `installCorpCard`, not here. While a run is in progress, an ice's
 * rez cost is increased by `run.rezCostIncrease` (Tread Lightly).
 *
 * This is the single source of truth for what rezzing charges; the corp rez
 * window (settle.ts `corpRezOptions`) displays the same value.
 */
export function rezCostFor(state: GameState, card: CardInstance): number {
  const def = cardDef(card.cardId);
  let cost = def.cost ?? 0;
  if (isIce(def) && state.run?.rezCostIncrease) cost += state.run.rezCostIncrease;
  return cost;
}

/**
 * "When you rez this asset, load N credits onto it" (e.g. Nico Campaign,
 * Regolith Mining License). Lives next to `rezCard`, its only caller, so the
 * rez choke point and its trigger can never drift apart.
 */
export function fireRez(state: GameState, card: CardInstance): void {
  const b = behaviors.get(card.cardId);
  if (!b) return;
  for (const t of b.triggers ?? []) {
    if (t.kind === "on-rez-load-credits") addHostedCredits(state, card, t.amount ?? 0);
  }
}

/**
 * Rez a card, paying its cost. `free` bypasses payment (Send a Message).
 */
export function rezCard(
  state: GameState,
  card: CardInstance,
  free = false,
): boolean {
  if (card.rezzed) return true;
  if (!free) {
    const cost = rezCostFor(state, card);
    if (cost > state.corp.credits) return false;
    spendCredits(state, "corp", cost);
  }
  card.rezzed = true;
  state.log.push({ type: "rez", cardId: card.id });
  // "When you rez this asset, load N credits onto it" (e.g. Nico Campaign,
  // Regolith Mining License). Every rez path — the corp.rez action, the
  // approach rez window, and free rezzes (Send a Message) — funnels through
  // this choke point, so the trigger fires exactly once per actual rez.
  fireRez(state, card);
  return true;
}

/** Initiate a run; sets up the run state and the initiation phase. */
export function initiateRun(state: GameState, server: ServerId, source?: string): void {
  const fund = state.runner.pendingRunFund;
  state.runner.pendingRunFund = 0;
  state.run = {
    server,
    position: null,
    phase: "initiation",
    broken: [],
    resolved: [],
    successful: false,
    unsuccessful: false,
    source,
    fundCredits: fund > 0 ? fund : undefined,
  };
  state.breach = null;
  state.log.push({ type: "run-start", server, source });
}

/** Complete the initiation phase (rule 6.9.1): set the Runner's initial position. */
export function completeInitiation(state: GameState): void {
  const run = state.run!;
  const ice = iceAt(state, run.server);
  if (ice.length > 0) {
    run.position = ice.length - 1; // outermost ice
    run.currentIceId = ice[run.position]!.id;
    run.phase = "approach-ice";
    state.log.push({ type: "approach-ice", cardId: run.currentIceId });
    return;
  }
  run.position = null;
  run.currentIceId = undefined;
  run.phase = "movement";
}

/** Start the encounter with the ice in the current position. */
export function beginEncounter(state: GameState): void {
  const run = state.run!;
  const ice = iceAt(state, run.server);
  const current = run.position !== null ? ice[run.position] : undefined;
  if (!current) {
    run.phase = "movement";
    return;
  }
  run.currentIceId = current.id;
  run.phase = "encounter-ice";
  run.broken = [];
  run.resolved = [];
  run.encounterStarted = true;
  // Safety: each encounter starts with no leftover pumps, making "no boost
  // outside an encounter" (rule 3.9.5b) local to the encounter. All pumps in
  // the card pool are encounter-duration; a "for the remainder of this run"
  // pump (rule 3.9.5c) would need to be exempted here.
  expireIcebreakerPumps(state);
  state.log.push({ type: "encounter-ice", cardId: current.id });
}

/**
 * The shared body of passing the ice at the Runner's current position and
 * moving inward (rule 6.9.4a/d): log the pass, decrement the position, and log
 * the approach of the next ice. When the innermost piece was passed (or the
 * Runner is already at the server), the run parks in the movement phase at the
 * server and the CALLER owns what happens next — `passIce` leaves success to
 * the movement phase (toll, then `declareSuccess`, rule 6.7.2), while
 * `continueMovement` pays the approach toll and declares success itself.
 */
function passCurrentIce(state: GameState): void {
  const run = state.run!;
  const ice = iceAt(state, run.server);
  const current = run.position !== null ? ice[run.position] : null;
  if (current) state.log.push({ type: "pass-ice", cardId: current.id });
  run.currentIceId = undefined;
  if (run.position === null || run.position === 0) {
    run.position = null;
    run.phase = "movement";
    return;
  }
  run.position -= 1;
  run.phase = "approach-ice";
  run.currentIceId = ice[run.position]!.id;
  run.encounterStarted = false;
  state.log.push({ type: "approach-ice", cardId: run.currentIceId });
}

/** Runner passes the current ice and moves inward, or approaches the server. */
export function passIce(state: GameState): void {
  const run = state.run!;
  // A passed piece of ice gives a fresh jack-out chance in the next movement
  // phase (rule 6.1.5a). `continueMovement` deliberately does NOT reset this:
  // there the Runner has already declined the chance for this movement.
  run.jackOutOffered = false;
  passCurrentIce(state);
}

/**
 * The Runner declines to jack out and continues the movement phase
 * (rule 6.9.4d-g): pass the ice at the current position and move inward, or
 * approach the server — opening the Corp's (R) rez window (6.9.4e), paying
 * the Manegarm toll first if one is rezzed (rule 6.9.4g) — and declare the
 * run successful.
 *
 * `rezOptions` carries the Corp's rez options for the server approach,
 * computed by the caller from settle.ts `corpRezOptions`. They travel in as a
 * parameter because this module must stay a leaf (settle.ts imports it), and
 * because it scopes the window to the one decision that may open it: the
 * Runner's decline-to-jack-out (`runner.continueRun`), which happens exactly
 * once per movement step. The re-drives that follow a window or toll answer
 * (settle.ts, and apply.ts `finishCurrentApproach`) call this WITHOUT
 * options, so the window can never re-open once it has closed.
 *
 * This is the body of the old auto-resolving `movementStep`; it now runs from
 * the `runner.continueRun` move handler (apply.ts) and from settle when the
 * jack-out chance for this movement was already given.
 */
export function continueMovement(
  state: GameState,
  rezOptions?: PromptOption[],
): boolean {
  const run = state.run!;
  if (run.position !== null) {
    // Passing the ice at the current position and moving inward (rule
    // 6.9.4a/d). No jack-out reset here: the Runner just declined it (see
    // `passIce`).
    passCurrentIce(state);
    if (run.position !== null) return false; // approaching the next ice (6.9.4f)
  }
  // The Runner is at the attacked server — either straight from the movement
  // park (an ice-less server) or after passing the innermost ice (6.9.4d→g).
  return approachServerStep(state, rezOptions);
}

/**
 * The movement step has arrived at the attacked server (rule 6.9.4g): the
 * Corp's (R) rez window opens first (6.9.4e — the only in-run moment a
 * facedown root card, e.g. Manegarm Skunkworks, can be rezzed on an ice-less
 * server), then the approach toll, then the run is declared successful.
 */
function approachServerStep(state: GameState, rezOptions?: PromptOption[]): boolean {
  if (rezOptions && rezOptions.length > 0) {
    state.prompts.push({
      kind: "rez-window",
      id: state.nextPromptId++,
      player: "corp",
      options: rezOptions,
    });
    return true; // park: the Corp answers the window (or passes it)
  }
  if (approachToll(state)) return true;
  declareSuccess(state);
  return false;
}

/** Approach toll on the attacked server's root (Manegarm, rule 6.9.4g). */
function approachToll(state: GameState): boolean {
  const run = state.run!;
  if (run.tollPaid) return false;
  for (const card of serverById(state, run.server).root) {
    if (card.rezzed !== true) continue;
    const toll = triggersOf(card.cardId).find((t) => t.kind === "approach-toll");
    if (!toll) continue;
    const creditCost = toll.creditCost ?? 5;
    const clickCost = toll.clickCost ?? 2;
    state.prompts.push({
      kind: "choose-one",
      id: state.nextPromptId++,
      player: "runner",
      title: `${cardDef(card.cardId).title}: end the run unless you spend ${
        "[click]".repeat(clickCost)
      } or pay ${creditCost}[credit]`,
      options: [
        {
          id: "toll-credits",
          label: `Pay ${creditCost} credits`,
          creditCost,
          effect: { kind: "pay-toll-credits" },
        },
        {
          id: "toll-clicks",
          label: `Spend ${"[click]".repeat(clickCost)}`,
          clickCost,
          effect: { kind: "pay-toll-clicks" },
        },
        { id: "toll-end", label: "End the run", effect: { kind: "end-run" } },
      ],
    });
    return true;
  }
  return false;
}

/** The Runner reaches the server: declare the run successful. */
export function declareSuccess(state: GameState): void {
  const run = state.run!;
  run.successful = true;
  run.phase = "success";
  state.log.push({ type: "run-successful", server: run.server });
  state.runner.successfulRunThisTurn = true;
}

/** End the run for any reason (rule 6.8). Subroutine resolution aborts. */
export function endRun(state: GameState): void {
  const run = state.run;
  if (!run) return;
  run.phase = "run-ends";
}

/**
 * "When this run ends, trash this program" (Mayfly) — dispatched from the
 * card's `run-trash-program` trigger. Lives next to `finishRun`, its only
 * caller. Every run end funnels through `finishRun`, which calls this.
 */
export function trashMayfly(state: GameState): void {
  for (const card of [...state.runner.installed]) {
    if (triggersOf(card.cardId).some((t) => t.kind === "run-trash-program")) {
      toDiscard(state, card, "run ends"); // logs the trash event
    }
  }
}

/** Finish the run entirely and clear run state (rule 6.8/6.9.6). */
export function finishRun(state: GameState): void {
  const run = state.run!;
  const successful = run.successful;
  state.log.push({ type: "run-end", server: run.server, successful });
  // The run is over (jack-out, subroutine, breach complete): any icebreaker
  // pump still pending expires with it (rules 3.9.5b/3.9.5d).
  expireIcebreakerPumps(state);
  // Mayfly: "When this run ends, trash this program." Every run end funnels
  // through here — jack out, subroutine ETR, breach complete, server pruned
  // mid-run — so the delayed ability fires on any run end. The one exception
  // is settle()'s win-mid-run path, which nulls `state.run` without calling
  // finishRun: the game is over, so the delayed ability never resolves.
  trashMayfly(state);
  state.run = null;
}
