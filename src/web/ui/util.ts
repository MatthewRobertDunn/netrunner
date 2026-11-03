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
import { cardVisibleTo, tryCardDef } from "../../mod.ts";
import { PASS_OPTION_ID } from "../../types.ts";
import type {
  CardId,
  CardInstance,
  CardInstanceId,
  GameEvent,
  GameState,
  Move,
  PlayerSide,
  Prompt,
  TurnPhase,
} from "../../types.ts";

// "The player who may act right now" is engine state machinery (also used by
// the AI shell), so it lives next to `player`/`other` in engine/state.ts and
// is re-exported here for the UI components.
export { actorOf } from "../../engine/state.ts";

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
    default: {
      // Remotes: "remote-3" reads as "remote 3" (rule 4.6.8) — the board
      // label's form, so every surface (log, move buttons, run banner,
      // server cards) names a remote the same way.
      const remote = /^remote-(\d+)$/.exec(server);
      return remote ? `remote ${remote[1]}` : server;
    }
  }
}

/** Status-badge wording for a turn phase: the raw enum ("action") is engine
 *  jargon, so each phase maps to the wording the rest of the UI uses. The
 *  record is keyed by `TurnPhase`, so adding a phase fails to compile until
 *  it gets a label. */
const PHASE_LABELS: Record<TurnPhase, string> = {
  action: "acting",
  discard: "discard",
  mulligans: "mulligans",
  "game-over": "game over",
};

/** Human-readable label for a turn phase (see `PHASE_LABELS`). */
export function phaseLabel(phase: TurnPhase): string {
  return PHASE_LABELS[phase];
}

/** One line of log text for a game event, as seen by `viewer`. */
export function formatEvent(
  state: GameState,
  e: GameEvent,
  viewer: PlayerSide,
): string {
  const side = (p: PlayerSide) => (p === "corp" ? "Corp" : "Runner");
  // Visibility is the engine's single predicate (`cardVisibleTo`): owned
  // cards, installed Runner cards, the Runner's heap, rezzed Corp cards,
  // scored agendas, and the card being accessed. Everything else (facedown
  // Corp installs, the opponent's hand/deck, facedown Archives) is hidden.
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
    case "steal":
      // Only the Runner can steal an agenda (rule 7.2.3), so the actor is
      // named directly — the event carries no player field.
      return `Runner steals ${visible(e.cardId)} (${e.points} AP)`;
    case "pump-strength":
      return `+${e.amount} strength on ${visible(e.cardId)}`;
    case "game-end":
      return e.winner === "draw"
        ? `Game ends in a draw — ${e.reason}`
        : `${side(e.winner)} wins — ${e.reason}`;
    default: {
      const exhaustive: never = e;
      return String((exhaustive as { type: string }).type);
    }
  }
}

function cardIdOfInstance(state: GameState, id: CardInstanceId): string {
  const card = findCardIn(state, id);
  return card ? card.cardId : String(id);
}

/** Stable v-for key for a move object (structural equality). Shared by
 *  GameScreen and ActionPanel, which both list moves. */
export function moveKey(m: Move): string {
  return JSON.stringify(m);
}

// ---------------------------------------------------------------------------
// The data-* annotation contract (see docs/ui-gotchas.md, entry "annotation
// contract"): every clickable element carries `data-action` (the engine's
// move kind when the button plays a move, else a UI verb such as "zoom") and
// one attribute per move parameter. Automated browser agents select with CSS
// attribute conjunctions — e.g. `[data-action="runner.run"][data-server="hq"]`
// — so every dimension is its own attribute, never packed into one string.
// The UI itself never reads these attributes; they are a pure output contract.
// ---------------------------------------------------------------------------

/** The attribute set `moveActionAttrs` produces for a move button. */
export interface ActionAttrs {
  "data-action": string;
  "data-server"?: string;
  "data-card-id"?: string;
  "data-instance"?: string;
  "data-target"?: string;
  /** 1-based, matching the visible label ("Break sub 2" → data-sub="2"). */
  "data-sub"?: string;
  /** 1-based, matching the visible label ("Ability 2" → data-ability="2"). */
  "data-ability"?: string;
  "data-option"?: string;
}

/**
 * Action attributes for a button that plays `move`. The verb is the move kind
 * itself (lossless: `runner.breakSubroutine` vs `runner.bioroidBreak` stay
 * distinct); each parameter the move carries becomes its own attribute.
 * Undefined values are dropped by Vue's binding, so buttons carry only what
 * they need. Subroutine and ability numbers are 1-based to match the labels.
 */
export function moveActionAttrs(move: Move): ActionAttrs {
  const attrs: ActionAttrs = { "data-action": move.kind };
  if ("cardId" in move) attrs["data-card-id"] = move.cardId;
  if ("server" in move) attrs["data-server"] = move.server;
  if ("targetId" in move) attrs["data-target"] = move.targetId;
  if ("programId" in move) attrs["data-instance"] = move.programId;
  if ("iceId" in move) attrs["data-instance"] = move.iceId;
  if ("subIndex" in move) attrs["data-sub"] = String(move.subIndex + 1);
  if ("abilityIndex" in move) attrs["data-ability"] = String(move.abilityIndex + 1);
  if ("optionId" in move) attrs["data-option"] = move.optionId;
  return attrs;
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
    case "runner.continueRun":
      return "Continue the run";
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
    case "prompt.answer": {
      const prompt = state.prompts.find((p) => p.id === move.promptId);
      const option = prompt && "options" in prompt
        ? prompt.options.find((o) => o.id === move.optionId)
        : undefined;
      if (option) {
        // Option labels that already embed their cost (the rez window prints
        // "Rez X (3[credit])") must not get the cost appended a second time.
        const embedsCost = /\[(?:credit|click)\]/.test(option.label);
        const costs: string[] = [];
        if (option.creditCost) costs.push(`${option.creditCost} [credit]`);
        if (option.clickCost) costs.push(`${option.clickCost} [click]`);
        return option.label + (costs.length && !embedsCost ? ` (${costs.join(", ")})` : "");
      }
      // The reserved "pass" answer (see `PromptOption.id`) is the engine's
      // decline/cancel — it has no option entry to look up in some prompts
      // (the rez window enumerates it without listing it in `options`), and
      // the raw lowercase id must never render as a button.
      if (move.optionId === PASS_OPTION_ID) return "Decline";
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

/**
 * Short prompt title for the action panel, keyed by prompt kind. A
 * choose-one prompt's own `title` takes precedence over the map entry;
 * unknown kinds fall back to the raw kind string.
 */
export const PROMPT_TITLES: Record<string, string> = {
  mulligan: "Mulligan?",
  discard: "Discard phase",
  "rez-window": "Rez window",
  "choose-one": "Choose one",
  "access-decision": "Accessed card",
};

/** Short prompt title for the action panel. */
export function promptTitle(prompt: Prompt): string {
  if (prompt.kind === "choose-one" && prompt.title) return prompt.title;
  return PROMPT_TITLES[prompt.kind] ?? prompt.kind;
}
