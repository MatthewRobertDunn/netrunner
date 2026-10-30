/**
 * `determinize` (the engine API behind the AI information boundary).
 *
 * Four properties, per the phase-B2 spec:
 *
 * 1. Round-trip: for many states and seeds, `getPlayerView(determinize(view,
 *    ctx, rng), side)` deep-equals `view`. The log is restored as the view's
 *    ALREADY-REDACTED events; because the engine never reads the log for
 *    logic and `visibleEvent` is idempotent over redacted events, even
 *    `events` round-trips exactly — no exception is needed.
 * 2. Legal-move consistency: `getLegalMoves(determinized, side)` equals the
 *    `legal` list computed on the true state (the fuzz audit proved move
 *    availability depends only on own + public information; this locks it in).
 * 3. Multiset discipline: every card placed in a hidden zone comes from the
 *    context's multisets; the returned state's total card multiset equals the
 *    true state's; hidden ice slots always receive an ICE definition and
 *    hidden root slots a non-ice Corp definition (rules 4.6.2, 4.6.6f).
 * 4. Reproducibility: same (view, ctx, seed) → deep-equal determinized states.
 */

import {
  cardDef,
  determinize,
  engine,
  makeAIDecisionContext,
  makeRng,
  RandomAI,
  starterDeckConfigs,
} from "../src/mod.ts";
import type {
  AIDecisionContext,
  CardId,
  CardInstance,
  GameState,
  Move,
  PlayerSide,
  PlayerView,
} from "../src/types.ts";
import {
  installInNewRemoteAndEndTurn,
  newGameWithCorpHand,
  newStarterGame,
  play,
} from "../src/testing/fixtures.ts";
import { decide } from "./helpers/boundary.ts";
import { assert, assertEquals } from "./helpers/assert.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Advance a game `steps` decisions with RandomAI (through the boundary). */
function randomGame(seed: number, steps: number): GameState {
  const decks = starterDeckConfigs();
  let state = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
  const ai = new RandomAI();
  for (let i = 0; i < steps && !state.winner; i++) {
    const actor: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
    const legal = engine.getLegalMoves(state, actor);
    if (legal.length === 0) break;
    const result = engine.applyMove(state, actor, decide(ai, state, actor, legal, i));
    if (result.kind === "illegal-move") break;
    state = result.state;
  }
  return state;
}

/** Determinize `state` as seen by `side` with a fixed decision seed. */
function determinizeState(state: GameState, side: PlayerSide, seed = 1): {
  view: PlayerView;
  ctx: AIDecisionContext;
  det: GameState;
} {
  const view = engine.getPlayerView(state, side);
  const ctx = makeAIDecisionContext(state, side, seed);
  return { view, ctx, det: determinize(view, ctx, makeRng(seed)) };
}

function actorOf(state: GameState): PlayerSide {
  return state.prompts[0]?.player ?? state.turn.player;
}

/** Sorted JSON of a move list, for order-insensitive comparison. */
function movesKey(moves: Move[]): string {
  return JSON.stringify(
    moves.map((m) => JSON.stringify(m, Object.keys(m).sort())).sort(),
  );
}

/** Every card instance in a state, with its definition id. */
function allCards(state: GameState): CardInstance[] {
  const cards: CardInstance[] = [];
  for (const side of ["corp", "runner"] as PlayerSide[]) {
    const p = state[side];
    cards.push(p.identity, ...p.hand, ...p.deck, ...p.discard, ...p.score, ...p.installed);
  }
  for (const s of state.servers) cards.push(...s.root, ...s.ice);
  return cards;
}

/** Card id -> count. */
function multiset(cards: CardInstance[]): Map<CardId, number> {
  const m = new Map<CardId, number>();
  for (const c of cards) m.set(c.cardId, (m.get(c.cardId) ?? 0) + 1);
  return m;
}

// ---------------------------------------------------------------------------
// 1. Round-trip
// ---------------------------------------------------------------------------

