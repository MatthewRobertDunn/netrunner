/**
 * The settle loop: advances the game state through phases, resolves automatic
 * rules and card effects, and stops at player decisions.
 */

import { cardDef } from "../cards/catalogue.ts";
import { behavior, triggersOf } from "../cards/effects.ts";
import {
  fireAccessBegin,
  fireScore,
  fireSteal,
  fireSuccessfulRun,
  subroutineCount,
} from "./effects.ts";
import {
  beginEncounter,
  completeInitiation,
  continueMovement,
  finishRun,
  iceAt,
  passIce,
  rezCostFor,
} from "./runs.ts";
import {
  expireIcebreakerPumps,
  findCard,
  nextDeckCard,
  player,
  pruneEmptyRemotes,
  serverById,
  setGameOver,
  spendCredits,
  toDiscard,
} from "./state.ts";
import { rngNext } from "./rng.ts";
import { enterDiscardPhase } from "./turns.ts";
import type { CardInstance, GameState, PlayerSide, ServerId } from "../types.ts";

/** Resolve automatic rules until input is needed (or the game ends). */
export function settle(state: GameState): void {
  let guard = 0;
  while (guard++ < 1000) {
    if (state.winner) {
      state.prompts = [];
      state.run = null;
      state.breach = null;
      return;
    }

    // Checkpoint (rule 4.6.8e): a remote server with nothing in its root and
    // no ice ceases to exist. If that happens during a run against it, the run
    // ends after the open paid-ability window closes — neither successful nor
    // unsuccessful (rules 8.5.8, 10.3.1h). The leftover access/rez prompts
    // reference a server that no longer exists, so they are dropped here.
    const gone = pruneEmptyRemotes(state);
    if (state.run && gone.includes(state.run.server)) {
      state.breach = null;
      state.prompts = state.prompts.filter(
        (p) => p.kind !== "access-decision" && p.kind !== "rez-window",
      );
      finishRun(state);
      continue;
    }

    if (state.prompts.length > 0) return; // waiting on a player decision

    if (state.run) {
      // Breach resolution precedes run-phase stepping (rule 7.5).
      if (state.breach) {
        if (stepBreach(state)) return;
        continue;
      }
      if (stepRun(state)) return;
      continue;
    }

    // Action phase: out of clicks -> discard phase (rule 5.6.3 / 5.7.2).
    if (state.turn.phase === "action" && player(state, state.turn.player).clicks === 0) {
      enterDiscardPhase(state);
      if (state.prompts.length > 0) return;
      continue;
    }
    return;
  }
  // The guard exists so a wedged settle loop can't hang the process; if it
  // ever trips, leave a breadcrumb (the warnings surface in the UI log) saying
  // so — a silent exit would look like an engine stall.
  state.supportWarnings.push(
    "settle loop guard reached 1000 steps — the phase machine may be wedged",
  );
}

// ---------------------------------------------------------------------------
// Runs (steps of a run, rule 6.9)
// ---------------------------------------------------------------------------

function stepRun(state: GameState): boolean {
  const run = state.run!;
  switch (run.phase) {
    case "initiation":
      completeInitiation(state);
      return false;
    case "approach-ice":
      return approachIceStep(state);
    case "encounter-ice":
      return encounterStep(state);
    case "movement":
      // Rule 6.9.4c / 6.6.3: during the movement phase the Runner may jack
      // out. Park and wait for `runner.jackOut` / `runner.continueRun` —
      // unless the chance was already given for this movement (the field is
      // set when parking), e.g. after paying the Manegarm toll at the server,
      // which rule 6.9.4g places after the jack-out step.
      if (run.jackOutOffered) return continueMovement(state);
      run.jackOutOffered = true;
      return true;
    case "success":
      successStep(state);
      return false;
    case "run-ends":
      finishRun(state);
      return false;
  }
}

function approachIceStep(state: GameState): boolean {
  const run = state.run!;
  const ice = currentIce(state);
  if (!ice) {
    run.phase = "movement";
    run.jackOutOffered = false;
    return false;
  }
  if (ice.rezzed === true) {
    beginEncounter(state);
    return false;
  }
  const options = corpRezOptions(state);
  if (options.length > 0) {
    state.prompts.push({ kind: "rez-window", id: state.nextPromptId++, player: "corp", options });
    return true;
  }
  // Unrezzed ice is passed (rule 6.9.2c).
  passIce(state);
  return false;
}

/** Ice at the Runner's current position. */
function currentIce(state: GameState): CardInstance | null {
  const run = state.run!;
  const ice = iceAt(state, run.server);
  return run.position !== null ? ice[run.position] ?? null : null;
}

function corpRootCards(state: GameState, server: ServerId): CardInstance[] {
  return serverById(state, server).root;
}

