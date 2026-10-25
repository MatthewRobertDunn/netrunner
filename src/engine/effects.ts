/**
 * Card effect execution: subroutines, triggers and paid abilities.
 *
 * Every effect is keyed by card id and implemented as typed code. English card
 * text is never parsed at runtime.
 */

import { cardDef } from "../cards/catalogue.ts";
import { behaviors } from "../cards/effects.ts";
import {
  addHostedCredits,
  dealDamage,
  drawCards,
  findCard,
  gainCredits,
  loseCredits,
  moveCardTo,
  player,
  takeCreditsFrom,
  toDiscard,
} from "./state.ts";
import { rngNext } from "./rng.ts";
import { endRun, iceAt, initiateRun, rezCard } from "./runs.ts";
import type {
  CardInstance,
  CardInstanceId,
  ChoiceEffect,
  GameState,
  Prompt,
  ServerId,
} from "../types.ts";

/** Append a prompt to the decision queue. */
function queuePrompt(state: GameState, prompt: Prompt): void {
  // Only one prompt is actionable at a time; keep the queue FIFO.
  state.prompts.push(prompt);
}

// ---------------------------------------------------------------------------
// Install / rez / access / score / steal triggers
// ---------------------------------------------------------------------------

/** "When you install this resource, load N credits onto it." */
export function fireInstall(state: GameState, card: CardInstance): void {
  const b = behaviors.get(card.cardId);
  if (!b) return;
  for (const t of b.triggers ?? []) {
    if (t.kind === "on-install-load-credits") addHostedCredits(state, card, t.amount ?? 0);
  }
}

/** "When you rez this asset, load N credits onto it." */
export function fireRez(state: GameState, card: CardInstance): void {
  const b = behaviors.get(card.cardId);
  if (!b) return;
  for (const t of b.triggers ?? []) {
    if (t.kind === "on-rez-load-credits") addHostedCredits(state, card, t.amount ?? 0);
  }
}

/** Urtica Cipher: damage while installed when accessed. */
export function fireAccessBegin(state: GameState, card: CardInstance): void {
  if (card.cardId !== "urtica_cipher") return;
  if (card.zone !== "play-area") return; // only "while it is installed"
  const amount = 2 + (card.advancement ?? 0);
  dealDamage(state, amount, "net", () => rngNext(state));
}

/** "When you score this agenda, ..." */
export function fireScore(state: GameState, card: CardInstance): void {
  const b = behaviors.get(card.cardId);
  if (!b) return;
  for (const t of b.triggers ?? []) {
    if (t.kind === "score-gain-credits") gainCredits(state, "corp", t.amount ?? 0);
    if (t.kind === "score-optional-draw") {
      queuePrompt(state, {
        kind: "choose-one",
        id: state.nextPromptId++,
        player: "corp",
        title: `${cardDef(card.cardId).title}: draw ${t.amount} cards?`,
        options: [
          {
            id: "draw",
            label: "Draw 2 cards",
            effect: { kind: "corp-draw", amount: t.amount ?? 2 },
          },
          { id: "pass", label: "Pass", effect: { kind: "no-op" } },
        ],
      });
    }
    if (t.kind === "scored-or-stolen-optional-rez-ice") queueFreeRezPrompt(state, card);
  }
}

/** "When this agenda is scored or stolen, you may rez 1 installed piece of ice." */
export function fireSteal(state: GameState, card: CardInstance): void {
  const b = behaviors.get(card.cardId);
  if (!b) return;
  for (const t of b.triggers ?? []) {
    if (t.kind === "scored-or-stolen-optional-rez-ice") queueFreeRezPrompt(state, card);
  }
}

function queueFreeRezPrompt(state: GameState, card: CardInstance): void {
  if (card.cardId !== "send_a_message") return;
  const unrezzedIce = iceAtAllServers(state).filter((c) => c.rezzed !== true);
  queuePrompt(state, {
    kind: "choose-one",
    id: state.nextPromptId++,
    player: "corp",
    title: "Send a Message: rez 1 installed piece of ice, ignoring all costs?",
    options: [
      ...unrezzedIce.map((c) => ({
        id: `rez-${c.id}`,
        label: `Rez ${cardDef(c.cardId).title} (free)`,
        targetId: c.id,
        effect: { kind: "rez-card-free", targetId: c.id } as ChoiceEffect,
      })),
      { id: "pass", label: "Pass", effect: { kind: "no-op" } as ChoiceEffect },
    ],
  });
}

