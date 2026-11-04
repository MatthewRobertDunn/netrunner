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
 * children (public/css/style.css), driven by the `corpSeat` prop — and the
 * WITHIN-STACK order is flipped in the component (`iceSlots` below), because
 * the engine lists ice innermost-first while the corp seat renders the stack
 * top-down on the runner side. The `.server.central` / `.server.remote`
 * classes, the inner class names, and this nesting are pinned by
 * tests/ui/game_screen_test.ts (computed `order` + stack slot order).
 */

import { computed, defineComponent } from "vue";
import type { PropType } from "vue";
import type { Move, PublicServerStatus, ViewCard } from "../../types.ts";
import CardTile from "./card-tile.ts";
import { cardTitle, serverLabel } from "./util.ts";

/**
 * Server glyphs for the central server cards that render one: R&D, Archives,
 * and HQ. HQ's glyph is the fallback face shown when the Corp's identity art
 * is missing — without an entry here `serverGlyphFor("hq")` returned `""`
 * and the card rendered a broken `<img src="">`. Remotes never reach this
 * map: they draw a text label instead (see the template's `v-else` branch).
 */
const SERVER_GLYPH: Record<string, string> = {
  hq: "assets/svg/hq.svg",
  rd: "assets/svg/rd.svg",
  archives: "assets/svg/archives.svg",
};

function serverGlyphFor(id: string): string {
  return SERVER_GLYPH[id] ?? "";
}

/** Central servers keep their dedicated server card; everything else is a
 *  remote (id "remote-N"), drawn as a label + root/ice columns. Note: this
 *  is deliberately NOT `id in SERVER_GLYPH` — the glyph map holds the
 *  servers that render a glyph face, which is not the same set. */
function isCentralId(id: string): boolean {
  return id === "hq" || id === "rd" || id === "archives";
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
    /**
     * The ice stack in render order, paired with each card's engine position
     * (innermost ice = position 1, matching `ServerState.ice`'s order). The
     * engine lists ice innermost-first (`ServerState.ice`, types.ts), and
     * this template renders the stack top to bottom, so in the RUNNER seat
     * (server card above the stack) the innermost ice lands nearest the
     * server card — physically correct. In the CORP seat the CSS `order`
     * flip moves the whole stack to the runner side (above the card), which
     * would render the INNERMOST ice farthest from the server card — the
     * exact inverse of the physical stack — unless the array is reversed
     * here. The reversal is deliberately in the component, not
     * `flex-direction: column-reverse`: that would also flip the
     * negative-margin overlap direction of `.ice-slot + .ice-slot`. The
     * paired position is emitted as `data-card-pos` so the automated agent
     * can address "the second ice" seat-independently (DOM order flips with
     * the seat; the engine position does not).
     */
    const iceSlots = computed<{ card: ViewCard; pos: number }[]>(() => {
      const withPos = props.server.ice.map((card, i) => ({ card, pos: i + 1 }));
      return props.corpSeat ? withPos.reverse() : withPos;
    });
    /**
     * Only the HQ server card opens the identity popup (the R&D/Archives
     * glyph faces have nothing to zoom). It renders as a real
     * `<button type="button">` when clickable — mirroring CardTile's
     * button/div split so keyboard users can open the popup too — and stays
     * an inert div otherwise. The emit is guarded here as well, so a stray
     * click on another server card never reaches the root.
     */
    const hqClickable = computed(() => props.server.id === "hq" && !!props.identityImg);
    return {
      isCentralId,
      serverGlyphFor,
      serverLabel,
      isCurrentIce,
      iceSlots,
      hqClickable,
      cardTitle,
    };
  },
  template: `
    <div class="server" :class="isCentralId(server.id) ? 'central' : 'remote'" :data-server="server.id">
      <!-- Central servers (hq, rd, archives) keep their dedicated server
           card (corp back + glyph + name). HQ additionally shows the
           Corp's identity card (open information, rule 10.2.3); the
           @error flag falls back to the glyph when the art is missing.
           Only the HQ card (with art) is a clickable button; the other
           central cards render the same markup as inert divs. -->
      <template v-if="isCentralId(server.id)">
        <component
          :is="hqClickable ? 'button' : 'div'"
          :type="hqClickable ? 'button' : undefined"
          class="server-card"
          :class="{ clickable: hqClickable }"
          :data-action="hqClickable ? 'zoom' : undefined"
          :data-card-id="hqClickable && identityCardId ? identityCardId : undefined"
          @click="hqClickable && $emit('zoom-identity', server.id)"
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
            <img
              v-if="serverGlyphFor(server.id)"
              class="server-glyph"
              :src="serverGlyphFor(server.id)"
              :alt="serverLabel(server.id)"
            />
            <span class="server-name">{{ serverLabel(server.id) }}</span>
          </div>
        </component>
      </template>
      <!-- Remotes: a small label nearest the corp side, shown only when the
           server has a root card or ice. -->
      <template v-else>
        <div
          v-if="server.root.length || server.ice.length"
          class="server-label"
        >{{ serverLabel(server.id) }}</div>
      </template>
      <!-- Root row and ice stack render for BOTH kinds. Remotes with only
           ice reserve a one-card root-slot space (blank, no glyph/back) so
           the layout doesn't jump when a root card is later installed; a
           completely empty remote draws nothing else at all (only its Run
           button). Central roots hold at most an upgrade. server.ice keeps
           unrezzed ice IN POSITION as "hidden" entries (identities are
           redacted, the stack order stays open — rule 4.6.2). -->
      <div v-if="server.root.length" class="server-root-row">
        <template v-for="c in server.root" :key="c.id">
          <card-tile
            v-if="c.cardId !== 'hidden'"
            :card="c"
            clickable
            @zoom="$emit('zoom', c.cardId)"
          />
          <card-tile v-else :card="c" facedown corp />
        </template>
      </div>
      <div
        v-else-if="!isCentralId(server.id) && server.ice.length"
        class="server-root-row server-root-empty"
      ></div>
      <div class="server-ice-stack">
        <div
          v-for="slot in iceSlots"
          :key="slot.card.id"
          class="ice-slot"
          :class="{ facedown: slot.card.cardId === 'hidden' }"
        >
          <card-tile
            v-if="slot.card.cardId !== 'hidden'"
            :card="slot.card"
            :pos="slot.pos"
            ice
            clickable
            :highlight="isCurrentIce(slot.card)"
            :badge="isCurrentIce(slot.card) ? 'RUN' : ''"
            @zoom="$emit('zoom', slot.card.cardId)"
          />
          <!-- Unrezzed ice arrives IN POSITION as a redacted entry: render it
               on the facedown-tile path right where it physically sits. Its
               real instance id survives the redaction, so the RUN badge and
               highlight follow the approached facedown ice too (position is
               open information, rule 4.6.2; identity stays hidden, 4.6.3). -->
          <card-tile
            v-else
            :card="slot.card"
            facedown
            ice
            corp
            :pos="slot.pos"
            :highlight="isCurrentIce(slot.card)"
            :badge="isCurrentIce(slot.card) ? 'RUN' : ''"
          />
        </div>
      </div>
      <button
        v-if="runMove && !runInProgress"
        class="run-btn"
        data-action="run"
        :data-server="server.id"
        @click="runMove && $emit('move', runMove)"
      >Run</button>
    </div>
  `,
});
