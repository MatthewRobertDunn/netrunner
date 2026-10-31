/**
 * Regression tests: install/play moves key on the definition id (apply
 * resolves the first matching instance), so a second copy of a card in hand
 * must not duplicate the buttons. Before the fix, two copies of an ice in
 * the grip produced two identical rows of install buttons — and doubled the
 * AI's softmax mass for the same move.
 */

import { cardDef, engine, starterDeckConfigs } from "../src/mod.ts";
import type { GameState, Move } from "../src/types.ts";
import { assert, assertEquals } from "./helpers/assert.ts";

function fresh(seed: number): GameState {
  return engine.startGame({
    corp: starterDeckConfigs().corp,
    runner: starterDeckConfigs().runner,
    mode: "starter-decks",
    seed,
  });
}

/** Duplicate the first hand card matching `want`, giving the copy a fresh id. */
function dupHandCard(
  state: GameState,
  side: "corp" | "runner",
  want: (cardId: string) => boolean,
): string | null {
  const hand = side === "corp" ? state.corp.hand : state.runner.hand;
  const card = hand.find((c) => want(c.cardId));
  if (!card) return null;
  hand.push({ ...card, id: `${card.id}-dup` });
  return card.cardId;
}

function moveKey(m: Move): string {
  return JSON.stringify(m);
}

/** Find a seed whose Corp opening hand holds an installable ice. */
function iceSeed(): { seed: number; cardId: string } | null {
  for (let seed = 1; seed <= 60; seed++) {
    const state = fresh(seed);
    const ice = state.corp.hand.find((c) => cardDef(c.cardId).type === "ice");
    if (ice) return { seed, cardId: ice.cardId };
  }
  return null;
}

Deno.test("install dedup: two copies of an ice yield one install move per server", () => {
  const found = iceSeed();
  if (!found) {
    console.log("no seed has ice in the Corp opening hand — skip");
    return;
  }
  const state = fresh(found.seed);
  const before = engine.getLegalMoves(state, "corp").filter((m) =>
    m.kind === "corp.install" && m.cardId === found.cardId
  );
  assert(before.length > 0, "the ice is installable before duplication");
  dupHandCard(state, "corp", (id) => id === found.cardId);
  const after = engine.getLegalMoves(state, "corp").filter((m) =>
    m.kind === "corp.install" && m.cardId === found.cardId
  );
  assertEquals(after.length, before.length, "a second copy adds no install moves");
  assertEquals(
    new Set(after.map(moveKey)).size,
    after.length,
    "no exact-duplicate install moves",
  );
});

Deno.test("install dedup: two copies of an operation yield one play move", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const state = fresh(seed);
    const op = state.corp.hand.find((c) => cardDef(c.cardId).type === "operation");
    if (!op) continue;
    if (
      engine.getLegalMoves(state, "corp").every((m) =>
        !(m.kind === "corp.playOperation" && m.cardId === op.cardId)
      )
    ) continue;
    const before = engine.getLegalMoves(state, "corp").filter((m) =>
      m.kind === "corp.playOperation" && m.cardId === op.cardId
    );
    dupHandCard(state, "corp", (id) => id === op.cardId);
    const after = engine.getLegalMoves(state, "corp").filter((m) =>
      m.kind === "corp.playOperation" && m.cardId === op.cardId
    );
    assertEquals(after.length, before.length, "a second copy adds no play moves");
    assertEquals(after.length, 1, "exactly one play move for the operation");
    return;
  }
  console.log("no seed has a playable operation in the Corp opening hand — skip");
});

Deno.test("install dedup: two copies of a runner card yield one install/play move", () => {
  for (let seed = 1; seed <= 60; seed++) {
    // Runner moves second: burn through the corp turn with first-legal moves.
    let s = fresh(seed);
    for (let i = 0; i < 60 && !s.winner && s.turn.player !== "runner"; i++) {
      const moves = engine.getLegalMoves(s, s.turn.player);
      if (moves.length === 0) break;
      const r = engine.applyMove(s, s.turn.player, moves[0]!);
      if (r.kind !== "applied") break;
      s = r.state;
    }
    if (s.winner || s.turn.player !== "runner") continue;
    const res = s.runner.hand.find((c) =>
      ["program", "hardware", "resource"].includes(cardDef(c.cardId).type)
    );
    if (!res) continue;
    const before = engine.getLegalMoves(s, "runner").filter((m) =>
      (m.kind === "runner.install" || m.kind === "runner.playEvent") &&
      m.cardId === res.cardId
    );
    if (before.length === 0) continue;
    dupHandCard(s, "runner", (id) => id === res.cardId);
    const after = engine.getLegalMoves(s, "runner").filter((m) =>
      (m.kind === "runner.install" || m.kind === "runner.playEvent") &&
      m.cardId === res.cardId
    );
    assertEquals(after.length, before.length, "a second copy adds no moves");
    assertEquals(
      new Set(after.map(moveKey)).size,
      after.length,
      "no exact-duplicate runner moves",
    );
    return;
  }
  console.log("no seed has an installable runner card on turn 1 — skip");
});
