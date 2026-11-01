/**
 * EvalAI: a "fun" opponent built from determinization + a hand-written eval.
 *
 * The eval is a 1-ply weighted sum over determinized worlds, picked by a root
 * softmax. Variety comes ONLY from determinization (the hidden identities an
 * opponent might hold) and the softmax — never from randomness inside the eval.
 *
 * Tests: full games, boundary purity, softmax variety, eval sanity, perf smoke.
 */

import {
  applyMove,
  cardDef,
  decisionSeedFor,
  determinize,
  engine,
  EvalAI,
  fastCloneState,
  makeAIDecisionContext,
  makeRng,
} from "../src/mod.ts";
import { RandomAI } from "../src/ai/random.ts";
import { playGame } from "../src/ai/play.ts";
import { evaluate } from "../src/ai/eval.ts";
import { softmaxIndex } from "../src/ai/policy.ts";
import type { AIDecisionContext, GameState, PlayerSide, PlayerView } from "../src/types.ts";
import {
  CORP_FILLER,
  endCorpTurn,
  newGameWithCorpHand,
  orderedCorpDeck,
  play,
  setAgendaPoints,
  setHand,
  setInstalledAdvancement,
  starterDeckPair,
} from "./helpers/fixtures.ts";
import { decide } from "./helpers/boundary.ts";
import { randomGame, reorderHidden } from "./helpers/drive.ts";
import { assert, assertDefined, assertEquals, deepClone } from "./helpers/assert.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A small-samples EvalAI drives a fast playout into a mid-game position. */
function evalRandomGame(seed: number, steps: number): GameState {
  return randomGame(new EvalAI({ samples: 4 }), seed, steps, (i) => i * 131 + 7);
}

/**
 * The rest of the corp deck for the "runs the game-winning agenda" scenario:
 * identical to the shared `CORP_FILLER` pool except that the three
 * superconducting_hub copies (off-world agenda points the runner could steal)
 * are swapped for three extra hedge_funds, keeping the deck at 30 cards.
 */
const AGENDA_HEAVY_CORP_FILLER = CORP_FILLER.map((id) =>
  id === "superconducting_hub" ? "hedge_fund" : id
);

// ---------------------------------------------------------------------------
// 1. Full games: EvalAI completes games on both sides
// ---------------------------------------------------------------------------

