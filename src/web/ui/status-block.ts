/**
 * StatusBlock: one player's public-status panel (the two `<section
 * class="status-block">` halves of the status dock, extracted from
 * GameScreen).
 *
 * Purely presentational: it renders the viewer-aware public player object and
 * never reads engine state. The optional interactive tiles — the own credits
 * tile (gain-credit basic action) and the own hand tile (draw basic action) —
 * are enabled by passing their legal moves as props (`gainMove` / `drawMove`);
 * clicks bubble up as `move` events for the root component to apply. The
 * opponent block passes neither prop, so both tiles render as inert elements
 * exactly as before. Credits + agenda form the two-tile primary row; the
 * clicks and hand tiles share their size but keep their usual slots in the
 * secondary grid (the hand tile is the Draw 1 card button; clicks is an
 * inert counter), with a deck glyph in place of the word "hand".
 *
 * The DOM contract is pinned by tests/ui/game_screen_test.ts: the
 * `data-side` / `data-own` scoping pair, the per-player status numbers as
 * `data-player-*` (credits, clicks, hand, hand-size, deck, discard, agenda
 * points, tags for the Runner / bad publicity for the Corp — kept distinct
 * because they are different things), the `<side>-score` strip marker, and
 * the real `<button>` tags for the interactive tiles and the scored-agenda
 * mini-cards. Buttons carry the data-* annotation contract's `data-action` +
 * parameter attributes (see docs/ui-gotchas.md): the gain/draw tiles are
 * `gainMove`/`drawMove` buttons, so they get the same `moveActionAttrs` as any
 * other move button rather than a hand-maintained `data-move` string.
 */

import { computed, defineComponent, ref } from "vue";
import type { PropType } from "vue";
import type { Move, PlayerSide, PublicPlayerStatus } from "../../types.ts";
import { cardTitle, imageFor, moveActionAttrs } from "./util.ts";

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
  emits: ["move", "zoom"],
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
    /** Scored-agenda instance ids whose art failed to load: they fall back to
     *  a text mini-card instead of a broken image. */
    const scoreImgFailed = ref<string[]>([]);
    function onScoreImgError(id: string): void {
      if (!scoreImgFailed.value.includes(id)) {
        scoreImgFailed.value = [...scoreImgFailed.value, id];
      }
    }
    return {
      glyph,
      identityImg,
      glyphFailed,
      discardName,
      cardTitle,
      scoreImgFailed,
      onScoreImgError,
      moveActionAttrs,
    };
  },
  template: `
    <section
      class="status-block"
      :class="[side, isOwn ? 'status-own' : 'status-opponent', { active }]"
      :data-side="side"
      :data-own="String(isOwn)"
      :data-player-credits="stats.credits"
      :data-player-clicks="stats.clicks"
      :data-player-hand="stats.handCount"
      :data-player-hand-size="stats.handSize"
      :data-player-deck="stats.deckCount"
      :data-player-discard="stats.discardCount"
      :data-player-agenda-points="stats.agendaPoints"
      :data-player-tags="side === 'runner' ? stats.tags : undefined"
      :data-player-bad-publicity="side === 'corp' ? stats.tags : undefined"
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
          v-bind="isOwn && gainMove ? moveActionAttrs(gainMove) : undefined"
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
        <!-- The clicks counter shares the primary tiles' size (it has no
             action, so it stays an inert div in both seats) but keeps the
             clicks stat's usual grid slot. -->
        <div class="primary-stat clicks">
          <img class="sym" src="assets/svg/click.svg" alt="Clicks" />
          <span class="primary-val">{{ stats.clicks }}</span>
        </div>
        <!-- The own hand tile doubles as the Draw 1 card button (inert div
             for the opponent block), same single-markup treatment as the
             credits tile. It keeps the hand stat's usual grid slot but
             shares the primary tiles' size, and the deck glyph stands in
             for the word "hand". -->
        <component
          :is="isOwn ? 'button' : 'div'"
          :type="isOwn ? 'button' : undefined"
          class="primary-stat hand"
          :class="{ clickable: !!drawMove }"
          :disabled="isOwn ? !drawMove : undefined"
          v-bind="isOwn && drawMove ? moveActionAttrs(drawMove) : undefined"
          :title="isOwn ? 'Draw 1 card' : undefined"
          @click="drawMove && $emit('move', drawMove)"
        >
          <img class="sym" src="assets/svg/deck.svg" alt="Hand" />
          <span class="primary-val">{{ stats.handCount }}/{{ stats.handSize }}</span>
        </component>
        <span class="stat">deck {{ stats.deckCount }}</span>
        <span class="stat">{{ discardName(side) }} {{ stats.discardCount }}</span>
        <span v-if="side === 'runner' && stats.tags" class="stat"><img class="sym" src="assets/svg/tag.svg" alt="Tags" />{{ stats.tags }}</span>
        <span v-if="side === 'corp' && stats.tags" class="stat">bad pub {{ stats.tags }}</span>
      </div>
      <span v-if="stats.score.length" class="score-strip" :data-panel="'score-' + side">
        <!-- Scored agendas are open information (rule 4.4.7b); each mini-card
             is a button that opens the card zoom, same as the sheet titles.
             data-card-id names the scored agenda; the strip's data-panel
             marker is the non-interactive region name. -->
        <template v-for="c in stats.score" :key="c.id">
          <button
            v-if="!scoreImgFailed.includes(c.id)"
            type="button"
            class="mini-card mini-card-btn"
            data-action="zoom"
            :data-card-id="c.cardId"
            :title="'View ' + cardTitle(c.cardId)"
            @click="$emit('zoom', c.cardId)"
          >
            <img
              class="mini-card-img"
              :src="'images/' + c.cardId + '.webp'"
              :alt="cardTitle(c.cardId)"
              @error="onScoreImgError(c.id)"
            />
          </button>
          <button
            v-else
            type="button"
            class="mini-card mini-card-text"
            data-action="zoom"
            :data-card-id="c.cardId"
            :title="'View ' + cardTitle(c.cardId)"
            @click="$emit('zoom', c.cardId)"
          >{{ cardTitle(c.cardId) }}</button>
        </template>
      </span>
    </section>
  `,
});
