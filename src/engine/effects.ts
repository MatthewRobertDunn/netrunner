/**
 * Card effect execution: subroutines, triggers and paid abilities.
 *
 * Every effect is keyed by card id and implemented as typed code. English card
 * text is never parsed at runtime.
 */

import { cardDef } from "../cards/catalogue.ts";
import { behavior, behaviors, triggersOf } from "../cards/effects.ts";
import {
  addHostedCredits,
  corpInstalled,
  dealDamage,
  drawCards,
  findCard,
  gainCredits,
  loseCredits,
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

/**
 * "When the Runner accesses this card while it is installed, do N net damage
 * plus 1 per hosted advancement counter" (Urtica Cipher). Dispatched from the
 * card's `access-damage-installed` trigger.
 */
export function fireAccessBegin(state: GameState, card: CardInstance): void {
  const t = triggersOf(card.cardId).find((tr) => tr.kind === "access-damage-installed");
  if (!t) return;
  if (card.zone !== "play-area") return; // only "while it is installed"
  const amount = (t.amount ?? 2) + (card.advancement ?? 0);
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
        title: `${cardDef(card.cardId).title}: draw ${t.amount ?? 2} cards?`,
        options: [
          {
            id: "draw",
            label: `Draw ${t.amount ?? 2} cards`,
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

/**
 * "You may rez 1 installed piece of ice, ignoring all costs" — queued when a
 * card with the `scored-or-stolen-optional-rez-ice` trigger is scored or
 * stolen (Send a Message). Callers already filtered on the trigger, so this
 * does not name the card.
 */
function queueFreeRezPrompt(state: GameState, card: CardInstance): void {
  const unrezzedIce = iceAtAllServers(state).filter((c) => c.rezzed !== true);
  queuePrompt(state, {
    kind: "choose-one",
    id: state.nextPromptId++,
    player: "corp",
    title: `${cardDef(card.cardId).title}: rez 1 installed piece of ice, ignoring all costs?`,
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
  return state.servers.flatMap((s) => s.ice);
}

/** Successful-run triggers (rule 6.7.2a). */
export function fireSuccessfulRun(state: GameState): void {
  const run = state.run;
  if (!run) return;
  const runner = state.runner;
  // "Whenever you make a successful run, place N credits on this hardware"
  // (Pennyshaver) — dispatched from each installed card's trigger.
  for (const c of runner.installed) {
    const t = triggersOf(c.cardId).find((tr) => tr.kind === "successful-run-place-credit");
    if (t) addHostedCredits(state, c, t.amount ?? 1);
  }
  // Run-sourced effects (rule 5.2.2b): an event run sources the event's card
  // id, a paid-ability run sources `${prefix}:${instanceId}`.
  const src = run.source;
  if (src) {
    // "If successful, draw N cards" on the run the event initiated (Jailbreak).
    const ee = behavior(src)?.eventEffect;
    if (ee?.kind === "run" && ee.onSuccessfulRunDraw) {
      drawCards(state, "runner", ee.onSuccessfulRunDraw);
    }
    // "If successful, take N credits from this resource" on the ability's run
    // (Red Team) — the instance id after the prefix names the resource.
    const sep = src.indexOf(":");
    if (sep > 0) {
      const found = runner.installed.find((c) => c.id === src.slice(sep + 1));
      if (found) {
        const t = triggersOf(found.cardId).find((tr) => tr.kind === "successful-run-take-credits");
        if (t) {
          const taken = takeCreditsFrom(state, found, t.amount ?? 3);
          if (taken > 0) {
            runner.credits += taken;
            checkEmpty(state, found);
          }
        }
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
            effect: {
              kind: "corp-install-ice-inward",
              iceId: ice.id,
              targetId: c.id,
            } as ChoiceEffect,
          })),
          ...state.corp.discard.filter((c) => cardDef(c.cardId).type === "ice").map((c) => ({
            id: `install-${c.id}`,
            label: `Install ${cardDef(c.cardId).title} from Archives`,
            targetId: c.id,
            effect: {
              kind: "corp-install-ice-inward",
              iceId: ice.id,
              targetId: c.id,
            } as ChoiceEffect,
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

/**
 * Place exactly 2 advancement counters on `card`. Seamless Launch's text is
 * "Place 2 advancement counters on 1 installed card that you did not install
 * this turn" — rule 1.18.2 keeps this distinct from advancing (no click, no
 * credit, no rez). Shared by the single-target path (apply.ts) and the
 * multi-target choose-one option (`place-2-advancement`).
 */
export function addTwoAdvancement(state: GameState, card: CardInstance): void {
  card.advancement = (card.advancement ?? 0) + 2;
  state.log.push({ type: "advance", cardId: card.id, amount: 2 });
}

/**
 * Place N advancement counters on an installed card, subject to the
 * operation's own restriction (rule 1.18.2: "1 installed card that you did not
 * install this turn"). When more than one card is legal the Corp chooses; the
 * chosen option carries a `place-2-advancement` effect, which calls
 * `addTwoAdvancement` on the target. This is the single implementation of the
 * operation's effect, so the choice effect and the one-target path agree.
 */
export function placeAdvancementOnInstalled(
  state: GameState,
  card: CardInstance,
  amount: number,
): void {
  card.advancement = (card.advancement ?? 0) + amount;
  state.log.push({ type: "advance", cardId: card.id, amount });
}

/**
 * Resolve what playing a Corp operation does, beyond paying its cost. The
 * operation's effect is declared in the registry (`operationEffect`), so the
 * engine dispatches on it — never on the card id.
 *
 * For "place-advancement-on-installed" (rule 1.18.2: "Place N advancement
 * counters on 1 installed card that you did not install this turn"), the
 * target selection is part of the effect: a single legal target places
 * directly; multiple targets offer a choose-one prompt whose options carry a
 * `place-2-advancement` effect, so the choice effect and the one-target path
 * both land on `placeAdvancementOnInstalled` and can never disagree.
 */
export function resolveOperationEffect(
  state: GameState,
  card: CardInstance,
): void {
  const eff = behavior(card.cardId)?.operationEffect;
  if (!eff) return;
  switch (eff.kind) {
    case "gain-credits":
      gainCredits(state, "corp", eff.amount ?? 0);
      break;
    case "place-advancement-on-installed": {
      const amount = eff.amount ?? 2;
      const candidates = corpInstalled(state).filter((c) =>
        !state.corp.installedThisTurn.includes(c.id)
      );
      if (candidates.length === 0) {
        state.supportWarnings.push(
          `${
            cardDef(card.cardId).title
          } found no legal target; it resolves without placing counters`,
        );
        break;
      }
      if (candidates.length === 1) {
        placeAdvancementOnInstalled(state, candidates[0]!, amount);
        break;
      }
      queuePrompt(state, {
        kind: "choose-one",
        id: state.nextPromptId++,
        player: "corp",
        title: `${
          cardDef(card.cardId).title
        }: place ${amount} advancement counters on 1 installed card`,
        options: candidates.map((c) => ({
          id: `advance-${c.id}`,
          label: `Place ${amount} on ${cardDef(c.cardId).title}`,
          targetId: c.id,
          effect: { kind: "place-2-advancement", targetId: c.id } as ChoiceEffect,
        })),
      });
      break;
    }
  }
}

/**
 * Resolve what playing a Runner event does, beyond paying its cost (rule
 * 5.2.2). The event's effect is declared in the registry (`eventEffect`), so
 * the engine dispatches on it — never on the card id. Run-sourcing events
 * (rule 5.2.2b) initiate the run themselves; the run's `source` carries the
 * event id so the success-phase triggers can find the event's bonuses.
 */
export function resolveEventEffect(
  state: GameState,
  card: CardInstance,
  server?: ServerId,
): void {
  const eff = behavior(card.cardId)?.eventEffect;
  if (!eff) return;
  switch (eff.kind) {
    case "gain-credits":
      gainCredits(state, "runner", eff.amount ?? 0);
      break;
    case "draw":
      drawCards(state, "runner", eff.amount ?? 1);
      break;
    case "run": {
      // Rule 5.2.2b: the run is part of the event's resolution — the action is
      // not complete until the new timing structure (the run) is complete.
      const target = server ?? "hq";
      initiateRun(state, target, card.cardId);
      if (eff.fundCredits) state.run!.fundCredits = eff.fundCredits;
      if (eff.rezCostIncrease) state.run!.rezCostIncrease = eff.rezCostIncrease;
      state.runner.ranServersThisTurn.push(target);
      break;
    }
  }
  if (eff.thenLoseClickIfAny && state.runner.clicks > 0) {
    // Rule 5.2.2a / 1.11.3b: "lose" is not "spend", so only an available click
    // is lost — playing it as the last action of the turn loses nothing.
    state.runner.clicks -= 1;
    state.log.push({ type: "lose-clicks", player: "runner", amount: 1 });
  }
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
      spendToll(state);
      break;
    case "pay-toll-clicks":
      spendToll(state);
      break;
    case "rez-card-free": {
      const found = findCard(state, effect.targetId);
      if (found) rezCard(state, found.card, true);
      break;
    }
    case "rez-card-paid": {
      // A genuine paid-rez instruction (rule 8.1.2d): rezCard is the single
      // payment point, so the cost is charged there, not here.
      const found = findCard(state, effect.targetId);
      if (found) rezCard(state, found.card);
      break;
    }
    case "place-2-advancement": {
      // Seamless Launch (rule 1.18.2): placing counters directly is not
      // advancing, so no cost is paid and nothing is rezzed.
      const found = findCard(state, effect.targetId);
      if (found) addTwoAdvancement(state, found.card);
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

/**
 * Mark the Manegarm Skunkworks toll as paid. The credit/click cost is charged
 * once, by `answerPrompt`'s generic option-cost spend (legal-moves.ts filters
 * unaffordable options by reading `option.creditCost`/`option.clickCost`), so
 * this effect only sets the flag. It must not spend again — that double-charged
 * and, after the generic spend drained the runner, the old affordability guard
 * returned early without ever setting `tollPaid`, so the toll re-prompted.
 */
function spendToll(state: GameState): void {
  const run = state.run;
  if (!run) return;
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

  // The effect is declared in the registry; the engine dispatches on it.
  const effect = ability.effect;
  switch (effect.kind) {
    case "load-credits":
      // "[click]: Place N credits on this card" (from the bank).
      addHostedCredits(state, card, effect.amount);
      return true;
    case "take-credits": {
      // "[click]: Take N credits from this card."
      const taken = takeCreditsFrom(state, card, effect.amount);
      player(state, side).credits += taken;
      checkEmpty(state, card);
      return true;
    }
    case "load-then-take-all": {
      // "[click]: Place N credits on this hardware, then take all credits from it."
      addHostedCredits(state, card, effect.amount);
      const taken = takeCreditsFrom(state, card, 999);
      runner.credits += taken;
      checkEmpty(state, card);
      return true;
    }
    case "run-server": {
      if (!server) return false;
      // Rule 6.3.2a: the ability announces a central server "you have not run this
      // turn" (Red Team). That run counts toward the same-central-twice
      // restriction exactly like a basic `runner.run` move (apply.ts), so the
      // Runner cannot then legally `runner.run` the same central again.
      initiateRun(state, server, `${effect.sourcePrefix}:${card.id}`);
      if (server === "hq" || server === "rd" || server === "archives") {
        state.runner.ranServersThisTurn.push(server);
      }
      return true;
    }
  }
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
  toDiscard(state, card, "emptied"); // logs the trash event
  if (draw) drawCards(state, "corp", 1);
}

/**
 * "When this run ends, trash this program" (Mayfly) — dispatched from the
 * card's `run-trash-program` trigger. Every run end funnels through
 * `finishRun`, which calls this.
 */
export function trashMayfly(state: GameState): void {
  for (const card of [...state.runner.installed]) {
    if (triggersOf(card.cardId).some((t) => t.kind === "run-trash-program")) {
      toDiscard(state, card, "run ends"); // logs the trash event
    }
  }
}
