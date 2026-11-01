/**
 * GameScreen: the play surface (Composition API form).
 *
 * Renders the public game status (viewer-aware) plus the human player's own
 * hand, and turns the engine's legal moves into buttons. All state mutation
 * flows up through the `move` event; the root component owns `applyMove` and
 * the AI turn loop.
 *
 * This file keeps every piece of state derivation (public status, legal
 * moves, prompts, tile-hosted basic actions) and the zoom/discard UI state;
 * the three big template clusters are extracted components:
 *
 *   - StatusBlock    — one player's `<section class="status-block">` panel
 *                      (opponent + own, one component instead of two copies)
 *   - ServerColumn   — one server column (server card/label, root row, ice
 *                      stack, Run button; corp-seat flip stays in CSS)
 *   - ActionPanel    — winner/waiting banners, access notice, prompt box
 *                      (incl. the discard picker) and the moves list
 *
 * Layout: Corp across the top (servers, ice), run/breach banner in the
 * middle, action panel + log, Runner (hand) at the bottom.
 */

import { computed, defineComponent, ref, watch } from "vue";
import type { PropType } from "vue";
import ActionPanel from "./action-panel.ts";
import CardTile from "./card-tile.ts";
import CardZoom from "./card-zoom.ts";
import ServerColumn from "./server-column.ts";
import StatusBlock from "./status-block.ts";
import { cardDef, engine } from "../../mod.ts";
import type { CardInstance, GameState, Move, PlayerSide, PublicGameStatus } from "../../types.ts";
import {
  actorOf,
  cardTitle,
  describeMove,
  findCardIn,
  formatEvent,
  handOf,
  imageFor,
  moveKey,
  promptFor,
  serverLabel,
} from "./util.ts";

