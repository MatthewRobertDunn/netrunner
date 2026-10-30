/**
 * Netrunner Engine -- public API.
 *
 * Small, typed, offline. Usage:
 *
 * ```ts
 * import { engine, starterDeckConfigs } from "./src/mod.ts";
 *
 * const decks = starterDeckConfigs();
 * const state = engine.startGame({
 *   corp: decks.corp,
 *   runner: decks.runner,
 *   mode: "starter-decks",
 *   seed: 42,
 * });
 *
 * const moves = engine.getLegalMoves(state, "corp");
 * const result = engine.applyMove(state, "corp", moves[0]!);
 * const view = engine.getPlayerView(result.state, "corp");
 * const status = engine.getPublicGameStatus(state);
 * ```
 *
 * `applyMove` returns `ApplyMoveResult` for a legal move, or an `IllegalMove`
 * describing why it was rejected. The original state is never mutated.
 *
 * `getPublicGameStatus` returns a viewer-agnostic DTO of everything the
 * Comprehensive Rules (rules 10.2.2/10.2.3) treat as public knowledge: credits,
 * clicks, tags, agenda points, and hand/deck/discard counts for both players
 * (4.3.4), plus turn/phase, score area, server placement, run and breach
 * progress, pending prompts and support warnings. It never leaks hidden
 * information, so both players can safely call it and receive the same value.
 *
 * AI players live in `src/ai/mod.ts` (`RandomAI`, `UctAI`, `playGame`).
 */

import { cardDef, tryCardDef } from "./cards/catalogue.ts";
import { behaviors, cardSupportReport, supportStatus } from "./cards/effects.ts";
import {
  starterDeckConfigs,
  starterPoolCardIds,
  verifyFixtureAgainstSnapshot,
} from "./decks/starter-decks-cyberclick-v1.ts";
import { applyMove } from "./engine/apply.ts";
import { getLegalMoves } from "./engine/legal-moves.ts";
import { getPublicGameStatus, getPublicGameStatusFor } from "./engine/public-status.ts";
import { startGame, validateDeck } from "./engine/setup.ts";
import { cardVisibleTo, findCard, player } from "./engine/state.ts";
import { maxHandSize } from "./engine/turns.ts";
import type {
  ApplyMoveOptions,
  ApplyMoveResult,
  CardId,
  CardInstance,
  CardInstanceId,
  DeckConfig,
  DeckValidationResult,
  GameConfig,
  GameEngine,
  GameEvent,
  GameState,
  IllegalMove,
  Move,
  PlayerSide,
  PlayerView,
  Prompt,
  PromptStub,
  PublicGameStatus,
  ServerId,
  ViewCard,
} from "./types.ts";

export * from "./types.ts";
export {
  applyMove,
  getLegalMoves,
  getPublicGameStatus,
  getPublicGameStatusFor,
  startGame,
  validateDeck,
};

export * from "./ai/mod.ts";

// ---------------------------------------------------------------------------
// Player view
// ---------------------------------------------------------------------------

const HIDDEN = "hidden" as const;

/**
 * Build a safe view of a card, hiding identity when required.
 *
 * Hiding must cover every field that fingerprints a card, strength included:
 * most starter ice are uniquely identified by their printed strength (rules
 * 10.2.2, 4.6.3).
 */
