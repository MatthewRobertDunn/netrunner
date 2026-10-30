/**
 * UI-side helpers for the Netrunner web front end.
 *
 * These read the authoritative engine state for the *human* player's own
 * information (their hand, the cards they are accessing) and use the public
 * status DTO for everything else. The engine state lives in the same browser
 * as the UI, so reading the viewer's own hand is equivalent to the human
 * looking at their cards.
 */

import type { CardDef } from "../../cards/catalogue.ts";
import { tryCardDef } from "../../cards/catalogue.ts";
import type {
  CardId,
  CardInstance,
  CardInstanceId,
  GameEvent,
  GameState,
  Move,
  PlayerSide,
  Prompt,
} from "../../types.ts";

/** The player who may act right now (prompted player, else turn player). */
export function actorOf(state: GameState): PlayerSide {
  const prompt = state.prompts[0];
  if (prompt) return prompt.player;
  return state.turn.player;
}

export function handOf(state: GameState, side: PlayerSide): CardInstance[] {
  return side === "corp" ? state.corp.hand : state.runner.hand;
}

export function findCardIn(state: GameState, id: CardInstanceId): CardInstance | null {
  const sides: PlayerSide[] = ["corp", "runner"];
  for (const side of sides) {
    const p = side === "corp" ? state.corp : state.runner;
    const lists = [p.hand, p.deck, p.discard, p.installed, p.score, [p.identity]];
    for (const list of lists) {
      for (const c of list) if (c.id === id) return c;
    }
  }
  for (const s of state.servers) {
    for (const c of [...s.root, ...s.ice]) if (c.id === id) return c;
  }
  return null;
}

export function cardTitle(cardId: CardId | string): string {
  return tryCardDef(cardId as CardId)?.title ?? String(cardId);
}

export function cardOf(cardId: CardId | string): CardDef | null {
  return tryCardDef(cardId as CardId) ?? null;
}

export function imageFor(cardId: CardId | string): string | null {
  return cardOf(cardId) ? `images/${String(cardId)}.webp` : null;
}

/** Card text with the catalogue's markup tags (<strong>, <em>, …) stripped. */
export function plainCardText(cardId: CardId | string): string {
  const def = cardOf(cardId);
  return def ? def.text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
}

export function serverLabel(server: string): string {
  switch (server) {
    case "hq":
      return "HQ";
    case "rd":
      return "R&D";
    case "archives":
      return "Archives";
    case "new-remote":
      return "new remote";
    default:
      return server;
  }
}

