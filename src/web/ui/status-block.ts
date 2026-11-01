/**
 * StatusBlock: one player's public-status panel (the two `<section
 * class="status-block">` halves of the status dock, extracted from
 * GameScreen).
 *
 * Purely presentational: it renders the viewer-aware public player object and
 * never reads engine state. The optional interactive tiles — the own credits
 * tile (gain-credit basic action) and the own hand stat (draw basic action) —
 * are enabled by passing their legal moves as props (`gainMove` / `drawMove`);
 * clicks bubble up as `move` events for the root component to apply. The
 * opponent block passes neither prop, so both tiles render as inert stat
 * elements exactly as before.
 *
 * The DOM contract is pinned by tests/ui/game_screen_test.ts: the
 * `status-opponent` / `status-own` testids, the per-side `data-side`
 * attribute, `<side>-score` on the score strip, the real `<button>` tags for
 * the interactive tiles, and the `.status-block` classes the dock's CSS
 * layout splits evenly.
 */

import { computed, defineComponent, ref } from "vue";
import type { PropType } from "vue";
import type { Move, PlayerSide, PublicPlayerStatus } from "../../types.ts";
import { cardTitle, imageFor } from "./util.ts";

/** Glyph for a status block: Corp identity / Runner faction art. */
function sideGlyph(side: PlayerSide): string {
  return side === "corp" ? "assets/svg/faction-hb.svg" : "assets/svg/faction-criminal.svg";
}

/** Correct discard-pile names (rules 2526-2545): Corp Archives, Runner Heap. */
function discardName(side: PlayerSide): string {
  return side === "corp" ? "Archives" : "Heap";
}

export default defineComponent({
  name: "StatusBlock",
  props: {
    /** Which player this block shows (drives data-side, colors, zone names). */
    side: { type: String as PropType<PlayerSide>, required: true },
    /** The viewer-aware public status object for `side`. */
    stats: { type: Object as PropType<PublicPlayerStatus>, required: true },
    /** Agenda-point target, shared by both seats ("x/target" readout). */
    agendaTarget: { type: Number, required: true },
    /** Whether this side is the turn's acting player (highlight). */
    active: { type: Boolean, default: false },
    /** Whether this is the human player's own block ("(you)" tag + tiles). */
    isOwn: { type: Boolean, default: false },
    /** Legal gain-credit move: turns the credits stat into the action button. */
    gainMove: { type: Object as PropType<Move | null>, default: null },
    /** Legal draw move: turns the hand stat into the action button. */
    drawMove: { type: Object as PropType<Move | null>, default: null },
  },
  emits: ["move"],
  setup(
    props: {
      side: PlayerSide;
      stats: PublicPlayerStatus;
      agendaTarget: number;
      active: boolean;
      isOwn: boolean;
      gainMove: Move | null;
      drawMove: Move | null;
    },
  ) {
    /**
     * The glyph is the seat's actual identity card art (the identity is open
     * information, rule 10.2.3), keyed off the card id like GameScreen's
     * HQ identity face — not a hardcoded per-side faction logo, which showed
     * Haas-Bioroid's mark for whichever Corp was seated. Falls back to the
     * per-side faction SVG when the identity is hidden/unknown or its art
     * failed to load.
     */
    const glyphFailed = ref(false);
    const identityImg = computed<string | null>(() => {
      const id = props.stats.identity.cardId;
      return id && id !== "hidden" ? imageFor(id) : null;
    });
    const glyph = computed(() =>
      !glyphFailed.value && identityImg.value ? identityImg.value : sideGlyph(props.side)
    );
    return { glyph, identityImg, glyphFailed, discardName, cardTitle };
  },
  template: `
    <section
      class="status-block"
      :class="[side, isOwn ? 'status-own' : 'status-opponent', { active }]"
      :data-testid="isOwn ? 'status-own' : 'status-opponent'"
      :data-side="side"
    >
      <div class="status-who">
        <img
          class="glyph-side"
          :class="{ identity: !!identityImg && !glyphFailed }"
          :src="glyph"
          alt=""
          @error="glyphFailed = true"
        />
        <span class="who">{{ side === 'corp' ? 'CORP' : 'RUNNER' }}<template v-if="isOwn"> (you)</template></span>
        <span v-if="active" class="acting-tag">acting</span>
        <span v-if="!isOwn" class="opp-tag">opponent</span>
      </div>
      <div class="status-primary">
        <!-- The own credits tile doubles as the gain-credit button; the
             opponent block renders the identical markup as an inert div
             (<component :is> keeps one copy of the stat markup, mirroring
             CardTile's button/div split). -->
        <component
          :is="isOwn ? 'button' : 'div'"
          :type="isOwn ? 'button' : undefined"
          class="primary-stat credits"
          :class="{ clickable: !!gainMove }"
          :disabled="isOwn ? !gainMove : undefined"
          :data-testid="isOwn ? 'gain-credit' : undefined"
          :title="isOwn ? 'Gain 1 credit' : undefined"
          @click="gainMove && $emit('move', gainMove)"
        >
          <img class="sym" src="assets/svg/credit.svg" alt="Credits" />
          <span class="primary-val">{{ stats.credits }}</span>
        </component>
        <div class="primary-stat agenda">
          <img class="sym" src="assets/svg/agenda.svg" alt="Agenda points" />
          <span class="primary-val">{{ stats.agendaPoints }}/{{ agendaTarget }}</span>
        </div>
      </div>
      <div class="status-secondary">
        <span class="stat"><img class="sym" src="assets/svg/click.svg" alt="Clicks" />{{ stats.clicks }}</span>
        <!-- The own hand stat doubles as the Draw 1 card button (span for the
             opponent block), same single-markup treatment as the credits tile. -->
        <component
          :is="isOwn ? 'button' : 'span'"
          :type="isOwn ? 'button' : undefined"
          class="stat"
          :class="{ clickable: !!drawMove }"
          :disabled="isOwn ? !drawMove : undefined"
          :data-testid="isOwn ? 'draw-card' : undefined"
          :title="isOwn ? 'Draw 1 card' : undefined"
          @click="drawMove && $emit('move', drawMove)"
        >hand {{ stats.handCount }}/{{ stats.handSize }}</component>
        <span class="stat">deck {{ stats.deckCount }}</span>
        <span class="stat">{{ discardName(side) }} {{ stats.discardCount }}</span>
        <span v-if="side === 'runner' && stats.tags" class="stat"><img class="sym" src="assets/svg/tag.svg" alt="Tags" />{{ stats.tags }}</span>
        <span v-if="side === 'corp' && stats.tags" class="stat">bad pub {{ stats.tags }}</span>
      </div>
      <span v-if="stats.score.length" class="score-strip" :data-testid="side + '-score'">
        <img v-for="c in stats.score" :key="c.id" class="mini-card" :src="'images/' + c.cardId + '.webp'" :alt="cardTitle(c.cardId)" />
      </span>
    </section>
  `,
});
