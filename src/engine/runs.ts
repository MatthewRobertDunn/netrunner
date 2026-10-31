/**
 * Run phases: initiation, approach/encounter/movement progression and end
 * (rules 6.1–6.9). Functions here only navigate phases; subroutine effects are
 * resolved in `settle.ts`.
 */

import { cardDef, isIce } from "../cards/catalogue.ts";
import { serverById, spendCredits } from "./state.ts";
import type { CardInstance, GameState, ServerId } from "../types.ts";

export function iceAt(state: GameState, server: ServerId): CardInstance[] {
  return serverById(state, server).ice;
}

/** Rez cost: printed cost; for ice, the number of ice already protecting the server. */
export function rezCostFor(state: GameState, card: CardInstance): number {
  const def = cardDef(card.cardId);
  let cost: number;
  if (isIce(def)) {
    cost = serverById(state, card.server!).ice.length;
  } else {
    cost = def.cost ?? 0;
  }
  if (isIce(def) && state.run?.rezCostIncrease) cost += state.run.rezCostIncrease;
  return cost;
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
  run.awaitingChoice = false;
  state.log.push({ type: "encounter-ice", cardId: current.id });
}

/** Runner passes the current ice and moves inward, or approaches the server. */
export function passIce(state: GameState): void {
  const run = state.run!;
  const ice = iceAt(state, run.server);
  const current = run.position !== null ? ice[run.position] : null;
  if (current) state.log.push({ type: "pass-ice", cardId: current.id });
  // A passed piece of ice gives a fresh jack-out chance in the next movement
  // phase (rule 6.1.5a).
  run.jackOutOffered = false;
  if (run.position === null || run.position === 0) {
    run.position = null;
    run.currentIceId = undefined;
    // The movement phase decides success (toll, then declareSuccess) — it must
    // not bypass declareSuccess, or "run-successful" never fires (rule 6.7.2).
    run.phase = "movement";
    return;
  }
  run.position -= 1;
  run.phase = "approach-ice";
  run.currentIceId = ice[run.position]!.id;
  run.encounterStarted = false;
  state.log.push({ type: "approach-ice", cardId: run.currentIceId });
}

/**
 * The Runner declines to jack out and continues the movement phase
 * (rule 6.9.4d-g): pass the ice at the current position and move inward, or
 * approach the server — paying the Manegarm toll first if it is rezzed
 * (rule 6.9.4g) — and declare the run successful.
 *
 * This is the body of the old auto-resolving `movementStep`; it now runs from
 * the `runner.continueRun` move handler (apply.ts) and from settle when the
 * jack-out chance for this movement was already given.
 */
export function continueMovement(state: GameState): boolean {
  const run = state.run!;
  const ice = iceAt(state, run.server);
  if (run.position === null) {
    // The Runner approaches the server (rule 6.9.4g).
    if (approachToll(state)) return true;
    declareSuccess(state);
    return false;
  }
  // Passing the ice at the current position and moving inward (rule 6.9.4a/d).
  const current = ice[run.position];
  if (current) state.log.push({ type: "pass-ice", cardId: current.id });
  run.currentIceId = undefined;
  if (run.position === 0) {
    run.position = null;
    if (approachToll(state)) return true;
    declareSuccess(state);
    return false;
  }
  run.position -= 1;
  run.currentIceId = ice[run.position]!.id;
  run.phase = "approach-ice";
  state.log.push({ type: "approach-ice", cardId: run.currentIceId });
  return false;
}

/** Manegarm Skunkworks toll when the Runner approaches the server (rule 6.9.4g). */
function approachToll(state: GameState): boolean {
  const run = state.run!;
  if (run.tollPaid) return false;
  const manegarm = serverById(state, run.server).root.find((c) =>
    c.cardId === "manegarm_skunkworks" && c.rezzed === true
  );
  if (!manegarm) return false;
  state.prompts.push({
    kind: "choose-one",
    id: state.nextPromptId++,
    player: "runner",
    title: "Manegarm Skunkworks: end the run unless you spend [click][click] or pay 5[credit]",
    options: [
      {
        id: "toll-credits",
        label: "Pay 5 credits",
        creditCost: 5,
        effect: { kind: "pay-toll-credits" },
      },
      {
        id: "toll-clicks",
        label: "Spend [click][click]",
        clickCost: 2,
        effect: { kind: "pay-toll-clicks" },
      },
      { id: "toll-end", label: "End the run", effect: { kind: "end-run" } },
    ],
  });
  return true;
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

/** Finish the run entirely and clear run state (rule 6.8/6.9.6). */
export function finishRun(state: GameState): void {
  const run = state.run!;
  const successful = run.successful;
  state.log.push({ type: "run-end", server: run.server, successful });
  state.run = null;
}
