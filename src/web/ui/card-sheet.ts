/**
 * CardSheet: one player's panel of the card dock — the vertical sidebar that
 * replaced the horizontal action row. The dock stacks two sheets (opponent on
 * top, own at the bottom, splitting the viewport 50/50 like the status dock);
 * this component renders ONE of them.
 *
 * A sheet lists the player's installed Programs / Hardware / Resources as
 * compact rows: the card title (a real button that opens the zoom popup),
 * the card's open counter chips (hosted credits, effective strength — rule
 * 10.2), and — on the OWN sheet only — that card's action buttons directly
 * below it. Opponent sheets never render actions: another player's decisions
 * are not this seat's interface, while the cards and their counters are open
 * information (rule 4.6.2).
 *
 * Presentational only: every row/group is precomputed by GameScreen (the
 * trusted root) into plain `SheetGroup` data via `buildSheetGroups`, and the
 * own sheet receives the ActionPanel (banners, prompts, general moves)
 * through the `actions` slot. Every click bubbles up as `move` or `zoom`.
 */

import { defineComponent } from "vue";
import type { PropType } from "vue";
import { breakAbilityDef, paidAbilitiesOf, pumpAbilityDef } from "../../mod.ts";
import type { CardInstance, GameState, Move, PlayerSide } from "../../types.ts";
import { cardOf, cardTitle, moveKey, serverLabel } from "./util.ts";

/** A counter chip under a sheet card (hosted credits, effective strength). */
export interface SheetToken {
  kind: "credits" | "strength";
  value: number;
}

/** A per-card action button (the card it belongs to sits right above it). */
export interface SheetAction {
  /** Stable v-for key (the move's structural form, same as moveKey). */
  key: string;
  /** Short label — the card title is printed above the button, not repeated. */
  label: string;
  move: Move;
  /** Declared costs, rendered as symbol chips ahead of the label. */
  clickCost?: number;
  creditCost?: number;
}

/** One card row: title button (zoom), token chips, per-card actions. */
export interface SheetCardRow {
  /** Card instance id (v-for key; two copies of a card are two rows). */
  id: string;
  /** Definition id for the zoom popup. */
  cardId: string;
  title: string;
  tokens: SheetToken[];
  actions: SheetAction[];
}

/** A titled group of card rows (Programs / Hardware / Resources). */
export interface SheetGroup {
  key: string;
  title: string;
  cards: SheetCardRow[];
}

/** Runner installed-card types in the dock's fixed group order. */
const SHEET_GROUP_TYPES = ["program", "hardware", "resource"] as const;

const SHEET_GROUP_TITLES: Record<(typeof SHEET_GROUP_TYPES)[number], string> = {
  program: "Programs",
  hardware: "Hardware",
  resource: "Resources",
};

/** A runner installed card's open counters as chip data. Hosted credits ride
 *  on the instance (rule 10.2); strength is printed + the live pump (rule
 *  3.9.5b), shown only for cards with a printed strength (icebreakers). */
function sheetTokens(card: CardInstance): SheetToken[] {
  const tokens: SheetToken[] = [];
  if (card.hostedCredits) tokens.push({ kind: "credits", value: card.hostedCredits });
  const printed = cardOf(card.cardId)?.strength ?? null;
  if (printed !== null) {
    tokens.push({ kind: "strength", value: printed + (card.strengthBoost ?? 0) });
  }
  return tokens;
}

/** Short label + declared costs for one of an installed card's legal actions.
 *  The card title is the row above the button, so the label names only the
 *  effect ("Place 3 credits", "Break sub 2", "+2 strength"). */
function installedAction(card: CardInstance, move: Move): SheetAction {
  switch (move.kind) {
    case "runner.ability": {
      // One paid-ability move per printed ability (and per server for
      // abilities that choose one — Red Team's central run), so the index
      // picks the definition whose printed title becomes the label.
      const def = paidAbilitiesOf(card.cardId)[move.abilityIndex];
      const base = def?.title ?? `Ability ${move.abilityIndex + 1}`;
      return {
        key: moveKey(move),
        label: move.server ? `${base} — ${serverLabel(move.server)}` : base,
        move,
        clickCost: def?.clickCost,
        creditCost: def?.creditCost,
      };
    }
    case "runner.breakSubroutine": {
      // Breaking is priced by the PROGRAM's break ability (one credit per
      // break on the starter breakers).
      return {
        key: moveKey(move),
        label: `Break sub ${move.subIndex + 1}`,
        move,
        creditCost: breakAbilityDef(card.cardId)?.creditCost,
      };
    }
    case "runner.pumpIcebreaker": {
      const pump = pumpAbilityDef(card.cardId);
      return {
        key: moveKey(move),
        label: pump ? `+${pump.amount} strength` : "Pump strength",
        move,
        creditCost: pump?.creditCost,
      };
    }
    default:
      return { key: moveKey(move), label: move.kind, move };
  }
}

