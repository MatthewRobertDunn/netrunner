/**
 * GameScreen: the play surface (Composition API form).
 *
 * Renders the public game status (viewer-aware) plus the human player's own
 * hand, and turns the engine's legal moves into buttons. All state mutation
 * flows up through the `move` event; the root component owns `applyMove` and
 * the AI turn loop.
 *
 * Layout: Corp across the top (servers, ice), run/breach banner in the
 * middle, action panel + log, Runner (hand) at the bottom.
 */

import { computed, defineComponent, ref, watch } from "npm:vue@3.5.13/dist/vue.esm-bundler.js";
import type { PropType } from "npm:vue@3.5.13/dist/vue.esm-bundler.js";
import CardTile from "./card-tile.ts";
import CardZoom from "./card-zoom.ts";
import { engine } from "../../mod.ts";
import type {
  CardInstance,
  GameState,
  Move,
  PlayerSide,
  PublicGameStatus,
  ViewCard,
} from "../../types.ts";
import {
  actorOf,
  cardTitle,
  describeMove,
  findCardIn,
  formatEvent,
  handOf,
  promptFor,
  serverLabel,
} from "./util.ts";

const SERVER_GLYPH: Record<string, string> = {
  hq: "assets/svg/hq.svg",
  rd: "assets/svg/rd.svg",
  archives: "assets/svg/archives.svg",
};

const PROMPT_TITLES: Record<string, string> = {
  mulligan: "Mulligan?",
  discard: "Discard phase",
  "rez-window": "Rez window",
  "choose-one": "Choose one",
  "access-decision": "Accessed card",
};

function moveKey(m: Move): string {
  return JSON.stringify(m);
}

