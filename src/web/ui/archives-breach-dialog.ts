/**
 * ArchivesBreachDialog: the modal that owns an Archives breach for the human
 * Runner (rules 7.3.2-7.3.4, 7.4.1d).
 *
 * A successful run on Archives must access EVERY card in the pile — there is
 * nothing to decline — so the dialog is deliberately not dismissible: no Esc,
 * no backdrop click, no close button. It mounts while the breach is active
 * and unmounts when the engine ends it (all candidates accessed → run ends).
 *
 * Interaction model (one click per card):
 *   - Click a remaining tile  → the app root accesses it AND answers the
 *     forced finish decision (rule 7.1.5b removed the trash option for cards
 *     already in Archives, so the decision has no real choice). When the
 *     engine auto-chooses the last remaining candidate (its one-candidate
 *     shortcut in `stepBreach`), that decision is NOT answered silently — the
 *     tile shows "Accessing…" and a Finish access button appears, so the
 *     final card (possibly a stolen agenda) is always seen.
 *   - "Access remaining"      → sweeps the rest left-to-right (agendas first
 *     — they are sorted to the left so stealing them, the point of the run,
 *     is the first thing on offer).
 *
 * The parent (GameScreen) suppresses the per-card zoom and quiets the action
 * panel while this dialog is open: this modal is the single surface for every
 * breach decision (docs/ui-gotchas.md, the archives-dialog entry).
 *
 * DOM contract (pinned by tests/ui/archives_breach_dialog_test.ts):
 *   [data-modal="archives-breach"]  root
 *   [data-state]                    per tile: remaining|accessing|accessed|stolen
 *   [data-action="accessCard"]      per remaining tile (+ data-target)
 *   [data-action="finishAccess"]    the pending forced decision
 *   [data-action="access-remaining"] the bulk sweep button
 *   [data-breach-accessed] / [data-breach-remaining] status counters
 *
 * Uses `setup()` (Composition API) so `deno check` gets full typing.
 */

import { computed, defineComponent, onMounted, onUnmounted, ref } from "vue";
import type { PropType } from "vue";
import type { ArchivesBreachEntry } from "./archives-breach.ts";
import CardTile from "./card-tile.ts";

/** Minimal DOM shapes for the focus trap (same bridge as WinModal's). */
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
  name: "ArchivesBreachDialog",
  components: { CardTile },
  props: {
    /** The breach's ordered card list (see archives-breach.ts). */
    entries: { type: Array as PropType<ArchivesBreachEntry[]>, required: true },
  },
  emits: ["access", "finish", "remaining"],
  setup(props: { entries: ArchivesBreachEntry[] }) {
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

    /** Focus trap (Tab) — same contract as WinModal/CardZoom. */
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

    const remaining = computed(() => props.entries.filter((e) => e.state === "remaining"));
    const accessing = computed(() => props.entries.find((e) => e.state === "accessing") ?? null);
    const accessed = computed(() => props.entries.filter((e) => e.state !== "remaining").length);
    const stolenPoints = computed(() => props.entries.reduce((sum, e) => sum + e.agendaPoints, 0));

    /** Under-tile badge text (the data-state attribute is the agent contract;
     *  this is the human-readable mirror of it). */
    function badgeFor(entry: ArchivesBreachEntry): string {
      if (entry.state === "accessing") return "Accessing…";
      if (entry.state === "stolen") return `Stolen +${entry.agendaPoints}`;
      if (entry.state === "accessed") return "Accessed";
      return "";
    }

    return {
      backdropRef,
      trapTab,
      remaining,
      accessing,
      accessed,
      stolenPoints,
      badgeFor,
    };
  },
  template: `
    <div
      ref="backdropRef"
      class="breach-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Accessing Archives"
      data-modal="archives-breach"
      tabindex="0"
      @keydown.tab="trapTab"
    >
      <div class="breach-card">
        <div class="breach-eyebrow">Successful run</div>
        <h2 class="breach-title">Accessing Archives</h2>
        <p class="breach-hint">
          Every card in Archives is faceup and must be accessed (rule 7.3.4) —
          click a card to access it. Agendas are stolen automatically
          (rule 7.1.6); cards already in Archives cannot be trashed
          (rule 7.1.5b).
        </p>

        <div class="breach-status">
          <span data-breach-accessed>Accessed {{ accessed }} of {{ entries.length }}</span>
          <span data-breach-remaining>{{ remaining.length }} remaining</span>
          <span v-if="stolenPoints > 0" class="breach-stolen" data-breach-stolen-points>
            Stolen +{{ stolenPoints }} agenda points
          </span>
        </div>

        <div class="breach-cards">
          <template v-for="entry in entries" :key="entry.card.id">
            <!-- Remaining: a real button (keyboard reachable); disabled while
                 a forced finish decision is pending — that decision belongs to
                 the accessing card. -->
            <button
              v-if="entry.state === 'remaining'"
              class="breach-slot"
              data-state="remaining"
              :data-instance="entry.card.id"
              data-action="accessCard"
              :data-target="entry.card.id"
              :disabled="!!accessing"
              @click="$emit('access', entry.card.id)"
            >
              <card-tile :card="entry.card" />
            </button>
            <!-- Accessed / accessing / stolen: inert, badged in place. The
                 tile itself carries data-card-id; the wrapper only scopes the
                 copy (data-instance) and the breach state. -->
            <div
              v-else
              class="breach-slot"
              :data-state="entry.state"
              :data-instance="entry.card.id"
            >
              <card-tile :card="entry.card" :highlight="entry.state === 'accessing'" :badge="badgeFor(entry)" />
            </div>
          </template>
          <span v-if="!entries.length" class="breach-empty">Archives is empty</span>
        </div>

        <div class="breach-controls">
          <button
            v-if="accessing"
            class="move-btn primary"
            data-action="finishAccess"
            @click="$emit('finish')"
          >Finish access</button>
          <button
            class="move-btn"
            data-action="access-remaining"
            :disabled="!remaining.length && !accessing"
            @click="$emit('remaining')"
          >Access remaining</button>
        </div>
      </div>
    </div>
  `,
});