/** One line of log text for a game event, as seen by `viewer`. */
export function formatEvent(
  state: GameState,
  e: GameEvent,
  viewer: PlayerSide,
): string {
  const side = (p: PlayerSide) => (p === "corp" ? "Corp" : "Runner");
  // A card id is visible to the viewer when it is rezzed, owned by the
  // viewer, or currently being accessed by the Runner. Everything else
  // (facedown Corp installs, the opponent's hand/deck/discard) is hidden.
  const visible = (id: CardInstanceId) =>
    cardVisibleTo(state, id, viewer) ? cardTitle(cardIdOfInstance(state, id)) : "a card";
  switch (e.type) {
    case "game-started":
      return "Game started";
    case "mulligan":
      return `${side(e.player)} ${e.taken ? "took a mulligan" : "kept their hand"}`;
    case "turn-start":
      return `— Turn ${e.turn}: ${side(e.player)} —`;
    case "turn-end":
      return `${side(e.player)} ends turn ${e.turn}`;
    case "mandatory-draw":
      return `${side(e.player)} mandatory draw`;
    case "draw":
      return `${side(e.player)} draws ${e.count}`;
    case "gain-credits":
      return `${side(e.player)} gains ${e.amount} [credit]`;
    case "lose-credits":
      return `${side(e.player)} loses ${e.amount} [credit]`;
    case "spend-credits":
      return `${side(e.player)} spends ${e.amount} [credit]`;
    case "spend-clicks":
      return `${side(e.player)} spends ${e.amount} [click]`;
    case "gain-clicks":
      return `${side(e.player)} gains ${e.amount} [click]`;
    case "lose-clicks":
      return `${side(e.player)} loses ${e.amount} [click]`;
    case "load-credits":
      return `Loads ${e.amount} [credit] on ${visible(e.targetId)}`;
    case "take-credits":
      return `${side(e.player)} takes ${e.amount} [credit] from ${visible(e.targetId)}`;
    case "install": {
      const where = e.server ? ` in ${serverLabel(e.server)}` : "";
      return `${side(e.player)} installs ${visible(e.cardId)}${where}`;
    }
    case "play":
      return `${side(e.player)} plays ${visible(e.cardId)}`;
    case "rez":
      return `Corp rezzes ${visible(e.cardId)}`;
    case "derez":
      return `Corp derezzes ${visible(e.cardId)}`;
    case "access":
      return `Runner accesses ${visible(e.cardId)} in ${serverLabel(e.server)}`;
    case "trash": {
      const who = e.from === "access" ? "The Runner" : "Corp";
      return `${who} trashes ${visible(e.cardId)} from ${e.from}`;
    }
    case "run-start":
      return `Runner runs ${serverLabel(e.server)}`;
    case "approach-ice":
      return `Runner approaches ${visible(e.cardId)}`;
    case "encounter-ice":
      return `Runner encounters ${visible(e.cardId)}`;
    case "break-subroutine":
      return `Runner breaks a subroutine on ${visible(e.cardId)}`;
    case "resolve-subroutine":
      return `${visible(e.cardId)} resolves a subroutine`;
    case "pass-ice":
      return `Runner passes ${visible(e.cardId)}`;
    case "jack-out":
      return "Runner jacks out";
    case "run-successful":
      return `Run on ${serverLabel(e.server)} is successful`;
    case "run-unsuccessful":
      return `Run on ${serverLabel(e.server)} is unsuccessful`;
    case "run-end":
      return `Run on ${serverLabel(e.server)} ends`;
    case "breach":
      return `Runner breaches ${serverLabel(e.server)}`;
    case "damage": {
      // Damage trashes from the Runner's grip are secret — the Corp never
      // learns which cards were hit (rule 4.2). The card ids are still in the
      // event for engine use, but the log must not name them.
      const cards = e.trashed.length
        ? ` (trashes ${e.trashed.length} card${e.trashed.length > 1 ? "s" : ""})`
        : "";
      return `${side(e.player)} takes ${e.amount} ${e.kind} damage${cards}`;
    }
    case "flatline":
      return "Runner is flatlined";
    case "decked":
      return `${side(e.player)} is decked`;
    case "discard":
      return `${side(e.player)} discards ${visible(e.cardId)}`;
    case "advance":
      return `Corp advances ${visible(e.cardId)} (${e.amount} counter(s))`;
    case "score":
      return `Corp scores ${visible(e.cardId)} (${e.points} agenda point(s))`;
    default:
      return e.type;
  }
}

function cardIdOfInstance(state: GameState, id: CardInstanceId): string {
  const card = findCardIn(state, id);
  return card ? card.cardId : String(id);
}

/**
 * Whether the card instance's identity is public knowledge for `viewer`
 * (rules 10.2.2/10.2.3, 1.21, 4.6.2/4.6.3): rezzed Corp cards, cards the viewer
 * owns, scored agendas, the identity card, and the card currently being
 * accessed. Everything else — facedown Corp installs, the opponent's hand,
 * deck, and discard pile — stays hidden. A discard only becomes known when its
 * cards are actually accessed.
 */
function cardVisibleTo(
  state: GameState,
  id: CardInstanceId,
  viewer: PlayerSide,
): boolean {
  const card = findCardIn(state, id);
  if (!card) return false; // unknown id → don't leak a title
  if (card.owner === viewer) return true;
  if (card.cardId === viewer) return true; // identity card
  // Scored agendas are open information.
  if (card.zone === "score") return true;
  // Rezzed Corp cards are public; unrezzed ones are not.
  if (card.rezzed === true) return true;
  // The card currently being accessed is visible to the runner.
  for (const p of state.prompts) {
    if (p.kind === "access-decision" && p.cardId === id) return true;
  }
  if (state.breach?.accessing === id) return true;
  return false;
}

