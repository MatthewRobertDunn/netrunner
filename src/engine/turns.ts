/**
 * Turn and phase machinery.
 *
 * Turns are explicit phases (rules 5.3–5.7). `settle` advances phases; the Corp's
 * mandatory draw can lose the game (rule 1.7.2c), the Runner has no draw phase.
 */

import { drawCards, player, takeCreditsFrom, toDiscard } from "./state.ts";
import type { CardInstance, GameState, PlayerSide } from "../types.ts";

export const CORP_CLICKS = 3;
export const RUNNER_CLICKS = 4;

function resetTurnState(state: GameState, side: PlayerSide): void {
  const p = player(state, side);
  p.installedThisTurn = [];
  p.basicDrawThisTurn = false;
  p.successfulRunThisTurn = false;
  p.ranServersThisTurn = [];
  p.hqBreachesThisTurn = 0;
  p.usedOncePerTurn = [];
  p.pendingRunFund = 0;
}

/** Begin the Corp's turn: turn-begin abilities then the mandatory draw. */
export function beginCorpTurn(state: GameState): void {
  resetTurnState(state, "corp");
  state.prompts = [];
  state.run = null;
  state.breach = null;
  state.turn.number += 1;
  state.turn.player = "corp";
  state.turn.phase = "action";
  const corp = state.corp;
  corp.clicks = CORP_CLICKS;
  state.log.push({ type: "turn-start", player: "corp", turn: state.turn.number });
  if (state.winner) return;

  // Nico Campaign: "When your turn begins, take 3 credits from this asset."
  const nicos = state.servers.flatMap((s) => s.root).filter((c) =>
    c.cardId === "nico_campaign" && c.rezzed
  );
  for (const nico of nicos) {
    const taken = Math.min(nico.hostedCredits ?? 0, 3);
    nico.hostedCredits = (nico.hostedCredits ?? 0) - taken;
    state.corp.credits += taken;
    if (taken > 0) {
      state.log.push({ type: "take-credits", targetId: nico.id, amount: taken, player: "corp" });
    }
    checkEmptyAsset(state, nico, true);
  }
  if (state.winner) return;

  // Mandatory draw (rule 5.6.1e / 5.3.3).
  state.log.push({ type: "mandatory-draw", player: "corp" });
  if (state.corp.deck.length === 0) {
    // The Corp must draw but cannot: the Runner wins (rule 1.7.2c).
    state.log.push({ type: "decked", player: "corp" });
    setGameOver(state, "runner", "Corp could not draw from an empty R&D");
    state.turn.phase = "game-over";
    return;
  }
  drawCards(state, "corp", 1);
}

export function beginRunnerTurn(state: GameState): void {
  resetTurnState(state, "runner");
  state.prompts = [];
  state.run = null;
  state.breach = null;
  state.turn.player = "runner";
  state.turn.phase = "action";
  state.runner.clicks = RUNNER_CLICKS;
  state.log.push({ type: "turn-start", player: "runner", turn: state.turn.number });

  // Smartware Distributor: "When your turn begins, take 1 credit from this resource."
  for (const card of [...state.runner.installed]) {
    if (card.cardId !== "smartware_distributor") continue;
    const taken = Math.min(card.hostedCredits ?? 0, 1);
    card.hostedCredits = (card.hostedCredits ?? 0) - taken;
    state.runner.credits += taken;
    if (taken > 0) {
      state.log.push({ type: "take-credits", targetId: card.id, amount: taken, player: "runner" });
    }
  }
}

/** Enter the discard phase for the active player (called by `settle`). */
export function enterDiscardPhase(state: GameState): void {
  if (state.winner) return;
  const side = state.turn.player;
  const p = player(state, side);
  state.turn.phase = "discard";
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

export function finishTurn(state: GameState): void {
  if (state.winner) return;
  const side = state.turn.player;
  const leftover = player(state, side).clicks;
  if (leftover > 0) state.log.push({ type: "lose-clicks", player: side, amount: leftover });
  player(state, side).clicks = 0;
  state.log.push({ type: "turn-end", player: side, turn: state.turn.number });
  if (side === "corp") beginRunnerTurn(state);
  else beginCorpTurn(state);
}

export function maxHandSize(state: GameState, side: PlayerSide): number {
  const p = player(state, side);
  // Superconducting Hub: +2 maximum hand size while in the Corp's score area.
  const hubBonus =
    side === "corp" && state.corp.score.some((c) => c.cardId === "superconducting_hub") ? 2 : 0;
  return p.baseHandSize + p.maxHandSizeMod + hubBonus;
}

/** "When it is empty, trash it" for hosted-credit assets. */
export function checkEmptyAsset(state: GameState, card: CardInstance, drawOne: boolean): void {
  if ((card.hostedCredits ?? 0) > 0) return;
  state.log.push({ type: "trash", cardId: card.id, from: "emptied" });
  toDiscard(state, card, "emptied");
  if (drawOne) drawCards(state, "corp", 1);
}

function setGameOver(state: GameState, winner: PlayerSide | "draw", reason: string): void {
  if (state.winner) return;
  state.winner = winner;
  state.winReason = reason;
  state.turn.phase = "game-over";
  state.log.push({ type: "game-end", winner, reason });
}

export { setGameOver, takeCreditsFrom };
