/**
 * Trusted-shell helpers for the AI information boundary.
 *
 * Both functions in this module read the authoritative `GameState`; they are
 * called by the trusted shell (the game loop and the web app), never by an AI.
 * The values they return are what crosses the boundary: an `AIDecisionContext`
 * of definition-id multisets plus a seed, and a stable info-set fingerprint for
 * tree search.
 */

import { other, player } from "../engine/state.ts";
import type { AIDecisionContext, CardId, GameState, PlayerSide, PlayerView } from "../types.ts";

/**
 * Build the hidden-card context for `side`'s decision (rules 10.2, 4.2.2,
 * 4.3.2, 4.4.6/4.4.7).
 *
 * `ownDeck` is the deciding player's own remaining deck as a multiset (their
 * decklist minus everything that has left the deck); `unseen` is every hidden
 * identity: the opponent's hand, the opponent's remaining deck (accepted
 * multiset concession — this is a decklist-format game), and every card the
 * view shows as `cardId: "hidden"` — for a Runner viewer that means unrezzed
 * Corp installs and the whole Corp discard pile (the engine does not yet model
 * the faceup/facedown Archives split, so the view — and therefore this
 * context — conservatively hides all of it, including cards that were rezzed
 * before being trashed).
 *
 * The one exception is the card currently being accessed: rule 7.2.1 makes its
 * identity public (the view exposes it in `breach.accessing`), so it is
 * excluded here and `determinize` pins it rather than sampling it. With that
 * exception the multisets line up exactly: every hidden slot in the view is
 * filled by exactly one draw from `unseen`.
 *
 * Both arrays are sorted so they carry no order information. The context holds
 * no instance ids, zones, or placement, and `seed` is the caller's; the AI
 * never sees `state.rngState`.
 */
export function makeAIDecisionContext(
  state: GameState,
  side: PlayerSide,
  seed: number,
): AIDecisionContext {
  const opponent = other(side);
  const opp = player(state, opponent);
  const accessedId = state.breach?.accessing;

  const ownDeck: CardId[] = player(state, side).deck.map((c) => c.cardId);
  const unseen: CardId[] = [];
  for (const card of opp.hand) if (card.id !== accessedId) unseen.push(card.cardId);
  for (const card of opp.deck) if (card.id !== accessedId) unseen.push(card.cardId);

  if (side === "runner") {
    // Unrezzed Corp installs, exactly as the view hides them (rule 4.6.3).
    for (const server of state.servers) {
      for (const card of [...server.root, ...server.ice]) {
        if (card.id === accessedId) continue;
        if (card.rezzed !== true) unseen.push(card.cardId);
      }
    }
    // Facedown Archives: the engine keeps the discard pile unordered and
    // unmarked (TODO in moveCardTo), so the Runner conservatively treats the
    // whole Corp discard as hidden — matching `getPlayerView`.
    for (const card of state.corp.discard) {
      if (card.id === accessedId) continue;
      unseen.push(card.cardId);
    }
  }

  return {
    side,
    ownDeck: ownDeck.sort(),
    unseen: unseen.sort(),
    seed,
  };
}

/**
 * A stable fingerprint of the observable state (rules 10.2): the tree key a
 * future ISMCTS uses to bucket a position by its information set.
 *
 * The view's event log is dropped (it describes history, not the present
 * position); everything else is serialized with sorted object keys and hashed
 * with FNV-1a (32-bit). The function is pure and deterministic across runs —
 * no Date, no randomness — so two runs of the same game produce identical
 * keys. Two genuinely different views may collide, which is acceptable for a
 * search tree bucket key.
 */
export function infoSetKey(view: PlayerView): string {
  const { events: _events, ...rest } = view;
  return fnv1aHex(stableStringify(rest));
}

/**
 * Derive a per-decision RNG seed from OBSERVABLE information only: a pure
 * function of the deciding player's view.
 *
 * A seed must never be derived from `state.rngState`: any reversible mapping
 * (an XOR mix, say) hands the AI the game's PRNG state and with it every
 * future random outcome — which rules 10.2/1.21 keep hidden. As a function of
 * the info-set fingerprint, this seed is identical whenever the observable
 * state is, so an AI's decision inputs are fully determined by what its
 * player may see.
 */
export function decisionSeedFor(view: PlayerView): number {
  return parseInt(infoSetKey(view), 16) | 0;
}

/** JSON with object keys sorted recursively; arrays keep their order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** 32-bit FNV-1a hash of a string, as 8 lowercase hex digits. */
function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