/** Human-readable label for a legal move. */
export function describeMove(state: GameState, move: Move): string {
  switch (move.kind) {
    case "mulligan.take":
      return "Take a mulligan";
    case "mulligan.decline":
      return "Keep starting hand";
    case "discard":
      return `Discard ${move.cardInstanceIds.length} card(s)`;
    case "corp.gainCredits":
    case "runner.gainCredits":
      return "Gain 1 credit";
    case "corp.draw":
    case "runner.draw":
      return "Draw 1 card";
    case "corp.install":
      return `Install ${cardTitle(move.cardId)} — ${serverLabel(move.server)}`;
    case "corp.playOperation":
      return `Play ${cardTitle(move.cardId)}`;
    case "corp.advance": {
      const card = findCardIn(state, move.targetId);
      const adv = card ? card.advancement : 0;
      return `Advance ${cardTitle(card?.cardId ?? "")} (${adv}→${(adv ?? 0) + 1})`;
    }
    case "corp.score":
      return `Score ${cardTitle(findCardIn(state, move.targetId)?.cardId ?? "")}`;
    case "corp.rez":
      return `Rez ${cardTitle(findCardIn(state, move.targetId)?.cardId ?? "")}`;
    case "corp.ability": {
      const title = cardTitle(findCardIn(state, move.targetId)?.cardId ?? "");
      return `Ability ${move.abilityIndex + 1} — ${title}`;
    }
    case "runner.install":
      return `Install ${cardTitle(move.cardId)}`;
    case "runner.playEvent":
      return `Play ${cardTitle(move.cardId)}`;
    case "runner.run":
      return `Run ${serverLabel(move.server)}`;
    case "runner.ability": {
      const title = cardTitle(findCardIn(state, move.targetId)?.cardId ?? "");
      return `Ability ${move.abilityIndex + 1} — ${title}`;
    }
    case "runner.jackOut":
      return "Jack out";
    case "runner.breakSubroutine":
      return `Break subroutine ${move.subIndex + 1} with ${
        cardTitle(findCardIn(state, move.programId)?.cardId ?? "")
      }`;
    case "runner.pumpIcebreaker":
      return `Pump strength — ${cardTitle(findCardIn(state, move.programId)?.cardId ?? "")}`;
    case "runner.bioroidBreak":
      return `Break subroutine ${move.subIndex + 1} (spend a click)`;
    case "runner.resolveSubroutines":
      return "Let subroutines resolve";
    case "runner.accessCard": {
      // Name the card only when its identity is open to the Runner (rezzed or
      // currently being accessed, rules 1.21.1a, 7.2.1); a facedown candidate
      // (unrezzed install, facedown Archives card) stays anonymous.
      const card = findCardIn(state, move.targetId);
      const named = card && cardVisibleTo(state, move.targetId, "runner");
      return `Access ${named ? cardTitle(card!.cardId) : "a card"}`;
    }
    case "runner.accessRandom":
      return "Access a random card";
    case "runner.trashAccessed":
      return "Trash";
    case "runner.finishAccess":
      return "Finish access";
    case "runner.payToll":
      return move.method === "credits" ? "Pay the toll (credits)" : "Pay the toll (click)";
    case "prompt.answer": {
      const prompt = state.prompts.find((p) => p.id === move.promptId);
      const option = prompt && "options" in prompt
        ? prompt.options.find((o) => o.id === move.optionId)
        : undefined;
      if (option) {
        const costs: string[] = [];
        if (option.creditCost) costs.push(`${option.creditCost} [credit]`);
        if (option.clickCost) costs.push(`${option.clickCost} [click]`);
        return option.label + (costs.length ? ` (${costs.join(", ")})` : "");
      }
      return move.optionId;
    }
    default:
      return JSON.stringify(move);
  }
}

/** The head prompt, if it belongs to `side` and carries options to render. */
export function promptFor(state: GameState, side: PlayerSide): Prompt | null {
  const prompt = state.prompts[0];
  return prompt && prompt.player === side ? prompt : null;
}

/** Short prompt title for the action panel. */
export function promptTitle(prompt: Prompt): string {
  switch (prompt.kind) {
    case "mulligan":
      return "Mulligan?";
    case "discard":
      return `Discard ${prompt.count} card(s)`;
    case "rez-window":
      return "Corp rez window";
    case "choose-one":
      return prompt.title;
    case "access-decision":
      return "Accessed card";
    default:
      return "Decision";
  }
}
