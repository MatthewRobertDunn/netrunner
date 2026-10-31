/**
 * Determinization: build a COMPLETE hypothetical `GameState` that is
 * consistent with what one player is allowed to see.
 *
 * The AI information boundary (rules 10.2, 1.21, 4.2.2, 4.3.2) hands an AI a
 * sanitized `PlayerView` plus an `AIDecisionContext` of hidden-card multisets —
 * never the authoritative `GameState`. To run the rules engine on hypotheses
 * (`applyMove`, `getLegalMoves`) the AI must first reconstruct a full state;
 * this module is the only bridge across the boundary.
 *
 * Every card the view exposes keeps its real instance id and card id; every
 * card the view hides (`cardId: "hidden"`, the opponent's hand, both deck
 * orders, facedown Archives, and count-only zones) is filled by sampling
 * WITHOUT replacement from the hidden-card multisets in `ctx`, using `rng`.
 *
 * Ice-vs-root discipline (rules 4.6.2, 4.6.6f): physical placement is open
 * information, so a hidden card in an ice slot is always dealt an ice
 * definition and a hidden card in a server root is always dealt a non-ice
 * Corp card (asset/agenda/upgrade). An agenda never lands in an ice slot and
 * ice never lands in a root. The *type* of a root card remains hidden.
 *
 * The returned state:
 *  - has `drawMode: "random"` (a uniformly sampled draw order with no O(n)
 *    shuffle per playout), and
 *  - has `rngState` seeded from the passed `rng`, so playout randomness is
 *    reproducible for a given decision seed.
 *
 * Fidelity contract: `getPlayerView(determinized, view.viewer)` deep-equals
 * the input `view`. The single documented exception is `events`: the
 * hypothetical state's log is restored as the view's already-redacted events
 * (the engine never reads the log for logic, and re-redacting them is
 * idempotent). The contract must hold for the REDACTED view.
 *
 * The returned state is structurally isolated from the input view (deep-cloned
 * with the guarded `fastCloneState`), so an AI can mutate its hypothesis freely.
 */

import { cardDef, isIce } from "../cards/catalogue.ts";
import { fastCloneState } from "../ai/fast-clone.ts";
import type { Rng } from "./rng.ts";
import type {
  AIDecisionContext,
  CardId,
  CardInstance,
  CardInstanceId,
  GameEvent,
  GameState,
  PlayerSide,
  PlayerState,
  PlayerView,
  Prompt,
  PromptStub,
  ServerId,
  ServerState,
  ViewCard,
} from "../types.ts";

const HIDDEN = "hidden" as const;

/** The player who is not `side`. */
function otherSide(side: PlayerSide): PlayerSide {
  return side === "corp" ? "runner" : "corp";
}

/**
 * A multiset of card definition ids supporting uniform draws without
 * replacement. Iteration order is insertion order of first occurrences, so a
 * fixed `rng` stream makes every draw deterministic.
 */
class CardPool {
  private readonly counts = new Map<CardId, number>();

  constructor(ids: CardId[]) {
    for (const id of ids) this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
  }

  /** Remove one occurrence of `id`, if present. */
  remove(id: CardId): void {
    const n = this.counts.get(id);
    if (n === undefined) return;
    if (n <= 1) this.counts.delete(id);
    else this.counts.set(id, n - 1);
  }

  /** Draw one id matching `predicate`, or throw if none remains. */
  draw(rng: Rng, predicate: (id: CardId) => boolean, what: string): CardId {
    const matching: CardId[] = [];
    let total = 0;
    for (const [id, n] of this.counts) {
      if (n > 0 && predicate(id)) {
        matching.push(id);
        total += n;
      }
    }
    if (total === 0) {
      throw new Error(
        `determinize: no card in the hidden pool matches ${what}; ` +
          `AIDecisionContext is inconsistent with the view`,
      );
    }
    let roll = Math.floor(rng.next() * total);
    let id: CardId | undefined;
    for (const candidate of matching) {
      const n = this.counts.get(candidate)!;
      if (roll < n) {
        id = candidate;
        break;
      }
      roll -= n;
    }
    if (id === undefined) id = matching[matching.length - 1]!;
    const left = this.counts.get(id)! - 1;
    if (left <= 0) this.counts.delete(id);
    else this.counts.set(id, left);
    return id;
  }
}

