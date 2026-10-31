/**
 * The settle loop: advances the game state through phases, resolves automatic
 * rules and card effects, and stops at player decisions.
 */

import { cardDef } from "../cards/catalogue.ts";
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
  declareSuccess,
  finishRun,
  iceAt,
  passIce,
  rezCostFor,
} from "./runs.ts";
import {
  findCard,
  nextDeckCard,
  player,
  pruneEmptyRemotes,
  serverById,
  spendCredits,
  toDiscard,
} from "./state.ts";
import { rngNext } from "./rng.ts";
import { beginCorpTurn, beginRunnerTurn, setGameOver } from "./turns.ts";
import type { CardInstance, GameState, ServerId } from "../types.ts";

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

    // Checkpoint (rule 4.6.10): a remote server with nothing in its root and
    // no ice ceases to exist. If that happens during a run against it, the run
    // ends — neither successful nor unsuccessful (rule 4.6.10b).
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
      state.turn.phase = "discard";
      promptOrFinishDiscard(state);
      if (state.prompts.length > 0) return;
      continue;
    }
    return;
  }
}

function promptOrFinishDiscard(state: GameState): void {
  const side = state.turn.player;
  const p = player(state, side);
  // Flatline check before the Runner discards (rule 5.5.4a).
  if (side === "runner" && maxHandSize(state, "runner") < 0) {
    setGameOver(state, "corp", "Runner's maximum hand size dropped below 0");
    return;
  }
  const max = maxHandSize(state, side);
  if (p.hand.length > max) {
    state.prompts.push({
      kind: "discard",
      id: state.nextPromptId++,
      player: side,
      count: p.hand.length - max,
    });
    return;
  }
  finishTurn(state);
}

function finishTurn(state: GameState): void {
  if (state.winner) return;
  const side = state.turn.player;
  const leftover = player(state, side).clicks;
  if (leftover > 0) state.log.push({ type: "lose-clicks", player: side, amount: leftover });
  player(state, side).clicks = 0;
  state.log.push({ type: "turn-end", player: side, turn: state.turn.number });
  if (side === "corp") beginRunnerTurn(state);
  else beginCorpTurn(state);
}

function maxHandSize(state: GameState, side: "corp" | "runner"): number {
  const p = player(state, side);
  const hubBonus =
    side === "corp" && state.corp.score.some((c) => c.cardId === "superconducting_hub") ? 2 : 0;
  return p.baseHandSize + p.maxHandSizeMod + hubBonus;
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
      return movementStep(state);
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
  if (ice && ice.rezzed !== true) {
    options.push({
      id: `rez-${ice.id}`,
      label: `Rez ${cardDef(ice.cardId).title} (${rezSafeCost(state, ice)}[credit])`,
      targetId: ice.id,
      creditCost: rezSafeCost(state, ice),
    });
  }
  for (const c of corpRootCards(state, run.server)) {
    if (c.rezzed === true) continue;
    const def = cardDef(c.cardId);
    if (def.type !== "asset" && def.type !== "upgrade") continue;
    options.push({
      id: `rez-${c.id}`,
      label: `Rez ${def.title} (${rezSafeCost(state, c)}[credit])`,
      targetId: c.id,
      creditCost: rezSafeCost(state, c),
    });
  }
  return options;
}

function rezSafeCost(state: GameState, card: CardInstance): number {
  // The displayed cost must equal what rezzing charges: the printed rez cost
  // (rule 1.16.8), plus the run's increase for ice while Tread Lightly is
  // active. `rezCostFor` is the single source of truth for both.
  return rezCostFor(state, card);
}

function encounterStep(state: GameState): boolean {
  const run = state.run!;
  const ice = currentIce(state);
  if (!ice) {
    run.phase = "movement";
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
    return false;
  }
  // Break window: the Runner may break subroutines (exposed as moves).
  return true;
}

