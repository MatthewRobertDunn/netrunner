/**
 * State helpers: card lookup, zone movement, credits, damage, and trashing.
 *
 * These helpers mutate the state object they are given. `applyMove` only ever
 * passes a *copy* of the state, guaranteeing that a rejected move never
 * partially mutates the caller's state.
 */

import { cardDef, isIce } from "../cards/catalogue.ts";
import { behaviors } from "../cards/effects.ts";
import { rngInt } from "./rng.ts";
import type {
  CardInstance,
  GameState,
  PlayerSide,
  PlayerState,
  ServerId,
  ServerState,
} from "../types.ts";

export function player(state: GameState, side: PlayerSide): PlayerState {
  return side === "corp" ? state.corp : state.runner;
}

export function other(side: PlayerSide): PlayerSide {
  return side === "corp" ? "runner" : "corp";
}

const CENTRAL_IDS: ServerId[] = ["hq", "rd", "archives"];

export function isCentral(id: ServerId): boolean {
  return CENTRAL_IDS.includes(id);
}

export function serverById(state: GameState, id: ServerId): ServerState {
  return state.servers.find((s) => s.id === id)!;
}

export function serverExists(state: GameState, id: ServerId): boolean {
  return state.servers.some((s) => s.id === id);
}

/** All servers currently able to be run on (central + existing remotes). */
export function allServers(state: GameState): ServerId[] {
  return state.servers.map((s) => s.id);
}

export function nextRemoteId(state: GameState): ServerId {
  let n = 1;
  const ids = new Set(state.servers.map((s) => s.id));
  while (ids.has(`remote-${n}`)) n++;
  return `remote-${n}`;
}

export function createRemote(state: GameState): ServerState {
  const server: ServerState = { id: nextRemoteId(state), root: [], ice: [] };
  state.servers.push(server);
  return server;
}

/**
 * The next card a player would draw. In the real game that's the top of the
 * deck (hidden information, rules 10.2.2, 4.3.4). In an AI simulation with
 * `drawMode: "random"` it's a uniformly random card from the remaining deck,
 * so the search can't plan around a specific draw order.
 */
export function nextDeckCard(state: GameState, side: PlayerSide): CardInstance | null {
  const p = player(state, side);
  if (p.deck.length === 0) return null;
  const idx = state.drawMode === "random" ? rngInt(state, p.deck.length) : 0;
  return p.deck[idx]!;
}

/**
 * Checkpoint cleanup (rules 4.6.8d/e, 8.5.8, 10.3.1h): a remote server with
 * no cards in its root and no ice protecting it ceases to exist. Centrals
 * are permanent (rule 4.6.7a).
 * Returns the ids of the servers that were removed.
 */
export function pruneEmptyRemotes(state: GameState): ServerId[] {
  const gone: ServerId[] = [];
  state.servers = state.servers.filter((s) => {
    if (isCentral(s.id) || s.root.length > 0 || s.ice.length > 0) return true;
    gone.push(s.id);
    return false;
  });
  return gone;
}

export function findCard(
  state: GameState,
  instanceId: string,
): { card: CardInstance; side: PlayerSide } | null {
  for (const side of ["corp", "runner"] as PlayerSide[]) {
    const p = player(state, side);
    if (p.identity.id === instanceId) return { card: p.identity, side };
    for (const list of [p.hand, p.deck, p.discard, p.score, p.installed]) {
      const c = list.find((x) => x.id === instanceId);
      if (c) return { card: c, side };
    }
  }
  for (const s of state.servers) {
    const c = [...s.root, ...s.ice].find((x) => x.id === instanceId);
    if (c) return { card: c, side: "corp" };
  }
  return null;
}

/** All Corp cards installed in servers (root cards and ice). */
export function corpInstalled(state: GameState): CardInstance[] {
  return state.servers.flatMap((s) => [...s.root, ...s.ice]);
}