export default defineComponent({
  name: "GameScreen",
  components: { CardTile, CardZoom },
  props: {
    state: { type: Object as PropType<GameState>, required: true },
    humanSide: { type: String as PropType<PlayerSide>, required: true },
    thinking: { type: Boolean, default: false },
    lastWarning: { type: String, default: "" },
  },
  emits: ["move", "new-game"],
  setup(
    props: {
      state: GameState;
      humanSide: PlayerSide;
      thinking: boolean;
      lastWarning: string;
    },
    { emit }: { emit: (event: "move" | "new-game", ...args: unknown[]) => void },
  ) {
    const discardSelected = ref<string[]>([]);
    const zoomCardId = ref<string | null>(null);

    const status = computed<PublicGameStatus>(() =>
      engine.getPublicGameStatusFor(props.state, props.humanSide)
    );
    const actor = computed<PlayerSide>(() => actorOf(props.state));
    const isHumanTurn = computed(
      () => !props.state.winner && actor.value === props.humanSide,
    );
    const isAiTurn = computed(
      () => !props.state.winner && actor.value !== props.humanSide,
    );
    const corp = computed(() => status.value.players.corp);
    const runner = computed(() => status.value.players.runner);
    const prompt = computed(() => promptFor(props.state, props.humanSide));
    const legal = computed<Move[]>(() =>
      isHumanTurn.value ? engine.getLegalMoves(props.state, props.humanSide) : []
    );
    const hand = computed(() => handOf(props.state, props.humanSide));
    const discardCount = computed(() =>
      prompt.value && prompt.value.kind === "discard" ? prompt.value.count : 0
    );
    const selectedKey = computed(() => [...discardSelected.value].sort().join(","));
    const canDiscard = computed(() => {
      if (!discardCount.value || discardSelected.value.length !== discardCount.value) {
        return false;
      }
      return legal.value.some(
        (m: Move) =>
          m.kind === "discard" &&
          [...m.cardInstanceIds].sort().join(",") === selectedKey.value,
      );
    });
    const events = computed<string[]>(() => {
      const lines = props.state.log.map((e) => formatEvent(props.state, e, props.humanSide));
      return lines.slice(-150).reverse();
    });
    const warnings = computed<string[]>(() => props.state.supportWarnings.slice(-5));
    const run = computed(() => status.value.run);
    const breach = computed(() => status.value.breach);
    const accessedCard = computed(() => {
      for (const p of props.state.prompts) {
        if (p.kind === "access-decision") return findCardIn(props.state, p.cardId);
      }
      return null;
    });
    const serverRows = computed(() => status.value.servers);

    watch(
      () => props.state,
      () => {
        discardSelected.value = [];
      },
    );

    // When the runner accesses a card, pop it up automatically so it's easy
    // to read before deciding to trash or finish access. Close it when the
    // access ends (the card was trashed or the access finished).
    watch(
      accessedCard,
      (card: CardInstance | null) => {
        zoomCardId.value = card && card.cardId !== "hidden" ? card.cardId : null;
      },
    );

    function label(move: Move): string {
      return describeMove(props.state, move);
    }

    function name(cardId: string): string {
      return cardTitle(cardId);
    }

    function toggleDiscard(id: string) {
      if (discardSelected.value.includes(id)) {
        discardSelected.value = discardSelected.value.filter((x: string) => x !== id);
      } else if (discardSelected.value.length < discardCount.value) {
        discardSelected.value = [...discardSelected.value, id];
      }
    }

    function submitDiscard() {
      if (!canDiscard.value) return;
      const option = legal.value.find(
        (m: Move) =>
          m.kind === "discard" &&
          [...m.cardInstanceIds].sort().join(",") === selectedKey.value,
      );
      if (option) emit("move", option);
    }

    function play(move: Move) {
      emit("move", move);
    }

    function zoom(cardId: string) {
      zoomCardId.value = cardId;
    }

    function closeZoom() {
      zoomCardId.value = null;
    }

    function isCurrentIce(card: ViewCard): boolean {
      const r = status.value.run;
      if (!r || !r.currentIce) return false;
      return card.id === r.currentIce.id;
    }

    function serverGlyph(id: string): string {
      return SERVER_GLYPH[id] ?? "assets/svg/set-sysgw.svg";
    }

    /** Corp root (non-ice) installed cards per server id, viewer-aware. */
    const rootCards = computed<Record<string, ViewCard[]>>(() => {
      const map: Record<string, ViewCard[]> = {};
      for (const c of corp.value.installed) {
        if (c.server && c.iceIndex === undefined) {
          (map[c.server] ??= []).push(c);
        }
      }
      return map;
    });

    function runMove(server: string): Move | undefined {
      return legal.value.find(
        (m: Move) => m.kind === "runner.run" && (m as { server: string }).server === server,
      );
    }

    /** Moves that belong to a specific hand card (install / play). */
    function isCardMove(m: Move): boolean {
      return m.kind === "runner.install" || m.kind === "runner.playEvent" ||
        m.kind === "corp.install" || m.kind === "corp.playOperation";
    }

    /** Generic moves (credits, runs, jack out, …) for the action panel. */
    const generalMoves = computed<Move[]>(() => legal.value.filter((m: Move) => !isCardMove(m)));

    /** Legal actions for one card in the human player's hand. */
    function handActionsFor(c: CardInstance): Move[] {
      if (!isHumanTurn.value || prompt.value) return [];
      return legal.value.filter((m: Move) => {
        switch (m.kind) {
          case "runner.install":
          case "runner.playEvent":
          case "corp.install":
          case "corp.playOperation":
            return m.cardId === c.cardId;
          default:
            return false;
        }
      });
    }

    /** Short button label for an under-card action (the card is above it). */
    function shortActionLabel(m: Move): string {
      switch (m.kind) {
        case "runner.install":
          return "Install";
        case "corp.install":
          return `Install → ${serverLabel(m.server)}`;
        case "runner.playEvent":
        case "corp.playOperation":
          return "Play";
        default:
          return describeMove(props.state, m);
      }
    }

    function promptTitle(p: { kind: string; title?: string }): string {
      if (p.kind === "choose-one" && p.title) return p.title;
      return PROMPT_TITLES[p.kind] ?? p.kind;
    }

    return {
      // data
      discardSelected,
      zoomCardId,
      // computed
      status,
      actor,
      isHumanTurn,
      isAiTurn,
      corp,
      runner,
      prompt,
      legal,
      generalMoves,
      hand,
      discardCount,
      canDiscard,
      events,
      warnings,
      run,
      breach,
      accessedCard,
      serverRows,
      rootCards,
      // methods
      label,
      name,
      moveKey,
      toggleDiscard,
      submitDiscard,
      play,
      zoom,
      closeZoom,
      isCurrentIce,
      serverGlyph,
      runMove,
      promptTitle,
      handActionsFor,
      shortActionLabel,
    };
  },
  template: `
    <div class="game">
      <!-- ================= HEADER ================= -->
      <header class="game-header">
        <div class="turn-badge">
          <span class="turn-num">Turn {{ state.turn.number }}</span>
          <span class="turn-player" :class="state.turn.player">
            {{ state.turn.player === 'corp' ? 'Corp' : 'Runner' }} acting · {{ state.turn.phase }}
          </span>
        </div>
        <div class="header-status">
          <span class="chip">AP target {{ status.agendaPointTarget }}</span>
          <span v-if="state.winner" class="chip win" data-testid="winner">
            Winner: {{ state.winner }}
            <template v-if="state.winReason"> — {{ state.winReason }}</template>
          </span>
          <span v-if="!state.winner && isAiTurn && thinking" class="chip thinking" data-testid="ai-thinking">
            Corp is thinking…
          </span>
          <span v-if="lastWarning" class="chip warn">{{ lastWarning }}</span>
        </div>
        <button class="ghost-btn" @click="$emit('new-game')">New game</button>
      </header>

      <!-- ================= CORP AREA ================= -->
      <section class="corp-area">
        <div class="player-strip corp" :class="{ active: state.turn.player === 'corp' }">
          <img class="glyph-side" src="assets/svg/faction-hb.svg" alt="" />
          <span class="who">CORP</span>
          <span class="stat"><img class="sym" src="assets/svg/credit.svg" alt="Credit" />{{ corp.credits }}</span>
          <span class="stat"><img class="sym" src="assets/svg/click.svg" alt="Click" />{{ corp.clicks }}</span>
          <span class="stat">hand {{ corp.handCount }}/{{ corp.handSize }}</span>
          <span class="stat">deck {{ corp.deckCount }}</span>
          <span class="stat">heap {{ corp.discardCount }}</span>
          <span class="stat"><img class="sym" src="assets/svg/agenda.svg" alt="Agenda points" />{{ corp.agendaPoints }}/{{ status.agendaPointTarget }}</span>
          <span v-if="corp.tags" class="stat">bad publicity {{ corp.tags }}</span>
          <span v-if="corp.score.length" class="score-strip" data-testid="corp-score">
            <img v-for="c in corp.score" :key="c.id" class="mini-card" :src="'images/' + c.cardId + '.webp'" :alt="name(c.cardId)" />
          </span>
        </div>

        <div class="servers" data-testid="servers">
          <div v-for="s in serverRows" :key="s.id" class="server">
            <div class="server-ice-stack">
              <div v-for="card in s.ice" :key="card.id" class="ice-slot">
                <card-tile
                  :card="card"
                  ice
                  clickable
                  :highlight="isCurrentIce(card)"
                  :badge="isCurrentIce(card) ? 'RUN' : ''"
                  @zoom="zoom"
                />
              </div>
              <div v-for="n in s.unrezzedCount" :key="'u' + s.id + n" class="ice-slot facedown">
                <card-tile facedown ice corp />
              </div>
            </div>
            <div v-if="(rootCards[s.id] ?? []).length" class="server-root-row">
              <template v-for="c in rootCards[s.id]" :key="c.id">
                <card-tile
                  v-if="c.cardId !== 'hidden'"
                  :card="{ cardId: c.cardId, rezzed: c.rezzed, advancement: c.advancement }"
                  small
                  clickable
                  @zoom="zoom"
                />
                <card-tile v-else facedown small corp />
              </template>
            </div>
            <div class="server-card">
              <img class="corp-back-img" src="assets/corp-back.svg" alt="" />
              <div class="server-card-face">
                <img class="server-glyph" :src="serverGlyph(s.id)" :alt="name(s.id)" />
                <span class="server-name">{{ name(s.id) }}</span>
              </div>
            </div>
            <button
              v-if="runMove(s.id) && !state.run"
              class="run-btn"
              @click="play(runMove(s.id))"
              :data-testid="'run-' + s.id"
            >Run</button>
          </div>
        </div>
      </section>

      <!-- ================= RUN / BREACH BANNER ================= -->
      <section v-if="run || breach" class="run-banner" data-testid="run-banner">
        <template v-if="breach">
          <span class="run-tag">BREACH</span> {{ name(breach.server) }} ·
          <span v-if="breach.accessing">accessing a card…</span>
          <span v-else>{{ breach.randomAccessLimit - breach.randomAccessesUsed }} access(es) left</span>
        </template>
        <template v-else-if="run">
          <span class="run-tag">RUN</span> on {{ name(run.server) }}
          <template v-if="run.currentIce">
            · approached {{ name(run.currentIce.cardId) }}
            <span v-if="run.brokenSubroutines.length"> · {{ run.brokenSubroutines.length }} sub(s) broken</span>
          </template>
          <template v-else> · at {{ name(run.server) }}</template>
        </template>
      </section>

      <!-- ================= ACTION + LOG ================= -->
      <section class="action-row">
        <div class="action-panel" data-testid="action-panel">
          <template v-if="state.winner">
            <div class="banner-win">Winner: {{ state.winner }} <span v-if="state.winReason">({{ state.winReason }})</span></div>
          </template>

          <template v-else-if="!isHumanTurn">
            <div class="banner-wait">
              <template v-if="thinking">Corp is planning its move…</template>
              <template v-else>Waiting for the Corp…</template>
            </div>
          </template>

          <template v-else>
            <div v-if="prompt" class="prompt-box" data-testid="prompt">
              <div class="prompt-title">{{ promptTitle(prompt) }}</div>

              <div v-if="accessedCard" class="accessed-card-strip">
                <span class="accessed-label">Accessing</span>
                <card-tile
                  :card="accessedCard"
                  clickable
                  @zoom="zoom"
                />
              </div>

              <div v-if="prompt.kind === 'discard'" class="discard-picker">
                <div class="hint">Choose {{ discardCount }} card(s) to discard:</div>
                <div class="hand-row picker">
                  <div
                    v-for="c in hand"
                    :key="c.id"
                    class="pick-slot"
                    :class="{ picked: discardSelected.includes(c.id) }"
                    @click="toggleDiscard(c.id)"
                  >
                    <card-tile
                      :card="{ cardId: c.cardId, rezzed: true, advancement: 0 }"
                      :badge="discardSelected.includes(c.id) ? '✓' : ''"
                      small
                      clickable
                      @zoom="zoom"
                    />
                  </div>
                </div>
                <button class="move-btn primary" :disabled="!canDiscard" @click="submitDiscard" data-testid="discard-submit">
                  Discard selected
                </button>
              </div>

              <div v-else class="moves">
                <button
                  v-for="m in legal"
                  :key="moveKey(m)"
                  class="move-btn"
                  @click="play(m)"
                  :data-move="m.kind"
                >{{ label(m) }}</button>
              </div>
            </div>

            <div v-else class="moves" data-testid="action-moves">
              <button
                v-for="m in generalMoves"
                :key="moveKey(m)"
                class="move-btn"
                @click="play(m)"
                :data-move="m.kind"
              >{{ label(m) }}</button>
            </div>
          </template>
        </div>

        <div class="log-panel">
          <h3>Game log</h3>
          <ul>
            <li v-for="(line, i) in events" :key="i">{{ line }}</li>
          </ul>
        </div>
      </section>

      <!-- ================= RUNNER AREA ================= -->
      <section class="runner-area">
        <div class="hand-row runner-hand" data-testid="human-hand">
          <div v-for="c in hand" :key="c.id" class="hand-card">
            <card-tile
              :card="{ cardId: c.cardId, rezzed: true, advancement: 0 }"
              clickable
              @zoom="zoom"
            />
            <div v-if="handActionsFor(c).length" class="card-actions">
              <button
                v-for="m in handActionsFor(c)"
                :key="moveKey(m)"
                class="move-btn card-action-btn"
                @click="play(m)"
                :data-move="m.kind"
              >{{ shortActionLabel(m) }}</button>
            </div>
          </div>
          <span v-if="!hand.length" class="empty-hand">(no cards in hand)</span>
        </div>
        <div class="player-strip runner" :class="{ active: state.turn.player === 'runner' }">
          <img class="glyph-side" src="assets/svg/faction-criminal.svg" alt="" />
          <span class="who">RUNNER</span>
          <span class="stat"><img class="sym" src="assets/svg/credit.svg" alt="Credit" />{{ runner.credits }}</span>
          <span class="stat"><img class="sym" src="assets/svg/click.svg" alt="Click" />{{ runner.clicks }}</span>
          <span class="stat">hand {{ runner.handCount }}/{{ runner.handSize }}</span>
          <span class="stat">deck {{ runner.deckCount }}</span>
          <span class="stat">heap {{ runner.discardCount }}</span>
          <span v-if="runner.tags" class="stat"><img class="sym" src="assets/svg/tag.svg" alt="Tags" />{{ runner.tags }} tags</span>
          <span v-if="runner.score.length" class="score-strip">
            <img v-for="c in runner.score" :key="c.id" class="mini-card" :src="'images/' + c.cardId + '.webp'" :alt="name(c.cardId)" />
          </span>
        </div>
      </section>

      <div v-if="warnings.length" class="support-warnings" data-testid="warnings">
        <span v-for="(w, i) in warnings" :key="i">⚠ {{ w }}</span>
      </div>

      <card-zoom v-if="zoomCardId" :card-id="zoomCardId" @close="closeZoom" />
    </div>
  `,
});
