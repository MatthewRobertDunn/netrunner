/**
 * ActionPanel: the action-row panel (extracted from GameScreen).
 *
 * Shows, in priority order: the waiting banner (the AI is acting), the
 * human's turn UI — an access notice (reopens the card popup), a prompt box
 * (discard picker or one button per legal move), or the general moves list.
 * The game-over announcement is NOT here: it is the WinModal, a dialog over
 * the play surface (a win banner in this narrow per-card sidebar read as a
 * stray control). It holds no game logic and never sees the engine state:
 * the root passes scalars (`aiSideName` for the waiting banner) and a
 * `label(move)` callback that resolves move labels against the authoritative
 * state. Every click bubbles up as a `move` or `discard` event for the root
 * component to apply.
 *
 * The DOM contract is pinned by tests/ui/game_screen_test.ts: the
 * `data-panel="actions"` marker, the prompt box's `data-prompt` kind, and the
 * `.banner-wait` / `.banner-access` / `.prompt-box` / `.discard-picker` /
 * `.pick-slot` / `.moves` / `.move-btn` classes. Buttons carry the data-*
 * annotation contract's `data-action` + parameter attributes (see
 * docs/ui-gotchas.md): `data-option` on prompt answers is what makes every
 * prompt answerable by attribute rather than by button text.
 */

import { computed, defineComponent } from "vue";
import type { PropType } from "vue";
import type { CardInstance, Move, Prompt } from "../../types.ts";
import CardTile from "./card-tile.ts";
import { cardTitle, moveActionAttrs, moveKey, promptTitle } from "./util.ts";

export default defineComponent({
  name: "ActionPanel",
  components: { CardTile },
  props: {
    /** Whether it is the human player's turn to act. */
    humanTurn: { type: Boolean, default: false },
    /** The AI is mid-decision (waiting banner wording). */
    thinking: { type: Boolean, default: false },
    /** The side the AI plays, for the thinking/waiting banner wording. */
    aiSideName: { type: String, default: "Corp" },
    /** Human-readable label for a legal move — resolved by the root, which
     *  owns the engine state (this panel stays logic-free). */
    label: { type: Function as PropType<(m: Move) => string>, required: true },
    /** The card the human is accessing (shows the access notice). */
    accessedCardId: { type: String as PropType<string | null>, default: null },
    /** The human's own prompt, if any. */
    prompt: { type: Object as PropType<Prompt | null>, default: null },
    /** All legal moves for the human (prompt buttons). */
    legal: { type: Array as PropType<Move[]>, default: () => [] },
    /** Legal moves minus card/run/tile-hosted ones (general moves list). */
    generalMoves: { type: Array as PropType<Move[]>, default: () => [] },
    /** The human player's hand (discard picker tiles). */
    hand: { type: Array as PropType<CardInstance[]>, default: () => [] },
    /** Cards picked in the discard picker so far. */
    discardSelected: { type: Array as PropType<string[]>, default: () => [] },
    /** Whether the current discard selection can be submitted. */
    canDiscard: { type: Boolean, default: false },
  },
  emits: ["move", "discard-toggle", "discard-submit", "open-access"],
  setup(props: {
    humanTurn: boolean;
    thinking: boolean;
    aiSideName: string;
    label: (m: Move) => string;
    accessedCardId: string | null;
    prompt: Prompt | null;
    legal: Move[];
    generalMoves: Move[];
    hand: CardInstance[];
    discardSelected: string[];
    canDiscard: boolean;
  }) {
    const discardCount = computed(() =>
      props.prompt && props.prompt.kind === "discard" ? props.prompt.count : 0
    );
    /** Human-readable label for a move — delegates to the root's callback. */
    function label(move: Move): string {
      return props.label(move);
    }
    return { label, moveActionAttrs, moveKey, promptTitle, discardCount, cardTitle };
  },
  template: `
    <div class="action-panel" data-panel="actions">
      <template v-if="!humanTurn">
        <div class="banner-wait" data-state="waiting">
          <template v-if="thinking">{{ aiSideName }} is planning its move…</template>
          <template v-else>Waiting for the {{ aiSideName }}…</template>
        </div>
      </template>

      <template v-else>
        <!-- Everything below is the own sheet's Actions area: the access
             notice, the prompt box, or the general moves list. -->
        <h3 class="sheet-heading">Actions</h3>

        <!-- Access decisions live on the card popup (rule 7.2.2), so the
             action panel shows nothing while one is pending. Clicking the
             notice reopens the popup. -->
        <button
          v-if="accessedCardId"
          class="banner-wait banner-access"
          data-action="open-access"
          @click="$emit('open-access')"
        >
          Accessing {{ cardTitle(accessedCardId) }} — decide on the card
        </button>

        <div v-else-if="prompt" class="prompt-box" :data-prompt="prompt.kind">
          <div class="prompt-title">{{ promptTitle(prompt) }}</div>

          <div v-if="prompt.kind === 'discard'" class="discard-picker">
            <div class="hint" :data-count="discardCount">Choose {{ discardCount }} card(s) to discard:</div>
            <!-- Each slot is a real <button type="button"> whose single click
                 toggles the pick (Enter/Space work the same). The tile inside
                 is deliberately NOT clickable: a nested button would be
                 invalid HTML with a double tab stop, and one click would both
                 pick and open the zoom modal that blocks the next click. The
                 tile tooltip still names the card; the hand shows the same
                 cards zoomable. data-card-id / data-instance are what let the
                 automated agent pick by card instead of by art alt text; the
                 picked state is aria-pressed + the .picked class. -->
            <div class="hand-row picker">
              <button
                v-for="c in hand"
                :key="c.id"
                type="button"
                class="pick-slot"
                :class="{ picked: discardSelected.includes(c.id) }"
                :aria-pressed="String(discardSelected.includes(c.id))"
                data-action="discard-pick"
                :data-card-id="c.cardId"
                :data-instance="c.id"
                @click="$emit('discard-toggle', c.id)"
              >
                <card-tile
                  :card="c"
                  :badge="discardSelected.includes(c.id) ? '✓' : ''"
                  small
                  :clickable="false"
                />
              </button>
            </div>
            <button class="move-btn primary" :disabled="!canDiscard" data-action="discard-submit" @click="$emit('discard-submit')">
              Discard selected
            </button>
          </div>

          <div v-else class="moves">
            <button
              v-for="m in legal"
              :key="moveKey(m)"
              class="move-btn"
              v-bind="moveActionAttrs(m)"
              @click="$emit('move', m)"
            >{{ label(m) }}</button>
          </div>
        </div>

        <div v-else class="moves">
          <button
            v-for="m in generalMoves"
            :key="moveKey(m)"
            class="move-btn"
            v-bind="moveActionAttrs(m)"
            @click="$emit('move', m)"
          >{{ label(m) }}</button>
        </div>
      </template>
    </div>
  `,
});
