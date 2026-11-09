/**
 * The paid ability window after the last click (rules 5.6.2a/5.7.1e).
 *
 * Bug this pins: the engine used to roll straight into the discard phase the
 * moment clicks hit 0, so a corp that advanced an agenda to readiness with its
 * last click could never score it (and could not rez non-ice or use paid
 * abilities either). Now the window stays open until the active player
 * declines it with `endTurn`.
 */

import { cardDef, engine, isCorpInstall } from "../src/mod.ts";
import type { CardInstance, GameState } from "../src/types.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";
import { newGameWithCorpHand, play, setHand, setInstalledAdvancement } from "./helpers/fixtures.ts";

/** The card instance with this id, searching every installed zone. */
function installedCard(s: GameState, id: string): CardInstance {
  for (const server of s.servers) {
    for (const card of [...server.root, ...server.ice]) {
      if (card.id === id) return card;
    }
  }
  throw new Error(`card ${id} not installed anywhere`);
}

/** A corp on its last click with `agendaId` one advancement from ready in a
 * brand-new remote: advancing it is the exact scenario from the bug report. */
function lastClickAlmostReady(agendaId: string): GameState {
  const state = newGameWithCorpHand([agendaId]);
  const install = assertDefined(
    engine.getLegalMoves(state, "corp").find(
      (m) =>
        isCorpInstall(m) && m.cardId === agendaId &&
        m.server === "new-remote",
    ),
    "the corp can install the agenda in a new remote",
  );
  let s = play(state, "corp", install!);
  const def = assertDefined(cardDef(agendaId));
  const req = def.advancementRequirement ?? 0;
  assert(req >= 1, "test setup: the agenda needs at least one advancement");
  const agenda = assertDefined(
    s.servers.find((x) => x.id === "remote-1")?.root.find((c) => c.cardId === agendaId),
    "the agenda is installed",
  );
  // Burn clicks down to exactly one, then pre-set all but the last
  // advancement (sanctioned setter), so the ADVANCE is the last click and the
  // window opens right as the agenda becomes scorable.
  while (s.corp.clicks > 1) {
    s = play(s, "corp", { kind: "gainCredits" });
  }
  assertEquals(s.corp.clicks, 1, "test setup: one click remains for the advance");
  if (req > 1) s = setInstalledAdvancement(s, agenda.id, req - 1);
  const advance = assertDefined(
    engine.getLegalMoves(s, "corp").find(
      (m) => m.kind === "advance" && m.targetId === agenda.id,
    ),
    "the agenda can be advanced",
  );
  return play(s, "corp", advance!);
}

Deno.test("the paid ability window stays open after the corp's last click", async (t) => {
  await t.step("an agenda readied by the last click is scorable in the window", () => {
    const s = lastClickAlmostReady("offworld_office");
    assertEquals(s.corp.clicks, 0, "the advance spent the last click");
    assertEquals(s.turn.phase, "action", "the action phase has NOT ended");
    const legal = engine.getLegalMoves(s, "corp");
    const score = assertDefined(
      legal.find((m) => m.kind === "score"),
      "the just-readied agenda is scorable in the window",
    );
    assert(
      legal.some((m) => m.kind === "endTurn"),
      "endTurn is offered alongside the window moves",
    );
    // Scoring it works from the window (rule 5.6.2a marks the window (S)).
    const after = play(s, "corp", score!);
    assertEquals(after.corp.agendaPoints, 2, "offworld_office scored for its 2 points");
  });

  await t.step("endTurn closes the window and ends the corp's turn", () => {
    const s = lastClickAlmostReady("offworld_office");
    const legal = engine.getLegalMoves(s, "corp");
    const endTurn = assertDefined(legal.find((m) => m.kind === "endTurn"));
    const after = play(s, "corp", endTurn!);
    assert(
      after.turn.player === "runner" || after.turn.phase === "discard",
      `the turn ended (got phase ${after.turn.phase}, player ${after.turn.player})`,
    );
  });

  await t.step("an empty window needs no decision: the turn auto-ends", () => {
    // No ready agenda, no affordable unrezzed asset/upgrade, no zero-click
    // paid ability, and a hand within its limit (setHand empties it — the
    // opening deal would otherwise park a discard prompt instead): the window
    // has no options, so clicking out the clicks ends the turn exactly as
    // before the fix.
    const dealt = newGameWithCorpHand([]);
    let s = setHand(dealt, "corp", []);
    s = play(s, "corp", { kind: "gainCredits" });
    s = play(s, "corp", { kind: "gainCredits" });
    s = play(s, "corp", { kind: "gainCredits" });
    assertEquals(s.corp.clicks, 0);
    assertEquals(engine.getLegalMoves(s, "corp").length, 0, "no window moves");
    assert(
      s.turn.player === "runner" || s.turn.phase === "discard",
      "the turn ended without an endTurn move",
    );
  });

  await t.step("rez of an affordable asset is offered in the window; ice never is", () => {
    // Nico Campaign (cost 2) installed unrezzed; the corp spends its clicks
    // gaining credits, so at clicks==0 the window offers the rez.
    let s = newGameWithCorpHand(["nico_campaign"]);
    const install = assertDefined(
      engine.getLegalMoves(s, "corp").find(
        (m) =>
          isCorpInstall(m) && m.cardId === "nico_campaign" &&
          m.server === "new-remote",
      ),
    );
    s = play(s, "corp", install!);
    while (s.corp.clicks > 0) {
      const move = assertDefined(
        engine.getLegalMoves(s, "corp").find((m) => m.kind === "gainCredits"),
      );
      s = play(s, "corp", move);
    }
    const legal = engine.getLegalMoves(s, "corp");
    const nico = installedCard(s, s.servers.find((x) => x.id === "remote-1")!.root[0]!.id);
    assert(
      legal.some((m) => m.kind === "rez" && m.targetId === nico.id),
      "the window offers the affordable rez",
    );
    // Ice can only be rezzed at the approach window (rule 6.4.3): no rez
    // offered by this window may ever target ice.
    for (const m of legal) {
      if (m.kind !== "rez") continue;
      const card = installedCard(s, m.targetId);
      assertEquals(
        cardDef(card.cardId).type === "ice",
        false,
        "ice is never offered in the end-of-turn window",
      );
    }
  });

  await t.step("the runner's window is empty at clicks 0 (pool has no free abilities)", () => {
    // The runner's last click is spent; the (P)-only window has no zero-click
    // ability in the pool, so the turn auto-ends as before. The corp's hand is
    // emptied so its discard phase (if any) cannot park the turn mid-burn.
    let s = setHand(newGameWithCorpHand([]), "corp", []);
    // Corp turn burns out, runner takes four clicks' worth of gains.
    s = play(s, "corp", { kind: "gainCredits" });
    s = play(s, "corp", { kind: "gainCredits" });
    s = play(s, "corp", { kind: "gainCredits" });
    assertEquals(s.turn.player, "runner");
    s = play(s, "runner", { kind: "gainCredits" });
    s = play(s, "runner", { kind: "gainCredits" });
    s = play(s, "runner", { kind: "gainCredits" });
    s = play(s, "runner", { kind: "gainCredits" });
    assertEquals(s.runner.clicks, 0);
    assertEquals(
      engine.getLegalMoves(s, "runner").length,
      0,
      "no runner window moves in the starter pool",
    );
    assert(
      s.turn.player === "corp" || s.turn.phase === "discard",
      "the runner's turn auto-ended",
    );
  });
});