/**
 * Turn a `ViewCard` back into a `CardInstance`, preserving every field the
 * view showed (id, placement, counters). `cardId` must already be a real
 * definition id.
 */
function instanceOf(view: ViewCard, cardId: CardId): CardInstance {
  const card: CardInstance = {
    id: view.id,
    cardId,
    owner: view.owner,
    zone: view.zone,
  };
  if (view.rezzed !== undefined) card.rezzed = view.rezzed;
  if (view.advancement !== undefined) card.advancement = view.advancement;
  if (view.hostedCredits !== undefined) card.hostedCredits = view.hostedCredits;
  if (view.strengthBoost !== undefined) card.strengthBoost = view.strengthBoost;
  if (view.server !== undefined) card.server = view.server;
  if (view.iceIndex !== undefined) card.iceIndex = view.iceIndex;
  return card;
}

/** A freshly created, fully hidden card with a synthesized instance id. */
function hiddenInstance(
  id: CardInstanceId,
  cardId: CardId,
  side: PlayerSide,
  zone: CardInstance["zone"],
): CardInstance {
  const card: CardInstance = { id, cardId, owner: side, zone };
  // Match `makeInstance` in setup.ts: ice and agendas carry an advancement
  // counter (starting at 0).
  const def = cardDef(cardId);
  if (isIce(def) || def.type === "agenda") card.advancement = 0;
  return card;
}

/** Build a `PlayerState` shell from the view's public resource counters. */
function basePlayerState(view: PlayerView, side: PlayerSide): PlayerState {
  const section = view[side] as PlayerView["corp"];
  // baseHandSize is always 5 in this engine; reconstruct the modifier so the
  // derived maximum hand size round-trips. Superconducting Hub's +2 is
  // recomputed by the engine from the score area, so subtract it here.
  const hubBonus =
    side === "corp" && view.corp.score.some((c) => c.cardId === "superconducting_hub") ? 2 : 0;
  return {
    side,
    identity: instanceOf(section.identity, section.identity.cardId as CardId),
    credits: section.credits,
    clicks: section.clicks,
    hand: [],
    deck: [],
    discard: [],
    score: section.score.map((c) => instanceOf(c, c.cardId as CardId)),
    installed: [],
    baseHandSize: 5,
    maxHandSizeMod: section.handSize - 5 - hubBonus,
    memoryLimitMod: 0,
    tags: section.tags,
    agendaPoints: section.agendaPoints,
    installedThisTurn: [...section.turnState.installedThisTurn],
    basicDrawThisTurn: section.turnState.basicDrawThisTurn,
    successfulRunThisTurn: section.turnState.successfulRunThisTurn,
    ranServersThisTurn: [...section.turnState.ranServersThisTurn],
    hqBreachesThisTurn: section.turnState.hqBreachesThisTurn,
    usedOncePerTurn: [...section.turnState.usedOncePerTurn],
    pendingRunFund: section.turnState.pendingRunFund,
  };
}

/** Reconstruct a Prompt from a non-owner's view stub (rules 10.2.2/1.21.3). */
function promptFromStub(stub: PromptStub): Prompt {
  switch (stub.kind) {
    case "mulligan":
      return { kind: "mulligan", id: stub.id, player: stub.player };
    case "discard":
      // The count is hidden from the non-owner; 0 is a safe placeholder (the
      // deciding player never has to answer someone else's prompt).
      return { kind: "discard", id: stub.id, player: stub.player, count: 0 };
    case "rez-window":
      // Rez windows are always the Corp's decision.
      return { kind: "rez-window", id: stub.id, player: "corp", options: [] };
    case "choose-one":
      return { kind: "choose-one", id: stub.id, player: stub.player, title: "", options: [] };
    case "access-decision":
      // Access decisions are always the Runner's (rule 7.5); the accessed card
      // id is hidden from the non-owner and never consulted by the deciding
      // player, who is always the Runner here.
      return { kind: "access-decision", id: stub.id, player: "runner", cardId: "" };
  }
}

