/**
 * Card catalogue: immutable printed card data loaded from the checked-in
 * NetrunnerDB snapshot (`data/cards.json`). Never modified at runtime.
 */

import raw from "../../data/cards.json" with { type: "json" };
import type { CardId, PlayerSide } from "../types.ts";

export type CardType =
  | "agenda"
  | "asset"
  | "event"
  | "hardware"
  | "ice"
  | "operation"
  | "program"
  | "resource"
  | "upgrade"
  | "runner_identity"
  | "corp_identity";

export interface CardDef {
  id: CardId;
  title: string;
  strippedTitle: string;
  text: string;
  strippedText: string;
  type: CardType;
  side: PlayerSide;
  faction: string;
  /** Play/install/rez cost. Null where not printed. */
  cost: number | null;
  advancementRequirement: number | null;
  agendaPoints: number | null;
  baseLink: number | null;
  deckLimit: number | null;
  influenceCost: number | null;
  influenceLimit: number | null;
  memoryCost: number | null;
  minimumDeckSize: number | null;
  strength: number | null;
  trashCost: number | null;
  unique: boolean;
  subtypes: string[];
  displaySubtypes: string | null;
  printingIds: string[];
  updatedAt: string | null;
}

interface RawCard {
  id: string;
  title?: string;
  stripped_title?: string;
  text?: string;
  stripped_text?: string;
  card_type_id?: string;
  side_id?: string;
  faction_id?: string;
  cost?: number | null;
  advancement_requirement?: number | null;
  agenda_points?: number | null;
  base_link?: number | null;
  deck_limit?: number | null;
  influence_cost?: number | null;
  influence_limit?: number | null;
  memory_cost?: number | null;
  minimum_deck_size?: number | null;
  strength?: number | null;
  trash_cost?: number | null;
  is_unique?: boolean;
  card_subtype_ids?: string[];
  display_subtypes?: string | null;
  printing_ids?: string[];
  updated_at?: string;
}

function toCardDef(rawCard: RawCard): CardDef {
  const num = (v: number | string | null | undefined): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: rawCard.id,
    title: rawCard.title ?? rawCard.id,
    strippedTitle: rawCard.stripped_title ?? rawCard.id,
    text: rawCard.text ?? "",
    strippedText: rawCard.stripped_text ?? "",
    type: (rawCard.card_type_id ?? "operation") as CardType,
    side: (rawCard.side_id ?? "corp") as PlayerSide,
    faction: rawCard.faction_id ?? "neutral",
    cost: num(rawCard.cost),
    advancementRequirement: num(rawCard.advancement_requirement),
    agendaPoints: num(rawCard.agenda_points),
    baseLink: num(rawCard.base_link),
    deckLimit: num(rawCard.deck_limit),
    influenceCost: num(rawCard.influence_cost),
    influenceLimit: num(rawCard.influence_limit),
    memoryCost: num(rawCard.memory_cost),
    minimumDeckSize: num(rawCard.minimum_deck_size),
    strength: num(rawCard.strength),
    trashCost: num(rawCard.trash_cost),
    unique: rawCard.is_unique ?? false,
    subtypes: rawCard.card_subtype_ids ?? [],
    displaySubtypes: rawCard.display_subtypes ?? null,
    printingIds: rawCard.printing_ids ?? [],
    updatedAt: rawCard.updated_at ?? null,
  };
}

export interface CatalogueMeta {
  provider: string;
  retrievedAt: string;
  runnerDecklistId: string;
  corpDecklistId: string;
}

const data = raw as unknown as {
  _source: CatalogueMeta;
  cards: RawCard[];
};

const cards: ReadonlyMap<CardId, CardDef> = new Map(
  data.cards.map((c) => [c.id, toCardDef(c)]),
);

/** Card definition for a known id; throws for unknown ids. */
export function cardDef(cardId: CardId): CardDef {
  const def = cards.get(cardId);
  if (!def) throw new Error(`Unknown card id: ${cardId}`);
  return def;
}

/** Card definition, or undefined for unknown ids (used by deck validation). */
export function tryCardDef(cardId: CardId): CardDef | undefined {
  return cards.get(cardId);
}

export function allCardDefs(): CardDef[] {
  return [...cards.values()];
}

export function catalogueMeta(): CatalogueMeta {
  return { ...data._source };
}

/** Cards that can be rezzed (assets, upgrades, ice). */
export function isRezzable(def: CardDef): boolean {
  return def.type === "asset" || def.type === "upgrade" || def.type === "ice";
}

/** Cards that are always active once installed by the Runner. */
export function isRunnerInstallable(def: CardDef): boolean {
  return def.type === "program" || def.type === "hardware" || def.type === "resource";
}

export function isIce(def: CardDef): boolean {
  return def.type === "ice";
}