function movementStep(state: GameState): boolean {
  const run = state.run!;
  const ice = iceAt(state, run.server);
  if (run.position === null) {
    // The Runner approaches the server (rule 6.9.4g).
    if (approachToll(state)) return true;
    declareSuccess(state);
    return false;
  }
  // Passing the ice at the current position and moving inward (rule 6.9.4).
  run.currentIceId = undefined;
  if (run.position === 0) {
    run.position = null;
    run.phase = "movement";
    if (approachToll(state)) return true;
    declareSuccess(state);
    return false;
  }
  run.position -= 1;
  run.currentIceId = ice[run.position]!.id;
  run.phase = "approach-ice";
  return false;
}

/** Manegarm Skunkworks toll when the Runner approaches the server. */
function approachToll(state: GameState): boolean {
  const run = state.run!;
  if (run.tollPaid) return false;
  const manegarm = corpRootCards(state, run.server).find((c) =>
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
    if (run.source === "jailbreak") limit += 1;
    // Docklands Pass: "The first time each turn you breach HQ, access 1
    // additional card" — only HQ breaches count toward that once-per-turn,
    // so a prior R&D/Archives/remote breach must not consume the bonus.
    if (server === "hq" && state.runner.hqBreachesThisTurn === 0) {
      if (state.runner.installed.some((c) => c.cardId === "docklands_pass")) limit += 1;
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
  const remaining = candidatesForBreach(state).filter((c) => !breach.chosen.includes(c.instanceId));
  if (remaining.length === 0) {
    // Breach complete: the run proceeds to the Run Ends phase.
    state.breach = null;
    state.run!.phase = "run-ends";
    return false;
  }
  if (remaining.length === 1) {
    doAccessChoice(state, remaining[0]!.instanceId);
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

/** Move an agenda to the Runner's score area. */
function stealAgendaInstance(state: GameState, cardId: string): void {
  const found = findCard(state, cardId);
  if (!found) return;
  const card = found.card;
  const def = cardDef(card.cardId);
  card.zone = "score";
  card.rezzed = undefined;
  card.server = undefined;
  card.iceIndex = undefined;
  card.advancement = 0;
  for (const s of state.servers) {
    const i = s.root.findIndex((c) => c.id === cardId);
    if (i >= 0) s.root.splice(i, 1);
    const j = s.ice.findIndex((c) => c.id === cardId);
    if (j >= 0) s.ice.splice(j, 1);
  }
  for (const list of [state.corp.hand, state.corp.discard, state.corp.deck]) {
    const i = list.findIndex((c) => c.id === cardId);
    if (i >= 0) list.splice(i, 1);
  }
  state.runner.score.push(card);
  state.runner.agendaPoints += def.agendaPoints ?? 0;
  state.log.push({ type: "steal", cardId: card.id, points: def.agendaPoints ?? 0 });
  checkVictory(state);
}

/** Score an agenda for the Corp. */
export function scoreAgenda(state: GameState, cardId: string): void {
  const found = findCard(state, cardId);
  if (!found) return;
  const card = found.card;
  const def = cardDef(card.cardId);
  card.zone = "score";
  card.rezzed = undefined;
  card.server = undefined;
  card.iceIndex = undefined;
  card.advancement = 0;
  for (const s of state.servers) {
    const i = s.root.findIndex((c) => c.id === cardId);
    if (i >= 0) s.root.splice(i, 1);
    const j = s.ice.findIndex((c) => c.id === cardId);
    if (j >= 0) s.ice.splice(j, 1);
  }
  for (const list of [state.corp.hand, state.corp.discard, state.corp.deck]) {
    const i = list.findIndex((c) => c.id === cardId);
    if (i >= 0) list.splice(i, 1);
  }
  state.corp.score.push(card);
  state.corp.agendaPoints += def.agendaPoints ?? 0;
  state.log.push({ type: "score", cardId: card.id, points: def.agendaPoints ?? 0 });
  checkVictory(state);
  fireScore(state, card);
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
  if (state.prompts.length > 0) state.prompts.shift();
  const side = pendingMulliganPlayer(state);
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

function pendingMulliganPlayer(state: GameState) {
  return state.prompts.find((p) => p.kind === "mulligan")?.player ?? "corp";
}

export { rngNext };