/**
 * Build a hypothetical `GameState` consistent with `view`, filling every
 * hidden identity by sampling without replacement from `ctx` with `rng`.
 *
 * @throws if `ctx` does not carry exactly the hidden-card multiset the view
 * implies (an inconsistent context would silently corrupt the hypothesis).
 */
export function determinize(view: PlayerView, ctx: AIDecisionContext, rng: Rng): GameState {
  const viewer = view.viewer;
  const opponent = otherSide(viewer);
  if (ctx.side !== viewer) {
    throw new Error(
      `determinize: ctx.side (${ctx.side}) does not match view.viewer (${viewer})`,
    );
  }

  const corp = basePlayerState(view, "corp");
  const runner = basePlayerState(view, "runner");
  const players: Record<PlayerSide, PlayerState> = { corp, runner };

  // A card currently being accessed has a visible id AND identity (rule 7.2.1)
  // even when it sits in an otherwise-hidden zone; remember it so hidden
  // entries can be pinned rather than sampled.
  const accessed = view.breach?.accessing;
  const isHidden = (v: ViewCard): boolean => v.cardId === HIDDEN;
  const pinnedId = (v: ViewCard): CardId | undefined =>
    accessed && accessed.id === v.id ? (accessed.cardId as CardId) : undefined;

  const pool = new CardPool(ctx.unseen);

  // --- Orphan ids -----------------------------------------------------------
  // The event log, prompts and breach records name real instance ids the
  // viewer has legitimately seen. Every card the view lists keeps its id, but
  // ids can also point at cards in HIDDEN zones — the viewer's own deck (the
  // owner always sees their own deck cards' ids, rule 4.2.2 only hides the
  // order) and, during a multi-access breach, cards already accessed out of
  // the opponent's hand or deck. Those ids must exist in the hypothesis (with
  // a sampled identity) or the engine's id-based lookups diverge.
  const orphans = collectOrphans(view);
  const ownDeckPins = orphans.ownDeck; // ids → viewer's own deck
  const oppHandPins = accessed && accessed.owner === opponent && accessed.zone === "hand"
    ? [accessed.id, ...orphans.oppHand]
    : [...orphans.oppHand];
  const oppDeckPins = accessed && accessed.owner === opponent && accessed.zone === "deck"
    ? [accessed.id, ...orphans.oppDeck]
    : [...orphans.oppDeck];

  // --- Corp installs: rebuild servers, sampling hidden identities ----------
  // Constrained slots (ice must be ice, root must be asset/agenda/upgrade)
  // are filled FIRST so unconstrained draws cannot starve them of the right
  // definition types (rules 4.6.2, 4.6.6f).
  const servers = buildServers(view, pool, rng, pinnedId);

  // --- Visible zones and hidden discard entries ----------------------------
  for (const side of ["corp", "runner"] as PlayerSide[]) {
    const section = view[side] as PlayerView["corp"];
    players[side].hand = section.hand.map((c) => instanceOf(c, c.cardId as CardId));
    players[side].discard = section.discard.map((c) => {
      if (!isHidden(c)) return instanceOf(c, c.cardId as CardId);
      const pinned = pinnedId(c);
      const cardId = pinned ?? pool.draw(rng, (id) => cardDef(id).side === side, `${side} discard`);
      return instanceOf(c, cardId);
    });
    players[side].score = section.score.map((c) => instanceOf(c, c.cardId as CardId));
  }
  // Runner installed cards are always public (rule 4.6.8); Corp cards live in
  // the servers, rebuilt above.
  players.runner.installed = view.runner.installed.map((c) => instanceOf(c, c.cardId as CardId));

  // --- Own deck: known multiset, unknown order ------------------------------
  const ownDeckPool = new CardPool(ctx.ownDeck);
  const ownPinned = accessed && accessed.owner === viewer && accessed.zone === "deck"
    ? accessed
    : undefined;
  if (ownPinned) ownDeckPool.remove(ownPinned.cardId as CardId);
  const deckCount = (view[viewer] as PlayerView["corp"]).deckCount;
  assertSize(
    ctx.ownDeck.length,
    deckCount,
    "ctx.ownDeck",
    `own deck count (${viewer} deck)`,
  );
  const ownDeck: CardInstance[] = [];
  if (ownPinned) {
    ownDeck.push(hiddenInstance(ownPinned.id, ownPinned.cardId as CardId, viewer, "deck"));
  }
  // Orphan ids get real ids with identities sampled from the own-deck multiset.
  for (const id of ownDeckPins) {
    if (ownDeck.some((c) => c.id === id)) continue;
    ownDeck.push(
      hiddenInstance(id, ownDeckPool.draw(rng, () => true, "own deck pin"), viewer, "deck"),
    );
  }
  for (let i = ownDeck.length; i < deckCount; i++) {
    ownDeck.push(
      hiddenInstance(
        `${viewer}-deck-${i}`,
        ownDeckPool.draw(rng, () => true, "own deck"),
        viewer,
        "deck",
      ),
    );
  }
  // Deck order is hidden information (rules 4.2.2, 4.3.4); shuffle the
  // reconstructed order so nothing leaks a notion of "top".
  shuffleArray(rng, ownDeck);
  players[viewer].deck = ownDeck;

  // --- Opponent hand and deck: count-only zones -----------------------------
  const oppSection = view[opponent] as PlayerView["corp"];
  const oppHand: CardInstance[] = [];
  for (const id of oppHandPins) {
    if (oppHand.some((c) => c.id === id)) continue;
    if (accessed && accessed.id === id) {
      // The currently accessed card: identity is public (rule 7.2.1) and is
      // not part of the unseen multiset.
      oppHand.push(hiddenInstance(id, accessed.cardId as CardId, opponent, "hand"));
      continue;
    }
    oppHand.push(
      hiddenInstance(
        id,
        pool.draw(rng, (cid) => cardDef(cid).side === opponent, "opponent hand pin"),
        opponent,
        "hand",
      ),
    );
  }
  for (let i = oppHand.length; i < oppSection.handCount; i++) {
    oppHand.push(
      hiddenInstance(
        `${opponent}-hand-${i}`,
        pool.draw(rng, (id) => cardDef(id).side === opponent, "opponent hand"),
        opponent,
        "hand",
      ),
    );
  }
  players[opponent].hand = oppHand;

  const oppDeck: CardInstance[] = [];
  for (const id of oppDeckPins) {
    if (oppDeck.some((c) => c.id === id)) continue;
    if (accessed && accessed.id === id) {
      oppDeck.push(hiddenInstance(id, accessed.cardId as CardId, opponent, "deck"));
      continue;
    }
    oppDeck.push(
      hiddenInstance(
        id,
        pool.draw(rng, (cid) => cardDef(cid).side === opponent, "opponent deck pin"),
        opponent,
        "deck",
      ),
    );
  }
  for (let i = oppDeck.length; i < oppSection.deckCount; i++) {
    oppDeck.push(
      hiddenInstance(
        `${opponent}-deck-${i}`,
        pool.draw(rng, (id) => cardDef(id).side === opponent, "opponent deck"),
        opponent,
        "deck",
      ),
    );
  }
  shuffleArray(rng, oppDeck);
  players[opponent].deck = oppDeck;

  // --- Decided facts --------------------------------------------------------
  const prompts: Prompt[] = view.prompts.map((p) =>
    p.player === viewer ? (p as Prompt) : promptFromStub(p as PromptStub)
  );
  const nextPromptId = prompts.reduce((max, p) => Math.max(max, p.id), 0) + 1;

  const run = view.run
    ? {
      server: view.run.server,
      position: view.run.position,
      phase: view.run.phase,
      currentIceId: view.run.currentIce?.id,
      broken: [...view.run.broken],
      resolved: [...view.run.resolved],
      successful: view.run.phase === "success",
      unsuccessful: false,
      jackOutOffered: false,
      source: view.run.source,
      fundCredits: view.run.fundCredits,
      rezCostIncrease: view.run.rezCostIncrease,
      tollPaid: view.run.tollPaid,
      encounterStarted: view.run.phase === "encounter-ice",
    }
    : null;

  const breach = view.breach
    ? {
      server: view.breach.server,
      randomAccessLimit: view.breach.randomAccessLimit,
      randomAccessesUsed: view.breach.randomAccessLimit - view.breach.remaining,
      chosen: [...view.breach.chosen],
      accessing: view.breach.accessing?.id,
    }
    : null;

  const skeleton: GameState = {
    nextPromptId,
    turn: { ...view.turn },
    corp,
    runner,
    servers,
    run,
    breach,
    prompts,
    // The log is output-only; restore the view's redacted events. The engine
    // never reads the log for logic, and re-redacting is idempotent.
    log: view.events.map((e) => ({ ...e }) as GameEvent),
    rngState: rng.state,
    drawMode: "random",
    agendaPointTarget: view.agendaPointTarget,
    winner: view.winner,
    winReason: view.winReason,
    mode: view.mode,
    supportWarnings: [...view.warnings],
  };

  // Structural isolation from the view: hand back a clone the AI may mutate.
  return fastCloneState(skeleton);
}

