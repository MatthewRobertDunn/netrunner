/**
 * CardTile: renders a card face using the checked-in card image, with
 * advancement/strength counter overlays. Falls back to a text-only face when
 * the image is missing, and to a facedown "card back" when `facedown` is set.
 *
 * A `clickable` tile renders as a real `<button type="button">` (keyboard
 * focusable, Enter/Space activate it); every other tile stays a `<div>`. The
 * root element is chosen with `<component :is>`, so the single template body
 * keeps the shared `.card-tile` classes and children identical in both forms —
 * the button reset in public/css/style.css keeps the look unchanged.
 *
 * Uses `setup()` (Composition API) so `deno check` gets full typing: the
 * Options API's `this` is untyped in plain object literals.
 */

import { computed, defineComponent } from "vue";
import type { PropType } from "vue";
import type { ViewCard } from "../../types.ts";
import { cardOf, imageFor } from "./util.ts";

/**
 * The card fields a tile renders: definition id plus face counters. A
 * projection of the real `ViewCard` (engine type) rather than a re-declared
 * subset, so callers can pass a `CardInstance` or `ViewCard` directly.
 */
export type CardTileCard = Pick<
  ViewCard,
  | "cardId"
  | "rezzed"
  | "advancement"
  | "hostedCredits"
  | "strength"
  | "strengthBoost"
>;

export default defineComponent({
  name: "CardTile",
  props: {
    card: { type: Object as PropType<CardTileCard | null>, default: null },
    facedown: { type: Boolean, default: false },
    ice: { type: Boolean, default: false },
    highlight: { type: Boolean, default: false },
    badge: { type: String, default: "" },
    small: { type: Boolean, default: false },
    clickable: { type: Boolean, default: false },
    // Facedown tiles show the corp card back instead of the runner's.
    corp: { type: Boolean, default: false },
    // Ice-stack position (innermost = 1), emitted as data-card-pos. DOM
    // order flips with the corp-seat CSS flip; the engine position does not.
    pos: { type: Number, default: undefined },
  },
  emits: ["zoom"],
  setup(
    props: {
      card: CardTileCard | null;
      facedown: boolean;
      ice: boolean;
      highlight: boolean;
      badge: string;
      small: boolean;
      clickable: boolean;
      corp: boolean;
      pos: number | undefined;
    },
    { emit }: { emit: (event: "zoom", cardId: string) => void },
  ) {
    const def = computed(() => {
      const card = props.card;
      return card && card.cardId !== "hidden" ? cardOf(card.cardId) : null;
    });
    const img = computed(() => {
      const card = props.card;
      return card && card.cardId !== "hidden" ? imageFor(card.cardId) : null;
    });
    const typeTag = computed(() => (def.value ? def.value.type : ""));
    const isAgenda = computed(() => typeTag.value === "agenda");
    /** A tile zooms only when it is clickable and shows a known card face. */
    const isZoomable = computed(() =>
      Boolean(props.clickable && props.card && props.card.cardId !== "hidden")
    );
    /** The annotation contract's attributes: every face-up tile is findable
     *  by card id, and clickable tiles are actions ("zoom") like any other
     *  button. Facedown (redacted) tiles carry position only — except
     *  advancement counters, which are open information (rule 10.2.3) and the
     *  one number a Runner most needs on a face-down card, so they ride the
     *  tile even when the card's identity is redacted. */
    const cardAttrs = computed<Record<string, string | undefined>>(() => {
      const card = props.card;
      const known = card && card.cardId !== "hidden";
      return {
        "data-card-id": known ? card!.cardId : undefined,
        "data-action": isZoomable.value ? "zoom" : undefined,
        "data-card-pos": props.pos !== undefined ? String(props.pos) : undefined,
        "data-advancement": card?.advancement ? String(card.advancement) : undefined,
      };
    });

    function onClick(): void {
      const card = props.card;
      if (isZoomable.value && card) emit("zoom", card.cardId);
    }

    return { def, img, typeTag, isAgenda, isZoomable, cardAttrs, onClick };
  },
  template: `
    <component
      :is="isZoomable ? 'button' : 'div'"
      :type="isZoomable ? 'button' : undefined"
      class="card-tile"
      :class="{ facedown, ice, highlight, small, 'is-agenda': isAgenda, clickable }"
      :title="def ? def.title + '\\n' + def.strippedText : 'Facedown card'"
      v-bind="cardAttrs"
      @click="onClick"
    >
      <img v-if="img" class="card-img" :src="img" :alt="def ? def.title : ''" loading="lazy" />
      <div v-else class="card-face-fallback">
        <template v-if="!facedown && def">
          <div class="card-name">{{ def.title }}</div>
          <div class="card-type">{{ def.type }}</div>
        </template>
        <template v-else-if="corp">
          <img class="corp-back-img" src="assets/corp-back.svg" alt="" />
        </template>
        <template v-else>
          <div class="card-back-pattern"></div>
        </template>
      </div>
      <div v-if="card && card.advancement" class="counter adv-counter">
        <img class="adv-token" src="assets/svg/advancement.svg" alt="" />
        <span class="adv-num">{{ card.advancement }}</span>
      </div>
      <!-- Hosted credits (Nico Campaign et al): open information (rule 10.2),
           mirrored after the advancement counter. -->
      <div v-if="card && card.hostedCredits" class="counter credit-counter">{{ card.hostedCredits }}</div>
      <!-- Effective strength: printed + the live pump. During an encounter the
           pump is exactly what the Runner is deciding on, so the counter must
           not understate it (the rule 3.9.5b boost rides in strengthBoost). -->
      <div
        v-if="card && card.strength !== undefined"
        class="counter str-counter"
        :class="{ boosted: !!card.strengthBoost }"
        :title="card.strengthBoost
          ? 'Strength ' + (card.strength + card.strengthBoost) + ' (printed ' + card.strength + ' +' + card.strengthBoost + ' this encounter)'
          : undefined"
      >{{ card.strength + (card.strengthBoost ?? 0) }}</div>
      <div v-if="badge" class="counter badge-counter">{{ badge }}</div>
      <div
        v-if="card && card.rezzed === false && !facedown"
        class="unrezzed-flag"
        title="installed facedown"
      >D</div>
      <div v-if="facedown && !corp" class="facedown-label">?</div>
    </component>
  `,
});