/** Corp rez options for the current approach (approached ice + non-ice cards). */
export function corpRezOptions(
  state: GameState,
): { id: string; label: string; targetId: string; creditCost: number }[] {
  const run = state.run!;
  const options: { id: string; label: string; targetId: string; creditCost: number }[] = [];
  const ice = currentIce(state);
  // The displayed cost must equal what rezzing charges (rule 1.16.8, plus the
  // run's Tread Lightly increase for ice): `rezCostFor` is the single source
  // of truth for both.
  if (ice && ice.rezzed !== true) {
    options.push({
      id: `rez-${ice.id}`,
      label: `Rez ${cardDef(ice.cardId).title} (${rezCostFor(state, ice)}[credit])`,
      targetId: ice.id,
      creditCost: rezCostFor(state, ice),
    });
  }
  for (const c of corpRootCards(state, run.server)) {
    if (c.rezzed === true) continue;
    const def = cardDef(c.cardId);
    if (def.type !== "asset" && def.type !== "upgrade") continue;
    options.push({
      id: `rez-${c.id}`,
      label: `Rez ${def.title} (${rezCostFor(state, c)}[credit])`,
      targetId: c.id,
      creditCost: rezCostFor(state, c),
    });
  }
  return options;
}

function encounterStep(state: GameState): boolean {
  const run = state.run!;
  const ice = currentIce(state);
  if (!ice) {
    run.phase = "movement";
    run.jackOutOffered = false;
    return false;
  }
  const total = subroutineCount(ice);
  const allHandled = Array.from({ length: total }, (_, i) => i).every((i) =>
    run.resolved.includes(i) || run.broken.includes(i)
  );
  if (allHandled) {
    run.currentIceId = undefined;
    // Encounter complete: proceed to the movement phase (rule 6.5.6).
    run.phase = "movement";
    run.jackOutOffered = false;
    // Icebreaker pumps last only "for the remainder of the current encounter"
    // (rule 3.9.5b) — clear them for every installed program now that the
    // encounter is over.
    expireIcebreakerPumps(state);
    return false;
  }
  // Break window: the Runner may break subroutines (exposed as moves).
  return true;
}

function successStep(state: GameState): void {
  fireSuccessfulRun(state);
  if (state.winner) return;
  beginBreach(state, state.run!.server);
  // Successful-run triggers fire when the run becomes successful (rule 6.7.2).
}

/** Set up a breach: determine the random access limit (rule 7.3.5). */
export function beginBreach(state: GameState, server: ServerId): void {
  const run = state.run!;
  let limit = 1;
  if (server === "hq" || server === "rd") {
    // Run-sourcing events can add access on breach (Jailbreak: "when you
    // breach the attacked server, access 1 additional card", rule 7.3.5). The
    // run's `source` carries the event's card id.
    const ee = run.source ? behavior(run.source)?.eventEffect : undefined;
    if (ee?.kind === "run" && ee.breachAccessBonus) limit += ee.breachAccessBonus;
    // "The first time each turn you breach HQ, access 1 additional card"
    // (Docklands Pass) — only HQ breaches count toward that once-per-turn,
    // so a prior R&D/Archives/remote breach must not consume the bonus.
    if (server === "hq" && state.runner.hqBreachesThisTurn === 0) {
      for (const c of state.runner.installed) {
        for (const t of triggersOf(c.cardId)) {
          if (t.kind === "first-hq-breach-extra-access") limit += t.amount ?? 1;
        }
      }
    }
  }
  // The counter tracks HQ breaches only (it exists for Docklands Pass).
  if (server === "hq") state.runner.hqBreachesThisTurn += 1;
  state.breach = {
    server,
    randomAccessLimit: limit,
    randomAccessesUsed: 0,
    chosen: [],
  };
  state.log.push({ type: "breach", server });
}

// ---------------------------------------------------------------------------
// Breach (rule 7.5)
// ---------------------------------------------------------------------------

function stepBreach(state: GameState): boolean {
  const breach = state.breach!;
  if (breach.accessing) return true; // access-decision pending
  const remaining = candidatesForBreach(state);
  if (remaining.length === 0) {
    // Breach complete: the run proceeds to the Run Ends phase.
    state.breach = null;
    state.run!.phase = "run-ends";
    return false;
  }
  if (remaining.length === 1) {
    doAccessChoice(state, remaining[0]!.instanceId);
    // A mid-access ability can end the game (rule 1.7.2d: lethal damage while
    // accessing an installed Urtica Cipher flatlines the Runner). The winner is
    // set mid-iteration, but `breach.accessing` was already assigned, so the
    // plain park below would leave a live run/breach in the game-over state —
    // return false instead and let the loop's winner cleanup (top of `settle`)
    // clear prompts/run/breach.
    if (state.winner) return false;
    return Boolean(state.breach?.accessing) || state.prompts.length > 0;
  }
  return true; // wait for the Runner's choice
}

