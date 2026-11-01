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
import { corpInstalled, findCard, player } from "./state.ts";
import { maxHandSize } from "./turns.ts";
import type {
  CardInstance,
  GameState,
  PlayerSide,
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

const HIDDEN = "hidden" as const;

/**
 * Build a safe view of a card, hiding identity when required.
 *
 * Hiding must cover every field that fingerprints a card, strength included:
 * most starter ice are uniquely identified by their printed strength (rules
 * 10.2.2, 4.6.3). Temporary boosts (`strengthBoost`) are open counters but are
 * suppressed alongside the id for the same reason. `owner` and `position`
 * (ice-vs-root placement, rule 4.6.2) are always open information.
 *
 * This is the canonical redaction primitive: both `getPlayerView` (mod.ts) and
 * the public-status DTO below go through it, so their redaction can never
 * drift.
 */
export function viewCard(
  card: CardInstance,
  opts: { hidden?: boolean; position?: ViewCard["position"] } = {},
): ViewCard {
  const hidden = opts.hidden === true;
  return {
    id: card.id,
    cardId: hidden ? HIDDEN : card.cardId,
    owner: card.owner,
    rezzed: card.rezzed,
    advancement: card.advancement,
    hostedCredits: card.hostedCredits,
    strength: hidden ? undefined : cardDef(card.cardId).strength ?? undefined,
    strengthBoost: hidden ? undefined : card.strengthBoost,
    // Kept as a present-`undefined` key on purpose: `infoSetKey` serializes the
    // view with sorted keys and turns a present-undefined key into
    // `"iceIndex":null`, so dropping the key would change every decision seed
    // (and with it every AI trajectory) — see docs/rules-gotchas.md.
    iceIndex: undefined,
    position: opts.position,
    zone: card.zone,
    server: card.server,
  };
}

/**
 * A prompt as `viewer` may see it: full detail for the player who must answer
 * (their own prompts never hide information from them), a stub for anyone else
 * — option labels and target ids name hidden cards, so they cannot be shared
 * (rules 10.2.2, 1.21.3).
 */
export function visiblePrompt(prompt: Prompt, viewer: PlayerSide): Prompt | PromptStub {
  if (prompt.player === viewer) return prompt;
  return promptStub(prompt);
}

/**
 * Cards installed for `side`. For the Corp these live in the servers
 * (rule 4.6.7); for the Runner they live in the Runner's `installed` list.
 */
function installedCards(state: GameState, side: "corp" | "runner"): CardInstance[] {
  if (side === "runner") return state.runner.installed;
  return corpInstalled(state);
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
    identity: viewCard(p.identity),
    score: p.score.map((c) => viewCard(c)),
    installed: installedCards(state, side).map((c) =>
      viewCard(c, { hidden: hideInstalled && c.rezzed !== true })
    ),
  };
}

function serverStatus(state: GameState, id: ServerId, hideInstalled: boolean): PublicServerStatus {
  const s = state.servers.find((x) => x.id === id)!;
  // Rules 4.6.2/4.6.3: the Corp always knows its own cards; the Runner sees
  // only rezzed ice identities. Unrezzed ice STAYS IN POSITION as a redacted
  // entry (`cardId: "hidden"`, real instance id preserved): the stack order is
  // open information (rule 4.6.2), so the UI renders facedown tiles exactly
  // where the cards physically sit. Reducing unrezzed ice to a bare count and
  // appending it after the rezzed cards drew mixed-rez stacks inside-out (and
  // lost the RUN badge on the approached facedown ice).
  return {
    id,
    root: s.root.map((c) =>
      viewCard(c, { hidden: hideInstalled && c.rezzed !== true, position: "root" })
    ),
    ice: s.ice.map((c) =>
      viewCard(c, { hidden: hideInstalled && c.rezzed !== true, position: "ice" })
    ),
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
    if (found) {
      currentIce = viewCard(found.card, {
        hidden: hideCorpInstalled && found.card.rezzed !== true,
      });
    }
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
