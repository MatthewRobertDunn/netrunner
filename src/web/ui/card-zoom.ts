/**
 * CardZoom: a full-size modal that pops up when you click a card tile so you
 * can actually read the text. Shows the checked-in card art at native size
 * plus the card's printed title, type line, and text. Click the backdrop or
 * press Esc to close.
 *
 * While the Runner is accessing a card the popup also carries the access
 * decision buttons (rule 7.2.2: one mid-access window — pass, or the basic
 * trash ability if the card has a payable trash cost).
 *
 * Uses `setup()` (Composition API) so `deno check` gets full typing.
 */

import { computed, defineComponent } from "vue";
import type { PropType } from "vue";
import { cardOf, imageFor, plainCardText } from "./util.ts";

export default defineComponent({
  name: "CardZoom",
  props: {
    cardId: { type: String as PropType<string | null>, default: null },
    /** Optional buttons shown under the card text (e.g. access decisions). */
    actions: { type: Array as PropType<{ label: string; move: unknown }[]>, default: () => [] },
  },
  emits: ["close", "move"],
  setup(props: { cardId: string | null }, { emit }: { emit: (event: "close") => void }) {
    const def = computed(() => (props.cardId ? cardOf(props.cardId) : null));
    const img = computed(() => (props.cardId ? imageFor(props.cardId) : null));
    const text = computed(() => (props.cardId ? plainCardText(props.cardId) : ""));

    return { def, img, text, onClose: () => emit("close") };
  },
  template: `
    <transition name="zoom">
      <div
        v-if="cardId"
        class="zoom-backdrop"
        @click.self="onClose"
        @keydown.escape="onClose"
        tabindex="0"
        data-testid="card-zoom"
      >
        <div class="zoom-card">
          <img
            v-if="img"
            class="zoom-art"
            :src="img"
            :alt="def ? def.title : ''"
          />
          <div v-else class="zoom-face-fallback">
            <div class="zoom-name">{{ def ? def.title : cardId }}</div>
            <div class="zoom-type">{{ def ? def.type : '' }}</div>
          </div>

          <div class="zoom-info">
            <div class="zoom-title">
              {{ def ? def.title : cardId }}
              <span v-if="def && def.unique" class="zoom-unique">●</span>
            </div>
            <div class="zoom-type-line">
              <span v-if="def">{{ def.type }}</span>
              <span v-if="def && def.side" class="zoom-side" :class="def.side">
                {{ def.side === 'corp' ? 'Corp' : 'Runner' }}
              </span>
              <span v-if="def && def.faction" class="zoom-faction">· {{ def.faction }}</span>
            </div>

            <div v-if="def" class="zoom-stats">
              <span v-if="def.cost !== null" class="zoom-stat">Cost {{ def.cost }}</span>
              <span v-if="def.agendaPoints !== null" class="zoom-stat">AP {{ def.agendaPoints }}</span>
              <span v-if="def.strength !== null" class="zoom-stat">Str {{ def.strength }}</span>
              <span v-if="def.trashCost !== null" class="zoom-stat">Trash {{ def.trashCost }}</span>
              <span v-if="def.memoryCost !== null" class="zoom-stat">Mem {{ def.memoryCost }}</span>
            </div>

            <p v-if="text" class="zoom-text">{{ text }}</p>

            <div v-if="actions.length" class="zoom-actions">
              <button
                v-for="a in actions"
                :key="a.label"
                class="move-btn primary"
                @click="$emit('move', a.move)"
              >{{ a.label }}</button>
            </div>
            <button v-else class="zoom-close" @click="onClose" data-testid="zoom-close">✕ Close</button>
          </div>
        </div>
      </div>
    </transition>
  `,
});
