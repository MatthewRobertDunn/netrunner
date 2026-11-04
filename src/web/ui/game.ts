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
 *                      (opponent + own, one component instead of two copies;
 *                      its scored-agenda mini-cards emit `zoom`)
 *   - ServerColumn   — one server column (server card/label, root row, ice
 *                      stack, Run button; corp-seat flip stays in CSS)
 *   - ActionPanel    — waiting banner, access notice, prompt box, moves list
 *   - WinModal      — the game-over dialog (winner + win reason + New game)
 *                      (incl. the discard picker) and the moves list
 *
 * Layout: Corp across the top (servers, ice), run/breach banner in the
 * middle, action panel + log, Runner (hand) at the bottom.
 */

import { computed, defineComponent, ref, watch } from "vue";
import type { PropType } from "vue";
import ActionPanel from "./action-panel.ts";
import ArchivesBreachDialog from "./archives-breach-dialog.ts";
import { archivesBreachActive, archivesBreachEntries } from "./archives-breach.ts";
import CardSheet, { buildSheetGroups } from "./card-sheet.ts";
import CardTile from "./card-tile.ts";
import CardZoom from "./card-zoom.ts";
import ServerColumn from "./server-column.ts";
import StatusBlock from "./status-block.ts";
import WinModal from "./win-modal.ts";
import { availableCredits, cardDef, engine } from "../../mod.ts";
import type { CardInstance, GameState, Move, PlayerSide, PublicGameStatus } from "../../types.ts";
import { isCorpInstall } from "../../types.ts";
import {
  actorOf,
  cardTitle,
  describeMove,
  findCardIn,
  formatEvent,
  handOf,
  imageFor,
  moveActionAttrs,
  moveKey,
  phaseLabel,
  promptFor,
  serverLabel,
} from "./util.ts";