Deno.test("EvalAI plays complete games on both sides", () => {
  const decks = starterDeckPair();
  for (const seed of [1, 2, 3, 4]) {
    for (const evalSide of ["corp", "runner"] as const) {
      const other: PlayerSide = evalSide === "corp" ? "runner" : "corp";
      const out = playGame({
        corp: evalSide === "corp" ? new EvalAI({ samples: 6 }) : new RandomAI(),
        runner: evalSide === "runner" ? new EvalAI({ samples: 6 }) : new RandomAI(),
        state: engine.startGame({
          corp: decks.corp,
          runner: decks.runner,
          mode: "starter-decks",
          seed,
        }),
        maxMoves: 1500,
      });
      assert(
        !out.timedOut,
        `seed ${seed} as ${evalSide}: game did not finish (${out.moves} moves)`,
      );
      assertDefined(out.winner, `seed ${seed} as ${evalSide}: no winner`);
      assert(
        out.winner === evalSide || out.winner === other,
        `seed ${seed} as ${evalSide}: bad winner ${out.winner}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Boundary purity + hidden-order invariance (rules 10.2, 4.2.2, 4.3.4)
// ---------------------------------------------------------------------------

Deno.test("EvalAI's boundary discipline: pure picks and hidden-order invariance", async (t) => {
  await t.step("the pick is a pure function of (view, legal, ctx)", () => {
    const ai = new EvalAI();
    for (const seed of [1, 7, 42, 99]) {
      const state = evalRandomGame(seed, 8);
      const side: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
      const legal = engine.getLegalMoves(state, side);
      if (legal.length < 2) continue;

      // Same inputs -> same pick, twice, on two fresh instances.
      const a = decide(ai, state, side, legal, 5);
      const b = decide(new EvalAI(), state, side, legal, 5);
      assertEquals(b, a, `seed ${seed}: the pick was not a pure function of the inputs`);

      // The pick is one of the legal moves (the AI must not fabricate a move).
      const inLegal = legal.some((m) => JSON.stringify(m) === JSON.stringify(a));
      assert(
        inLegal,
        `seed ${seed}: the AI returned a move it was not offered: ${JSON.stringify(a)}`,
      );
    }
  });

  await t.step("the pick ignores the order of every hidden zone (rules 10.2, 4.2.2, 4.3.4)", () => {
    const ai = new EvalAI();
    for (const seed of [1, 7, 42, 99]) {
      const state = evalRandomGame(seed, 8);
      const side: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
      const legal = engine.getLegalMoves(state, side);
      if (legal.length < 2) continue;

      const view: PlayerView = engine.getPlayerView(state, side);
      const ctx: AIDecisionContext = makeAIDecisionContext(state, side, decisionSeedFor(view));
      const shuffled = reorderHidden(state, side, seed * 7919);
      shuffled.rngState = (shuffled.rngState ^ 0x5f3759df) | 0;

      // The boundary inputs cannot distinguish the two true states...
      assertEquals(
        engine.getPlayerView(shuffled, side),
        view,
        `seed ${seed}: the view leaked hidden order`,
      );
      assertEquals(
        makeAIDecisionContext(shuffled, side, decisionSeedFor(view)),
        ctx,
        `seed ${seed}: the context leaked hidden order`,
      );

      // ...so the determinized worlds and the EvalAI's pick must be identical.
      const d1 = determinize(view, ctx, makeRng(ctx.seed));
      const d2 = determinize(engine.getPlayerView(shuffled, side), ctx, makeRng(ctx.seed));
      assertEquals(d2, d1, `seed ${seed}: determinize depended on hidden order`);
      assertEquals(
        decide(ai, shuffled, side, legal, decisionSeedFor(view)),
        decide(ai, state, side, legal, decisionSeedFor(view)),
        `seed ${seed}: the pick changed when hidden order changed`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Softmax variety: similar situations do not collapse to one move
// ---------------------------------------------------------------------------

Deno.test("softmaxIndex spreads picks across a range of seeds", () => {
  // Two close averages: the top move wins ~52% of the time, not 100%.
  const avgs = new Float64Array([0, 0.1]);
  const seen = new Set<number>();
  for (let seed = 1; seed <= 200; seed++) {
    const rng = makeRng(seed * 131 + 7);
    seen.add(softmaxIndex(avgs, 5, rng));
  }
  assert(
    seen.size >= 2,
    `softmaxIndex always returned the same index: ${JSON.stringify([...seen])}`,
  );

  // A confident favourite is picked every time — the softmax is not noise.
  // Index 1 carries the higher average, so it is the favourite.
  const confident = new Float64Array([0, 100]);
  for (let seed = 1; seed <= 50; seed++) {
    const rng = makeRng(seed * 17 + 3);
    assertEquals(softmaxIndex(confident, 2, rng), 1, `seed ${seed}: the favourite was not picked`);
  }
});

Deno.test("EvalAI varies its pick across similar positions", () => {
  // A corp with a single hedge_fund in hand faces three close moves: draw,
  // play hedge_fund, or gain credits. The eval's small deltas and the softmax
  // spread the pick across seeds — never one deterministic move.
  const dealt = newGameWithCorpHand(["hedge_fund"]);
  const state = setHand(dealt, "corp", ["hedge_fund"]);
  const legal = engine.getLegalMoves(state, "corp");
  assert(legal.length >= 3, `expected at least 3 legal moves, got ${legal.length}`);

  const seen = new Set<string>();
  for (let seed = 1; seed <= 30; seed++) {
    const m = decide(new EvalAI(), state, "corp", legal, seed * 101);
    seen.add(m.kind);
  }
  assert(
    seen.size >= 2,
    `EvalAI picked the same move in all 30 seeds: ${JSON.stringify([...seen])}`,
  );
});

// ---------------------------------------------------------------------------
// 4. Eval sanity: the eval prefers obviously good moves
// ---------------------------------------------------------------------------

/** A corp with `agendaId` installed in a brand-new remote, advanced to its
 * requirement, with the corp already at 5 of 7 agenda points — scoring it
 * wins the game. The score/advancement setup goes through the clone-first
 * fixture setters (see tests/helpers/fixtures.ts header), never in place. */
function gameWinningAgendaState(agendaId: string): GameState {
  const state = newGameWithCorpHand([agendaId]);
  const install = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.install" && m.cardId === agendaId && m.server === "new-remote",
  );
  assertDefined(install, `the corp cannot install ${agendaId} in a new remote`);
  let s = play(state, "corp", install!);
  const server = s.servers.find((x) => x.id === "remote-1")!;
  const agenda = assertDefined(
    server.root.find((c) => c.cardId === agendaId),
    `the installed agenda is not in remote-1`,
  );
  const def = assertDefined(cardDef(agendaId), `unknown agenda ${agendaId}`);
  s = setInstalledAdvancement(s, agenda.id, def.advancementRequirement ?? 0);
  return setAgendaPoints(s, "corp", 5);
}

Deno.test("EvalAI takes a game-winning line", async (t) => {
  await t.step("scores a game-winning agenda", () => {
    const state = gameWinningAgendaState("offworld_office");
    const legal = engine.getLegalMoves(state, "corp");
    const score = assertDefined(
      legal.find((m) => m.kind === "corp.score"),
      "the ready agenda cannot be scored",
    );
    for (let seed = 1; seed <= 10; seed++) {
      const pick = decide(new EvalAI(), state, "corp", legal, seed * 131);
      assertEquals(pick, score, `seed ${seed}: the AI did not score the winning agenda`);
    }
  });

  await t.step("runs the game-winning agenda instead of gaining a credit", () => {
    // The runner is at 5 of 7 points; an offworld_office sits installed in a
    // brand-new remote. The runner's hand is empty (so it can't install) and
    // the corp's hidden pool is agenda-heavy, so determinization makes the
    // remote read as an agenda in most worlds — and the AI runs it.
    //
    // Deck: the opening hand plus `AGENDA_HEAVY_CORP_FILLER` (the shared
    // CORP_FILLER pool with its three superconducting_hub swapped for extra
    // hedge_funds), so no hand-derived card counts are duplicated here.
    const decks = starterDeckPair();
    let state = engine.startGame({
      corp: orderedCorpDeck(["offworld_office", ...AGENDA_HEAVY_CORP_FILLER]),
      runner: decks.runner,
      mode: "starter-decks",
      seed: 3,
    });
    const install = engine.getLegalMoves(state, "corp").find(
      (m) =>
        m.kind === "corp.install" && m.cardId === "offworld_office" && m.server === "new-remote",
    );
    assertDefined(install, "the corp cannot install offworld_office in a new remote");
    state = play(state, "corp", install!);
    state = endCorpTurn(state);
    const emptied = setHand(state, "runner", []);
    state = setAgendaPoints(emptied, "runner", 5);

    const legal = engine.getLegalMoves(state, "runner");
    const runs = legal.filter((m) => m.kind === "runner.run");
    assert(runs.length > 0, "the runner has no run move");
    const gain = legal.find((m) => m.kind === "runner.gainCredits");
    for (let seed = 1; seed <= 10; seed++) {
      const pick = decide(new EvalAI(), state, "runner", legal, seed * 131);
      assert(
        pick.kind === "runner.run",
        `seed ${seed}: the runner chose ${pick.kind} instead of running`,
      );
    }
    // And the eval itself agrees: running the agenda beats gaining a credit.
    const runClone = fastCloneState(state);
    const runResult = applyMove(runClone, "runner", runs[0]!, { mutate: true });
    if (runResult.kind !== "applied") {
      throw new Error(`the run move is illegal: ${runResult.reason}`);
    }
    const gainClone = fastCloneState(state);
    const gainResult = applyMove(gainClone, "runner", gain!, { mutate: true });
    if (gainResult.kind !== "applied") {
      throw new Error(`the gain-credit move is illegal: ${gainResult.reason}`);
    }
    assert(
      evaluate(runResult.state, "runner") > evaluate(gainResult.state, "runner"),
      "running the agenda should score higher than gaining a credit",
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Eval properties: monotone in obvious goods, zero-sum, terminal short-circuit
// ---------------------------------------------------------------------------

Deno.test("evaluate is monotone in obvious goods, zero-sum, and terminal", async (t) => {
  await t.step("monotone in obvious goods and zero-sum", () => {
    const state = newGameWithCorpHand(["hedge_fund"]);

    // More credits never lowers a side's own term.
    const moreCredits = deepClone(state);
    moreCredits.corp.credits += 1;
    assert(
      evaluate(moreCredits, "corp") > evaluate(state, "corp"),
      "corp credits must raise the corp term",
    );
    const moreRunnerCredits = deepClone(state);
    moreRunnerCredits.runner.credits += 1;
    assert(
      evaluate(moreRunnerCredits, "runner") > evaluate(state, "runner"),
      "runner credits must raise the runner term",
    );

    // More scored agenda points never lowers the scorer's term.
    const moreAgenda = deepClone(state);
    moreAgenda.corp.agendaPoints += 1;
    assert(
      evaluate(moreAgenda, "corp") > evaluate(state, "corp"),
      "agenda points must raise the corp term",
    );

    // Tags hurt the runner.
    const moreTags = deepClone(state);
    moreTags.runner.tags += 1;
    assert(
      evaluate(moreTags, "runner") < evaluate(state, "runner"),
      "tags must lower the runner term",
    );

    // Zero-sum on non-terminal positions.
    for (const s of [state, moreCredits, moreAgenda]) {
      assertEquals(
        evaluate(s, "corp") + evaluate(s, "runner"),
        0,
        `evaluate must be zero-sum on ${JSON.stringify(s.turn)}`,
      );
    }
  });

  await t.step("short-circuits to +/-WIN on terminal positions", () => {
    const state = newGameWithCorpHand(["hedge_fund"]);
    const won = deepClone(state);
    won.winner = "corp";
    won.winReason = "test";
    assertEquals(evaluate(won, "corp"), 10_000);
    assertEquals(evaluate(won, "runner"), -10_000);

    const drawn = deepClone(state);
    drawn.winner = "draw";
    assertEquals(evaluate(drawn, "corp"), 0);
    assertEquals(evaluate(drawn, "runner"), 0);
  });
});

// ---------------------------------------------------------------------------
// 6. Performance smoke: one decision on a mid-game state
// ---------------------------------------------------------------------------

Deno.test("EvalAI decides a mid-game position comfortably under 15s (perf smoke)", () => {
  const ai = new EvalAI();
  for (const seed of [42, 99]) {
    const state = evalRandomGame(seed, 30);
    const side: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
    const legal = engine.getLegalMoves(state, side);
    if (legal.length < 2) continue;
    const view = engine.getPlayerView(state, side);
    const ctx = makeAIDecisionContext(state, side, 12345);
    const t0 = performance.now();
    const pick = ai.chooseMove(view, legal, ctx);
    const ms = performance.now() - t0;
    // Perf signal is preserved (logged every run) but the bound is generous
    // (15s) so a warm-cache / CI-slowdown cannot flake a 2s assertion.
    console.log(`perf: EvalAI decision seed ${seed} took ${ms.toFixed(0)}ms`);
    assert(ms < 15000, `seed ${seed}: decision took ${ms.toFixed(0)}ms`);
    assert(legal.some((m) => JSON.stringify(m) === JSON.stringify(pick)), "the pick is legal");
  }
});