Deno.test("determinize: view round-trips at many states, seeds and for both sides", () => {
  for (const gameSeed of [1, 7, 42, 99]) {
    // Walk one random game and check in at every decision point.
    const decks = starterDeckConfigs();
    let state = engine.startGame({
      corp: decks.corp,
      runner: decks.runner,
      mode: "starter-decks",
      seed: gameSeed,
    });
    const ai = new RandomAI();
    for (let i = 0; i < 40 && !state.winner; i++) {
      for (const side of ["corp", "runner"] as PlayerSide[]) {
        const { view, det } = determinizeState(state, side, 100 + i);
        assertEquals(
          engine.getPlayerView(det, side),
          view,
          `seed ${gameSeed}, step ${i}, ${side}: view did not round-trip`,
        );
      }
      const actor = actorOf(state);
      const legal = engine.getLegalMoves(state, actor);
      if (legal.length === 0) break;
      const result = engine.applyMove(state, actor, decide(ai, state, actor, legal, i));
      if (result.kind === "illegal-move") break;
      state = result.state;
    }
  }
});

Deno.test("determinize: round-trips a game with installs, a run and a breach", () => {
  // Ice in a remote, then a runner run against it: exercises facedown ice,
  // rez windows, encounters and breach access candidates.
  let state = installInNewRemoteAndEndTurn("tithe", 3);
  const runMove = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "runner.run" && m.server === "remote-1",
  );
  assert(runMove && runMove.kind === "runner.run", "runner can run the remote");
  state = play(state, "runner", runMove).state;
  // The corp answers its rez window (rez or pass).
  const prompt = state.prompts[0];
  if (prompt && prompt.kind === "rez-window") {
    const answer = engine.getLegalMoves(state, "corp").find(
      (m) => m.kind === "prompt.answer" && m.promptId === prompt.id,
    );
    assert(answer && answer.kind === "prompt.answer", "corp can answer the rez window");
    state = play(state, "corp", answer).state;
  }
  for (const side of ["corp", "runner"] as PlayerSide[]) {
    const { view, det } = determinizeState(state, side, 77);
    assertEquals(
      engine.getPlayerView(det, side),
      view,
      `${side}: view did not round-trip during a run`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. Legal-move consistency
// ---------------------------------------------------------------------------

Deno.test("determinize: legal moves on the hypothesis equal the true legal moves", () => {
  for (const gameSeed of [1, 4, 42]) {
    const decks = starterDeckConfigs();
    let state = engine.startGame({
      corp: decks.corp,
      runner: decks.runner,
      mode: "starter-decks",
      seed: gameSeed,
    });
    const ai = new RandomAI();
    for (let i = 0; i < 30 && !state.winner; i++) {
      const actor = actorOf(state);
      const legal = engine.getLegalMoves(state, actor);
      if (legal.length === 0) break;
      const { det } = determinizeState(state, actor, 50 + i);
      assertEquals(
        movesKey(engine.getLegalMoves(det, actor)),
        movesKey(legal),
        `seed ${gameSeed}, step ${i}, ${actor}: legal moves diverged on the hypothesis`,
      );
      const result = engine.applyMove(state, actor, decide(ai, state, actor, legal, i));
      if (result.kind === "illegal-move") break;
      state = result.state;
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Multiset discipline
// ---------------------------------------------------------------------------

/**
 * A state with unrezzed ice AND an unrezzed remote root card (a facedown
 * agenda), from the runner's point of view: the classic hidden-install case.
 */
function hiddenInstallsState(): GameState {
  let state = newGameWithCorpHand(["offworld_office", "tithe"], 3);
  const installAgenda = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.install" && m.cardId === "offworld_office" && m.server === "new-remote",
  );
  assert(installAgenda && installAgenda.kind === "corp.install", "corp can install the agenda");
  state = play(state, "corp", installAgenda).state;
  const installIce = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.install" && m.cardId === "tithe" && m.server === "remote-1",
  );
  assert(installIce && installIce.kind === "corp.install", "corp can protect the remote");
  return endQuietly(play(state, "corp", installIce).state);
}

/** Spend remaining corp clicks so the turn passes (keeps the fixtures small). */
function endQuietly(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 10; i++) {
    if (cur.turn.player !== "corp" || cur.winner) break;
    const gain = engine.getLegalMoves(cur, "corp").find((m) => m.kind === "corp.gainCredits");
    if (!gain) break;
    cur = play(cur, "corp", gain).state;
  }
  return cur;
}

Deno.test("determinize: hidden installs land in the right slots with the right types", () => {
  const state = hiddenInstallsState();
  const { det } = determinizeState(state, "runner", 31);

  // The runner must not learn the identities...
  const runnerView = engine.getPlayerView(state, "runner");
  const hidden = runnerView.corp.installed.filter((c) => c.cardId === "hidden");
  assert(hidden.length === 2, "test setup: one facedown ice + one facedown root card");
  assert(
    hidden.some((c) => c.position === "ice") && hidden.some((c) => c.position === "root"),
    "test setup: one hidden ice slot and one hidden root slot",
  );

  // ...but the hypothesis must fill ice slots with ice and root slots with
  // non-ice corp cards (rules 4.6.2, 4.6.6f): never an agenda in an ice slot,
  // never ice in a root.
  const server = det.servers.find((s) => s.id === "remote-1")!;
  for (const ice of server.ice) {
    assert(
      cardDef(ice.cardId).type === "ice",
      `ice slot ${ice.id} was dealt a ${cardDef(ice.cardId).type}`,
    );
  }
  for (const root of server.root) {
    const type = cardDef(root.cardId).type;
    assert(
      type === "asset" || type === "agenda" || type === "upgrade",
      `root slot ${root.id} was dealt a ${type}`,
    );
  }
});

Deno.test("determinize: the hypothesis's total card multiset equals the true state's", () => {
  const cases: GameState[] = [
    newStarterGame(1),
    newStarterGame(42),
    hiddenInstallsState(),
    randomGame(9, 8),
  ];
  for (const [i, state] of cases.entries()) {
    for (const side of ["corp", "runner"] as PlayerSide[]) {
      const { det } = determinizeState(state, side, 60 + i);
      assertEquals(
        multiset(allCards(det)),
        multiset(allCards(state)),
        `case ${i}, ${side}: card multiset diverged`,
      );
    }
  }
});

Deno.test("determinize: sampled identities come from the context's multisets", () => {
  const state = hiddenInstallsState();
  for (const side of ["corp", "runner"] as PlayerSide[]) {
    const view = engine.getPlayerView(state, side);
    const ctx = makeAIDecisionContext(state, side, 8);

    // Expected hidden-zone contents: exactly the context's multisets (own deck
    // + everything unseen), minus any card that is being accessed right now —
    // its identity is already public (rule 7.2.1) and is pinned, not sampled.
    const expected = new Map<CardId, number>();
    for (const id of [...ctx.ownDeck, ...ctx.unseen]) {
      expected.set(id, (expected.get(id) ?? 0) + 1);
    }
    const accessed = view.breach?.accessing;
    if (accessed) {
      const n = (expected.get(accessed.cardId) ?? 0) - 1;
      if (n <= 0) expected.delete(accessed.cardId);
      else expected.set(accessed.cardId, n);
    }

    // Actual hidden-zone contents in the hypothesis: the viewer's own deck,
    // the opponent's hand, the opponent's deck, and every card the view
    // showed as "hidden" (facedown installs, facedown Archives).
    const hiddenIds = new Set<string>();
    for (const section of [view.corp, view.runner]) {
      for (const v of [...section.discard, ...section.installed]) {
        if (v.cardId === "hidden") hiddenIds.add(v.id);
      }
    }
    const opponent: PlayerSide = side === "corp" ? "runner" : "corp";
    const det = determinize(view, ctx, makeRng(8));
    const actual = new Map<CardId, number>();
    for (const card of allCards(det)) {
      const inHiddenZone = card.zone === "deck" ||
        hiddenIds.has(card.id) ||
        (card.owner === opponent && card.zone === "hand");
      if (!inHiddenZone) continue;
      actual.set(card.cardId, (actual.get(card.cardId) ?? 0) + 1);
    }

    assertEquals(actual, expected, `${side}: hidden-zone contents diverged from the context`);
  }
});

// ---------------------------------------------------------------------------
// 4. Reproducibility
// ---------------------------------------------------------------------------

Deno.test("determinize: same view, ctx and seed give identical states", () => {
  for (const gameSeed of [1, 42]) {
    const state = randomGame(gameSeed, 7);
    for (const side of ["corp", "runner"] as PlayerSide[]) {
      for (const decisionSeed of [0, 5, 12345]) {
        const { view, ctx } = determinizeState(state, side, decisionSeed);
        const a = determinize(view, ctx, makeRng(decisionSeed));
        const b = determinize(view, ctx, makeRng(decisionSeed));
        assertEquals(a, b, `seed ${gameSeed}, ${side}: determinize was not reproducible`);
        assert(
          JSON.stringify(a) === JSON.stringify(b),
          "serialized forms must match too",
        );
      }
    }
  }
});
