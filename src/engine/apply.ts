/**
 * Apply a move: validate it against the current state, execute it on a copy so
 * a rejected move can never mutate the caller's state, then settle.
 */

import { cardDef, isIce } from "../cards/catalogue.ts";
import { behaviors } from "../cards/effects.ts";
import { applyChoice, applyPaidAbility, fireInstall, resolveSubroutine } from "./effects.ts";
import {
  beginEncounter,
  continueMovement,
  endRun,
  finishRun,
  initiateRun,
  passIce,
  rezCard,
} from "./runs.ts";
import {
  beginBreach,
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
  findCard,
  gainCredits,
  loseCredits,
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
import type {
  ApplyMoveResult,
  CardInstance,
  GameState,
  IllegalMove,
  Move,
  PlayerSide,
  ServerId,
} from "../types.ts";

/** Deep copy of the game state (JSON round-trip keeps it deterministic). */
function copyState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export interface ApplyMoveOptions {
  /**
   * Apply the move directly on `state` without copying it first.
   *
   * The engine normally copies the state before applying a move so a rejected
   * move can never partially mutate the caller's state. AI simulations that
   * already own their own state (a UCT search clone, a random playout) pay for
   * that copy on every edge they walk — the dominant cost in a Monte-Carlo
   * search. Passing `mutate: true` skips the copy and mutates `state` in
   * place; the returned `ApplyMoveResult.state` is the same object.
   *
   * Callers must not reuse the original `state` after a mutated apply. The
   * public engine API (`engine.applyMove`) never mutates.
   */
  mutate?: boolean;
}

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
      reason: explainIllegal(state, playerSide, move),
      move,
    };
  }
  const next = opts.mutate ? state : copyState(state);
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