/**
 * Instance ids the view references (events, prompts, breach records) that no
 * view card entry carries. A visible-but-unlisted id can only belong to a
 * hidden deck zone: the viewer's own deck (its owner always sees its cards'
 * ids — only the ORDER is hidden, rules 4.2.2/4.3.4) or, during a multi-access
 * breach, a card already accessed out of the opponent's hand or deck. These
 * ids are pinned into the hypothesis with sampled identities so id-based
 * lookups (`cardVisibleTo`, chosen-candidate filtering) keep working.
 */
function collectOrphans(view: PlayerView): {
  ownDeck: CardInstanceId[];
  oppHand: CardInstanceId[];
  oppDeck: CardInstanceId[];
} {
  const listed = new Set<CardInstanceId>();
  for (const section of [view.corp, view.runner]) {
    for (
      const v of [
        section.identity,
        ...section.score,
        ...section.hand,
        ...section.discard,
        ...section.installed,
      ]
    ) {
      listed.add(v.id);
    }
  }
  if (view.run?.currentIce) listed.add(view.run.currentIce.id);
  if (view.breach?.accessing) listed.add(view.breach.accessing.id);

  const referenced = new Set<CardInstanceId>();
  for (const event of view.events) {
    for (const id of eventCardIds(event)) referenced.add(id);
  }
  for (const prompt of view.prompts) {
    for (const id of promptCardIds(prompt)) referenced.add(id);
  }
  for (const id of view.breach?.chosen ?? []) referenced.add(id);
  if (view.breach?.accessing) referenced.add(view.breach.accessing.id);

  const breach = view.breach;
  const breachRefs = new Set<CardInstanceId>([
    ...(breach?.chosen ?? []),
    ...(breach?.accessing ? [breach.accessing.id] : []),
  ]);
  const orphans = [...referenced].filter((id) =>
    typeof id === "string" && id !== HIDDEN && !listed.has(id)
  );

  const ownDeck: CardInstanceId[] = [];
  const oppHand: CardInstanceId[] = [];
  const oppDeck: CardInstanceId[] = [];
  for (const id of orphans) {
    if (breachRefs.has(id) && breach) {
      // Breach targets are Corp cards; the zone follows the breached server.
      if (breach.server === "hq") oppHand.push(id);
      else if (breach.server === "rd") breachViewerDeck(view, id, ownDeck, oppDeck);
      // archives/remote targets are always listed (real discard/install ids).
      continue;
    }
    // Everything else the viewer can see but the view does not list is the
    // viewer's own deck.
    ownDeck.push(id);
  }
  return { ownDeck, oppHand, oppDeck };
}

