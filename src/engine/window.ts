/**
 * The paid ability window that opens after every action (rule 5.6.2a for the
 * Corp, 5.7.1e for the Runner): players may use paid abilities, the Corp may
 * rez non-ice cards, and the Corp may score agendas.
 *
 * While clicks remain, a player interleaves these options with their actions
 * freely, so the window needs no separate representation during the action
 * phase. Once the last click is spent it is all that is left: the window stays
 * open until the active player declines it, which is what the `endTurn` move
 * does. `settle` parks on `endOfTurnWindowOpen` instead of rolling into the
 * discard phase, and `getLegalMoves` generates the same moves plus `endTurn` —
 * both read the one function here, so the two can never drift.
 *
 * This module is a leaf (cards + state/effects/runs): `legal-moves.ts` and
 * `settle.ts` both import it, and neither is importable from the other.
 */

import { cardDef } from "../cards/catalogue.ts";
import { behaviors, supportStatus } from "../cards/effects.ts";
import { abilityLegality, serversForAbility } from "./effects.ts";
import { rezCostFor } from "./runs.ts";
import { corpInstalled } from "./state.ts";
import type { CardInstance, GameState, Move, PlayerSide } from "../types.ts";

/**
 * Moves available in the window for `side`, filtered to what is actually
 * payable right now. `abilityLegality` already rejects click costs the player
 * cannot pay, so with zero clicks this yields exactly the zero-click
 * abilities — the reason a clicks==0 window only opens when a real decision
 * remains.
 */
export function endOfTurnWindowMoves(state: GameState, side: PlayerSide): Move[] {
  const moves: Move[] = [];
  if (side === "corp") {
    for (const card of corpInstalled(state)) {
      const def = cardDef(card.cardId);
      if (def.type === "agenda") {
        // (S): a ready agenda can be scored in this window (rule 5.6.2a).
        if ((card.advancement ?? 0) >= (def.advancementRequirement ?? 0)) {
          moves.push({ kind: "score", targetId: card.id });
        }
      } else if (
        // (R): the Corp may rez non-ice cards — assets and upgrades. Ice is
        // NOT here: rule 6.4.3 makes the approach window its only place.
        (def.type === "asset" || def.type === "upgrade") &&
        card.rezzed !== true &&
        rezCostFor(state, card) <= state.corp.credits
      ) {
        moves.push({ kind: "rez", targetId: card.id });
      }
    }
    addAbilityMoves(state, "corp", corpInstalled(state), moves);
  } else {
    addAbilityMoves(state, "runner", state.runner.installed, moves);
  }
  return moves;
}

/** Whether the active player still has a decision in the window (so `settle`
 * must park rather than advance the phase). */
export function endOfTurnWindowOpen(state: GameState): boolean {
  return endOfTurnWindowMoves(state, state.turn.player).length > 0;
}

/**
 * Paid abilities of active cards, appended to `moves`. Rule 1.8.6: an ability
 * is active only while its source card is active — Corp assets, ice, and
 * upgrades become active when rezzed (rule 1.8.4) and installed agendas are
 * inactive until scored, so an unrezzed Corp card offers nothing; Runner cards
 * are installed faceup and always active.
 */
export function addAbilityMoves(
  state: GameState,
  side: PlayerSide,
  cards: CardInstance[],
  moves: Move[],
): void {
  for (const card of cards) {
    if (side === "corp" && card.rezzed !== true) continue;
    const abilityCount = behaviors.get(card.cardId)?.paidAbilities?.length ?? 0;
    if (supportStatus(card.cardId) === "unsupported") continue;
    for (let i = 0; i < abilityCount; i++) {
      const legality = abilityLegality(state, side, card, i);
      if (!legality.ok) continue;
      const servers = serversForAbility(state, card, i);
      if (servers.length > 0) {
        for (const server of servers) {
          moves.push({ kind: "ability", targetId: card.id, abilityIndex: i, server });
        }
      } else {
        moves.push({ kind: "ability", targetId: card.id, abilityIndex: i });
      }
    }
  }
}
