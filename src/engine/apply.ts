/**
 * Apply a move: validate it against the current state, execute it on a copy so
 * a rejected move can never mutate the caller's state, then settle.
 */

import { cardDef, isIce } from "../cards/catalogue.ts";
import {
  behavior,
  breakAbilityDef,
  pumpAbilityDef,
  subroutinesOf,
  triggersOf,
} from "../cards/effects.ts";
import { fastCloneState } from "./clone.ts";
import {
  applyChoice,
  applyPaidAbility,
  fireInstall,
  resolveEventEffect,
  resolveOperationEffect,
  resolveSubroutine,
} from "./effects.ts";
import { beginEncounter, continueMovement, endRun, initiateRun, passIce, rezCard } from "./runs.ts";
import {
  chooseRandomAccess,
  doAccessChoice,
  finishAccess,
  scoreAgenda,
  settle,
  takeMulligan,
} from "./settle.ts";
import {
  availableCredits,
  createRemote,
  drawCards,
  expireIcebreakerPumps,
  findCard,
  gainCredits,
  isCentral,
  memoryLimit,
  memoryUsed,
  moveCardTo,
  player,
  pruneEmptyRemotes,
  runnerInstallCost,
  serverById,
  serverExists,
  spendClicks,
  spendCredits,
} from "./state.ts";
import { getLegalMoves } from "./legal-moves.ts";
import { beginCorpTurn, enterDiscardPhase, maxHandSize } from "./turns.ts";
import { PASS_OPTION_ID } from "../types.ts";
import type {
  ApplyMoveOptions,
  ApplyMoveResult,
  CardInstance,
  GameState,
  IllegalMove,
  Move,
  PlayerSide,
  ServerId,
} from "../types.ts";

export function applyMove(
  state: GameState,
  playerSide: PlayerSide,
  move: Move,
  opts: ApplyMoveOptions = {},
): ApplyMoveResult | IllegalMove {
  const legal = getLegalMoves(state, playerSide);
  const ok = legal.some((m) => sameMove(m, move));
  if (!ok) {
    return {
      kind: "illegal-move",
      reason: explainIllegal(playerSide, move),
      move,
    };
  }
  const next = opts.mutate ? state : fastCloneState(state);
  const mark = next.log.length;
  applyResolvedMove(next, playerSide, move);
  settle(next);
  const events = next.log.slice(mark);
  return {
    kind: "applied",
    state: next,
    events,
    warnings: supportWarnings(next),
  };
}

function supportWarnings(state: GameState): string[] {
  return [...state.supportWarnings];
}

function sameMove(a: Move, b: Move): boolean {
  if (a.kind !== b.kind) return false;
  const keys: string[] = [];
  for (const [k, v] of Object.entries(a as unknown as Record<string, unknown>)) {
    if (v === undefined) continue;
    keys.push(k);
  }
  for (const k of keys) {
    const av = (a as unknown as Record<string, unknown>)[k];
    const bv = (b as unknown as Record<string, unknown>)[k];
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length || av.some((x, i) => x !== bv[i])) return false;
      continue;
    }
    if (av !== bv) return false;
  }
  return true;
}

