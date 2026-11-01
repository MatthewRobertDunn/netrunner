/**
 * ActionPanel: the action-row panel (extracted from GameScreen).
 *
 * Shows, in priority order: the winner banner, the waiting banner (the AI is
 * acting), the human's turn UI — an access notice (reopens the card popup),
 * a prompt box (discard picker or one button per legal move), or the general
 * moves list. It holds no game logic: every click bubbles up as a `move`,
 * `zoom`, or `discard` event for the root component to apply.
 *
 * The DOM contract is pinned by tests/ui/game_screen_test.ts: the
 * `action-panel`, `action-moves`, `prompt`, `access-notice`, and
 * `discard-submit` testids, and the `.banner-win` / `.banner-wait` /
 * `.banner-access` / `.prompt-box` / `.discard-picker` / `.pick-slot` /
 * `.moves` / `.move-btn` classes.
 */

import { computed, defineComponent } from "vue";
import type { PropType } from "vue";
import type { CardInstance, GameState, Move, Prompt } from "../../types.ts";
import CardTile from "./card-tile.ts";
import { cardTitle, describeMove, promptTitle } from "./util.ts";

function moveKey(m: Move): string {
  return JSON.stringify(m);
}

export default defineComponent({
  name: "ActionPanel",
  components: { CardTile },
  props: {
    state: { type: Object as PropType<GameState>, required: true },
    /** Whether it is the human player's turn to act. */
    humanTurn: { type: Boolean, default: false },
    /** The AI is mid-decision (waiting banner wording). */
    thinking: { type: Boolean, default: false },
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
  emits: ["move", "zoom", "discard-toggle", "discard-submit", "open-access"],
  setup(props: {
    state: GameState;
    humanTurn: boolean;
    thinking: boolean;
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
    /** Human-readable label for a move (viewer-aware). */
    function label(move: Move): string {
      return describeMove(props.state, move);
    }
    return { label, moveKey, promptTitle, discardCount, cardTitle };
  },
  template: `
    <div class="action-panel" data-testid="action-panel">
      <template v-if="state.winner">
        <div class="banner-win">Winner: {{ state.winner }} <span v-if="state.winReason">({{ state.winReason }})</span></div>
      </template>

      <template v-else-if="!humanTurn">
        <div class="banner-wait">
          <template v-if="thinking">Corp is planning its move…</template>
          <template v-else>Waiting for the Corp…</template>
        </div>
      </template>

      <template v-else>
        <!-- Access decisions live on the card popup (rule 7.2.2), so the
             action panel shows nothing while one is pending. Clicking the
             notice reopens the popup. -->
        <button
          v-if="accessedCardId"
          class="banner-wait banner-access"
          data-testid="access-notice"
          @click="$emit('open-access')"
        >
          Accessing {{ cardTitle(accessedCardId) }} — decide on the card
        </button>

        <div v-else-if="prompt" class="prompt-box" data-testid="prompt">
          <div class="prompt-title">{{ promptTitle(prompt) }}</div>

          <div v-if="prompt.kind === 'discard'" class="discard-picker">
            <div class="hint">Choose {{ discardCount }} card(s) to discard:</div>
            <div class="hand-row picker">
              <button
                v-for="c in hand"
                :key="c.id"
                type="button"
                class="pick-slot"
                :class="{ picked: discardSelected.includes(c.id) }"
                @click="$emit('discard-toggle', c.id)"
              >
                <card-tile
                  :card="{ cardId: c.cardId, rezzed: true, advancement: 0 }"
                  :badge="discardSelected.includes(c.id) ? '✓' : ''"
                  small
                  clickable
                  @zoom="$emit('zoom', c.cardId)"
                />
              </button>
            </div>
            <button class="move-btn primary" :disabled="!canDiscard" @click="$emit('discard-submit')" data-testid="discard-submit">
              Discard selected
            </button>
          </div>

          <div v-else class="moves">
            <button
              v-for="m in legal"
              :key="moveKey(m)"
              class="move-btn"
              @click="$emit('move', m)"
              :data-move="m.kind"
            >{{ label(m) }}</button>
          </div>
        </div>

        <div v-else class="moves" data-testid="action-moves">
          <button
            v-for="m in generalMoves"
            :key="moveKey(m)"
            class="move-btn"
            @click="$emit('move', m)"
            :data-move="m.kind"
          >{{ label(m) }}</button>
        </div>
      </template>
    </div>
  `,
});