export default defineComponent({
  name: "GameScreen",
  components: { ActionPanel, CardTile, CardZoom, ServerColumn, StatusBlock },
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
    /** Instance id of the grip card the popup was opened for (its single
     *  action row attaches to the zoom; the zoomed tile's under-tile row
     *  hides while open so the row never appears twice). */
    const zoomHandCardId = ref<string | null>(null);
    /** Game-log dock visibility (right sidebar). */
    const logOpen = ref(true);

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
    /**
     * The Corp's identity card id, read from the public status DTO. The
     * identity card is open information to both players (rules 10.2.2/10.2.3:
     * it starts the game faceup in the play area and is never hidden
     * information), so `players.corp.identity` already carries the real
     * cardId for every viewer — no new exposure was needed. Null only guards
     * a degenerate status so HQ keeps its glyph rendering instead of crashing.
     */
    const hqIdentity = computed<string | null>(() => {
      const id = corp.value.identity.cardId;
      return id && id !== "hidden" ? id : null;
    });
    /** Set when the identity art failed to load — HQ falls back to its glyph. */
    const identityImgFailed = ref(false);
    /** The HQ server card's identity art, or null to render the glyph face. */
    const hqIdentityImg = computed<string | null>(() =>
      hqIdentity.value && !identityImgFailed.value ? imageFor(hqIdentity.value) : null
    );
    watch(hqIdentity, () => {
      identityImgFailed.value = false;
    });
    /** Clicking the HQ server card opens the identity card popup. */
    function zoomHqIdentity(serverId: string) {
      if (serverId === "hq" && hqIdentity.value) zoom(hqIdentity.value);
    }
    const runner = computed(() => status.value.players.runner);
    /** Own / opponent seats: the side panel shows the opponent on top and
     *  the human player's own block on the bottom. */
    const opponentSide = computed<PlayerSide>(() => props.humanSide === "corp" ? "runner" : "corp");
    const ownSide = computed<PlayerSide>(() => props.humanSide);
    const opponent = computed(() => opponentSide.value === "corp" ? corp.value : runner.value);
    const own = computed(() => ownSide.value === "corp" ? corp.value : runner.value);
    const prompt = computed(() => promptFor(props.state, props.humanSide));
    const legal = computed<Move[]>(() =>
      isHumanTurn.value ? engine.getLegalMoves(props.state, props.humanSide) : []
    );
    const hand = computed(() => handOf(props.state, props.humanSide));
    const selectedKey = computed(() => [...discardSelected.value].sort().join(","));
    const canDiscard = computed(() => {
      if (!prompt.value || prompt.value.kind !== "discard") return false;
      if (discardSelected.value.length !== prompt.value.count) return false;
      return legal.value.some(
        (m: Move) =>
          m.kind === "discard" &&
          [...m.cardInstanceIds].sort().join(",") === selectedKey.value,
      );
    });
    /** The side the AI plays — the seat the human does not sit in. Names the
     *  thinking/waiting banners in both seats (human-as-Corp is supported). */
    const aiSideName = computed(() => (props.humanSide === "corp" ? "Runner" : "Corp"));
    /** The log dock's lines: the newest 150 events, newest first. Slicing
     *  before formatting keeps the per-state-change cost bounded, and each
     *  line carries the event's original log index as its v-for key (keying a
     *  reversed list by array position would make Vue reuse the wrong rows). */
    const events = computed<{ key: number; line: string }[]>(() => {
      const log = props.state.log;
      const start = Math.max(0, log.length - 150);
      return log
        .slice(start)
        .map((e, i) => ({
          key: start + i,
          line: formatEvent(props.state, e, props.humanSide),
        }))
        .reverse();
    });
    const warnings = computed<string[]>(() => props.state.supportWarnings.slice(-5));
    const run = computed(() => status.value.run);
    const breach = computed(() => status.value.breach);
    const accessedCard = computed(() => {
      for (const p of props.state.prompts) {
        // Only the human's own access decision pops the zoom: the AI answers
        // its accesses in ~60ms, so auto-opening on the opponent's prompt
        // just flashes a dialog the human can never act on.
        if (p.kind === "access-decision" && p.player === props.humanSide) {
          return findCardIn(props.state, p.cardId);
        }
      }
      return null;
    });
    /** Id of the ice the run currently sits at (the RUN highlight). */
    const currentIceId = computed<string | null>(() => run.value?.currentIce?.id ?? null);

    /**
     * Access decisions for the zoomed card (rule 7.2.2): pass, or the basic
     * trash ability when the card has a trash cost the Runner can pay.
     * Agenda stealing is mandatory and automatic (rule 7.2.3), so no button.
     */
    const accessActions = computed(() => {
      const actions: { label: string; move: Move }[] = [];
      for (const p of props.state.prompts) {
        if (p.kind !== "access-decision" || p.player !== props.humanSide) continue;
        const found = findCardIn(props.state, p.cardId);
        const trashCost = found ? cardDef(found.cardId).trashCost : null;
        if (
          trashCost !== null && trashCost > 0 && props.state.runner.credits >= trashCost
        ) {
          actions.push({
            label: `Trash (${trashCost} [credit])`,
            move: { kind: "runner.trashAccessed" },
          });
        }
        actions.push({ label: "Finish access", move: { kind: "runner.finishAccess" } });
        break;
      }
      return actions;
    });

    const serverRows = computed(() => status.value.servers);

    /** Moves that render on the side-panel status tiles instead of the
     *  action panel: gain-credit on the own credits tile, draw on the own
     *  hand stat (see gainCreditsMove / drawMove below). */
    const TILE_HOSTED_MOVES = new Set([
      "corp.gainCredits",
      "runner.gainCredits",
      "corp.draw",
      "runner.draw",
    ]);

    /** Whether the move is hosted on a side-panel tile, not the action panel. */
    function hostedOnTile(m: Move): boolean {
      return TILE_HOSTED_MOVES.has(m.kind);
    }

    /** The "gain 1 credit" basic action, when the human can take it. It lives
     *  on the own credits tile in the side panel instead of the action panel. */
    const gainCreditsMove = computed<Move | null>(() => {
      if (!isHumanTurn.value || prompt.value || accessedCard.value) return null;
      return legal.value.find((m: Move) =>
        m.kind === "corp.gainCredits" || m.kind === "runner.gainCredits"
      ) ?? null;
    });

    /** The "draw 1 card" basic action, when the human can take it. It lives
     *  on the own hand stat in the side panel instead of the action panel. */
    const drawMove = computed<Move | null>(() => {
      if (!isHumanTurn.value || prompt.value || accessedCard.value) return null;
      return legal.value.find((m: Move) => m.kind === "corp.draw" || m.kind === "runner.draw") ??
        null;
    });

    watch(
      () => props.state,
      () => {
        discardSelected.value = [];
      },
    );

    // When the human runner accesses a card, pop it up automatically so
    // it's easy to read before deciding to trash or finish access. Close
    // it when the access ends (the card was trashed or the access
    // finished). Opponent (AI) accesses never pop: accessedCard only
    // resolves the human's own prompt, so the dialog can't flash open for
    // ~one AI tick and close itself.
    watch(
      accessedCard,
      (card: CardInstance | null) => {
        zoomCardId.value = card && card.cardId !== "hidden" ? card.cardId : null;
        zoomHandCardId.value = null;
      },
    );

    function name(cardId: string | null): string {
      return cardTitle(cardId ?? "");
    }

    function toggleDiscard(id: string) {
      if (discardSelected.value.includes(id)) {
        discardSelected.value = discardSelected.value.filter((x: string) => x !== id);
      } else if (
        prompt.value && prompt.value.kind === "discard" &&
        discardSelected.value.length < prompt.value.count
      ) {
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
      zoomHandCardId.value = null;
    }

    /** Open the popup for a grip card (its single play/install row attaches). */
    function zoomHand(c: CardInstance) {
      zoomCardId.value = c.cardId;
      zoomHandCardId.value = c.id;
    }

    function closeZoom() {
      zoomCardId.value = null;
      zoomHandCardId.value = null;
    }

    /** A popup action consumed the card or ended the access — dismiss it. */
    function playFromZoom(move: Move) {
      play(move);
      closeZoom();
    }

    /** Clicking the access notice reopens the access popup (rule 7.2.2). */
    function openAccessZoom() {
      if (accessedCard.value) zoom(accessedCard.value.cardId);
    }

    /** Legal run move against one server, if the human Runner has one. */
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

    /** Generic moves for the action panel (jack out, …). Runs are
     *  deliberately excluded: every server already has its own Run button
     *  under it, so listing them here too only duplicates the row. The
     *  gain-credit and draw moves live on the own credits/hand tiles in
     *  the side panel, so they are excluded here too. */
    const generalMoves = computed<Move[]>(
      () =>
        legal.value.filter((m: Move) =>
          !isCardMove(m) && m.kind !== "runner.run" && !hostedOnTile(m)
        ),
    );

    /** Legal play/install moves for a card with this definition id. */
    function cardMoves(cardId: string): Move[] {
      if (!isHumanTurn.value || prompt.value) return [];
      return legal.value.filter((m: Move) => {
        switch (m.kind) {
          case "runner.install":
          case "runner.playEvent":
          case "corp.install":
          case "corp.playOperation":
            return m.cardId === cardId;
          default:
            return false;
        }
      });
    }

    /** Legal actions for one card in the human player's hand. */
    function handActionsFor(c: CardInstance): Move[] {
      return cardMoves(c.cardId);
    }

    /**
     * Buttons for the card popup: access decisions when the accessed card is
     * zoomed (rule 7.2.2), otherwise the single play/install row of the grip
     * card it was opened from. The engine emits one move set per definition
     * id, so this row is never doubled; the zoomed tile's own under-tile row
     * hides while the popup is open (see template), so the row appears
     * exactly once on screen. Empty for every other zoom.
     */
    const zoomActions = computed<{ label: string; move: Move }[]>(() => {
      const id = zoomCardId.value;
      if (!id) return [];
      if (accessedCard.value && accessedCard.value.cardId === id) {
        return accessActions.value;
      }
      const handCard = zoomHandCardId.value
        ? hand.value.find((c: CardInstance) => c.id === zoomHandCardId.value)
        : null;
      if (!handCard) return [];
      return cardMoves(handCard.cardId).map((m) => ({ label: shortActionLabel(m), move: m }));
    });

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

    /**
     * Human-readable label for a legal move, resolved against the
     * authoritative state here (the trusted root) so ActionPanel receives
     * only scalars and callbacks — no `GameState` at all.
     */
    function moveLabel(m: Move): string {
      return describeMove(props.state, m);
    }

    return {
      discardSelected,
      zoomCardId,
      zoomHandCardId,
      logOpen,
      status,
      isHumanTurn,
      isAiTurn,
      corp,
      runner,
      aiSideName,
      opponentSide,
      ownSide,
      opponent,
      own,
      prompt,
      legal,
      generalMoves,
      hand,
      canDiscard,
      events,
      warnings,
      run,
      breach,
      accessedCard,
      currentIceId,
      zoomActions,
      serverRows,
      gainCreditsMove,
      drawMove,
      hqIdentity,
      hqIdentityImg,
      name,
      moveKey,
      toggleDiscard,
      submitDiscard,
      play,
      playFromZoom,
      zoom,
      zoomHand,
      closeZoom,
      openAccessZoom,
      zoomHqIdentity,
      runMove,
      handActionsFor,
      shortActionLabel,
      moveLabel,
      identityImgFailed,
    };
  },
  template: `
    <div class="game">
      <!-- Status dock (left): turn badge + alerts + one StatusBlock per seat.
           .status-block's flex: 1 1 0 splits the dock evenly between them;
           data-side marks which side each block shows; active marks
           state.turn.player. -->
      <aside class="status-dock" data-testid="status-dock">
        <div class="status-half">
        <div class="status-title" data-testid="status-title">
          <div class="turn-badge">
            <span class="turn-num">Turn {{ state.turn.number }}</span>
            <span class="turn-player" :class="state.turn.player">
              {{ state.turn.player === 'corp' ? 'Corp' : 'Runner' }} acting · {{ state.turn.phase }}
            </span>
          </div>
          <button class="ghost-btn" @click="$emit('new-game')">New game</button>
        </div>
        <div v-if="state.winner || (!state.winner && isAiTurn && thinking) || lastWarning" class="status-alerts">
          <span v-if="state.winner" class="chip win" data-testid="winner">
            Winner: {{ state.winner }}
            <template v-if="state.winReason"> — {{ state.winReason }}</template>
          </span>
          <span v-if="!state.winner && isAiTurn && thinking" class="chip thinking" data-testid="ai-thinking">
            {{ aiSideName }} is thinking…
          </span>
          <span v-if="lastWarning" class="chip warn">{{ lastWarning }}</span>
        </div>
        <status-block
          :side="opponentSide"
          :stats="opponent"
          :agenda-target="status.agendaPointTarget"
          :active="state.turn.player === opponentSide"
        />
        <status-block
          :side="ownSide"
          :stats="own"
          :agenda-target="status.agendaPointTarget"
          :active="state.turn.player === ownSide"
          is-own
          :gain-move="gainCreditsMove"
          :draw-move="drawMove"
          @move="play"
        />
        </div>
      </aside>
      <!-- .game-main stacks servers, banner, action panel, hand, warnings
           top to bottom. The corp-seat class on .servers (below) drives the
           CSS "order" flip that puts ice on the runner side. -->
      <div class="game-main">
      <!-- Servers: one ServerColumn per public server row; the corp-seat flip
           (ice on the runner side) is CSS "order" on .server.central and
           .server.remote children, keyed off .servers.corp-seat above. -->
        <div class="servers" data-testid="servers" :class="{ 'corp-seat': humanSide === 'corp' }">
          <server-column
            v-for="s in serverRows"
            :key="s.id"
            :server="s"
            :corp-seat="humanSide === 'corp'"
            :identity-card-id="hqIdentity"
            :identity-img="hqIdentityImg"
            :run-move="runMove(s.id)"
            :run-in-progress="!!state.run"
            :current-ice-id="currentIceId"
            @move="play"
            @zoom="zoom"
            @zoom-identity="zoomHqIdentity"
            @identity-error="identityImgFailed = true"
          />
        </div>

        <!-- Run / breach banner (run/breach context for the action row). -->
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

        <!-- Action panel: winner/waiting banners, access notice, prompt box
             (incl. the discard picker) and the moves list. -->
        <section class="action-row">
          <action-panel
            :human-turn="isHumanTurn"
            :thinking="thinking"
            :ai-side-name="aiSideName"
            :winner="state.winner"
            :win-reason="state.winReason"
            :label="moveLabel"
            :accessed-card-id="accessedCard ? accessedCard.cardId : null"
            :prompt="prompt"
            :legal="legal"
            :general-moves="generalMoves"
            :hand="hand"
            :discard-selected="discardSelected"
            :can-discard="canDiscard"
            @move="play"
            @discard-toggle="toggleDiscard"
            @discard-submit="submitDiscard"
            @open-access="openAccessZoom"
          />
        </section>

        <!-- Hand (own grip, direct grid child via .hand-area wrapper). -->
        <section class="hand-area">
          <div class="hand-row runner-hand" data-testid="human-hand">
            <div v-for="c in hand" :key="c.id" class="hand-card">
              <card-tile
                :card="c"
                clickable
                @zoom="zoomHand(c)"
              />
              <div v-if="handActionsFor(c).length && zoomHandCardId !== c.id" class="card-actions">
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
        </section>

        <div v-if="warnings.length" class="support-warnings" data-testid="warnings">
          <span v-for="(w, i) in warnings" :key="i">⚠ {{ w }}</span>
        </div>
      </div><!-- /game-main -->

      <!-- Log dock (right sidebar). -->
      <aside class="log-dock" :class="{ collapsed: !logOpen }">
        <button
          class="log-toggle"
          :title="logOpen ? 'Collapse log' : 'Expand log'"
          @click="logOpen = !logOpen"
        >{{ logOpen ? '›' : '‹' }}</button>
        <div v-if="logOpen" class="log-panel" data-testid="log-panel">
          <h3>Game log</h3>
          <ul>
            <li v-for="e in events" :key="e.key">{{ e.line }}</li>
          </ul>
        </div>
      </aside>

      <card-zoom
        v-if="zoomCardId"
        :card-id="zoomCardId"
        :actions="zoomActions"
        @close="closeZoom"
        @move="playFromZoom"
      />
    </div>
  `,
});