export default defineComponent({
  name: "GameScreen",
  components: {
    ActionPanel,
    ArchivesBreachDialog,
    CardSheet,
    CardTile,
    CardZoom,
    ServerColumn,
    StatusBlock,
    WinModal,
  },
  props: {
    state: { type: Object as PropType<GameState>, required: true },
    humanSide: { type: String as PropType<PlayerSide>, required: true },
    thinking: { type: Boolean, default: false },
    lastWarning: { type: String, default: "" },
  },
  emits: ["move", "new-game", "archives-advance"],
  setup(
    props: {
      state: GameState;
      humanSide: PlayerSide;
      thinking: boolean;
      lastWarning: string;
    },
    { emit }: {
      emit: (event: "move" | "new-game" | "archives-advance", ...args: unknown[]) => void;
    },
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
    /**
     * Remaining access candidates for the current breach (rules 7.3.3-7.3.5),
     * mirroring the engine's `candidatesForBreach`: the breached server's root
     * cards, plus the random pool while accesses remain (every unchosen HQ
     * hand card, or R&D's top card), all minus the ids already chosen. The
     * banner must count CANDIDATES, not the access limit — the two diverge as
     * soon as a root card or a bigger hand is in play. Computed from the
     * trusted state here because the public DTO carries only the limit/used
     * counters, not the chosen ids; the count itself is open information
     * (the status panel already shows the hand/deck sizes it is derived from).
     */
    const breachCandidatesLeft = computed<number>(() => {
      const b = props.state.breach;
      if (!b) return 0;
      const chosen = new Set(b.chosen);
      const root = props.state.servers.find((s) => s.id === b.server)?.root ?? [];
      let count = root.filter((c) => !chosen.has(c.id)).length;
      if (b.server === "hq" && b.randomAccessesUsed < b.randomAccessLimit) {
        count += props.state.corp.hand.filter((c) => !chosen.has(c.id)).length;
      } else if (b.server === "rd" && b.randomAccessesUsed < b.randomAccessLimit) {
        const top = props.state.corp.deck[0];
        if (top && !chosen.has(top.id)) count += 1;
      } else if (b.server === "archives") {
        count += props.state.corp.discard.filter((c) => !chosen.has(c.id)).length;
      }
      return count;
    });
    /**
     * The human Runner's Archives breach dialog domain (rules 7.3.2-7.3.4).
     * While it is open it OWNS every breach decision: the per-card access
     * zoom and the action panel's access affordances are suppressed (one
     * surface, no duplicate buttons — docs/ui-gotchas.md, the no-duplicates
     * rule). Corp-owned prompts that can fire mid-breach (Send a Message's
     * free-rez choice on steal) stay underneath: the AI answers them and the
     * dialog remains. A RUNNER-owned prompt the dialog cannot answer would
     * hide the modal instead — no starter-pool card produces one, but the
     * guard keeps the prompt box reachable if a future card does.
     */
    const archivesActive = computed(() => {
      if (props.humanSide !== "runner" || !archivesBreachActive(props.state)) return false;
      const pending = props.state.prompts[0];
      return !pending || pending.player !== "runner" ||
        pending.kind === "access-decision";
    });
    const archivesEntries = computed(() =>
      archivesActive.value ? archivesBreachEntries(props.state) : []
    );
    const accessedCard = computed(() => {
      if (archivesActive.value) return null; // the breach dialog owns access
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
        // Same affordability calculator as the engine's move enumeration
        // (legal-moves.ts): during a run the Overclock fund pays first.
        if (
          trashCost !== null && trashCost > 0 &&
          availableCredits(props.state, props.humanSide) >= trashCost
        ) {
          actions.push({
            label: `Trash (${trashCost} [credit])`,
            move: { kind: "trashAccessed" },
          });
        }
        actions.push({ label: "Finish access", move: { kind: "finishAccess" } });
        break;
      }
      return actions;
    });

    const serverRows = computed(() => status.value.servers);

    /**
     * The game-over dialog: open the moment the game ends; Esc or a backdrop
     * click dismisses it to the final board (the ending stays reviewable),
     * and the status dock's Winner chip reopens it. A new game resets the
     * dismissal. The old win banner in the action panel is gone — a full-
     * width announcement in the narrow per-card sidebar read as a stray
     * control (docs/ui-gotchas.md, the card-dock entry).
     */
    const winDismissed = ref(false);
    watch(() => props.state.winner, () => {
      winDismissed.value = false;
    });
    const winModalOpen = computed(() => Boolean(props.state.winner) && !winDismissed.value);

    /**
     * The human's interaction is blocked while a prompt or access decision
     * owns the decision (the ActionPanel takes over then); per-card actions
     *  on the own sheet are silenced in that window.
     */
    const blocked = computed(() =>
      Boolean(props.state.winner || prompt.value || accessedCard.value)
    );

    /** The own sheet's card groups: precomputed rows with per-card actions. */
    const ownGroups = computed(() =>
      buildSheetGroups({
        state: props.state,
        side: props.humanSide,
        isOwn: true,
        legal: legal.value,
        blocked: blocked.value,
      })
    );
    /** The opponent sheet's card groups: titles and counters only, never
     *  actions (another player's decisions are not this seat's interface). */
    const opponentGroups = computed(() =>
      buildSheetGroups({
        state: props.state,
        side: opponentSide.value,
        isOwn: false,
        legal: [],
        blocked: true,
      })
    );

    /**
     * Move-kind groups used to route moves between the UI surfaces: `card`
     * kinds render on their hand-card tile (and its popup), `tile` kinds live
     * on the side-panel status tiles (gain-credit on the credits tile, draw on
     * the hand stat), `run` kinds have their own per-server Run buttons, and
     * `installed` kinds live under their card in the card sheet. One map
     * instead of four hand-maintained lists — a new move kind joins exactly
     * one group. */
    const MOVE_KIND_GROUPS = {
      card: new Set<string>([
        "install",
        "playEvent",
        "playOperation",
      ]),
      tile: new Set<string>([
        "gainCredits",
        "draw",
      ]),
      run: new Set<string>(["run"]),
    } as const;

    /** Whether the move renders on a hand-card tile, not the action panel. */
    function isCardMove(m: Move): boolean {
      return MOVE_KIND_GROUPS.card.has(m.kind);
    }

    /** Whether the move is hosted on a side-panel tile, not the action panel. */
    function hostedOnTile(m: Move): boolean {
      return MOVE_KIND_GROUPS.tile.has(m.kind);
    }

    /** The "gain 1 credit" basic action, when the human can take it. It lives
     *  on the own credits tile in the side panel instead of the action panel. */
    const gainCreditsMove = computed<Move | null>(() => {
      if (!isHumanTurn.value || prompt.value || accessedCard.value) return null;
      return legal.value.find((m: Move) => m.kind === "gainCredits") ?? null;
    });

    /** The "draw 1 card" basic action, when the human can take it. It lives
     *  on the own hand stat in the side panel instead of the action panel. */
    const drawMove = computed<Move | null>(() => {
      if (!isHumanTurn.value || prompt.value || accessedCard.value) return null;
      return legal.value.find((m: Move) => m.kind === "draw") ?? null;
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

    /** Wording for the run banner's approached-ice clause. Unrezzed ice
     *  arrives redacted as `cardId: "hidden"` (rule 4.6.3) — the banner must
     *  never print the redaction sentinel verbatim. */
    function approachedLabel(card: { cardId: string }): string {
      return card.cardId === "hidden" ? "a facedown card" : name(card.cardId);
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
        (m: Move) => m.kind === "run" && (m as { server: string }).server === server,
      );
    }

    /**
     * Moves already rendered under a card row on the own sheet. The general
     * Actions list must not repeat them, so it filters exactly this set — the
     * moves the sheet actually drew — rather than a parallel kind table. That
     * keeps one source of truth for "renders under a card" and, crucially,
     * leaves the Corp's own sheet (which has no card rows — its cards live on
     * the board) with every action, so an installed asset's paid ability stays
     * reachable in the Actions list.
     */
    const sheetHostedKeys = computed(() => {
      const keys = new Set<string>();
      for (const group of ownGroups.value) {
        for (const row of group.cards) {
          for (const action of row.actions) keys.add(action.key);
        }
      }
      return keys;
    });

    /** Generic moves for the action panel (jack out, …). Runs are
     *  deliberately excluded: every server already has its own Run button
     *  under it, so listing them here too only duplicates the row. The
     *  gain-credit and draw moves live on the own credits/hand tiles in
     *  the side panel, so they are excluded here too. Moves already rendered
     *  under a card on the own sheet (`sheetHostedKeys`) are excluded as
     *  well — the no-duplicates rule. */
    const generalMoves = computed<Move[]>(
      () =>
        legal.value.filter((m: Move) =>
          !isCardMove(m) &&
          !MOVE_KIND_GROUPS.run.has(m.kind) &&
          !hostedOnTile(m) &&
          !sheetHostedKeys.value.has(moveKey(m))
        ),
    );

    /**
     * The action panel's view of prompts and moves, quieted while the
     * Archives breach dialog owns the breach: its access-decision prompt and
     * accessCard moves would render duplicate affordances behind the modal
     * (the no-duplicates rule), so the panel shows neither until the breach
     * ends. Non-access prompts (discard, mulligan) can never coexist with a
     * breach, but they pass through unchanged regardless.
     */
    const panelPrompt = computed(() => archivesActive.value ? null : prompt.value);
    const panelGeneralMoves = computed<Move[]>(() =>
      archivesActive.value ? [] : generalMoves.value
    );

    /** Legal play/install moves for a card with this definition id. */
    function cardMoves(cardId: string): Move[] {
      if (!isHumanTurn.value || prompt.value) return [];
      return legal.value.filter((m: Move) =>
        MOVE_KIND_GROUPS.card.has(m.kind) && "cardId" in m && m.cardId === cardId
      );
    }

    /** Legal actions for one card in the human player's hand. */
    function handActionsFor(c: CardInstance): Move[] {
      return cardMoves(c.cardId);
    }

    /**
     * Buttons for the card popup: access decisions when the accessed card is
     * zoomed (rule 7.2.2), otherwise the play/install rows of the grip card
     * it was opened from. Rows are keyed per legal move, and run-sourcing
     * events (Jailbreak, Overclock, Tread Lightly) emit one move PER target
     * server (legal-moves.ts), so one event can show several rows here — each
     * labelled with its run target (see shortActionLabel). The zoomed tile's
     * own under-tile row hides while the popup is open (see template), so no
     * row appears twice on screen. Empty for every other zoom.
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
        // The two install shapes: the Corp label names the target server, the
        // Runner label does not.
        case "install":
          return isCorpInstall(m) ? `Install → ${serverLabel(m.server)}` : "Install";
        case "playEvent":
          // Run-sourcing events (Jailbreak, Overclock, Tread Lightly) emit one
          // move PER target server (legal-moves.ts), so the label must name
          // the run target — bare "Play" would render 2-5 identical buttons
          // and the human would pick the run target blind.
          return m.server ? `Play → ${serverLabel(m.server)}` : "Play";
        case "playOperation":
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
      moveActionAttrs,
      hand,
      canDiscard,
      events,
      warnings,
      run,
      breach,
      accessedCard,
      archivesActive,
      archivesEntries,
      panelPrompt,
      panelGeneralMoves,
      currentIceId,
      zoomActions,
      serverRows,
      gainCreditsMove,
      drawMove,
      winDismissed,
      winModalOpen,
      hqIdentity,
      hqIdentityImg,
      name,
      approachedLabel,
      phaseLabel,
      serverLabel,
      breachCandidatesLeft,
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
      ownGroups,
      opponentGroups,
      identityImgFailed,
    };
  },
  template: `
    <div class="game">
      <!-- Status dock (left): turn badge + alerts + one StatusBlock per seat.
           .status-block's flex: 1 1 0 splits the dock evenly between them;
           data-side marks which side each block shows; active marks
           state.turn.player. -->
      <aside class="status-dock" data-dock="status" :data-agenda-target="status.agendaPointTarget">
        <div class="status-half">
        <div class="status-title" data-panel="turn">
          <div class="turn-badge">
            <span class="turn-num">Turn {{ state.turn.number }}</span>
            <span class="turn-player" :class="state.turn.player">
              {{ state.turn.player === 'corp' ? 'Corp' : 'Runner' }} · {{ phaseLabel(state.turn.phase) }}
            </span>
          </div>
          <button class="ghost-btn" data-action="new-game" @click="$emit('new-game')">New game</button>
        </div>
        <div v-if="state.winner || (!state.winner && isAiTurn && thinking) || lastWarning" class="status-alerts">
          <!-- The Winner chip doubles as the win-modal reopen button: the
               dialog is dismissible (review the final board), so the chip is
               its way back. -->
          <button
            v-if="state.winner"
            class="chip win chip-btn"
            data-action="show-result"
            title="Show the game-over dialog again"
            @click="winDismissed = false"
          >
            Winner: {{ state.winner }}
            <template v-if="state.winReason"> — {{ state.winReason }}</template>
          </button>
          <span v-if="!state.winner && isAiTurn && thinking" class="chip thinking" data-state="thinking">
            {{ aiSideName }} is thinking…
          </span>
          <span v-if="lastWarning" class="chip warn">{{ lastWarning }}</span>
        </div>
        <status-block
          :side="opponentSide"
          :stats="opponent"
          :agenda-target="status.agendaPointTarget"
          :active="state.turn.player === opponentSide"
          @zoom="zoom"
        />
        <status-block
          :side="ownSide"
          :stats="own"
          :agenda-target="status.agendaPointTarget"
          :active="state.turn.player === ownSide"
          is-own
          :gain-move="gainCreditsMove"
          :draw-move="drawMove"
          @zoom="zoom"
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
        <div class="servers" data-panel="servers" :class="{ 'corp-seat': humanSide === 'corp' }">
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
        <section v-if="run || breach" class="run-banner" :data-banner="breach ? 'breach' : 'run'">
          <template v-if="breach">
            <span class="run-tag">BREACH</span> {{ serverLabel(breach.server) }} ·
            <span v-if="breach.accessing">accessing a card…</span>
            <span v-else>{{ breachCandidatesLeft }} of {{ breach.randomAccessLimit }} accesses</span>
          </template>
          <template v-else-if="run">
            <span class="run-tag">RUN</span> on {{ serverLabel(run.server) }}
            <template v-if="run.currentIce">
              · approached {{ approachedLabel(run.currentIce) }}
              <span v-if="run.brokenSubroutines.length"> · {{ run.brokenSubroutines.length }} sub(s) broken</span>
            </template>
            <template v-else> · at {{ serverLabel(run.server) }}</template>
          </template>
        </section>

        <!-- Hand (own grip, direct grid child via .hand-area wrapper). -->
        <section class="hand-area">
          <div class="hand-row runner-hand" data-panel="hand">
            <!-- Each hand card carries its identity (definition id) and copy
                 (instance id) so the automated agent can target "install
                 Unity" without scraping art alt text; two copies of a card
                 differ only by data-instance. -->
            <div v-for="c in hand" :key="c.id" class="hand-card" :data-card-id="c.cardId" :data-instance="c.id">
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
                  v-bind="moveActionAttrs(m)"
                  @click="play(m)"
                >{{ shortActionLabel(m) }}</button>
              </div>
            </div>
            <span v-if="!hand.length" class="empty-hand">(no cards in hand)</span>
          </div>
        </section>

        <div v-if="warnings.length" class="support-warnings" data-panel="warnings">
          <span v-for="(w, i) in warnings" :key="i">⚠ {{ w }}</span>
        </div>
      </div><!-- /game-main -->

      <!-- Card dock: the vertical sidebar between the board and the game log.
           Opponent sheet on top, own sheet at the bottom, splitting the
           viewport 50/50 (the same treatment as the status dock). The own
           sheet carries the ActionPanel (waiting banner, access notice,
           prompt box incl. the discard picker, and the general
           moves list) in its Actions area; its card groups add the
           per-card action buttons (abilities, break, pump) below each
           installed card. -->
        <section class="card-dock" data-dock="card">
          <card-sheet
            :side="opponentSide"
            :is-own="false"
            :active="state.turn.player === opponentSide"
            :groups="opponentGroups"
            @move="play"
            @zoom="zoom"
          />
          <card-sheet
            :side="ownSide"
            :is-own="true"
            :active="state.turn.player === ownSide"
            :groups="ownGroups"
            @move="play"
            @zoom="zoom"
          >
            <template #actions>
              <action-panel
                :human-turn="isHumanTurn"
                :thinking="thinking"
                :ai-side-name="aiSideName"
                :label="moveLabel"
                :accessed-card-id="accessedCard ? accessedCard.cardId : null"
                :prompt="panelPrompt"
                :legal="legal"
                :general-moves="panelGeneralMoves"
                :hand="hand"
                :discard-selected="discardSelected"
                :can-discard="canDiscard"
                @move="play"
                @discard-toggle="toggleDiscard"
                @discard-submit="submitDiscard"
                @open-access="openAccessZoom"
              />
            </template>
          </card-sheet>
        </section>

      <!-- Log dock (right sidebar). -->
      <aside class="log-dock" :class="{ collapsed: !logOpen }" data-dock="log">
        <button
          class="log-toggle"
          data-action="toggle-log"
          :title="logOpen ? 'Collapse log' : 'Expand log'"
          :aria-label="logOpen ? 'Collapse log' : 'Expand log'"
          @click="logOpen = !logOpen"
        >{{ logOpen ? '›' : '‹' }}</button>
        <div v-if="logOpen" class="log-panel" data-panel="log">
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

      <!-- Archives breach (human Runner only): the modal that owns the whole
           breach — every card faceup, access all, agendas stolen
           automatically. It is not dismissible (the breach is mandatory); it
           unmounts when the engine ends the breach. The advance intents go to
           the root, which owns the multi-move chain. Template expressions are
           compiled by Vue's runtime compiler — plain JS only, no TS
           annotations (docs/ui-gotchas.md, the archives-dialog entry). -->
      <archives-breach-dialog
        v-if="archivesActive"
        :entries="archivesEntries"
        @access="(id) => $emit('archives-advance', { type: 'card', instanceId: id })"
        @finish="play({ kind: 'finishAccess' })"
        @remaining="$emit('archives-advance', { type: 'remaining' })"
      />

      <!-- Game over: a dialog over the play surface (the announcement used to
           be a banner in the action panel, which is now the card dock's
           Actions area — too narrow to announce an ending). Esc/backdrop
           dismiss to the final board; the status dock's Winner chip reopens;
           the button restarts. -->
      <win-modal
        v-if="winModalOpen"
        :winner="state.winner"
        :win-reason="state.winReason"
        @new-game="$emit('new-game')"
        @dismiss="winDismissed = true"
      />
    </div>
  `,
});
