/**
 * ServerColumn: one column of the servers grid (extracted from GameScreen).
 *
 * Renders either a central server's dedicated server card (Corp back + glyph,
 * or the Corp identity card on HQ — open information, rule 10.2.3) or a
 * remote's small label, plus — for both kinds — the root row, the ice stack,
 * and the Runner's Run button.
 *
 * The DOM order below is ONE order for every case (server card/label -> root
 * row -> ice stack -> Run); the corp-seat visual flip (ice on the runner side)
 * is done in CSS via `order` on `.server.central` AND `.server.remote`
 * children (public/css/style.css), driven by the `corpSeat` prop. The
 * `.server.central` / `.server.remote` classes, the inner class names, and
 * this nesting are pinned by tests/ui/game_screen_test.ts (computed `order`).
 */

import { defineComponent } from "vue";
import type { PropType } from "vue";
import type { Move, PublicServerStatus, ViewCard } from "../../types.ts";
import CardTile from "./card-tile.ts";
import { cardTitle } from "./util.ts";

/**
 * Server glyphs for the central servers that still render a glyph: R&D,
 * Archives, and any remote server (which falls back to the generic
 * "set-sysgw" glyph via serverGlyphFor()). HQ no longer uses its glyph here —
 * the HQ server card renders the Corp's identity card instead (see the `hq`
 * branch in the template). The identity is public information to both players
 * (rule 10.2.3), so it is read from the public status DTO.
 */
const SERVER_GLYPH: Record<string, string> = {
  rd: "assets/svg/rd.svg",
  archives: "assets/svg/archives.svg",
};

function serverGlyphFor(id: string): string {
  return SERVER_GLYPH[id] ?? "";
}

/** Central servers keep their dedicated server card; everything else is a
 *  remote (id "remote-N"), drawn as a label + root/ice columns. Note: this
 *  is deliberately NOT `id in SERVER_GLYPH` — the glyph map only holds the
 *  servers that render one (the HQ branch shows the identity card instead,
 *  and is no longer in the map). */
function isCentralId(id: string): boolean {
  return id === "hq" || id === "rd" || id === "archives";
}

/** Label for a remote server: "remote-3" reads as "remote 3" (rule 4.6.8). */
function remoteLabelFor(id: string): string {
  return id.replace("-", " ");
}

export default defineComponent({
  name: "ServerColumn",
  components: { CardTile },
  props: {
    /** The public server row for this column. */
    server: { type: Object as PropType<PublicServerStatus>, required: true },
    /** Whether the human player sits in the Corp seat (drives the CSS flip). */
    corpSeat: { type: Boolean, default: false },
    /** The Corp's identity card id, or null when it could not be resolved. */
    identityCardId: { type: String as PropType<string | null>, default: null },
    /** The HQ identity art, or null to render the glyph face. */
    identityImg: { type: String as PropType<string | null>, default: null },
    /** The legal runner.run move for this server, if one exists. */
    runMove: { type: Object as PropType<Move | undefined>, default: undefined },
    /** A run is in progress (Run buttons hide while one is active). */
    runInProgress: { type: Boolean, default: false },
    /** Instance id of the ice the run is currently at (highlight). */
    currentIceId: { type: String as PropType<string | null>, default: null },
  },
  emits: ["move", "zoom", "zoom-identity", "identity-error"],
  setup(props: {
    server: PublicServerStatus;
    corpSeat: boolean;
    identityCardId: string | null;
    identityImg: string | null;
    runMove: Move | undefined;
    runInProgress: boolean;
    currentIceId: string | null;
  }) {
    /** The current ice carries the RUN badge + highlight. */
    function isCurrentIce(card: ViewCard): boolean {
      return props.currentIceId !== null && card.id === props.currentIceId;
    }
    return { isCentralId, serverGlyphFor, remoteLabelFor, isCurrentIce, cardTitle };
  },
  template: `
    <div class="server" :class="isCentralId(server.id) ? 'central' : 'remote'">
      <!-- Central servers (hq, rd, archives) keep their dedicated server
           card (corp back + glyph + name). HQ additionally shows the
           Corp's identity card (open information, rule 10.2.3); the
           @error flag falls back to the glyph when the art is missing. -->
      <template v-if="isCentralId(server.id)">
        <div
          class="server-card"
          :class="{ clickable: server.id === 'hq' && identityImg }"
          @click="$emit('zoom-identity', server.id)"
        >
          <img class="corp-back-img" src="assets/corp-back.svg" alt="" />
          <div v-if="server.id === 'hq' && identityImg" class="server-card-face identity-face">
            <img
              class="identity-art"
              :src="identityImg"
              :alt="cardTitle(identityCardId)"
              @error="$emit('identity-error')"
            />
            <span class="server-name">{{ cardTitle(identityCardId) }}</span>
          </div>
          <div v-else class="server-card-face">
            <img class="server-glyph" :src="serverGlyphFor(server.id)" :alt="cardTitle(server.id)" />
            <span class="server-name">{{ cardTitle(server.id) }}</span>
          </div>
        </div>
      </template>
      <!-- Remotes: a small label nearest the corp side, shown only when the
           server has a root card or ice. -->
      <template v-else>
        <div
          v-if="server.root.length || server.ice.length || server.unrezzedIceCount"
          class="server-label"
        >{{ remoteLabelFor(server.id) }}</div>
      </template>
      <!-- Root row and ice stack render for BOTH kinds. Remotes with only
           ice reserve a one-card root-slot space (blank, no glyph/back) so
           the layout doesn't jump when a root card is later installed; a
           completely empty remote draws nothing else at all (only its Run
           button). Central roots hold at most an upgrade. unrezzedIceCount
           covers ice the Runner cannot identify yet (public status redacts
           the cards, the count stays open information). -->
      <div v-if="server.root.length" class="server-root-row">
        <template v-for="c in server.root" :key="c.id">
          <card-tile
            v-if="c.cardId !== 'hidden'"
            :card="{ cardId: c.cardId, rezzed: c.rezzed, advancement: c.advancement }"
            small
            clickable
            @zoom="$emit('zoom', c.cardId)"
          />
          <card-tile v-else facedown small corp />
        </template>
      </div>
      <div
        v-else-if="!isCentralId(server.id) && (server.ice.length || server.unrezzedIceCount)"
        class="server-root-row server-root-empty"
      ></div>
      <div class="server-ice-stack">
        <div v-for="card in server.ice" :key="card.id" class="ice-slot">
          <card-tile
            :card="card"
            ice
            clickable
            :highlight="isCurrentIce(card)"
            :badge="isCurrentIce(card) ? 'RUN' : ''"
            @zoom="$emit('zoom', card.cardId)"
          />
        </div>
        <div v-for="n in server.unrezzedIceCount" :key="'u' + server.id + n" class="ice-slot facedown">
          <card-tile facedown ice corp />
        </div>
      </div>
      <button
        v-if="runMove && !runInProgress"
        class="run-btn"
        :data-testid="'run-' + server.id"
        @click="runMove && $emit('move', runMove)"
      >Run</button>
    </div>
  `,
});