/** Breach orphans on R&D: the corp's deck — the viewer's own or the opponent's. */
function breachViewerDeck(
  view: PlayerView,
  _id: CardInstanceId,
  ownDeck: CardInstanceId[],
  oppDeck: CardInstanceId[],
): void {
  if (view.viewer === "corp") ownDeck.push(_id);
  else oppDeck.push(_id);
}

/** Card ids an event references, as the viewer may see them. */
function eventCardIds(event: GameEvent): CardInstanceId[] {
  switch (event.type) {
    case "load-credits":
    case "take-credits":
      return [event.targetId];
    case "damage":
      return [...event.trashed];
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
      return [event.cardId];
    default:
      return [];
  }
}

/** Card ids a prompt option references (only the owner's prompts carry them). */
function promptCardIds(prompt: Prompt | PromptStub): CardInstanceId[] {
  const ids: CardInstanceId[] = [];
  // A non-owner stub has no cardId field at all.
  if (prompt.kind === "access-decision" && "cardId" in prompt) ids.push(prompt.cardId);
  if ("options" in prompt) {
    for (const option of prompt.options) {
      if (option.targetId !== undefined) ids.push(option.targetId);
      if (option.effect?.kind === "rez-card-free" && option.effect.targetId !== undefined) {
        ids.push(option.effect.targetId);
      }
      if (option.effect?.kind === "corp-install-ice-inward") {
        if (option.effect.iceId !== undefined) ids.push(option.effect.iceId);
        if (option.effect.targetId !== undefined) ids.push(option.effect.targetId);
      }
    }
  }
  return ids;
}

