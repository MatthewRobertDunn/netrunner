/**
 * WinModal: the game-over dialog. Pops up over the play surface when the
 * game ends, with the winner, the win reason, and a "New game" button.
 *
 * Why a modal instead of the banner that used to live in the action panel:
 * the action row became the card dock (a narrow sidebar of per-card
 * actions), and a full-width win banner there reads as a stray control
 * rather than an ending. The parent owns the open state (it reopens from
 * the status dock's Winner chip), so this component mounts only while
 * visible: it takes focus on mount, traps Tab inside, and returns focus to
 * the element that opened it when unmounted — the same contract as
 * CardZoom, so the two modals behave identically for keyboard and
 * screen-reader users.
 *
 * Two ways out, deliberately different: "New game" restarts, while Esc or
 * a backdrop click only DISMISSES to the final board (the ending state and
 * the log stay reviewable; the status chip reopens the dialog). It holds
 * no game logic: the root passes the winner scalars and applies both
 * outcomes.
 *
 * Uses `setup()` (Composition API) so `deno check` gets full typing.
 */

import { defineComponent, onMounted, onUnmounted, ref } from "vue";
import type { PropType } from "vue";

/** Minimal DOM shapes for the focus trap (this repo typechecks without the
 *  DOM lib — the same structural style as CardZoom's bridge below). */
interface TrapTarget {
  focus(): void;
  disabled?: boolean;
}
interface TrapEvent {
  preventDefault(): void;
  shiftKey: boolean;
}
type TrapRoot = TrapTarget & {
  querySelectorAll(selectors: string): ArrayLike<TrapTarget>;
};

export default defineComponent({
  name: "WinModal",
  props: {
    /** The game winner (drives the dialog's name line). */
    winner: { type: String as PropType<string | null>, required: true },
    /** Why the game ended (rendered under the winner). */
    winReason: { type: String as PropType<string | null>, default: null },
  },
  emits: ["new-game", "dismiss"],
  setup() {
    const backdropRef = ref<TrapRoot | null>(null);
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

    /** Focus trap (Tab): keeps keyboard focus cycling INSIDE the dialog —
     *  without it Tab walks straight out into the page behind the modal. */
    function trapTab(e: TrapEvent): void {
      const root = backdropRef.value;
      if (!root) return;
      const stops: TrapTarget[] = [root];
      const buttons = root.querySelectorAll("button");
      for (let i = 0; i < buttons.length; i++) {
        const button = buttons[i]!;
        if (!button.disabled) stops.push(button);
      }
      const doc = globalThis as unknown as {
        document?: { activeElement?: TrapTarget | null };
      };
      const current = doc.document?.activeElement;
      const at = current ? stops.indexOf(current) : -1;
      const from = at === -1 ? 0 : at;
      e.preventDefault();
      const next = e.shiftKey
        ? stops[(from - 1 + stops.length) % stops.length]
        : stops[(from + 1) % stops.length];
      next?.focus();
    }

    return { backdropRef, trapTab };
  },
  template: `
    <div
      ref="backdropRef"
      class="win-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="'Game over: ' + winner"
      @click.self="$emit('dismiss')"
      @keydown.escape="$emit('dismiss')"
      @keydown.tab="trapTab"
      tabindex="0"
      data-testid="win-modal"
    >
      <div class="win-card">
        <div class="win-eyebrow">Game over</div>
        <div class="win-name">{{ winner }}</div>
        <p v-if="winReason" class="win-reason">{{ winReason }}</p>
        <button class="move-btn primary" @click="$emit('new-game')" data-testid="win-new-game">
          New game
        </button>
      </div>
    </div>
  `,
});