/** The legal moves that belong to one installed card (its row's buttons). */
function actionsForCard(card: CardInstance, legal: Move[]): Move[] {
  return legal.filter((m) => {
    switch (m.kind) {
      case "runner.ability":
        return m.targetId === card.id;
      case "runner.breakSubroutine":
      case "runner.pumpIcebreaker":
        return m.programId === card.id;
      default:
        return false;
    }
  });
}

/** Move kinds that render under an installed card instead of the Actions
 *  list — the no-duplicates rule. GameScreen filters these out of its
 *  general moves with the same table. */
export const INSTALLED_ACTION_KINDS: ReadonlySet<string> = new Set([
  "runner.ability",
  "runner.breakSubroutine",
  "runner.pumpIcebreaker",
]);

/**
 * Build one player's sheet groups from the trusted state. The corp side has
 * no groups: its cards live on the board (servers), so both corp sheets show
 * the empty-state note (and the corp's own sheet only its Actions area).
 * Runner installed cards are open information to BOTH viewers (rule 4.6.2),
 * so the state list is read directly for own and opponent sheets alike.
 *
 * `legal` is the human seat's legal moves ([] whenever it is not their
 * turn); `blocked` silences per-card actions while a prompt or access
 * decision owns the interaction — the ActionPanel takes over then.
 */
export function buildSheetGroups(opts: {
  state: GameState;
  side: PlayerSide;
  isOwn: boolean;
  legal: Move[];
  blocked: boolean;
}): SheetGroup[] {
  if (opts.side !== "runner") return [];
  const groups: SheetGroup[] = [];
  for (const type of SHEET_GROUP_TYPES) {
    const cards: SheetCardRow[] = [];
    for (const card of opts.state.runner.installed) {
      if (cardOf(card.cardId)?.type !== type) continue;
      cards.push({
        id: card.id,
        cardId: card.cardId,
        title: cardTitle(card.cardId),
        tokens: sheetTokens(card),
        actions: opts.isOwn && !opts.blocked
          ? actionsForCard(card, opts.legal).map((m) => installedAction(card, m))
          : [],
      });
    }
    if (cards.length) groups.push({ key: type, title: SHEET_GROUP_TITLES[type], cards });
  }
  return groups;
}

export default defineComponent({
  name: "CardSheet",
  props: {
    /** Which player this sheet shows (drives colors and the empty note). */
    side: { type: String as PropType<PlayerSide>, required: true },
    /** Whether this is the human player's own sheet (actions allowed). */
    isOwn: { type: Boolean, default: false },
    /** Whether this side is the turn's acting player (border highlight
     *  only — the ACTING badge lives in the status dock's block, and a
     *  second badge here was just noise). */
    active: { type: Boolean, default: false },
    /** Precomputed groups (see buildSheetGroups). */
    groups: { type: Array as PropType<SheetGroup[]>, required: true },
  },
  emits: ["move", "zoom"],
  setup() {
    return {};
  },
  template: `
    <section
      class="card-sheet"
      :class="[side, { own: isOwn, active }]"
      :data-testid="isOwn ? 'sheet-own' : 'sheet-opponent'"
      :data-side="side"
    >
      <header class="sheet-who">
        <span class="who">{{ side === 'corp' ? 'CORP' : 'RUNNER' }}<template v-if="isOwn"> (you)</template></span>
        <span v-if="!isOwn" class="opp-tag">opponent</span>
      </header>
      <div class="sheet-body">
        <slot name="actions"></slot>
        <section v-for="g in groups" :key="g.key" class="sheet-group" :data-group="g.key">
          <h3 class="sheet-heading">{{ g.title }}</h3>
          <div v-for="row in g.cards" :key="row.id" class="sheet-card" :data-card-id="row.cardId">
            <button
              type="button"
              class="sheet-card-title"
              :title="row.title + ' — click for the card text'"
              @click="$emit('zoom', row.cardId)"
            >{{ row.title }}</button>
            <div v-if="row.tokens.length" class="sheet-tokens">
              <span
                v-for="(t, i) in row.tokens"
                :key="i"
                class="sheet-token"
                :class="t.kind"
                :title="t.kind === 'credits' ? 'Hosted credits' : 'Strength'"
              >
                <img v-if="t.kind === 'credits'" class="sym" src="assets/svg/credit.svg" alt="credits" />
                <em v-else class="tok-name">str</em>{{ t.value }}
              </span>
            </div>
            <div v-if="row.actions.length" class="sheet-card-actions">
              <button
                v-for="a in row.actions"
                :key="a.key"
                class="move-btn card-action-btn"
                :data-move="a.move.kind"
                @click="$emit('move', a.move)"
              >
                <span v-if="a.clickCost" class="cost"><img class="sym" src="assets/svg/click.svg" alt="clicks" />{{ a.clickCost }}</span>
                <span v-if="a.creditCost" class="cost"><img class="sym" src="assets/svg/credit.svg" alt="credits" />{{ a.creditCost }}</span>
                <span class="lbl">{{ a.label }}</span>
              </button>
            </div>
          </div>
        </section>
        <div v-if="!groups.length" class="sheet-empty">
          {{ side === 'corp' ? 'Corp cards are on the board.' : 'No cards installed.' }}
        </div>
      </div>
    </section>
  `,
});
