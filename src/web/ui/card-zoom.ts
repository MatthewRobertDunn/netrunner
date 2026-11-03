/**
 * CardZoom: a full-size modal that pops up when you click a card tile so you
 * can actually read the text. Shows the checked-in card art at native size
 * plus the card's printed title, type line, and text. Click the backdrop or
 * press Esc to close.
 *
 * The backdrop takes focus on mount (`onMounted`), so the Esc key reaches its
 * `@keydown.escape` handler without a prior click — the popup can always be
 * dismissed from the keyboard as soon as it opens. A Tab keydown handler on
 * the backdrop wraps focus inside the dialog (the backdrop plus its buttons),
 * so keyboard users can never tab out into the page behind the modal. The
 * backdrop doubles as
 * the dialog element (`role="dialog"` + `aria-modal` + card-title label), so
 * assistive tech announces the popup as the focus lands on it.
 *
 * While the Runner is accessing a card the popup also carries the access
 * decision buttons (rule 7.2.2: one mid-access window — pass, or the basic
 * trash ability if the card has a payable trash cost).
 *
 * Uses `setup()` (Composition API) so `deno check` gets full typing.
 */

import { computed, defineComponent, onMounted, onUnmounted, ref } from "vue";
import type { PropType } from "vue";
import type { Move } from "../../types.ts";
import { cardOf, imageFor, moveActionAttrs, plainCardText } from "./util.ts";

/** Minimal DOM shapes for the focus trap (this repo typechecks without the
 *  DOM lib — the same structural style as the onMounted bridge below). */
interface TabTarget {
  focus(): void;
  disabled?: boolean;
}
interface TabEvent {
  preventDefault(): void;
  shiftKey: boolean;
}
type TrapRoot = TabTarget & {
  querySelectorAll(selectors: string): ArrayLike<TabTarget>;
};

export default defineComponent({
  name: "CardZoom",
  props: {
    cardId: { type: String as PropType<string | null>, default: null },
    /** Optional buttons shown under the card text (e.g. access decisions). */
    actions: { type: Array as PropType<{ label: string; move: Move }[]>, default: () => [] },
  },
  emits: ["close", "move"],
  setup(
    props: { cardId: string | null; actions: { label: string; move: Move }[] },
    { emit }: { emit: (event: "close") => void },
  ) {
    const def = computed(() => (props.cardId ? cardOf(props.cardId) : null));
    const img = computed(() => (props.cardId ? imageFor(props.cardId) : null));
    const text = computed(() => (props.cardId ? plainCardText(props.cardId) : ""));

    /**
     * The modal backdrop; focused on mount so Esc closes without a click.
     * Typed structurally (this repo typechecks without the DOM lib).
     */
    const backdropRef = ref<TrapRoot | null>(null);
    /**
     * The element focused before the modal opened. On close (unmount) focus
     * returns to it, so keyboard and screen-reader users are handed back to
     * the tile they came from instead of being dumped at <body>. The open
     * behaviour (autofocus on the backdrop) is unchanged.
     */
    let previousFocus: { focus(): void } | null = null;
    onMounted(() => {
      const doc = globalThis as unknown as {
        document?: { activeElement?: { focus(): void } | null };
      };
      previousFocus = doc.document?.activeElement ?? null;
      backdropRef.value?.focus();
    });
    onUnmounted(() => {
      previousFocus?.focus();
      previousFocus = null;
    });

    /**
     * Focus trap (Tab): keeps keyboard focus cycling INSIDE the dialog —
     * without it Tab walks straight out into the page behind the modal. The
     * dialog's tab stops are the focused backdrop itself plus every enabled
     * button inside it (the Close button, or the access-decision actions);
     * Tab from the last stop wraps to the backdrop, Shift+Tab from the
     * backdrop wraps to the last stop. The keydown bubbles up from the
     * buttons to this backdrop handler, so one listener covers every stop.
     * Autofocus-on-open, Escape, and the focus restore on unmount are
     * unchanged.
     */
    function trapTab(e: TabEvent): void {
      const root = backdropRef.value;
      if (!root) return;
      const stops: TabTarget[] = [root];
      const buttons = root.querySelectorAll("button");
      for (let i = 0; i < buttons.length; i++) {
        const button = buttons[i]!;
        if (!button.disabled) stops.push(button);
      }
      const doc = globalThis as unknown as {
        document?: { activeElement?: TabTarget | null };
      };
      const current = doc.document?.activeElement;
      const at = current ? stops.indexOf(current) : -1;
      // Focus outside the dialog (shouldn't happen: the backdrop takes focus
      // on mount) is pulled back to the first stop.
      const from = at === -1 ? 0 : at;
      e.preventDefault();
      const next = e.shiftKey
        ? stops[(from - 1 + stops.length) % stops.length]
        : stops[(from + 1) % stops.length];
      next?.focus();
    }

    return { def, img, text, backdropRef, trapTab, moveActionAttrs, onClose: () => emit("close") };
  },
  template: `
    <transition name="zoom">
      <div
        v-if="cardId"
        ref="backdropRef"
        class="zoom-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="def ? def.title : cardId"
        @click.self="onClose"
        @keydown.escape="onClose"
        @keydown.tab="trapTab"
        tabindex="0"
        data-modal="zoom"
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
                v-bind="moveActionAttrs(a.move)"
                @click="$emit('move', a.move)"
              >{{ a.label }}</button>
            </div>
            <button v-else class="zoom-close" data-action="close" @click="onClose">✕ Close</button>
          </div>
        </div>
      </div>
    </transition>
  `,
});