/** Rebuild the corp's servers from the flat `view.corp.installed` list. */ function buildServers(
  view: PlayerView,
  pool: CardPool,
  rng: Rng,
  pinnedId: (v: ViewCard) => CardId | undefined,
): ServerState[] {
  // Centrals always exist; remotes appear only if something is installed.
  const order: ServerId[] = ["hq", "rd", "archives"];
  const servers = new Map<ServerId, ServerState>();
  for (const id of order) servers.set(id, { id, root: [], ice: [] });
  const ensure = (id: ServerId): ServerState => {
    let s = servers.get(id);
    if (!s) {
      s = { id, root: [], ice: [] };
      servers.set(id, s);
      order.push(id);
    }
    return s;
  };

  for (const v of view.corp.installed) {
    const server = ensure(v.server ?? "hq");
    let cardId: CardId;
    if (v.cardId !== HIDDEN) {
      cardId = v.cardId;
    } else {
      const pinned = pinnedId(v);
      cardId = pinned ??
        (v.position === "ice"
          ? pool.draw(rng, (id) => isIce(cardDef(id)), `an unrezzed ice (${v.id})`)
          : pool.draw(
            rng,
            // Rule 4.6.6f: a server root holds only assets, agendas and
            // upgrades (operations/events can never be installed there).
            (id) => {
              const type = cardDef(id).type;
              return type === "asset" || type === "agenda" || type === "upgrade";
            },
            `an unrezzed server-root card (${v.id})`,
          ));
    }
    const card = instanceOf(v, cardId);
    if (v.position === "ice") server.ice.push(card);
    else server.root.push(card);
  }

  return order.map((id) => servers.get(id)!);
}

/** In-place Fisher-Yates shuffle driven by `rng`. */
function shuffleArray<T>(rng: Rng, list: T[]): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
  }
}

/** Assert a reconstructed count matches the view, with a descriptive error. */
function assertSize(actual: number, expected: number, what: string, expectedDesc: string): void {
  if (actual !== expected) {
    throw new Error(
      `determinize: ${what} has ${actual} cards but the view's ${expectedDesc} is ${expected}; ` +
        `AIDecisionContext is inconsistent with the view`,
    );
  }
}
