/**
 * Public game status (rule 1.10).
 *
 * `getPublicGameStatus(state)` returns a DTO containing only information that
 * both players are always entitled to see. It deliberately excludes:
 *  - the opponent's hand/deck card identities (only counts are public),
 *  - the identities of unrezzed Corp installed cards (only their existence and
 *    server placement are public).
 *
 * Because the DTO is viewer-agnostic, `getPublicGameStatus(state)` returns the
 * same value for either player.
 */

import { cardDef } from "../cards/catalogue.ts";
import { findCard, player } from "./state.ts";
import type {
  CardInstance,
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

function viewCard(card: CardInstance, hidden: boolean): ViewCard {
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

/**
 * Cards installed for `side`. For the Corp these live in the servers/remotes
 * (rule 4.1); for the Runner they live in the Runner's `installed` list.
 */
function installedCards(state: GameState, side: "corp" | "runner"): CardInstance[] {
  if (side === "runner") return state.runner.installed;
  const cards: CardInstance[] = [];
  for (const server of ["hq", "rd", "archives"] as ServerId[]) {
    for (const c of state.corp.installed) {
      if (c.zone === "play-area" && c.server === server) cards.push(c);
    }
  }
  for (const remote of state.remotes) {
    cards.push(...remote.root, ...remote.ice);
  }
  return cards;
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
    handSize: p.baseHandSize + p.maxHandSizeMod,
    deckCount: p.deck.length,
    discardCount: p.discard.length,
    identity: viewCard(p.identity, false),
    score: p.score.map((c) => viewCard(c, false)),
    installed: installedCards(state, side).map((c) =>
      viewCard(c, hideInstalled && c.rezzed !== true)
    ),
  };
}

function serverStatus(id: ServerId, root: CardInstance[], ice: CardInstance[]): PublicServerStatus {
  const all = [...root, ...ice];
  const rezzed = all.filter((c) => c.rezzed === true);
  const unrezzed = all.filter((c) => c.rezzed !== true);
  return {
    id,
    rootCount: root.length,
    ice: rezzed.map((c) => viewCard(c, false)),
    unrezzedCount: unrezzed.length,
  };
}

function publicServers(state: GameState): PublicServerStatus[] {
  const servers: PublicServerStatus[] = [];
  for (const server of ["hq", "rd", "archives"] as ServerId[]) {
    const cards = state.corp.installed.filter(
      (c) => c.zone === "play-area" && c.server === server,
    );
    servers.push(serverStatus(server, cards, []));
  }
  for (const remote of state.remotes) {
    servers.push(serverStatus(remote.id, remote.root, remote.ice));
  }
  return servers;
}

function publicRun(state: GameState): PublicRunStatus | null {
  const run = state.run;
  if (!run) return null;
  const iceId = run.currentIceId;
  let currentIce: ViewCard | null = null;
  if (iceId) {
    const found = findCard(state, iceId);
    if (found) currentIce = viewCard(found.card, found.card.rezzed !== true);
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
  return {
    turn: { ...state.turn },
    winner: state.winner,
    winReason: state.winReason,
    agendaPointTarget: state.agendaPointTarget,
    players: {
      corp: publicPlayer(state, "corp", "runner"),
      runner: publicPlayer(state, "runner", "runner"),
    },
    servers: publicServers(state),
    run: publicRun(state),
    breach: publicBreach(state),
    prompts: state.prompts,
    warnings: [...state.supportWarnings],
  };
}

/**
 * Build the public game-status DTO as seen by `viewer`. The only difference
 * from `getPublicGameStatus` is that the Corp sees the ids of its own
 * unrezzed installed cards (rule 1.10: you always know your own cards).
 */
export function getPublicGameStatusFor(
  state: GameState,
  viewer: "corp" | "runner",
): PublicGameStatus {
  return {
    turn: { ...state.turn },
    winner: state.winner,
    winReason: state.winReason,
    agendaPointTarget: state.agendaPointTarget,
    players: {
      corp: publicPlayer(state, "corp", viewer),
      runner: publicPlayer(state, "runner", viewer),
    },
    servers: publicServers(state),
    run: publicRun(state),
    breach: publicBreach(state),
    prompts: state.prompts,
    warnings: [...state.supportWarnings],
  };
}
