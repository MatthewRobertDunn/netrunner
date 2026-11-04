/**
 * Archives breach view model (rules 7.3.2-7.3.4, 7.4.1d).
 *
 * A successful run on Archives accesses EVERY card in the discard pile — the
 * Runner picks candidates one at a time until none remain, and an accessed
 * agenda is stolen automatically (rule 7.1.6). This module derives the ordered
 * card list the breach dialog renders, shared by the component (display) and
 * the app root's advance loop (`nextArchivesCandidate`), so "left to right" on
 * screen is exactly the order the bulk action accesses in.
 *
 * Ordering: unaccessed candidates first — agendas leftmost (stealing them is
 * why the Runner is here, rule 7.1.6) — then already-chosen cards in access
 * order, each badged accessed/stolen. Stolen agendas stay visible in place:
 * they move to the Runner's score area, which `findCardIn` still resolves.
 *
 * Pure functions of the authoritative state: no sampling, no mutation.
 */

import { cardDef } from "../../cards/catalogue.ts";
import { findCardIn } from "./util.ts";
import type { CardInstance, GameState, Move, PlayerSide } from "../../types.ts";

/** Where a breach card stands in the dialog. */
export type ArchivesBreachCardState =
  | "remaining" // clickable: not chosen yet
  | "accessing" // chosen, its (forced) finish decision is pending
  | "accessed" // access resolved
  | "stolen"; // accessed and it was an agenda — moved to the score area

export interface ArchivesBreachEntry {
  /** The card at its CURRENT location (stolen agendas live in the score area). */
  card: CardInstance;
  /** Printed title, for accessible labels (the data-* attributes are the
   *  agent contract; this is what a name-based snapshot announces). */
  title: string;
  state: ArchivesBreachCardState;
  /** Agenda points for a stolen agenda (0 otherwise). */
  agendaPoints: number;
}

/** Whether the human Runner is mid-breach of Archives (the dialog's domain). */
export function archivesBreachActive(state: GameState): boolean {
  return state.breach?.server === "archives";
}

/**
 * The dialog's card list: remaining candidates (agendas first, then discard
 * order) followed by chosen cards in access order.
 *
 * Candidates mirror the engine's `candidatesForBreach` for archives: every
 * unchosen discard-pile card (rule 7.4.1d) plus the breached server's root
 * cards (rule 7.4.1a — an upgrade installed in the Archives root is one too).
 */
export function archivesBreachEntries(state: GameState): ArchivesBreachEntry[] {
  const breach = state.breach;
  if (!breach || breach.server !== "archives") return [];
  const chosen = new Set(breach.chosen);

  const candidates: CardInstance[] = [
    ...state.corp.discard,
    ...(state.servers.find((s) => s.id === "archives")?.root ?? []),
  ].filter((c) => !chosen.has(c.id));
  // Agenda-first, stable within each group (sort is stable per spec).
  candidates.sort(
    (a, b) =>
      Number(cardDef(b.cardId).type === "agenda") -
      Number(cardDef(a.cardId).type === "agenda"),
  );

  const entries: ArchivesBreachEntry[] = candidates.map((card) => ({
    card,
    title: cardDef(card.cardId).title,
    state: "remaining" as const,
    agendaPoints: 0,
  }));
  for (const id of breach.chosen) {
    const card = findCardIn(state, id);
    if (!card) continue; // defensive: a chosen card always stays findable
    const stolen = state.runner.score.some((c) => c.id === id);
    entries.push({
      card,
      title: cardDef(card.cardId).title,
      state: breach.accessing === id ? "accessing" : stolen ? "stolen" : "accessed",
      agendaPoints: stolen ? (cardDef(card.cardId).agendaPoints ?? 0) : 0,
    });
  }
  return entries;
}

/**
 * The next candidate for the bulk "Access remaining" action: the leftmost
 * remaining entry (agenda-first order, matching the display). Null when
 * nothing is left — the next settle pass then ends the breach.
 */
export function nextArchivesCandidate(state: GameState): string | null {
  for (const entry of archivesBreachEntries(state)) {
    if (entry.state === "remaining") return entry.card.id;
  }
  return null;
}

export type ArchivesAdvanceIntent =
  | { type: "card"; instanceId: string }
  | { type: "remaining" };

/**
 * The Archives breach driver: the dialog's two gestures funnel here. "Access
 * this card" applies the accessCard move, then answers the forced finish
 * decision the settle loop parks on — rule 7.1.5b removed the trash option
 * for cards already in Archives, so that decision has no real choice.
 * "Access remaining" sweeps the rest left-to-right (agenda-first order,
 * `nextArchivesCandidate`).
 *
 * A decision the gesture did NOT request is never answered silently: when the
 * engine auto-chooses the last remaining candidate (`stepBreach`'s
 * one-candidate shortcut), the loop stops and the dialog shows that card as
 * "Accessing…" with a Finish button — the final card, possibly a stolen
 * agenda, is always seen. The loop also stops at any other prompt (the Corp
 * AI answers its own through the caller's apply → planAiTurn chain), a wedged
 * apply, the guard cap, or the breach ending.
 *
 * Parametrized over a `getState`/`apply` context so the app root passes its
 * reactive shell and tests can drive the real loop against the real engine.
 */
export function advanceArchives(
  intent: ArchivesAdvanceIntent,
  ctx: {
    getState(): GameState | null;
    apply(actor: PlayerSide, move: Move): void;
    humanSide: PlayerSide;
  },
): void {
  const inBreach = (s: GameState | null): s is GameState =>
    Boolean(s && !s.winner && s.breach && s.breach.server === "archives");
  let requestedId: string | null = null;
  if (intent.type === "card") {
    const s = ctx.getState();
    if (!inBreach(s)) return;
    ctx.apply(ctx.humanSide, { kind: "accessCard", targetId: intent.instanceId });
    requestedId = intent.instanceId;
  }
  let guard = 0;
  while (guard++ < 200) {
    const s = ctx.getState();
    if (!inBreach(s)) break;
    const prompt = s!.prompts[0];
    if (prompt) {
      if (prompt.player !== "runner" || prompt.kind !== "access-decision") break;
      if (intent.type === "card" && prompt.cardId !== requestedId) break;
      const before = ctx.getState();
      ctx.apply(ctx.humanSide, { kind: "finishAccess" });
      if (ctx.getState() === before) break; // illegal/no-op — do not spin
      continue;
    }
    if (intent.type === "card") break; // a single click resolves one card
    const next = nextArchivesCandidate(s!);
    if (!next) break; // nothing left; the next settle pass ends the breach
    const before = ctx.getState();
    ctx.apply(ctx.humanSide, { kind: "accessCard", targetId: next });
    if (ctx.getState() === before) break;
  }
}