export interface BreachCandidate {
  instanceId: string;
  random: boolean;
}

/** Candidates for the current breach. */
export function candidatesForBreach(state: GameState): BreachCandidate[] {
  const run = state.run!;
  const breach = state.breach!;
  const server = run.server;
  const result: BreachCandidate[] = [];
  const push = (c: CardInstance, random: boolean): void => {
    if (breach.chosen.includes(c.id)) return;
    result.push({ instanceId: c.id, random });
  };
  for (const c of corpRootCards(state, server)) push(c, false);
  if (server === "hq") {
    if (breach.randomAccessesUsed < breach.randomAccessLimit) {
      for (const c of state.corp.hand) push(c, true);
    }
  } else if (server === "rd") {
    if (breach.randomAccessesUsed < breach.randomAccessLimit) {
      const top = nextDeckCard(state, "corp");
      if (top) push(top, true);
    }
  } else if (server === "archives") {
    for (const c of state.corp.discard) push(c, false);
  }
  return result;
}

/**
 * Specific (non-random) access candidates for the current breach — computed
 * WITHOUT sampling, so move enumeration can call it and stay pure. Mirrors the
 * `random: false` candidates of `candidatesForBreach`: root cards of the
 * breached server, plus the whole discard pile for an Archives breach
 * (rule 7.3.3).
 */
export function specificAccessCandidates(state: GameState): string[] {
  const breach = state.breach!;
  const server = breach.server;
  const ids: string[] = [];
  const push = (c: CardInstance): void => {
    if (!breach.chosen.includes(c.id)) ids.push(c.id);
  };
  for (const c of corpRootCards(state, server)) push(c);
  if (server === "archives") {
    for (const c of state.corp.discard) push(c);
  }
  return ids;
}

/**
 * How many random (hand/deck) access candidates the current breach has —
 * computed WITHOUT sampling, so move enumeration can call it and stay pure.
 * Mirrors the `random` candidates of `candidatesForBreach` exactly in the real
 * game (`drawMode: "top"`): every unchosen HQ hand card is one candidate, and
 * R&D contributes its top card (rule 7.3.4a). The actual card is still chosen
 * by `chooseRandomAccess` at apply time.
 */
export function randomAccessCandidateCount(state: GameState): number {
  const breach = state.breach!;
  if (breach.randomAccessesUsed >= breach.randomAccessLimit) return 0;
  if (breach.server === "hq") {
    return state.corp.hand.filter((c) => !breach.chosen.includes(c.id)).length;
  }
  if (breach.server === "rd") {
    const top = state.corp.deck[0];
    return top !== undefined && !breach.chosen.includes(top.id) ? 1 : 0;
  }
  return 0;
}

/**
 * Choose a random hand/deck access (rule 7.3.4a). This is the *only* place the
 * random access is sampled: it runs inside `applyMove`'s `runner.accessRandom`
 * handler. Move enumeration (`getLegalMoves`) never calls it, so listing
 * legal moves never advances the state PRNG.
 */
export function chooseRandomAccess(state: GameState): string | null {
  const breach = state.breach!;
  const random = candidatesForBreach(state).filter((c) =>
    c.random && !breach.chosen.includes(c.instanceId)
  );
  if (random.length === 0) return null;
  const idx = Math.floor(rngNext(state) * random.length);
  return random[idx]!.instanceId;
}

/** The Runner chooses a specific candidate to access. */
export function doAccessChoice(state: GameState, instanceId: string): void {
  const breach = state.breach!;
  const found = findCard(state, instanceId);
  if (!found) return;
  breach.chosen.push(instanceId);
  if (found.card.zone === "hand" || found.card.zone === "deck") breach.randomAccessesUsed += 1;
  breach.accessing = instanceId;
  state.log.push({ type: "access", cardId: instanceId, server: breach.server });
  fireAccessBegin(state, found.card);
  if (state.winner) return;
  state.prompts.push({
    kind: "access-decision",
    id: state.nextPromptId++,
    player: "runner",
    cardId: instanceId,
  });
}

