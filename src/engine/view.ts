/**
 * Player-view projection: `getPlayerView` turns the authoritative `GameState`
 * into what one player is allowed to see.
 *
 * This lives in the engine (not the public barrel): the facade, the trusted
 * AI shell (`src/ai/play.ts`), and the web app all call it, and "views are a
 * redaction contract" is an engine invariant. The redaction primitives it
 * builds on are canonical in `engine/public-status.ts`; this module is the
 * full-state projection.
 */

import { viewCard, visiblePrompt } from "./public-status.ts";
import { cardVisibleTo, findCard, player } from "./state.ts";
import { maxHandSize } from "./turns.ts";
import type {
  CardInstanceId,
  GameEvent,
  GameState,
  PlayerSide,
  PlayerTurnState,
  PlayerView,
  ViewCard,
} from "../types.ts";

// ---------------------------------------------------------------------------
// Player view
// ---------------------------------------------------------------------------

const HIDDEN = "hidden" as const;

/**
 * All corp cards installed in servers, preserving state.servers order and,
 * within each server, root-then-ice order. `position` marks which list each
 * card came from — the ice-vs-root placement is open information (rule 4.6.2)
 * even when the card's identity is not (rule 4.6.3).
 */
function corpInstalledView(state: GameState, viewer: PlayerSide): ViewCard[] {
  const hide = viewer !== "corp";
  return state.servers.flatMap((s) => [
    ...s.root.map((c) => viewCard(c, { hidden: hide && c.rezzed !== true, position: "root" })),
    ...s.ice.map((c) => viewCard(c, { hidden: hide && c.rezzed !== true, position: "ice" })),
  ]);
}

function sideCards(state: GameState, side: PlayerSide) {
  const p = player(state, side);
  return {
    handCount: p.hand.length,
    handSize: maxHandSize(state, side),
    deckCount: p.deck.length,
    discardCount: p.discard.length,
    installed: p.installed,
    identity: p.identity,
    score: p.score,
  };
}

function turnStateOf(state: GameState, side: PlayerSide): PlayerTurnState {
  const p = player(state, side);
  return {
    installedThisTurn: [...p.installedThisTurn],
    basicDrawThisTurn: p.basicDrawThisTurn,
    successfulRunThisTurn: p.successfulRunThisTurn,
    ranServersThisTurn: [...p.ranServersThisTurn],
    hqBreachesThisTurn: p.hqBreachesThisTurn,
    usedOncePerTurn: [...p.usedOncePerTurn],
    pendingRunFund: p.pendingRunFund,
  };
}

/**
 * A player's hand as `viewer` may see it: full detail for the owner (a player
 * may look at their own hand, rule 4.3.2), nothing at all for anyone else —
 * only `handCount` is open (rule 4.3.4).
 */
function handView(state: GameState, side: PlayerSide, viewer: PlayerSide): ViewCard[] {
  return side === viewer ? player(state, side).hand.map((c) => viewCard(c)) : [];
}

/**
 * A player's discard pile as `viewer` may see it. The Runner's heap is open
 * information to everyone (rule 4.4.7b). The Corp's Archives is open only to
 * the Corp (rules 4.4.6c/1.21.2a: facedown cards are examined by the player
 * controlling them); this engine does not yet model the faceup/facedown split
 * (TODO in `moveCardTo`), so other viewers see every entry as "hidden" — a
 * conservative deviation, not a rules claim.
 */
function discardView(state: GameState, side: PlayerSide, viewer: PlayerSide): ViewCard[] {
  const p = player(state, side);
  if (side === "runner" || side === viewer) return p.discard.map((c) => viewCard(c));
  return p.discard.map((c) => viewCard(c, { hidden: true }));
}

/**
 * Project the authoritative state into what `viewer` is allowed to see.
 *
 * Hidden information produced by another player (their hand/deck cards) is
 * replaced with `cardId: "hidden"`. Corp cards installed but not rezzed show
 * only counts and server placement until they are rezzed or accessed. Event
 * log entries naming cards the viewer may not see carry `"hidden"` instead of
 * the id, and opponent prompts are stubbed down to kind/id/player — option
 * labels and target ids routinely name hidden cards (rules 10.2.2, 10.2.3).
 */
