/**
 * Deck validation and game setup.
 */

import { cardDef, tryCardDef } from "../cards/catalogue.ts";
import { starterPoolCardIds } from "../decks/starter-decks-cyberclick-v1.ts";
import { shuffle } from "./rng.ts";
import { player } from "./state.ts";
import { beginCorpTurn } from "./turns.ts";
import type {
  CardInstance,
  DeckConfig,
  DeckValidationIssue,
  DeckValidationResult,
  GameConfig,
  GameState,
  PlayerSide,
} from "../types.ts";

const INFLUENCE_LIMIT_DEFAULT = 15; // standard influence limit for the Starter identities

function issue(
  code: DeckValidationIssue["code"],
  message: string,
  cardId?: string,
): DeckValidationIssue {
  return { code, message, cardId };
}

/** Validate a deck for a side, optionally restricted to the starter card pool. */
export function validateDeck(
  deck: DeckConfig,
  side: PlayerSide,
  mode: GameConfig["mode"] = "open-play",
): DeckValidationResult {
  const issues: DeckValidationIssue[] = [];
  const pool = mode === "starter-decks" ? new Set(starterPoolCardIds()) : null;

  // Identity
  const identity = tryCardDef(deck.identity);
  if (!identity) {
    issues.push(
      issue("unknown-identity", `Unknown identity card '${deck.identity}'`, deck.identity),
    );
  } else {
    const expectedType = side === "corp" ? "corp_identity" : "runner_identity";
    if (identity.type !== expectedType) {
      issues.push(
        issue(
          "identity-side-mismatch",
          `Identity '${identity.title}' is a ${identity.type}, not a ${side} identity`,
          deck.identity,
        ),
      );
    }
  }

  let total = 0;
  const seen = new Set<string>();
  const identityCount = deck.cards.filter((e) => e.cardId === deck.identity).reduce(
    (a, b) => a + b.count,
    0,
  );
  if (identityCount > 0) {
    issues.push(
      issue(
        "identity-count",
        "The identity card must not be included in the card list",
        deck.identity,
      ),
    );
  }

  let influence = 0;
  for (const entry of deck.cards) {
    if (entry.count < 0 || !Number.isInteger(entry.count)) {
      issues.push(
        issue(
          "invalid-count",
          `Card '${entry.cardId}' has invalid count ${entry.count}`,
          entry.cardId,
        ),
      );
      continue;
    }
    if (entry.count === 0) continue;
    total += entry.count;
    if (seen.has(entry.cardId)) {
      issues.push(
        issue(
          "invalid-count",
          `Card '${entry.cardId}' appears more than once in deck entries`,
          entry.cardId,
        ),
      );
    }
    seen.add(entry.cardId);

    const def = tryCardDef(entry.cardId);
    if (!def) {
      issues.push(issue("unknown-card", `Unknown card id '${entry.cardId}'`, entry.cardId));
      continue;
    }
    if (def.side !== side) {
      issues.push(
        issue(
          "not-in-supported-cards",
          `Card '${def.title}' is a ${def.side} card, not a ${side} card`,
          entry.cardId,
        ),
      );
    }
    if (mode === "starter-decks" && !pool!.has(entry.cardId)) {
      issues.push(
        issue(
          "not-in-supported-cards",
          `Card '${entry.cardId}' is not in the supported starter-deck card pool`,
          entry.cardId,
        ),
      );
    }
    if (def.deckLimit !== null && entry.count > def.deckLimit) {
      issues.push(
        issue(
          "over-deck-limit",
          `Card '${def.title}' exceeds its deck limit of ${def.deckLimit} (has ${entry.count})`,
          entry.cardId,
        ),
      );
    }
    if (def.influenceCost !== null && def.influenceCost > 0 && identity) {
      influence += def.influenceCost * entry.count;
    }
  }

  if (total === 0) issues.push(issue("empty-deck", "The deck contains no cards"));

  // Deckbuilding rules (open-play). The identity supplies minimum deck size.
  if (mode === "open-play") {
    const minSize = identity?.minimumDeckSize ?? 30;
    if (total < minSize) {
      issues.push(
        issue("under-minimum-deck-size", `Deck has ${total} cards; needs at least ${minSize}`),
      );
    }
    const influenceLimit = identity?.influenceLimit ?? INFLUENCE_LIMIT_DEFAULT;
    if (influence > influenceLimit) {
      issues.push(
        issue(
          "over-influence-limit",
          `Deck spends ${influence} influence; limit is ${influenceLimit}`,
        ),
      );
    }
  }

  // Ordered deck consistency
  if (deck.orderedCards) {
    const flat: string[] = [];
    for (const e of deck.cards) for (let i = 0; i < e.count; i++) flat.push(e.cardId);
    const counts = (ids: string[]): Map<string, number> => {
      const m = new Map<string, number>();
      for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
      return m;
    };
    const a = counts(flat);
    const b = counts(deck.orderedCards);
    if (a.size !== b.size || [...a].some(([id, n]) => b.get(id) !== n)) {
      issues.push(
        issue(
          "ordered-deck-mismatch",
          "orderedCards does not match the multiset of card entries (top-to-bottom order must contain exactly the same cards)",
        ),
      );
    }
  }

  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function makeInstance(side: PlayerSide, cardId: string, index: number): CardInstance {
  const def = cardDef(cardId);
  const instance: CardInstance = {
    id: `${side}-${index}`,
    cardId,
    owner: side,
    zone: "deck",
  };
  if (def.type === "ice" || def.type === "agenda") instance.advancement = 0;
  return instance;
}

function freshPlayer(side: PlayerSide, identityId: string, index: number): {
  identity: CardInstance;
  state: GameState["corp"];
} {
  const identity = makeInstance(side, identityId, index);
  identity.zone = "identity";
  const baseHandSize = 5;
  return {
    identity,
    state: {
      side,
      identity,
      credits: 5,
      clicks: 0,
      hand: [],
      deck: [],
      discard: [],
      score: [],
      installed: [],
      baseHandSize,
      maxHandSizeMod: 0,
      memoryLimitMod: 0,
      tags: 0,
      agendaPoints: 0,
      installedThisTurn: [],
      basicDrawThisTurn: false,
      successfulRunThisTurn: false,
      ranServersThisTurn: [],
      hqBreachesThisTurn: 0,
      usedOncePerTurn: [],
      pendingRunFund: 0,
    },
  };
}

/** Build a deck's card instances from a deck config (uses orderedCards if given). */
function buildDeckInstances(
  side: PlayerSide,
  deck: DeckConfig,
  startIndex: number,
  state: GameState,
): CardInstance[] {
  const ordered: string[] = deck.orderedCards
    ? [...deck.orderedCards]
    : deck.cards.flatMap((e) => Array<string>(e.count).fill(e.cardId));
  if (!deck.orderedCards) shuffle(state, ordered);
  return ordered.map((cardId, i) => makeInstance(side, cardId, startIndex + i));
}

export function startGame(config: GameConfig): GameState {
  // Seed the PRNG from the config, defaulting to a fixed value for determinism.
  const seed = config.seed ?? 0x2545f491;
  const state: GameState = {
    nextPromptId: 1,
    turn: { number: 0, player: "corp", phase: "mulligans" },
    corp: null as unknown as GameState["corp"],
    runner: null as unknown as GameState["runner"],
    // All five servers in a uniform shape; remotes are appended on demand.
    servers: [
      { id: "hq", root: [], ice: [] },
      { id: "rd", root: [], ice: [] },
      { id: "archives", root: [], ice: [] },
    ],
    run: null,
    breach: null,
    prompts: [],
    log: [],
    rngState: seed | 0,
    drawMode: "top",
    agendaPointTarget: config.agendaPointTarget ?? 7,
    winner: null,
    winReason: null,
    mode: config.mode,
    supportWarnings: [],
  };

  const corpIdentity = config.corp.identity;
  const runnerIdentity = config.runner.identity;
  const corpSetup = freshPlayer("corp", corpIdentity, 0);
  const runnerSetup = freshPlayer("runner", runnerIdentity, 1000);
  state.corp = corpSetup.state;
  state.runner = runnerSetup.state;

  const corpDeck = buildDeckInstances("corp", config.corp, 1, state);
  const runnerDeck = buildDeckInstances("runner", config.runner, 2001, state);
  state.corp.deck.push(...corpDeck);
  state.runner.deck.push(...runnerDeck);

  // Rule 1.6.4: 5 credits each. Rule 1.6.6: draw 5 cards each.
  for (const side of ["corp", "runner"] as PlayerSide[]) {
    const p = player(state, side);
    p.credits = 5;
    drawInitial(state, side, 5);
  }

  state.log.push({ type: "game-started" });

  if (config.allowMulligan) {
    // Corp decides first, then the Runner (rule 1.6.6a).
    state.prompts.push({ kind: "mulligan", id: state.nextPromptId++, player: "corp" });
    state.prompts.push({ kind: "mulligan", id: state.nextPromptId++, player: "runner" });
  } else {
    beginCorpTurn(state);
  }

  return state;
}

/** Draw cards without logging as an ordinary draw (setup). */
function drawInitial(state: GameState, side: PlayerSide, count: number): void {
  const p = player(state, side);
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    const card = p.deck.shift();
    if (!card) break;
    card.zone = "hand";
    p.hand.push(card);
    drawn++;
  }
  if (drawn > 0) state.log.push({ type: "draw", player: side, count: drawn });
}

// ---------------------------------------------------------------------------
// Setup imports
// ---------------------------------------------------------------------------