/**
 * Whether a card instance's identity is open information for `viewer`
 * (rules 10.2.2/10.2.3, 1.21, 4.6.2/4.6.3): cards the viewer owns, rezzed Corp
 * cards, scored agendas, identity cards, and the card currently being accessed
 * during a breach. Everything else — facedown Corp installs, the opponent's
 * hand, deck, and discard pile — stays hidden. A discard only becomes known
 * when its cards are actually accessed.
 */
export function cardVisibleTo(
  state: GameState,
  instanceId: string,
  viewer: PlayerSide,
): boolean {
  const found = findCard(state, instanceId);
  if (!found) return false; // unknown id → don't leak a title
  const card = found.card;
  if (card.owner === viewer) return true;
  if (card.cardId === viewer) return true; // identity card
  // Scored agendas are open information (rule 10.2.3).
  if (card.zone === "score") return true;
  // Rezzed Corp cards are public; unrezzed ones are secret (rules 1.21.1a, 4.6.3).
  if (card.rezzed === true) return true;
  // The card currently being accessed is visible to the Runner (rule 7.2.1).
  for (const p of state.prompts) {
    if (p.kind === "access-decision" && p.cardId === instanceId) return true;
  }
  if (state.breach?.accessing === instanceId) return true;
  return false;
}

export function installedCard(
  state: GameState,
  side: PlayerSide,
  instanceId: string,
): CardInstance | null {
  if (side === "corp") return corpInstalled(state).find((c) => c.id === instanceId) ?? null;
  return state.runner.installed.find((c) => c.id === instanceId) ?? null;
}

/** Draw `count` cards from the top of the player's deck. Returns drawn count. */
export function drawCards(state: GameState, side: PlayerSide, count: number): number {
  const p = player(state, side);
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    if (p.deck.length === 0) break;
    const idx = state.drawMode === "random" ? rngInt(state, p.deck.length) : 0;
    const card = p.deck.splice(idx, 1)[0]!;
    card.zone = "hand";
    p.hand.push(card);
    drawn++;
  }
  if (drawn > 0) state.log.push({ type: "draw", player: side, count: drawn });
  return drawn;
}

// ---------------------------------------------------------------------------
// Credits and clicks
// ---------------------------------------------------------------------------

/** Credits available to the player now (during a run includes the run fund). */
export function availableCredits(state: GameState, side: PlayerSide): number {
  const p = player(state, side);
  if (side === "runner" && state.run?.fundCredits) return p.credits + state.run.fundCredits;
  return p.credits;
}

/** Spend credits, consuming the run fund (Overclock) first. */
export function spendCredits(state: GameState, side: PlayerSide, amount: number): void {
  const p = player(state, side);
  let left = amount;
  if (side === "runner" && state.run?.fundCredits) {
    const fromFund = Math.min(left, state.run.fundCredits);
    state.run.fundCredits -= fromFund;
    left -= fromFund;
  }
  p.credits = Math.max(0, p.credits - left);
  state.log.push({ type: "spend-credits", player: side, amount });
}

export function gainCredits(state: GameState, side: PlayerSide, amount: number): void {
  player(state, side).credits += amount;
  state.log.push({ type: "gain-credits", player: side, amount });
}

export function loseCredits(state: GameState, side: PlayerSide, amount: number): number {
  const p = player(state, side);
  const lost = Math.min(p.credits, amount);
  p.credits -= lost;
  if (lost > 0) state.log.push({ type: "lose-credits", player: side, amount: lost });
  return lost;
}

export function spendClicks(state: GameState, side: PlayerSide, amount: number): number {
  const p = player(state, side);
  const spent = Math.min(p.clicks, amount);
  p.clicks -= spent;
  if (spent > 0) state.log.push({ type: "spend-clicks", player: side, amount: spent });
  return spent;
}

// ---------------------------------------------------------------------------
// Zone movement
// ---------------------------------------------------------------------------