function viewCard(
  card: CardInstance,
  opts: { hidden?: boolean } = {},
): ViewCard {
  const hidden = opts.hidden === true;
  return {
    id: card.id,
    cardId: hidden ? HIDDEN : card.cardId,
    rezzed: card.rezzed,
    advancement: card.advancement,
    hostedCredits: card.hostedCredits,
    strength: hidden ? undefined : cardDef(card.cardId).strength ?? undefined,
    iceIndex: card.iceIndex,
    zone: card.zone,
    server: card.server,
  };
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
  const hideCorpInstalled = viewer !== "corp";
  const corpInstalled: ViewCard[] = state.servers.flatMap((s) =>
    [...s.root, ...s.ice].map((c) =>
      viewCard(c, { hidden: hideCorpInstalled && c.rezzed !== true })
    )
  );

  const corpSide = sideCards(state, "corp");
  const runnerSide = sideCards(state, "runner");

  return {
    viewer,
    turn: { ...state.turn },
    winner: state.winner,
    winReason: state.winReason,
    agendaPointTarget: state.agendaPointTarget,
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
      installed: corpInstalled,
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
            hidden: hideCorpInstalled &&
              findCard(state, state.run.currentIceId)?.card.rezzed !== true,
          })
          : undefined,
        broken: [...state.run.broken],
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
 * A prompt as `viewer` may see it: full detail for the player who must answer
 * (their own prompts never hide information from them), a stub for anyone else
 * — option labels and target ids name hidden cards, so they cannot be shared
 * (rules 10.2.2, 1.21.3).
 */
function visiblePrompt(prompt: Prompt, viewer: PlayerSide): Prompt | PromptStub {
  if (prompt.player === viewer) return prompt;
  return { kind: prompt.kind, id: prompt.id, player: prompt.player };
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

// ---------------------------------------------------------------------------
// Engine facade
// ---------------------------------------------------------------------------

/** Card ids in the runner starter deck (corp equivalents follow the same API). */
export function starterDeckCardIds(): { runner: CardId[]; corp: CardId[] } {
  const s = starterDeckConfigs();
  return {
    runner: [s.runner.identity, ...s.runner.cards.map((e) => e.cardId)],
    corp: [s.corp.identity, ...s.corp.cards.map((e) => e.cardId)],
  };
}

export function cardSupport(cardId: CardId): {
  supported: boolean;
  status: "supported" | "partial" | "unsupported";
  note?: string;
} {
  const status = supportStatus(cardId);
  const note = behaviors.get(cardId)?.note;
  return status === "supported" ? { supported: true, status } : { supported: false, status, note };
}

/** Aggregate support report for the complete starter-deck card pool. */
export function starterDeckSupport() {
  const ids = starterPoolCardIds();
  const report = cardSupportReport(ids);
  return { ...report, all: ids };
}

export const engine: GameEngine = {
  validateDeck(
    deck: DeckConfig,
    side: PlayerSide,
    mode?: GameConfig["mode"],
  ): DeckValidationResult {
    return validateDeck(deck, side, mode);
  },
  startGame(config: GameConfig): GameState {
    return startGame(config);
  },
  getLegalMoves(state: GameState, player: PlayerSide): Move[] {
    return getLegalMoves(state, player);
  },
  applyMove(
    state: GameState,
    player: PlayerSide,
    move: Move,
    opts: ApplyMoveOptions = {},
  ): ApplyMoveResult | IllegalMove {
    return applyMove(state, player, move, opts);
  },
  /**
   * Public game status (rules 10.2.2/10.2.3): only information both players
   * are always entitled to see, so this returns the same value for either viewer.
   */
  getPublicGameStatus(state: GameState): PublicGameStatus {
    return getPublicGameStatus(state);
  },
  /**
   * Public game status as seen by `viewer`. Identical to `getPublicGameStatus`
   * except the Corp additionally sees the ids of its own installed cards.
   */
  getPublicGameStatusFor(state: GameState, viewer: PlayerSide): PublicGameStatus {
    return getPublicGameStatusFor(state, viewer);
  },
  getPlayerView(state: GameState, player: PlayerSide): PlayerView {
    return getPlayerView(state, player);
  },
};

export {
  cardDef,
  cardSupportReport,
  starterDeckConfigs,
  starterPoolCardIds,
  supportStatus,
  tryCardDef,
  verifyFixtureAgainstSnapshot,
};

export type { ApplyMoveOptions, CardInstance, CardInstanceId };

export const supportWarningsOf = (state: GameState): string[] => [...state.supportWarnings];