/** Conclude the current access, optionally trashing the card. */
export function finishAccess(state: GameState, trashed: boolean): void {
  const breach = state.breach!;
  const accessing = breach.accessing!;
  const found = findCard(state, accessing);
  breach.accessing = undefined;
  if (!found) return;
  const card = found.card;
  const def = cardDef(card.cardId);
  const wasAgenda = def.type === "agenda";
  if (trashed) {
    // Rule 7.1.5a: the basic trash ability is only available when the card has
    // a payable trash cost. An agenda with no trash cost can never reach this
    // branch, but if it ever does, trashing it must also steal it — the two
    // outcomes are not independent (rule 7.1.6).
    spendCredits(state, "runner", def.trashCost ?? 0);
    toDiscard(state, card, "access"); // logs the trash event
    if (wasAgenda) {
      stealAgendaInstance(state, card.id);
      fireSteal(state, card);
    }
  }
  state.prompts = state.prompts.filter((pr) => pr.kind !== "access-decision");
  // "If, after resolving mid-access abilities, the Runner is still accessing an
  // agenda, they must steal it." (rule 7.1.6). Stealing is mandatory and happens
  // exactly once — whether the Runner trashed the card during the mid-access
  // window or passed. Don't double-steal if the trash branch already did.
  if (wasAgenda && !state.runner.score.some((c) => c.id === card.id)) {
    stealAgendaInstance(state, card.id);
    fireSteal(state, card);
  }
}

/**
 * Detach a card from every zone it might be in and place it in `side`'s score
 * area: clear its placement, reset its counters, log the score/steal event, and
 * check the agenda-point victory condition. The two scoring paths differ only
 * in the log event (`score` vs `steal`) and the side that receives the card —
 * `scoreAgenda` additionally fires `fireScore`, and `finishAccess`'s trash
 * branch additionally fires `fireSteal`.
 */
function moveToScoreArea(
  state: GameState,
  card: CardInstance,
  side: PlayerSide,
  points: number,
  eventType: "score" | "steal",
): void {
  card.zone = "score";
  card.rezzed = undefined;
  card.server = undefined;
  card.advancement = 0;
  for (const s of state.servers) {
    const i = s.root.findIndex((c) => c.id === card.id);
    if (i >= 0) s.root.splice(i, 1);
    const j = s.ice.findIndex((c) => c.id === card.id);
    if (j >= 0) s.ice.splice(j, 1);
  }
  for (const list of [state.corp.hand, state.corp.discard, state.corp.deck]) {
    const i = list.findIndex((c) => c.id === card.id);
    if (i >= 0) list.splice(i, 1);
  }
  player(state, side).score.push(card);
  player(state, side).agendaPoints += points;
  state.log.push({ type: eventType, cardId: card.id, points });
  checkVictory(state);
}

/** Move an agenda to the Runner's score area. */
function stealAgendaInstance(state: GameState, cardId: string): void {
  const found = findCard(state, cardId);
  if (!found) return;
  const def = cardDef(found.card.cardId);
  moveToScoreArea(state, found.card, "runner", def.agendaPoints ?? 0, "steal");
}

/** Score an agenda for the Corp. */
export function scoreAgenda(state: GameState, cardId: string): void {
  const found = findCard(state, cardId);
  if (!found) return;
  const def = cardDef(found.card.cardId);
  moveToScoreArea(state, found.card, "corp", def.agendaPoints ?? 0, "score");
  fireScore(state, found.card);
}

/** Check the agenda-point victory condition (rule 1.7.2a). */
export function checkVictory(state: GameState): void {
  if (state.winner) return;
  if (state.corp.agendaPoints >= state.agendaPointTarget) {
    setGameOver(state, "corp", "Corp reached the agenda point target");
    return;
  }
  if (state.runner.agendaPoints >= state.agendaPointTarget) {
    setGameOver(state, "runner", "Runner reached the agenda point target");
  }
}

// ---------------------------------------------------------------------------
// Mulligans (rule 1.6.6a)
// ---------------------------------------------------------------------------

export function takeMulligan(state: GameState): void {
  // Read the prompt BEFORE popping it: `prompts[0]` names the player who is
  // mulliganing (rule 1.6.6a). Popping first and then searching the remaining
  // prompts for a mulligan would find the *next* mulligan (the Runner's, while
  // the Corp is deciding) and reshuffle the wrong hand.
  const prompt = state.prompts[0];
  if (prompt?.kind !== "mulligan") return;
  state.prompts.shift();
  const side = prompt.player;
  const p = player(state, side);
  // Shuffle the starting hand back into the deck, then draw a new hand.
  for (const card of p.hand) {
    card.zone = "deck";
    p.deck.push(card);
  }
  p.hand = [];
  const rng = (): number => rngNext(state);
  // Fisher-Yates shuffle using the seeded PRNG.
  for (let i = p.deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p.deck[i]!;
    p.deck[i] = p.deck[j]!;
    p.deck[j] = tmp;
  }
  let drawn = 0;
  for (let i = 0; i < 5; i++) {
    const card = p.deck.shift();
    if (!card) break;
    card.zone = "hand";
    p.hand.push(card);
    drawn++;
  }
  if (drawn > 0) state.log.push({ type: "draw", player: p.side, count: drawn });
}
