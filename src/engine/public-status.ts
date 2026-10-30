/**
 * Public game status (rules 10.2.2/10.2.3).
 *
 * `getPublicGameStatus(state)` returns a DTO containing only information that
 * both players are always entitled to see. It deliberately excludes:
 *  - the opponent's hand/deck card identities (only counts are public, 4.3.4),
 *  - the identities of unrezzed Corp installed cards (only their existence and
 *    server placement are public, 4.6.2/4.6.3).
 *
 * Because the DTO is viewer-agnostic, `getPublicGameStatus(state)` returns the
 * same value for either player.
 */

import { cardDef } from "../cards/catalogue.ts";
import { findCard, player } from "./state.ts";
import { maxHandSize } from "./turns.ts";
import type {
  CardInstance,
  Prompt,
  PromptStub,
  PublicBreachStatus,
  PublicGameStatus,
  PublicPlayerStatus,
  PublicRunStatus,
  PublicServerStatus,
  ServerId,
  ViewCard,
} from "../types.ts";
import type { GameState } from "../types.ts";

const HIDDEN = "hidden" as const;

function viewCard(card: CardInstance, hidden: boolean, position?: ViewCard["position"]): ViewCard {
  return {
    id: card.id,
    cardId: hidden ? HIDDEN : card.cardId,
    owner: card.owner,
    rezzed: card.rezzed,
    advancement: card.advancement,
    hostedCredits: card.hostedCredits,
    strength: hidden ? undefined : cardDef(card.cardId).strength ?? undefined,
    strengthBoost: hidden ? undefined : card.strengthBoost,
    iceIndex: card.iceIndex,
    position,
    zone: card.zone,
    server: card.server,
  };
}

/**
 * Cards installed for `side`. For the Corp these live in the servers
 * (rule 4.6.7); for the Runner they live in the Runner's `installed` list.
 */
function installedCards(state: GameState, side: "corp" | "runner"): CardInstance[] {
  if (side === "runner") return state.runner.installed;
  return state.servers.flatMap((s) => [...s.root, ...s.ice]);
}

function publicPlayer(
  state: GameState,
  side: "corp" | "runner",
  viewer: "corp" | "runner",
): PublicPlayerStatus {
  const p = player(state, side);
  const hideInstalled = side === "corp" && viewer !== "corp";
  return {
    side,
    credits: p.credits,
    clicks: p.clicks,
    tags: p.tags,
    agendaPoints: p.agendaPoints,
    handCount: p.hand.length,
    handSize: maxHandSize(state, side),
    deckCount: p.deck.length,
    discardCount: p.discard.length,
    identity: viewCard(p.identity, false),
    score: p.score.map((c) => viewCard(c, false)),
    installed: installedCards(state, side).map((c) =>
      viewCard(c, hideInstalled && c.rezzed !== true)
    ),
  };
}

function serverStatus(state: GameState, id: ServerId, hideInstalled: boolean): PublicServerStatus {
  const s = state.servers.find((x) => x.id === id)!;
  // Rules 4.6.2/4.6.3: the Corp always knows its own cards; the Runner only
  // sees rezzed ice identities plus the count of unrezzed ice.
  const iceVisible = s.ice.filter((c) => !hideInstalled || c.rezzed === true);
  return {
    id,
    root: s.root.map((c) => viewCard(c, hideInstalled && c.rezzed !== true, "root")),
    ice: iceVisible.map((c) => viewCard(c, false, "ice")),
    unrezzedIceCount: s.ice.length - iceVisible.length,
  };
}

function publicServers(state: GameState, hideInstalled: boolean): PublicServerStatus[] {
  return state.servers.map((s) => serverStatus(state, s.id, hideInstalled));
}

function publicRun(state: GameState, hideCorpInstalled: boolean): PublicRunStatus | null {
  const run = state.run;
  if (!run) return null;
  const iceId = run.currentIceId;
  let currentIce: ViewCard | null = null;
  if (iceId) {
    const found = findCard(state, iceId);
    // The approached ice is public once rezzed (rules 1.21.1a, 4.6.3). The
    // Corp also always knows its own unrezzed cards (4.6.3: facedown cards
    // are examined by the player controlling them).
    if (found) currentIce = viewCard(found.card, hideCorpInstalled && found.card.rezzed !== true);
  }
  return {
    server: run.server,
    phase: run.phase,
    position: run.position,
    currentIce,
    brokenSubroutines: [...run.broken],
  };
}

function publicBreach(state: GameState): PublicBreachStatus | null {
  const breach = state.breach;
  if (!breach) return null;
  return {
    server: breach.server,
    randomAccessLimit: breach.randomAccessLimit,
    randomAccessesUsed: breach.randomAccessesUsed,
    accessing: breach.accessing !== undefined,
  };
}

/**
 * Build the public game-status DTO. Same output for either viewer: the Corp's
 * own unrezzed installed card ids are hidden here (only `getPublicGameStatusFor`
 * with `viewer: "corp"` reveals them), because the DTO is meant to be the
 * intersection of what both players know.
 */
export function getPublicGameStatus(state: GameState): PublicGameStatus {
  // Viewer-agnostic: unrezzed Corp installed cards are hidden (the intersection
  // of what both players know).
  return publicStatus(state, true);
}

/**
 * Build the public game-status DTO as seen by `viewer`. The Corp additionally
 * sees the ids of its own unrezzed installed cards (rules 4.6.2/4.6.3: facedown
 * cards are always examined by the player controlling them).
 */
export function getPublicGameStatusFor(
  state: GameState,
  viewer: "corp" | "runner",
): PublicGameStatus {
  return publicStatus(state, viewer !== "corp");
}

function publicStatus(state: GameState, hideCorpInstalled: boolean): PublicGameStatus {
  return {
    turn: { ...state.turn },
    winner: state.winner,
    winReason: state.winReason,
    agendaPointTarget: state.agendaPointTarget,
    players: {
      corp: publicPlayer(state, "corp", hideCorpInstalled ? "runner" : "corp"),
      runner: publicPlayer(state, "runner", "runner"),
    },
    servers: publicServers(state, hideCorpInstalled),
    run: publicRun(state, hideCorpInstalled),
    breach: publicBreach(state),
    // Prompt option labels name unrezzed installed cards and hand/discard
    // cards, so the shared DTO carries only stubs — no options, no labels
    // (rules 10.2.2, 1.21.3).
    prompts: state.prompts.map(promptStub),
    warnings: [...state.supportWarnings],
  };
}

/** Non-owner view of a prompt: that a decision is pending, and for whom. */
function promptStub(prompt: Prompt): PromptStub {
  return { kind: prompt.kind, id: prompt.id, player: prompt.player };
}
