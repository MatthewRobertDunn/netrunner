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

import { computed, defineComponent, ref, watch } from "vue";
import type { PropType } from "vue";
import CardTile from "./card-tile.ts";
import CardZoom from "./card-zoom.ts";
import { cardDef } from "../../cards/catalogue.ts";
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
  imageFor,
  promptFor,
  serverLabel,
} from "./util.ts";

/**
 * Server glyphs for the central servers that still render a glyph: R&D,
 * Archives, and any remote server (which falls back to the generic
 * "set-sysgw" glyph via serverGlyph()). HQ no longer uses its glyph here —
 * the HQ server card renders the Corp's identity card instead (see the `hq`
 * branch in the CORP AREA template). The identity is public information to
 * both players (rule 10.2.3), so it is read from the public status DTO.
 */
const SERVER_GLYPH: Record<string, string> = {
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

    /**
     * Access decisions for the zoomed card (rule 7.2.2): pass, or the basic
     * trash ability when the card has a trash cost the Runner can pay.
     * Agenda stealing is mandatory and automatic (rule 7.2.3), so no button.
     */
    const accessActions = computed(() => {
      const actions: { label: string; move: Move }[] = [];
      for (const p of props.state.prompts) {
        if (p.kind !== "access-decision") continue;
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

    /** The "gain 1 credit" basic action, when the human can take it. It lives
     *  on the own credits tile in the side panel instead of the action panel. */
    const gainCreditsMove = computed<Move | null>(() => {
      if (!isHumanTurn.value || prompt.value || accessedCard.value) return null;
      return legal.value.find((m: Move) =>
        m.kind === "corp.gainCredits" || m.kind === "runner.gainCredits"
      ) ?? null;
    });

    /** Click the own credits tile: take the gain-credit basic action. */
    function playGainCredits() {
      if (gainCreditsMove.value) play(gainCreditsMove.value);
    }

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
        zoomHandCardId.value = null;
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

    function isCurrentIce(card: ViewCard): boolean {
      const r = status.value.run;
      if (!r || !r.currentIce) return false;
      return card.id === r.currentIce.id;
    }

    /** Glyph for a status block: Corp identity / Runner faction art. */
    function sideGlyph(side: PlayerSide): string {
      return side === "corp" ? "assets/svg/faction-hb.svg" : "assets/svg/faction-criminal.svg";
    }

    /** Correct discard-pile names (rules 2526-2545): Corp Archives, Runner Heap. */
    function discardName(side: PlayerSide): string {
      return side === "corp" ? "Archives" : "Heap";
    }

    function serverGlyph(id: string): string {
      return SERVER_GLYPH[id] ?? "";
    }

    /** Central servers keep their dedicated server card; everything else is a
     *  remote (id "remote-N"), drawn as a label + root/ice columns. Note: this
     *  is deliberately NOT `id in SERVER_GLYPH` — the glyph map only holds the
     *  servers that render one (the HQ branch shows the identity card instead,
     *  and is no longer in the map). */
    function isCentral(id: string): boolean {
      return id === "hq" || id === "rd" || id === "archives";
    }

    /** Label for a remote server: "remote-3" reads as "remote 3" (rule 4.6.8). */
    function remoteLabel(id: string): string {
      return id.replace("-", " ");
    }

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
     *  gain-credit move lives on the own credits tile in the side panel,
     *  so it is excluded here too. */
    const generalMoves = computed<Move[]>(
      () =>
        legal.value.filter((m: Move) =>
          !isCardMove(m) && m.kind !== "runner.run" &&
          m.kind !== "corp.gainCredits" && m.kind !== "runner.gainCredits"
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

    function promptTitle(p: { kind: string; title?: string }): string {
      if (p.kind === "choose-one" && p.title) return p.title;
      return PROMPT_TITLES[p.kind] ?? p.kind;
    }

    return {
      // data
      discardSelected,
      zoomCardId,
      zoomHandCardId,
      logOpen,
      // computed
      status,
      actor,
      isHumanTurn,
      isAiTurn,
      corp,
      runner,
      opponentSide,
      ownSide,
      opponent,
      own,
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
      accessActions,
      zoomActions,
      serverRows,
      gainCreditsMove,
      // methods
      label,
      name,
      moveKey,
      toggleDiscard,
      submitDiscard,
      play,
      playGainCredits,
      playFromZoom,
      zoom,
      zoomHand,
      closeZoom,
      isCurrentIce,
      serverGlyph,
      sideGlyph,
      discardName,
      isCentral,
      remoteLabel,
      runMove,
      promptTitle,
      handActionsFor,
      shortActionLabel,
      hqIdentity,
      hqIdentityImg,
      zoomHqIdentity,
      identityImgFailed,
    };
  },
  template: `
    <div class="game" :class="{ 'log-collapsed': !logOpen }">
      <!-- ================= STATUS DOCK (left) =================
           Mirrors the game-log dock width. Top half carries the title
           (turn badge style) plus the OPPONENT's status; the bottom half
           carries the human player's OWN status. data-side marks which
           side each block shows; active marks state.turn.player. -->
      <aside class="status-dock" data-testid="status-dock">
        <div class="status-half status-top">
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
            Corp is thinking…
          </span>
          <span v-if="lastWarning" class="chip warn">{{ lastWarning }}</span>
        </div>
        <section
          class="status-block status-opponent"
          :class="[opponentSide, { active: state.turn.player === opponentSide }]"
          data-testid="status-opponent"
          :data-side="opponentSide"
        >
          <div class="status-who">
            <img class="glyph-side" :src="sideGlyph(opponentSide)" alt="" />
            <span class="who">{{ opponentSide === 'corp' ? 'CORP' : 'RUNNER' }}</span>
            <span v-if="state.turn.player === opponentSide" class="acting-tag">acting</span>
            <span class="opp-tag">opponent</span>
          </div>
          <div class="status-primary">
            <div class="primary-stat credits">
              <img class="sym" src="assets/svg/credit.svg" alt="Credits" />
              <span class="primary-val">{{ opponent.credits }}</span>
            </div>
            <div class="primary-stat agenda">
              <img class="sym" src="assets/svg/agenda.svg" alt="Agenda points" />
              <span class="primary-val">{{ opponent.agendaPoints }}/{{ status.agendaPointTarget }}</span>
            </div>
          </div>
          <div class="status-secondary">
            <span class="stat"><img class="sym" src="assets/svg/click.svg" alt="Clicks" />{{ opponent.clicks }}</span>
            <span class="stat">hand {{ opponent.handCount }}/{{ opponent.handSize }}</span>
            <span class="stat">deck {{ opponent.deckCount }}</span>
            <span class="stat">{{ discardName(opponentSide) }} {{ opponent.discardCount }}</span>
            <span v-if="opponentSide === 'runner' && opponent.tags" class="stat"><img class="sym" src="assets/svg/tag.svg" alt="Tags" />{{ opponent.tags }}</span>
            <span v-if="opponentSide === 'corp' && opponent.tags" class="stat">bad pub {{ opponent.tags }}</span>
          </div>
          <span v-if="opponent.score.length" class="score-strip" :data-testid="opponentSide + '-score'">
            <img v-for="c in opponent.score" :key="c.id" class="mini-card" :src="'images/' + c.cardId + '.webp'" :alt="name(c.cardId)" />
          </span>
        </section>
        <section
          class="status-block status-own"
          :class="[ownSide, { active: state.turn.player === ownSide }]"
          data-testid="status-own"
          :data-side="ownSide"
        >
          <div class="status-who">
            <img class="glyph-side" :src="sideGlyph(ownSide)" alt="" />
            <span class="who">{{ ownSide === 'corp' ? 'CORP' : 'RUNNER' }} (you)</span>
            <span v-if="state.turn.player === ownSide" class="acting-tag">acting</span>
          </div>
          <div class="status-primary">
            <button
              class="primary-stat credits"
              :class="{ clickable: !!gainCreditsMove }"
              :disabled="!gainCreditsMove"
              data-testid="gain-credit"
              title="Gain 1 credit"
              @click="playGainCredits"
            >
              <img class="sym" src="assets/svg/credit.svg" alt="Credits" />
              <span class="primary-val">{{ own.credits }}</span>
            </button>
            <div class="primary-stat agenda">
              <img class="sym" src="assets/svg/agenda.svg" alt="Agenda points" />
              <span class="primary-val">{{ own.agendaPoints }}/{{ status.agendaPointTarget }}</span>
            </div>
          </div>
          <div class="status-secondary">
            <span class="stat"><img class="sym" src="assets/svg/click.svg" alt="Clicks" />{{ own.clicks }}</span>
            <span class="stat">hand {{ own.handCount }}/{{ own.handSize }}</span>
            <span class="stat">deck {{ own.deckCount }}</span>
            <span class="stat">{{ discardName(ownSide) }} {{ own.discardCount }}</span>
            <span v-if="ownSide === 'runner' && own.tags" class="stat"><img class="sym" src="assets/svg/tag.svg" alt="Tags" />{{ own.tags }}</span>
            <span v-if="ownSide === 'corp' && own.tags" class="stat">bad pub {{ own.tags }}</span>
          </div>
          <span v-if="own.score.length" class="score-strip" :data-testid="ownSide + '-score'">
            <img v-for="c in own.score" :key="c.id" class="mini-card" :src="'images/' + c.cardId + '.webp'" :alt="name(c.cardId)" />
          </span>
        </section>
        </div>
      </aside>
      <!-- Perspective class stays for seat-specific tweaks (server ice flip
           uses .corp-seat); the old in-flow strip order scheme is gone since
           both statuses now live in the left dock. .game-main holds servers,
           banner, action panel, hand, warnings top to bottom. -->
      <div class="game-main" :class="'perspective-' + humanSide">
      <!-- ================= SERVERS ================= -->
        <div class="servers" data-testid="servers" :class="{ 'corp-seat': humanSide === 'corp' }">
          <div v-for="s in serverRows" :key="s.id" class="server" :class="isCentral(s.id) ? 'central' : 'remote'">
            <!-- Central servers (hq, rd, archives) keep their dedicated server
                 card (corp back + glyph + name). HQ additionally shows the
                 Corp's identity card (open information, rule 10.2.3); the
                 @error flag falls back to the glyph when the art is missing. -->
            <template v-if="isCentral(s.id)">
              <div
                class="server-card"
                :class="{ clickable: s.id === 'hq' && hqIdentityImg }"
                @click="zoomHqIdentity(s.id)"
              >
                <img class="corp-back-img" src="assets/corp-back.svg" alt="" />
                <div v-if="s.id === 'hq' && hqIdentityImg" class="server-card-face identity-face">
                  <img
                    class="identity-art"
                    :src="hqIdentityImg"
                    :alt="name(hqIdentity)"
                    @error="identityImgFailed = true"
                  />
                  <span class="server-name">{{ name(hqIdentity) }}</span>
                </div>
                <div v-else class="server-card-face">
                  <img class="server-glyph" :src="serverGlyph(s.id)" :alt="name(s.id)" />
                  <span class="server-name">{{ name(s.id) }}</span>
                </div>
              </div>
            </template>
            <!-- Remotes: a small label nearest the corp side, shown only when the
                 server has a root card or ice. -->
            <template v-else>
              <div
                v-if="s.root.length || s.ice.length || s.unrezzedIceCount"
                class="server-label"
              >{{ remoteLabel(s.id) }}</div>
            </template>
            <!-- Root row and ice stack render for BOTH kinds. Remotes with only
                 ice reserve a one-card root-slot space (blank, no glyph/back) so
                 the layout doesn't jump when a root card is later installed; a
                 completely empty remote draws nothing else at all (only its Run
                 button). Central roots hold at most an upgrade. unrezzedIceCount
                 covers ice the Runner cannot identify yet (public status redacts
                 the cards, the count stays open information).

                 The DOM order below is one order for every case (server
                 card/label -> root row -> ice stack -> Run); the column order
                 is fixed up in CSS via order on .server.central children
                 (public/css/style.css). The screen is drawn from the human
                 player's seat, own side at the bottom, so the ice must sit on
                 the RUNNER side of the central server card: as Runner (runner
                 at the bottom) that is BELOW the card, which is this DOM
                 order; as Corp (corp at the bottom, runner at the top) the
                 ice stack moves ABOVE the card. The corp-seat class on
                 .servers drives that flip. Remotes keep their
                 label -> root -> ice order in both seats. -->
            <div v-if="s.root.length" class="server-root-row">
              <template v-for="c in s.root" :key="c.id">
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
            <div
              v-else-if="!isCentral(s.id) && (s.ice.length || s.unrezzedIceCount)"
              class="server-root-row server-root-empty"
            ></div>
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
              <div v-for="n in s.unrezzedIceCount" :key="'u' + s.id + n" class="ice-slot facedown">
                <card-tile facedown ice corp />
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

      <!-- ================= RUN / BREACH BANNER (run/breach context for the action row) ================= -->
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

      <!-- ================= ACTION PANEL ================= -->
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
            <!-- Access decisions live on the card popup (rule 7.2.2), so the
                 action panel shows nothing while one is pending. Clicking the
                 notice reopens the popup. -->
            <button
              v-if="accessedCard"
              class="banner-wait banner-access"
              data-testid="access-notice"
              @click="zoom(accessedCard.cardId)"
            >
              Accessing {{ name(accessedCard.cardId) }} — decide on the card
            </button>

            <div v-else-if="prompt" class="prompt-box" data-testid="prompt">
              <div class="prompt-title">{{ promptTitle(prompt) }}</div>

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
      </section>

      <!-- ================= HAND ================= -->
      <section class="hand-area">
        <div class="hand-row runner-hand" data-testid="human-hand">
          <div v-for="c in hand" :key="c.id" class="hand-card">
            <card-tile
              :card="{ cardId: c.cardId, rezzed: true, advancement: 0 }"
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

      <!-- ================= LOG DOCK (right) ================= -->
      <aside class="log-dock" :class="{ collapsed: !logOpen }">
        <button
          class="log-toggle"
          :title="logOpen ? 'Collapse log' : 'Expand log'"
          @click="logOpen = !logOpen"
        >{{ logOpen ? '›' : '‹' }}</button>
        <div v-if="logOpen" class="log-panel" data-testid="log-panel">
          <h3>Game log</h3>
          <ul>
            <li v-for="(line, i) in events" :key="i">{{ line }}</li>
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