function explainIllegal(playerSide: PlayerSide, move: Move): string {
  switch (move.kind) {
    case "mulligan.take":
    case "mulligan.decline":
      return `It is not ${playerSide}'s mulligan decision`;
    case "discard":
      return "It is not time to discard those cards";
    case "corp.gainCredits":
    case "corp.draw":
    case "corp.install":
    case "corp.advance":
    case "corp.score":
    case "corp.rez":
      return "Not legal in the current Corp action phase state";
    case "runner.gainCredits":
    case "runner.draw":
    case "runner.install":
    case "runner.run":
      return "Not legal in the current Runner action phase state";
    case "runner.continueRun":
    case "runner.jackOut":
      return "The run is not waiting in its movement phase right now";
    default:
      return `Move '${move.kind}' is not legal right now`;
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function applyResolvedMove(state: GameState, playerSide: PlayerSide, move: Move): void {
  switch (move.kind) {
    // Setup ---------------------------------------------------------------
    case "mulligan.take": {
      takeMulligan(state);
      if (state.prompts.length === 0) startFirstTurn(state);
      break;
    }
    case "mulligan.decline": {
      if (state.prompts.length > 0) state.prompts.shift();
      if (state.prompts.length === 0) startFirstTurn(state);
      break;
    }
    case "discard": {
      const prompt = state.prompts[0];
      const ids = move.cardInstanceIds;
      for (const id of ids) {
        const found = findCard(state, id);
        if (!found || found.side !== playerSide) continue;
        moveCardTo(state, found.card, "discard", playerSide);
        found.card.zone = "discard";
        state.log.push({ type: "discard", cardId: id, player: playerSide });
      }
      if (prompt && prompt.kind === "discard" && state.prompts[0]?.id === prompt.id) {
        state.prompts.shift();
      }
      const remaining = player(state, playerSide).hand.length - maxHandSize(state, playerSide);
      if (remaining > 0) {
        // More discards still required.
        state.prompts.push({
          kind: "discard",
          id: state.nextPromptId++,
          player: playerSide,
          count: remaining,
        });
        return;
      }
      enterDiscardPhase(state);
      break;
    }

    // Corp actions --------------------------------------------------------
    case "corp.gainCredits": {
      spendClicks(state, "corp", 1);
      gainCredits(state, "corp", 1);
      break;
    }
    case "corp.draw": {
      spendClicks(state, "corp", 1);
      if (state.corp.deck.length === 0) {
        state.winner = "runner";
        state.winReason = "Corp drew from an empty R&D";
        state.log.push({ type: "game-end", winner: "runner", reason: state.winReason });
        return;
      }
      drawCards(state, "corp", 1);
      break;
    }
    case "corp.install": {
      installCorpCard(state, move.cardId, move.server);
      break;
    }
    case "corp.playOperation": {
      playCorpOperation(state, move.cardId);
      break;
    }
    case "corp.advance": {
      const found = findCard(state, move.targetId);
      if (!found) break;
      // Rule 5.2.6f: "[click], 1[credit]: Advance 1 installed card."
      spendClicks(state, "corp", 1);
      spendCredits(state, "corp", 1);
      addAdvancementCounter(state, found.card);
      break;
    }
    case "corp.score": {
      scoreAgenda(state, move.targetId);
      break;
    }
    case "corp.rez": {
      const found = findCard(state, move.targetId);
      // rezCard fires the on-rez triggers (load credits) itself.
      if (found) rezCard(state, found.card);
      break;
    }
    case "corp.ability": {
      const found = findCard(state, move.targetId);
      if (found) applyPaidAbility(state, "corp", found.card, move.abilityIndex);
      break;
    }

    // Runner actions ------------------------------------------------------
    case "runner.gainCredits": {
      spendClicks(state, "runner", 1);
      gainCredits(state, "runner", 1);
      break;
    }
    case "runner.draw": {
      spendClicks(state, "runner", 1);
      const runner = state.runner;
      // Verbal Plasticity: "The first time each turn you take the basic action
      // to draw 1 card, instead draw 2 cards." Consulted from the trigger.
      const verbal = runner.installed.some((c) =>
        triggersOf(c.cardId).some((t) => t.kind === "first-basic-draw-double")
      );
      if (runner.deck.length === 0) {
        state.winner = "corp";
        state.winReason = "Runner drew from an empty Stack";
        state.log.push({ type: "game-end", winner: "corp", reason: state.winReason });
        return;
      }
      const count = verbal && !runner.basicDrawThisTurn ? 2 : 1;
      runner.basicDrawThisTurn = true;
      drawCards(state, "runner", count);
      break;
    }
    case "runner.install": {
      installRunnerCard(state, move.cardId);
      break;
    }
    case "runner.playEvent": {
      playRunnerEvent(state, move.cardId, move.server);
      break;
    }
    case "runner.run": {
      spendClicks(state, "runner", 1);
      initiateRun(state, move.server);
      if (isCentral(move.server)) {
        state.runner.ranServersThisTurn.push(move.server);
      }
      break;
    }
    case "runner.ability": {
      const found = findCard(state, move.targetId);
      if (found) applyPaidAbility(state, "runner", found.card, move.abilityIndex, move.server);
      break;
    }

    case "runner.continueRun": {
      // Decline to jack out: continue the movement phase (rule 6.9.4d-g).
      continueMovement(state);
      break;
    }
    case "runner.jackOut": {
      if (state.run) {
        state.log.push({ type: "jack-out" });
        endRun(state);
      }
      break;
    }
    case "runner.breakSubroutine": {
      breakSubroutine(state, move.programId, move.subIndex);
      break;
    }
    case "runner.pumpIcebreaker": {
      pumpIcebreaker(state, move.programId);
      break;
    }
    case "runner.resolveSubroutines": {
      resolveEncounter(state);
      break;
    }
    case "runner.bioroidBreak": {
      // Brân 1.0's `bioroid` break: spend a click to break one subroutine of
      // the encountered ice (any installed icebreaker qualifies, no strength
      // match — recorded interpretation in docs/rules-questions.md §7).
      breakSubroutine(state, move.iceId, move.subIndex);
      break;
    }

    // Access --------------------------------------------------------------
    case "runner.accessCard": {
      doAccessChoice(state, move.targetId);
      break;
    }
    case "runner.accessRandom": {
      // The random selection happens here, at apply time — move enumeration
      // (`getLegalMoves`) is pure and only reports that random candidates
      // exist. `chooseRandomAccess` advances the state PRNG exactly once per
      // applied access, keeping games deterministic (rule 7.3.4a).
      const chosen = chooseRandomAccess(state);
      if (chosen) doAccessChoice(state, chosen);
      break;
    }
    case "runner.trashAccessed": {
      finishAccess(state, true);
      break;
    }
    case "runner.finishAccess": {
      finishAccess(state, false);
      break;
    }

    // Prompt answers -------------------------------------------------------
    case "prompt.answer": {
      answerPrompt(state, move.promptId, move.optionId);
      break;
    }
  }
}

/** Apply one option of the head prompt and pop the prompt. */
function answerPrompt(state: GameState, promptId: number, optionId: string): void {
  const prompt = state.prompts[0];
  if (!prompt || prompt.id !== promptId) return;
  switch (prompt.kind) {
    case "rez-window": {
      const option = prompt.options.find((o) => o.id === optionId);
      if (!option?.targetId) {
        // "Pass" (or an empty option): close the window and continue the run.
        state.prompts.shift();
        finishCurrentApproach(state);
        return;
      }
      const found = findCard(state, option.targetId);
      if (!found) {
        state.prompts.shift();
        finishCurrentApproach(state);
        return;
      }
      const ok = rezCard(state, found.card);
      if (!ok) return; // not payable; leave the prompt open
      // rezCard is the single payment point (rule 8.1.2d) and fires the
      // load-on-rez trigger (fireRez) — nothing more to do here.
      state.prompts.shift();
      finishCurrentApproach(state);
      break;
    }
    case "choose-one": {
      if (optionId === PASS_OPTION_ID) {
        state.prompts.shift();
        return;
      }
      const option = prompt.options.find((o) => o.id === optionId);
      if (!option) return;
      if (option.creditCost) spendCredits(state, prompt.player, option.creditCost);
      if (option.clickCost) spendClicks(state, prompt.player, option.clickCost);
      // Dispatch on what the OPTION MEANS, never on "corp + targetId ⇒ rez":
      // that heuristic rezzed Seamless Launch targets and misrouted Brân's
      // install-inward option (BUG B1). Every rez path still funnels through
      // rezCard, the single payment point (rule 8.1.2d).
      if (option.effect?.kind === "rez-card-free" && option.targetId) {
        const found = findCard(state, option.targetId);
        if (found) rezCard(state, found.card, true);
      } else if (option.effect?.kind === "rez-card-paid" && option.targetId) {
        const found = findCard(state, option.targetId);
        if (found) rezCard(state, found.card);
      } else {
        applyChoice(state, option.effect);
      }
      state.prompts.shift();
      break;
    }
    default:
      state.prompts.shift();
      break;
  }
  /** After a rez window closes, encounter the ice if it is now rezzed. */
  function finishCurrentApproach(state: GameState): void {
    const run = state.run;
    if (!run) return;
    const ice = run.currentIceId ? findCard(state, run.currentIceId)?.card ?? null : null;
    if (ice && ice.rezzed === true) {
      beginEncounter(state);
    } else if (run.phase === "approach-ice") {
      // Unrezzed ice is passed (rule 6.9.2c).
      passIce(state);
    }
  }
}

// ---------------------------------------------------------------------------
// Corp installs
// ---------------------------------------------------------------------------

function installCorpCard(state: GameState, cardId: string, server: ServerId | "new-remote"): void {
  const card = state.corp.hand.find((c) => c.cardId === cardId);
  if (!card) return;
  const def = cardDef(cardId);
  spendClicks(state, "corp", 1);
  const target: ServerId | "new-remote" = server;
  const resolved: ServerId = target === "new-remote" ? createRemote(state).id : target;
  if (!serverExists(state, resolved)) return;

  // All servers hold root cards and ice in the same shape; only breach/access
  // behaviour differs between central and remote servers.
  const s = serverById(state, resolved);
  if (isIce(def)) {
    // Pay ice install cost (rule 1.16.6b): one credit per ice already
    // protecting the server; assets/agendas/upgrades are free.
    spendCredits(state, "corp", s.ice.length);
    s.ice.push(card); // outermost position (rule 8.5)
  } else {
    s.root.push(card);
  }
  const idx = state.corp.hand.findIndex((c) => c.id === card.id);
  if (idx >= 0) state.corp.hand.splice(idx, 1);
  card.zone = "play-area";
  card.server = resolved;
  card.rezzed = false;
  state.corp.installedThisTurn.push(card.id);
  state.log.push({ type: "install", cardId: card.id, player: "corp", server: resolved });
}

// ---------------------------------------------------------------------------
// Runner installs
// ---------------------------------------------------------------------------

function installRunnerCard(state: GameState, cardId: string): void {
  const card = state.runner.hand.find((c) => c.cardId === cardId);
  if (!card) return;
  const def = cardDef(cardId);
  spendClicks(state, "runner", 1);
  // Carmen: -2 after a successful run this turn (shared with enumeration).
  const cost = runnerInstallCost(state, cardId);
  spendCredits(state, "runner", cost);
  state.runner.hand.splice(state.runner.hand.findIndex((c) => c.id === card.id), 1);
  card.zone = "play-area";
  state.runner.installed.push(card);
  state.runner.installedThisTurn.push(card.id);
  state.log.push({ type: "install", cardId: card.id, player: "runner" });
  fireInstall(state, card);
  // Memory check (rule 1.20.3): not required by the Starter pool but enforced.
  if (memoryUsed(state) > memoryLimit(state)) {
    state.supportWarnings.push(`Memory limit exceeded installing ${def.title}`);
  }
}

// ---------------------------------------------------------------------------
// Operations and events
// ---------------------------------------------------------------------------

function playCorpOperation(state: GameState, cardId: string): void {
  const card = state.corp.hand.find((c) => c.cardId === cardId);
  if (!card) return;
  const def = cardDef(cardId);
  spendClicks(state, "corp", 1);
  spendCredits(state, "corp", def.cost ?? 0);
  state.corp.hand.splice(state.corp.hand.findIndex((c) => c.id === card.id), 1);
  card.zone = "discard";
  state.corp.discard.unshift(card);
  state.log.push({ type: "play", cardId: card.id, player: "corp" });
  // The operation's effect is declared in the registry (operationEffect); the
  // engine dispatches on it — never on the card id.
  resolveOperationEffect(state, card);
  pruneEmptyRemotes(state);
}

function playRunnerEvent(state: GameState, cardId: string, server?: ServerId): void {
  const card = state.runner.hand.find((c) => c.cardId === cardId);
  if (!card) return;
  const def = cardDef(cardId);
  spendClicks(state, "runner", 1);
  spendCredits(state, "runner", def.cost ?? 0);
  state.runner.hand.splice(state.runner.hand.findIndex((c) => c.id === card.id), 1);
  card.zone = "discard";
  state.runner.discard.unshift(card);
  state.log.push({ type: "play", cardId: card.id, player: "runner" });
  // The event's effect is declared in the registry (eventEffect); the engine
  // dispatches on it — never on the card id.
  resolveEventEffect(state, card, server);
}

// ---------------------------------------------------------------------------
// Ice encounters
// ---------------------------------------------------------------------------

function breakSubroutine(state: GameState, programId: string, subIndex: number): void {
  const program = findCard(state, programId)?.card;
  const iceId = state.run?.currentIceId;
  if (!program || !iceId) return;
  const found = findCard(state, iceId);
  const ice = found?.card;
  if (!ice) return;
  const run = state.run!;
  if (run.resolved.includes(subIndex) || run.broken.includes(subIndex)) return;

  if (breakAbilityDef(ice.cardId)?.bioroid) {
    // Brân 1.0 style: "lose [click]: Break 1 subroutine" (no strength
    // requirement) — the ice's `bioroid` break declaration, not its id.
    if (state.runner.clicks < 1) return;
    spendClicks(state, "runner", 1);
    run.broken.push(subIndex);
    state.log.push({ type: "break-subroutine", cardId: ice.id, subIndex });
    return;
  }

  const breakDef = breakAbilityDef(program.cardId);
  if (!breakDef) return;
  const cost = breakDef.creditCost;
  if (availableCredits(state, "runner") < cost) return;
  spendCredits(state, "runner", cost);
  run.broken.push(subIndex);
  state.log.push({ type: "break-subroutine", cardId: ice.id, subIndex });
}

function pumpIcebreaker(state: GameState, programId: string): void {
  const program = findCard(state, programId)?.card;
  if (!program) return;
  const pump = pumpAbilityDef(program.cardId);
  if (!pump) return;
  if (behavior(program.cardId)?.staticStrength) {
    // A static "+X" strength (Unity's "installed icebreakers") is recomputed
    // from the board, never stored in `strengthBoost` (rule 3.9.5b) — pumping
    // it is a no-op that says so.
    state.supportWarnings.push(
      `${cardDef(program.cardId).title}'s +X strength is static, not a pump`,
    );
    return;
  }
  if (availableCredits(state, "runner") < pump.creditCost) return;
  spendCredits(state, "runner", pump.creditCost);
  program.strengthBoost = (program.strengthBoost ?? 0) + pump.amount;
  state.log.push({ type: "pump-strength", cardId: program.id, amount: pump.amount });
}

/** Resolve unbroken subroutines in order, stopping for prompts. */
export function resolveEncounter(state: GameState): void {
  const run = state.run!;
  const iceId = run.currentIceId;
  if (!iceId) {
    run.phase = "movement";
    return;
  }
  const ice = findCard(state, iceId)?.card;
  if (!ice) {
    run.phase = "movement";
    return;
  }
  const subs = subroutinesOf(ice.cardId);
  for (let i = 0; i < subs.length; i++) {
    if (run.broken.includes(i) || run.resolved.includes(i)) continue;
    resolveSubroutine(state, ice, i);
    if (state.prompts.length > 0) {
      // Stop and let the player answer before continuing (rule 9.11.4g: a
      // choice between options ends the instruction; the chosen option
      // resolves next — see also 9.8.7b, subroutines resolve one at a time).
      return;
    }
    if (state.winner) return;
    if (state.run === null || state.run.phase !== "encounter-ice") return; // run ended
  }
  // All subroutines handled.
  run.currentIceId = undefined;
  run.phase = "movement";
  run.jackOutOffered = false;
  // Encounter over: icebreaker pumps expire with it (rule 3.9.5b).
  expireIcebreakerPumps(state);
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

function addAdvancementCounter(state: GameState, card: CardInstance): void {
  card.advancement = (card.advancement ?? 0) + 1;
  state.log.push({ type: "advance", cardId: card.id, amount: 1 });
}

function startFirstTurn(state: GameState): void {
  state.turn.phase = "action";
  beginCorpTurn(state);
}