/** True when `result` is a successfully applied move. */
export function applied(
  result: ApplyMoveResult | IllegalMove,
): result is ApplyMoveResult {
  return result.kind === "applied";
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

function explainIllegal(_state: GameState, playerSide: PlayerSide, move: Move): string {
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
      enterEndOfTurn(state);
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
      spendClicks(state, "corp", 1);
      addAdvancementCounter(state, found.card);
      break;
    }
    case "corp.score": {
      scoreAgenda(state, move.targetId);
      break;
    }
    case "corp.rez": {
      const found = findCard(state, move.targetId);
      if (found) {
        rezCard(state, found.card);
        fireInstall(state, found.card);
      }
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
      const verbal = runner.installed.some((c) => c.cardId === "verbal_plasticity");
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
      if (move.server === "hq" || move.server === "rd" || move.server === "archives") {
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
      // Bran 1.0 style breaking: the move names the ice whose subroutine the
      // Runner breaks with a click (handled the same as any icebreaker break).
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
      fireInstall(state, found.card);
      // Pay the rez cost.
      spendCredits(state, "corp", option.creditCost ?? 0);
      state.prompts.shift();
      finishCurrentApproach(state);
      break;
    }
    case "choose-one": {
      if (optionId === "pass") {
        state.prompts.shift();
        return;
      }
      const option = prompt.options.find((o) => o.id === optionId);
      if (!option) return;
      if (option.creditCost) spendCredits(state, prompt.player, option.creditCost);
      if (option.clickCost) spendClicks(state, prompt.player, option.clickCost);
      if (option.effect?.kind === "rez-card-free" && option.targetId) {
        const found = findCard(state, option.targetId);
        if (found) {
          rezCard(state, found.card, true);
          fireInstall(state, found.card);
        }
      } else if (option.targetId && (prompt.player === "corp")) {
        const found = findCard(state, option.targetId);
        if (found) {
          const wasUnrezzed = found.card.rezzed !== true;
          const ok = rezCard(state, found.card);
          if (ok && wasUnrezzed) fireInstall(state, found.card);
        }
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
  if (def.type === "program") memoryUsed(state);
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
  resolveCorpOperation(state, cardId, card);
  pruneEmptyRemotes(state);
}

function resolveCorpOperation(state: GameState, cardId: string, card: CardInstance): void {
  switch (cardId) {
    case "hedge_fund":
      gainCredits(state, "corp", 5);
      break;
    case "government_subsidy":
      gainCredits(state, "corp", 10);
      break;
    case "seamless_launch": {
      // Place 2 advancement counters on 1 installed card not installed this turn.
      const candidates = corpInstalledCards(state).filter((c) =>
        !state.corp.installedThisTurn.includes(c.id)
      );
      const targets = candidates.filter((c) => {
        const d = cardDef(c.cardId);
        return d.type === "agenda" || d.type === "asset" || d.type === "ice";
      });
      if (targets.length === 0) {
        state.supportWarnings.push(
          "Seamless Launch found no legal target; it resolves without placing counters",
        );
        break;
      }
      if (targets.length === 1) {
        addTwoAdvancement(state, targets[0]!);
        break;
      }
      state.prompts.push({
        kind: "choose-one",
        id: state.nextPromptId++,
        player: "corp",
        title: "Seamless Launch: place 2 advancement counters on 1 installed card",
        options: targets.map((c) => ({
          id: `advance-${c.id}`,
          label: `Place 2 on ${cardDef(c.cardId).title}`,
          targetId: c.id,
          effect: { kind: "no-op" } as const,
        })),
      });
      break;
    }
    default:
      break;
  }
  void card;
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

  switch (cardId) {
    case "sure_gamble":
      gainCredits(state, "runner", 9);
      break;
    case "creative_commission": {
      gainCredits(state, "runner", 5);
      spendClicks(state, "runner", 1);
      state.log.push({ type: "lose-clicks", player: "runner", amount: 1 });
      break;
    }
    case "vrcation": {
      // Draw 3 cards, then discard 1 (or lose 1 if the hand is empty).
      const drawn = drawCards(state, "runner", 3);
      if (state.runner.hand.length > 0 && drawn > 0) {
        if (state.runner.hand.length === 1) {
          discardSpecific(state, "runner", state.runner.hand[0]!.id);
        } else {
          state.prompts.push({
            kind: "discard",
            id: state.nextPromptId++,
            player: "runner",
            count: 1,
          });
        }
      } else {
        loseCredits(state, "runner", 1);
      }
      break;
    }
    case "jailbreak": {
      // "Run HQ or R&D. If successful, draw 1 card and when you breach the
      // attacked server, access 1 additional card."
      initiateRun(state, server ?? "hq", "jailbreak");
      state.runner.ranServersThisTurn.push(server ?? "hq");
      break;
    }
    case "overclock": {
      // "The 5 credits are added to the bank for the next run you make this turn."
      state.runner.pendingRunFund += 5;
      break;
    }
    case "tread_lightly": {
      const target = server ?? "hq";
      if (!state.run) initiateRun(state, target, "tread_lightly");
      else state.run.rezCostIncrease = 1;
      state.runner.ranServersThisTurn.push(target);
      break;
    }
    default:
      break;
  }
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

  if (ice.cardId === "bran_1_0") {
    // Bran 1.0: "lose [click]: Break 1 subroutine" (no strength requirement).
    if (state.runner.clicks < 1) return;
    spendClicks(state, "runner", 1);
    run.broken.push(subIndex);
    state.log.push({ type: "break-subroutine", cardId: ice.id, subIndex });
    return;
  }

  const breakDef = behaviors.get(program.cardId)?.breakAbility;
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
  if (program.cardId === "unity") {
    // Unity's strength is static (+X = installed icebreakers); not a pump.
    state.supportWarnings.push("Unity's +X strength is static, not a pump");
    return;
  }
  const pump = behaviors.get(program.cardId)?.pumpAbility;
  if (!pump) return;
  if (availableCredits(state, "runner") < pump.creditCost) return;
  spendCredits(state, "runner", pump.creditCost);
  const amount = typeof pump.amount === "number" ? pump.amount : 1;
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
  const subs = behaviors.get(ice.cardId)?.subroutines ?? [];
  for (let i = 0; i < subs.length; i++) {
    if (run.broken.includes(i) || run.resolved.includes(i)) continue;
    resolveSubroutine(state, ice, i);
    if (state.prompts.length > 0) {
      // Stop and let the player answer before continuing (rule 9.9.2).
      run.resumeSubIndex = i;
      return;
    }
    if (state.winner) return;
    if (state.run === null || state.run.phase !== "encounter-ice") return; // run ended
  }
  // All subroutines handled.
  run.currentIceId = undefined;
  run.phase = "movement";
  run.jackOutOffered = false;
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

function addTwoAdvancement(state: GameState, card: CardInstance): void {
  card.advancement = (card.advancement ?? 0) + 2;
  state.log.push({ type: "advance", cardId: card.id, amount: 2 });
}

function addAdvancementCounter(state: GameState, card: CardInstance): void {
  card.advancement = (card.advancement ?? 0) + 1;
  state.log.push({ type: "advance", cardId: card.id, amount: 1 });
}

function discardSpecific(state: GameState, side: PlayerSide, instanceId: string): void {
  const found = findCard(state, instanceId);
  if (!found) return;
  moveCardTo(state, found.card, "discard", side);
  state.log.push({ type: "discard", cardId: instanceId, player: side });
}

function enterEndOfTurn(state: GameState): void {
  enterDiscardPhase(state);
}

function startFirstTurn(state: GameState): void {
  state.turn.phase = "action";
  beginCorpTurn(state);
}

/** All Corp cards installed in servers (root cards and ice). */
function corpInstalledCards(state: GameState): CardInstance[] {
  return state.servers.flatMap((s) => [...s.root, ...s.ice]);
}

export { beginBreach, endRun, finishRun, initiateRun, moveCardTo };