function detachFromPlayer(p: PlayerState, card: CardInstance): void {
  if (p.identity.id === card.id) return;
  for (const list of [p.hand, p.deck, p.discard, p.score, p.installed]) {
    const i = list.findIndex((c) => c.id === card.id);
    if (i >= 0) list.splice(i, 1);
  }
}

export function moveCardTo(
  state: GameState,
  card: CardInstance,
  zone: "hand" | "deck" | "discard" | "score" | "play-area",
  side: PlayerSide,
  opts: { topOfDeck?: boolean; bottomOfDiscard?: boolean; server?: ServerId; iceIndex?: number } =
    {},
): void {
  const from = findCard(state, card.id);
  if (from) detachFromPlayer(player(state, from.side), card);
  for (const s of state.servers) {
    const i = s.root.findIndex((c) => c.id === card.id);
    if (i >= 0) s.root.splice(i, 1);
    const j = s.ice.findIndex((c) => c.id === card.id);
    if (j >= 0) s.ice.splice(j, 1);
  }
  card.zone = zone;
  if (zone !== "play-area") card.server = undefined;
  card.iceIndex = undefined;
  const p = player(state, side);
  switch (zone) {
    case "hand":
      p.hand.push(card);
      break;
    case "deck":
      if (opts.topOfDeck) p.deck.unshift(card);
      else p.deck.push(card);
      break;
    case "discard":
      // TODO(rules 4.4.6b–c, 7.3.2): facedown/faceup Archives is a known
      // unmodelled gap. Cards in Archives can be either faceup or facedown
      // depending on their visibility when trashed, and breaching Archives
      // turns facedown cards faceup before access. This engine keeps the
      // discard pile unordered and unmarked, so no faceup/facedown split is
      // tracked here yet.
      p.discard.unshift(card); // most recent first
      break;
    case "score":
      p.score.push(card);
      card.advancement = 0;
      break;
    case "play-area":
      // Runner cards live in runner.installed; Corp cards live in the
      // server's root (installCorpCard pushes ice directly into server.ice).
      p.installed.push(card);
      if (opts.server) card.server = opts.server;
      break;
  }
}

