/**
 * EvalAI2: the strength-focused fork of EvalAI (v1 in tests/ai_eval_test.ts).
 *
 * Same algorithm and information boundary as v1; its own eval (eval-v2.ts)
 * adds corp credit management (rez reserve, affordability-aware protection)
 * and lets the softmax price jack-out. Tests: full games on both sides,
 * boundary purity, determinism, and eval pins for the credit terms.
 */

import {
  cardDef,
  decisionSeedFor,
  engine,
  EvalAI2,
  makeAIDecisionContext,
  starterDeckConfigs,
} from "../src/mod.ts";
import { playGame } from "../src/ai/play.ts";
import { evaluate } from "../src/ai/eval-v2.ts";
import { RandomAI } from "../src/ai/random.ts";
import type { GameState, PlayerSide } from "../src/types.ts";
import { assert, assertEquals } from "./helpers/assert.ts";
import { randomGame } from "./helpers/drive.ts";

// ---------------------------------------------------------------------------
// 1. Full games: v2 completes games on both sides (playGame throws on any
//    empty legal list or illegal move, so completing IS the assertion).
// ---------------------------------------------------------------------------

Deno.test("EvalAI2 plays complete games on both sides", () => {
  for (const evalSide of ["corp", "runner"] as const) {
    const outcome = playGame({
      corp: evalSide === "corp" ? new EvalAI2({ samples: 6 }) : new RandomAI(),
      runner: evalSide === "runner" ? new EvalAI2({ samples: 6 }) : new RandomAI(),
      state: engine.startGame({
        ...starterDeckConfigs(),
        mode: "starter-decks",
        seed: 7,
      }),
    });
    assert(
      outcome.winner !== null,
      `v2 as ${evalSide} should reach a winner, not time out`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. Determinism: same view + ctx ⇒ same pick (the boundary contract).
// ---------------------------------------------------------------------------

Deno.test("EvalAI2 is deterministic given (view, legal, ctx)", () => {
  const state = randomGame(new EvalAI2({ samples: 4 }), 21, 40, (i) => i * 131 + 7);
  const side: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
  const legal = engine.getLegalMoves(state, side);
  if (legal.length <= 1) return; // nothing to compare on a forced move
  const view = engine.getPlayerView(state, side);
  const ctx = makeAIDecisionContext(state, side, decisionSeedFor(view));
  const ai = new EvalAI2({ samples: 4 });
  assertEquals(ai.chooseMove(view, legal, ctx), ai.chooseMove(view, legal, ctx));
});

// ---------------------------------------------------------------------------
// 3. Eval pins for the credit-management terms.
// ---------------------------------------------------------------------------

Deno.test("eval-v2: credits below the rez reserve are worth more than W_CREDIT", () => {
  // Two positions identical except credits, both BELOW the cheapest live
  // defense: the marginal credit must be worth strictly more than the flat
  // rate, because spending it deepens the defense shortfall.
  const rich = evalDeltaForCredits(6);
  const poor = evalDeltaForCredits(1);
  // The one-credit difference in the poor position must weigh MORE than in
  // the rich one (shortfall term active only under the reserve).
  assert(
    poor > rich,
    `marginal credit below reserve (${poor}) should outvalue one above it (${rich})`,
  );
});

/** evaluate(A) - evaluate(B) where A and B differ by exactly one corp credit
 * at the given level, with unrezzed guarding ice live in both. */
function evalDeltaForCredits(credits: number): number {
  const a = stateWithCreditsAndWall(credits);
  const b = stateWithCreditsAndWall(credits - 1);
  return evaluate(a, "corp") - evaluate(b, "corp");
}

function stateWithCreditsAndWall(credits: number): GameState {
  const decks = starterDeckConfigs();
  const state = engine.startGame({ ...decks, mode: "starter-decks", seed: 5 });
  state.corp.credits = credits;
  // Give HQ an agenda root card behind unrezzed ice, so a live defense
  // exists and the reserve is nonzero.
  const agenda = state.corp.hand.find((c) => cardDef(c.cardId).type === "agenda");
  if (agenda) {
    state.corp.hand.splice(state.corp.hand.indexOf(agenda), 1);
    state.servers.find((s) => s.id === "hq")!.root.push(agenda);
  }
  const ice = state.corp.hand.find((c) => cardDef(c.cardId).type === "ice");
  if (ice) {
    state.corp.hand.splice(state.corp.hand.indexOf(ice), 1);
    ice.rezzed = false;
    state.servers.find((s) => s.id === "hq")!.ice.push(ice);
  }
  return state;
}