export function getPlayerView(state: GameState, viewer: PlayerSide): PlayerView {
  const corpSide = sideCards(state, "corp");
  const runnerSide = sideCards(state, "runner");

  return {
    viewer,
    turn: { ...state.turn },
    winner: state.winner,
    winReason: state.winReason,
    agendaPointTarget: state.agendaPointTarget,
    mode: state.mode,
    corp: {
      credits: state.corp.credits,
      clicks: state.corp.clicks,
      handSize: corpSide.handSize,
      handCount: corpSide.handCount, // counts are public
      deckCount: corpSide.deckCount,
      discardCount: corpSide.discardCount,
      agendaPoints: state.corp.agendaPoints,
      tags: state.corp.tags,
      identity: viewCard(state.corp.identity),
      score: corpSide.score.map((c) => viewCard(c)),
      installed: corpInstalledView(state, viewer),
      hand: handView(state, "corp", viewer),
      discard: discardView(state, "corp", viewer),
      turnState: turnStateOf(state, "corp"),
    },
    runner: {
      credits: state.runner.credits,
      clicks: state.runner.clicks,
      handSize: runnerSide.handSize,
      handCount: runnerSide.handCount,
      deckCount: runnerSide.deckCount,
      discardCount: runnerSide.discardCount,
      agendaPoints: state.runner.agendaPoints,
      identity: viewCard(state.runner.identity),
      score: runnerSide.score.map((c) => viewCard(c)),
      installed: runnerSide.installed.map((c) => viewCard(c)),
      hand: handView(state, "runner", viewer),
      discard: discardView(state, "runner", viewer),
      tags: state.runner.tags,
      turnState: turnStateOf(state, "runner"),
    },
    run: state.run
      ? {
        server: state.run.server,
        phase: state.run.phase,
        position: state.run.position,
        currentIce: state.run.currentIceId
          ? viewCard(findCard(state, state.run.currentIceId)?.card ?? state.corp.identity, {
            // The ice being approached is public once rezzed (rules 1.21.1a,
            // 4.6.3): every player reads Rezzed ice off the table.
            hidden: viewer !== "corp" &&
              findCard(state, state.run.currentIceId)?.card.rezzed !== true,
            position: "ice",
          })
          : undefined,
        broken: [...state.run.broken],
        resolved: [...state.run.resolved],
        source: state.run.source,
        fundCredits: state.run.fundCredits,
        rezCostIncrease: state.run.rezCostIncrease,
        tollPaid: state.run.tollPaid,
      }
      : null,
    breach: state.breach
      ? {
        server: state.breach.server,
        randomAccessLimit: state.breach.randomAccessLimit,
        remaining: Math.max(
          0,
          state.breach.randomAccessLimit - state.breach.randomAccessesUsed,
        ),
        chosen: [...state.breach.chosen],
        accessing: state.breach.accessing
          ? viewCard(findCard(state, state.breach.accessing)?.card ?? state.corp.identity)
          : undefined,
      }
      : null,
    prompts: state.prompts.map((p) => visiblePrompt(p, viewer)),
    events: state.log.map((e) => visibleEvent(state, e, viewer)),
    warnings: [...state.supportWarnings],
  };
}

/**
 * A log event as `viewer` may see it. Every card id reference is filtered
 * through `cardVisibleTo`; anything the viewer is not entitled to see (a
 * facedown install, a card trashed from the opponent's hand by damage) becomes
 * "hidden". The event's shape is otherwise unchanged (rules 10.2.2, 4.2).
 */
function visibleEvent(state: GameState, event: GameEvent, viewer: PlayerSide): GameEvent {
  const vis = (id: CardInstanceId): CardInstanceId | "hidden" =>
    cardVisibleTo(state, id, viewer) ? id : HIDDEN;
  switch (event.type) {
    case "load-credits":
    case "take-credits":
      return { ...event, targetId: vis(event.targetId) };
    case "install":
    case "play":
    case "rez":
    case "derez":
    case "advance":
    case "score":
    case "steal":
    case "trash":
    case "discard":
    case "approach-ice":
    case "encounter-ice":
    case "resolve-subroutine":
    case "break-subroutine":
    case "pass-ice":
    case "access":
    case "pump-strength":
      return { ...event, cardId: vis(event.cardId) };
    case "damage":
      return { ...event, trashed: event.trashed.map(vis) };
    default:
      return event;
  }
}