/** Move a card to its owner's discard pile (trash or discard). */
export function toDiscard(state: GameState, card: CardInstance, reason: string): void {
  moveCardTo(state, card, "discard", card.owner);
  state.log.push({ type: "trash", cardId: card.id, from: reason });
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

/**
 * Deal net/meat damage to the Runner: randomly trash that many cards from grip.
 * If damage exceeds grip size, the Runner is flatlined. Returns trashed ids.
 */
export function dealDamage(
  state: GameState,
  amount: number,
  kind: "net" | "meat" | "core" = "net",
  rng: () => number,
): string[] {
  if (amount <= 0) return [];
  const rp = state.runner;
  if (amount > rp.hand.length) {
    const trashed = [...rp.hand];
    for (const c of trashed) moveCardTo(state, c, "discard", "runner");
    state.log.push({
      type: "damage",
      player: "runner",
      amount,
      kind,
      trashed: trashed.map((c) => c.id),
    });
    state.log.push({ type: "flatline" });
    setWinner(state, "corp", "Runner was flatlined by damage");
    return trashed.map((c) => c.id);
  }
  const trashed: CardInstance[] = [];
  let left = amount;
  while (left > 0 && rp.hand.length > 0) {
    const idx = Math.floor(rng() * rp.hand.length);
    trashed.push(...rp.hand.splice(idx, 1));
    left--;
  }
  for (const c of trashed) {
    c.zone = "discard";
    rp.discard.unshift(c);
  }
  state.log.push({
    type: "damage",
    player: "runner",
    amount,
    kind,
    trashed: trashed.map((c) => c.id),
  });
  return trashed.map((c) => c.id);
}

export function setWinner(state: GameState, winner: PlayerSide | "draw", reason: string): void {
  if (state.winner) return;
  state.winner = winner;
  state.winReason = reason;
  state.turn.phase = "game-over";
  state.log.push({ type: "game-end", winner, reason });
}

// ---------------------------------------------------------------------------
// Strength, memory, counters
// ---------------------------------------------------------------------------

export function baseStrength(card: CardInstance): number {
  return cardDef(card.cardId).strength ?? 0;
}

/** Current strength of ice or an icebreaker (printed + temporary pump). */
export function currentStrength(_state: GameState, card: CardInstance): number {
  if (card.cardId === "palisade" && (card.server?.startsWith("remote") ?? false)) {
    return baseStrength(card) + 2 + (card.strengthBoost ?? 0);
  }
  return baseStrength(card) + (card.strengthBoost ?? 0);
}

/**
 * Expire every temporary strength pump on the Runner's installed programs.
 *
 * Rule 3.9.5b: a paid ability that modifies an icebreaker's strength has an
 * implicit duration of "for the remainder of the current encounter"; one used
 * outside an encounter expires at the next checkpoint (rule 3.9.5d). So pumps
 * are cleared when an encounter ends and again when the run ends, and no boost
 * can outlive the run that created it. `strengthBoost` is the only pump field
 * (its sole writer is `pumpIcebreaker` in apply.ts) and every consumer reads it
 * with `?? 0`, so clearing it to `undefined` restores printed strength.
 *
 * Unity is unaffected by design: its "+X = installed icebreakers" strength is a
 * static ability recomputed on the fly in legal-moves.ts `currentIceStrength`
 * and is never stored in `strengthBoost` (`pumpIcebreaker` refuses to pump
 * Unity), so this sweep cannot clobber it.
 */
export function expireIcebreakerPumps(state: GameState): void {
  for (const card of state.runner.installed) {
    if (card.strengthBoost !== undefined) card.strengthBoost = undefined;
  }
}

export function memoryUsed(state: GameState): number {
  let used = 0;
  for (const c of state.runner.installed) used += cardDef(c.cardId).memoryCost ?? 0;
  return used;
}

export function memoryLimit(state: GameState): number {
  let limit = 4; // default starting memory limit (rule 1.20.2)
  limit += state.runner.memoryLimitMod;
  for (const c of state.runner.installed) {
    const b = behaviors.get(c.cardId);
    if (b?.triggers?.some((t) => t.kind === "console" && t.amount === 1)) limit += 1;
  }
  return limit;
}

export function isIcebreaker(card: CardInstance): boolean {
  const def = cardDef(card.cardId);
  return def.type === "program" && def.subtypes.includes("icebreaker");
}

export function isRezzedIce(card: CardInstance): boolean {
  return isIce(cardDef(card.cardId)) && card.rezzed === true;
}

export function addHostedCredits(state: GameState, card: CardInstance, amount: number): void {
  card.hostedCredits = (card.hostedCredits ?? 0) + amount;
  state.log.push({ type: "load-credits", targetId: card.id, amount });
}

/** Take credits off a card. Returns the amount taken. */
export function takeCreditsFrom(state: GameState, card: CardInstance, amount: number): number {
  const have = card.hostedCredits ?? 0;
  const taken = Math.min(have, amount);
  card.hostedCredits = have - taken;
  state.log.push({ type: "take-credits", targetId: card.id, amount: taken, player: card.owner });
  return taken;
}

/** Add an advancement counter. */
export function addAdvancement(state: GameState, card: CardInstance, amount = 1): void {
  card.advancement = (card.advancement ?? 0) + amount;
  state.log.push({ type: "advance", cardId: card.id, amount });
}

/** Total credits available on installed Corp cards with hosted credits. */
export function hostedCreditsOf(state: GameState, side: PlayerSide): number {
  const p = player(state, side);
  let total = 0;
  for (const c of p.installed) total += c.hostedCredits ?? 0;
  if (side === "corp") { for (const c of corpInstalled(state)) total += c.hostedCredits ?? 0; }
  return total;
}