function iceAtAllServers(state: GameState): CardInstance[] {
  const ids: CardInstance[] = [];
  for (const s of state.remotes) ids.push(...s.ice);
  for (const s of ["hq", "rd", "archives"] as ServerId[]) ids.push(...iceAt(state, s));
  for (const c of state.corp.installed) if (c.zone === "play-area" && c.server) ids.push(c);
  return ids;
}

/** Successful-run triggers (rule 6.7.2a). */
export function fireSuccessfulRun(state: GameState): void {
  const run = state.run;
  if (!run) return;
  const runner = state.runner;
  // Pennyshaver: "Whenever you make a successful run, place 1 credit on this hardware."
  for (const c of runner.installed) {
    if (c.cardId === "pennyshaver") addHostedCredits(state, c, 1);
  }
  // Jailbreak: "If successful, draw 1 card."
  if (run.source === "jailbreak") drawCards(state, "runner", 1);
  // Red Team ability: "If successful, take 3 credits from this resource."
  if (run.source?.startsWith("red-team:")) {
    const id = run.source.slice("red-team:".length);
    const found = runner.installed.find((c) => c.id === id);
    if (found) {
      const taken = takeCreditsFrom(state, found, 3);
      if (taken > 0) {
        runner.credits += taken;
        checkEmpty(state, found);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Subroutines
// ---------------------------------------------------------------------------

export function subroutineCount(card: CardInstance): number {
  return behaviors.get(card.cardId)?.subroutines?.length ?? 0;
}

/**
 * Resolve the subroutine at `index` on the encountered ice. Enqueues prompts
 * for runner choices (Karuna jack out) or corp choices (Bran 1.0).
 */
export function resolveSubroutine(state: GameState, ice: CardInstance, index: number): void {
  const sub = behaviors.get(ice.cardId)?.subroutines?.[index];
  if (!sub) return;
  state.run!.resolved.push(index);
  state.log.push({ type: "resolve-subroutine", cardId: ice.id, subIndex: index });
  switch (sub.kind) {
    case "net-damage":
      dealDamage(state, sub.amount ?? 1, "net", () => rngNext(state));
      break;
    case "gain-credits":
      gainCredits(state, "corp", sub.amount ?? 1);
      break;
    case "lose-credits":
      loseCredits(state, "runner", sub.amount ?? 3);
      break;
    case "end-run":
      endRun(state);
      break;
    case "net-damage-then-optional-jack-out": {
      dealDamage(state, sub.amount ?? 2, "net", () => rngNext(state));
      if (state.winner) return;
      queuePrompt(state, {
        kind: "choose-one",
        id: state.nextPromptId++,
        player: "runner",
        title: "Karuna: the Runner may jack out",
        options: [
          { id: "jack-out", label: "Jack out", effect: { kind: "end-run" } },
          { id: "pass", label: "Resolve remaining subroutines", effect: { kind: "no-op" } },
        ],
      });
      break;
    }
    case "diviner-damage": {
      const trashed = dealDamage(state, 1, "net", () => rngNext(state));
      if (state.winner) return;
      if (oddCostTrashed(state, trashed)) endRun(state);
      break;
    }
    case "lose-credits-then-conditional-end-run": {
      loseCredits(state, "runner", sub.amount ?? 3);
      if ((sub.creditsAtMost ?? 6) >= state.runner.credits) endRun(state);
      break;
    }
    case "install-ice-inward": {
      queuePrompt(state, {
        kind: "choose-one",
        id: state.nextPromptId++,
        player: "corp",
        title: `${
          cardDef(ice.cardId).title
        }: install 1 piece of ice from HQ or Archives, ignoring all costs`,
        options: [
          ...state.corp.hand.filter((c) => cardDef(c.cardId).type === "ice").map((c) => ({
            id: `install-${c.id}`,
            label: `Install ${cardDef(c.cardId).title} from HQ`,
            targetId: c.id,
            effect: { kind: "corp-install-ice-inward", iceId: ice.id } as ChoiceEffect,
          })),
          ...state.corp.discard.filter((c) => cardDef(c.cardId).type === "ice").map((c) => ({
            id: `install-${c.id}`,
            label: `Install ${cardDef(c.cardId).title} from Archives`,
            targetId: c.id,
            effect: { kind: "corp-install-ice-inward", iceId: ice.id } as ChoiceEffect,
          })),
          { id: "pass", label: "Pass", effect: { kind: "no-op" } as ChoiceEffect },
        ],
      });
      break;
    }
  }
}

/** Diviner helper: did the damage trash a card with an odd printed cost? */
function oddCostTrashed(state: GameState, trashed: CardInstanceId[]): boolean {
  for (const id of trashed) {
    const found = findCard(state, id);
    if (!found) continue;
    const cost = cardDef(found.card.cardId).cost ?? null;
    if (cost !== null && cost % 2 === 1) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Choice effects (answers to prompts)
// ---------------------------------------------------------------------------

export function applyChoice(state: GameState, effect: ChoiceEffect | undefined): void {
  if (!effect) return;
  switch (effect.kind) {
    case "no-op":
      break;
    case "end-run":
      endRun(state);
      break;
    case "pay-toll-credits":
      spendToll(state, true);
      break;
    case "pay-toll-clicks":
      spendToll(state, false);
      break;
    case "rez-card-free": {
      const found = findCard(state, effect.targetId);
      if (found) rezCard(state, found.card, true);
      break;
    }
    case "corp-draw":
      drawCards(state, "corp", effect.amount);
      break;
    case "corp-install-ice-inward": {
      installIceInward(state, effect.targetId, effect.iceId);
      break;
    }
    case "runner-take-3-red-team":
      break;
  }
}

function spendToll(state: GameState, credits: boolean): void {
  const run = state.run;
  if (!run) return;
  if (credits) {
    if (state.runner.credits < 5) return;
    state.runner.credits -= 5;
    state.log.push({ type: "lose-credits", player: "runner", amount: 5 });
  } else {
    if (state.runner.clicks < 2) return;
    state.runner.clicks -= 2;
    state.log.push({ type: "lose-clicks", player: "runner", amount: 2 });
  }
  run.tollPaid = true;
}

/** Install ice directly inward from another piece of ice, ignoring all costs. */
function installIceInward(state: GameState, targetId: string, fromIceId: string): void {
  const found = findCard(state, targetId);
  const from = findCard(state, fromIceId);
  if (!found || !from) return;
  const card = found.card;
  const server = from.card.server!;
  // Detach from wherever it is.
  const detach = (list: CardInstance[]): void => {
    const i = list.findIndex((c) => c.id === card.id);
    if (i >= 0) list.splice(i, 1);
  };
  detach(state.corp.hand);
  detach(state.corp.discard);
  detach(state.corp.deck);
  detach(state.corp.installed);
  card.zone = "play-area";
  card.server = server;
  card.advancement = 0;
  card.rezzed = false;
  const iceList = iceAt(state, server);
  const fromIndex = iceList.findIndex((c) => c.id === fromIceId);
  if (fromIndex < 0) return;
  // Install directly inward: insert at the same index, pushing `from` outward.
  iceList.splice(fromIndex, 0, card);
  state.log.push({ type: "install", cardId: card.id, player: "corp", server });
}

// ---------------------------------------------------------------------------
// Paid abilities
// ---------------------------------------------------------------------------

export interface AbilityLegality {
  ok: boolean;
  reason?: string;
  title: string;
  index: number;
}

export function abilityLegality(
  state: GameState,
  side: "corp" | "runner",
  card: CardInstance,
  abilityIndex: number,
): AbilityLegality {
  const b = behaviors.get(card.cardId);
  const ability = b?.paidAbilities?.[abilityIndex];
  if (!ability) return { ok: false, reason: "No such ability", title: "", index: abilityIndex };
  const onceKey = `${card.id}:${abilityIndex}`;
  if (ability.oncePerTurn && player(state, side).usedOncePerTurn.includes(onceKey)) {
    return { ok: false, reason: "Once per turn", title: ability.title, index: abilityIndex };
  }
  if (ability.clickCost && player(state, side).clicks < ability.clickCost) {
    return { ok: false, reason: "Not enough clicks", title: ability.title, index: abilityIndex };
  }
  if (ability.requiresHostedCredits && (card.hostedCredits ?? 0) < ability.requiresHostedCredits) {
    return { ok: false, reason: "No hosted credits", title: ability.title, index: abilityIndex };
  }
  if (ability.needsServer === "central-not-run-this-turn") {
    const available = centralServersNotRunThisTurn(state);
    if (available.length === 0) {
      return {
        ok: false,
        reason: "No central server to run",
        title: ability.title,
        index: abilityIndex,
      };
    }
  }
  return { ok: true, title: ability.title, index: abilityIndex };
}

function centralServersNotRunThisTurn(state: GameState): ServerId[] {
  const all: ServerId[] = ["hq", "rd", "archives"];
  return all.filter((s) => !state.runner.ranServersThisTurn.includes(s));
}

export function serversForAbility(
  state: GameState,
  card: CardInstance,
  abilityIndex: number,
): ServerId[] {
  const ability = behaviors.get(card.cardId)?.paidAbilities?.[abilityIndex];
  if (!ability?.needsServer) return [];
  if (ability.needsServer === "central-not-run-this-turn") {
    return centralServersNotRunThisTurn(state);
  }
  return [];
}

/** Perform a card's paid ability. Returns false when illegal. */
export function applyPaidAbility(
  state: GameState,
  side: "corp" | "runner",
  card: CardInstance,
  abilityIndex: number,
  server?: ServerId,
): boolean {
  const legality = abilityLegality(state, side, card, abilityIndex);
  if (!legality.ok) return false;
  const ability = behaviors.get(card.cardId)?.paidAbilities?.[abilityIndex]!;
  if (ability.clickCost) {
    state.log.push({ type: "spend-clicks", player: side, amount: ability.clickCost });
    player(state, side).clicks -= ability.clickCost;
  }
  if (ability.oncePerTurn) {
    player(state, side).usedOncePerTurn.push(`${card.id}:${abilityIndex}`);
  }
  const runner = state.runner;

  if (card.cardId === "smartware_distributor") {
    // click: Place 3 credits on this resource (from the bank).
    addHostedCredits(state, card, 3);
    return true;
  }
  if (card.cardId === "telework_contract") {
    // click: Take 3 credits from this resource.
    const taken = takeCreditsFrom(state, card, 3);
    runner.credits += taken;
    checkEmpty(state, card);
    return true;
  }
  if (card.cardId === "pennyshaver") {
    // click: Place 1 credit on this hardware, then take all credits from it.
    addHostedCredits(state, card, 1);
    const taken = takeCreditsFrom(state, card, 999);
    runner.credits += taken;
    return true;
  }
  if (card.cardId === "red_team" && ability.id === "run-central") {
    if (!server) return false;
    initiateRun(state, server, `red-team:${card.id}`);
    return true;
  }
  if (card.cardId === "regolith_mining_license" && ability.id === "take-3") {
    const taken = takeCreditsFrom(state, card, 3);
    state.corp.credits += taken;
    checkEmpty(state, card);
    return true;
  }
  return false;
}

/** "When it is empty, trash it" (and draw for Nico Campaign). */
export function checkEmpty(state: GameState, card: CardInstance): void {
  if ((card.hostedCredits ?? 0) > 0) return;
  const b = behaviors.get(card.cardId);
  if (!b) return;
  const trigger = (b.triggers ?? []).find((t) =>
    t.kind === "empty-then-trash" || t.kind === "empty-then-trash-and-draw"
  );
  if (!trigger) return;
  const draw = trigger.kind === "empty-then-trash-and-draw";
  state.log.push({ type: "trash", cardId: card.id, from: "emptied" });
  toDiscard(state, card, "emptied");
  if (draw) drawCards(state, "corp", 1);
}

/** Mayfly: trashed at the end of any run. */
export function trashMayfly(state: GameState): void {
  for (const card of [...state.runner.installed]) {
    if (card.cardId === "mayfly") {
      state.log.push({ type: "trash", cardId: card.id, from: "run ends" });
      toDiscard(state, card, "run ends");
    }
  }
}

export { moveCardTo };
