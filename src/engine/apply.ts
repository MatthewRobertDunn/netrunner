/**
 * Apply a move: validate it against the current state, execute it on a copy so
 * a rejected move can never mutate the caller's state, then settle.
 */

import { cardDef, isIce } from "../cards/catalogue.ts";
import { breakAbilityDef, pumpAbilityDef, subroutinesOf, triggersOf } from "../cards/effects.ts";
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
  corpRezOptions,
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
  isIcebreaker,
  memoryLimit,
  memoryUsed,
  moveCardTo,
  player,
  pruneEmptyRemotes,
  runnerInstallCost,
  serverById,
  serverExists,
  setGameOver,
  spendClicks,
  spendCredits,
} from "./state.ts";
import { getLegalMoves } from "./legal-moves.ts";
import { beginCorpTurn, enterDiscardPhase, maxHandSize } from "./turns.ts";
import { isCorpInstall, PASS_OPTION_ID } from "../types.ts";
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
  const seat = playerSide === "corp" ? "Corp" : "Runner";
  switch (move.kind) {
    case "mulligan.take":
    case "mulligan.decline":
      return `It is not ${playerSide}'s mulligan decision`;
    case "discard":
      return "It is not time to discard those cards";
    // Shared verbs: the seat the move was offered for names the phase.
    case "gainCredits":
    case "draw":
    case "install":
    case "ability":
      return `Not legal in the current ${seat} action phase state`;
    case "playOperation":
    case "advance":
    case "score":
    case "rez":
      return "Not legal in the current Corp action phase state";
    case "endTurn":
      return "The turn can only end once every click is spent";
    case "playEvent":
    case "run":
      return "Not legal in the current Runner action phase state";
    case "continueRun":
    case "jackOut":
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

    // Shared basic actions ------------------------------------------------
    // One case per verb; where the two seats' rules differ, branch on the
    // authority (`playerSide`) rather than on a second move shape.
    case "gainCredits": {
      spendClicks(state, playerSide, 1);
      gainCredits(state, playerSide, 1);
      break;
    }
    case "draw": {
      spendClicks(state, playerSide, 1);
      if (playerSide === "corp") {
        // Unreachable defense-in-depth: enumeration never offers a basic draw
        // from an empty R&D — the mandatory-draw loss (rule 1.7.2c) is handled
        // in beginCorpTurn. setGameOver still flips the phase to game-over if a
        // fabricated move ever lands here.
        if (state.corp.deck.length === 0) {
          setGameOver(state, "runner", "Corp drew from an empty R&D");
          return;
        }
        drawCards(state, "corp", 1);
        break;
      }
      const runner = state.runner;
      // Verbal Plasticity: "The first time each turn you take the basic action
      // to draw 1 card, instead draw 2 cards." Consulted from the trigger.
      const verbal = runner.installed.some((c) =>
        triggersOf(c.cardId).some((t) => t.kind === "first-basic-draw-double")
      );
      // Unreachable defense-in-depth: enumeration never offers a basic draw
      // from an empty Stack. setGameOver still flips the phase to game-over if
      // a fabricated move ever lands here.
      if (runner.deck.length === 0) {
        setGameOver(state, "corp", "Runner drew from an empty Stack");
        return;
      }
      const count = verbal && !runner.basicDrawThisTurn ? 2 : 1;
      runner.basicDrawThisTurn = true;
      drawCards(state, "runner", count);
      break;
    }
    case "ability": {
      const found = findCard(state, move.targetId);
      // The `server` choice only matters for run-server abilities (a Runner
      // ability, Red Team); passing it for the Corp is inert, so one handler
      // serves both seats.
      if (found) applyPaidAbility(state, playerSide, found.card, move.abilityIndex, move.server);
      break;
    }

    // Install: the one verb both seats share with a DIFFERENT shape. The two
    // forms are told apart structurally — the Corp install names the server it
    // goes into, the Runner install does not — via the shared guard.
    case "install": {
      if (isCorpInstall(move)) {
        installCorpCard(state, move.cardId, move.server);
      } else {
        installRunnerCard(state, move.cardId);
      }
      break;
    }

    // Corp-only actions ---------------------------------------------------
    case "playOperation": {
      playCorpOperation(state, move.cardId);
      break;
    }
    case "advance": {
      const found = findCard(state, move.targetId);
      if (!found) break;
      // Rule 5.2.6f: "[click], 1[credit]: Advance 1 installed card."
      spendClicks(state, "corp", 1);
      spendCredits(state, "corp", 1);
      addAdvancementCounter(state, found.card);
      break;
    }
    case "score": {
      scoreAgenda(state, move.targetId);
      break;
    }
    case "rez": {
      const found = findCard(state, move.targetId);
      // rezCard fires the on-rez triggers (load credits) itself.
      if (found) rezCard(state, found.card);
      break;
    }
    case "endTurn": {
      // The paid ability window after the last click is declined: the action
      // phase is complete (rule 5.6.2c→d / 5.7.1g→h) and play proceeds to the
      // discard phase, where `settle` handles hand size or the next turn.
      enterDiscardPhase(state);
      break;
    }

    // Runner-only actions -------------------------------------------------
    case "playEvent": {
      playRunnerEvent(state, move.cardId, move.server);
      break;
    }
    case "run": {
      spendClicks(state, "runner", 1);
      initiateRun(state, move.server);
      if (isCentral(move.server)) {
        state.runner.ranServersThisTurn.push(move.server);
      }
      break;
    }

    case "continueRun": {
      // Decline to jack out: continue the movement phase (rule 6.9.4d-g).
      // The Corp's (R) rez options ride along so that, when the movement step
      // arrives at the attacked server (rule 6.9.4e, before the approach toll
      // of 6.9.4g), its rez window can park the run — e.g. rezzing a facedown
      // Manegarm Skunkworks in an ice-less remote so its toll can fire. This
      // is the only caller that supplies options, so the window opens exactly
      // once per server approach; settle's re-drives call `continueMovement`
      // without them and never re-open it.
      continueMovement(state, corpRezOptions(state));
      break;
    }
    case "jackOut": {
      if (state.run) {
        state.log.push({ type: "jack-out" });
        endRun(state);
      }
      break;
    }
    case "breakSubroutine": {
      breakSubroutine(state, move.programId, move.subIndex);
      break;
    }
    case "pumpIcebreaker": {
      pumpIcebreaker(state, move.programId);
      break;
    }
    case "resolveSubroutines": {
      resolveEncounter(state);
      break;
    }
    case "bioroidBreak": {
      // Brân 1.0's `bioroid` break: spend a click to break one subroutine of
      // the encountered ice (any installed icebreaker qualifies, no strength
      // match — recorded interpretation in docs/rules-questions.md §7).
      breakSubroutine(state, move.iceId, move.subIndex);
      break;
    }

    // Access --------------------------------------------------------------
    case "accessCard": {
      doAccessChoice(state, move.targetId);
      break;
    }
    case "accessRandom": {
      // The random selection happens here, at apply time — move enumeration
      // (`getLegalMoves`) is pure and only reports that random candidates
      // exist. `chooseRandomAccess` advances the state PRNG exactly once per
      // applied access, keeping games deterministic (rule 7.3.4a).
      const chosen = chooseRandomAccess(state);
      if (chosen) doAccessChoice(state, chosen);
      break;
    }
    case "trashAccessed": {
      finishAccess(state, true);
      break;
    }
    case "finishAccess": {
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
      } else {
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
      }
      // Rule 6.9.3c-d: a mid-encounter choice (Brân 1.0's install-inward,
      // Karuna's optional jack-out) is not a second break window. The 6.9.3b
      // window occurred exactly once, before any subroutine resolved; once
      // the choice resolves, the next unbroken subroutine resolves
      // immediately. Re-driving the encounter loop here is what keeps settle
      // from re-parking the encounter with break moves re-offered — which let
      // the Runner break unbroken ETR subroutines for clicks AFTER the choice.
      // The phase guard skips the re-drive when the answer ended the run
      // (Karuna's jack-out option, an ETR subroutine); a newly queued prompt
      // parks instead, and its own answer re-drives.
      if (state.run?.phase === "encounter-ice" && state.prompts.length === 0) {
        resolveEncounter(state);
      }
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
    } else if (run.phase === "movement" && run.position === null) {
      // The Corp's (R) rez window at the server approach (6.9.4e, opened by
      // `continueMovement`) just closed: resume the approach — the toll of
      // anything the Corp rezzed (6.9.4g), then success. Called WITHOUT rez
      // options, so the window does not re-open.
      continueMovement(state);
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
  if (availableCredits(state, "runner") < pump.creditCost) return;
  spendCredits(state, "runner", pump.creditCost);
  // Rule 3.9.5b: a paid ability that modifies an icebreaker's strength has an
  // implicit duration of "for the remainder of the current encounter" — the
  // boost rides `strengthBoost` and the pump-expiry sweep clears it. A dynamic
  // amount (Unity's "+X = installed icebreakers, including this one") is
  // evaluated at activation, so later board changes only affect later pumps.
  const amount = pump.dynamicAmount
    ? state.runner.installed.filter((c) => isIcebreaker(c)).length
    : pump.amount ?? 0;
  program.strengthBoost = (program.strengthBoost ?? 0) + amount;
  state.log.push({ type: "pump-strength", cardId: program.id, amount });
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
