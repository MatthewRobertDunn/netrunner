/**
 * Rule 7.1.5b: "The Runner cannot trash or pay the trash cost of a card in the
 * Corp's discard pile, either with the basic trash ability or with other
 * mid-access abilities."
 *
 * The engine previously offered `trashAccessed` on any accessed card whose
 * trash cost was payable — including a card already sitting in Archives. That
 * is not a trash: it is a re-trash, and it charges credits the Runner never
 * agreed to spend. The fix is a zone guard in the access-decision move
 * generator (legal-moves.ts), pinned here.
 */

import { cardDef, engine, starterDeckConfigs } from "../src/mod.ts";
import { play } from "./helpers/fixtures.ts";
import type { GameState, Move } from "../src/types.ts";
import { assert, assertDefined } from "./helpers/assert.ts";

/** Clear any pending Corp rez-window prompt (6.9.4e) before the Runner acts. */
function clearRezWindow(state: GameState): GameState {
  while (state.prompts[0]?.kind === "rez-window") {
    const pass = assertDefined(
      engine.getLegalMoves(state, "corp").find(
        (m) => m.kind === "prompt.answer" && m.optionId === "pass",
      ),
      "the Corp can pass the rez window",
    );
    state = play(state, "corp", pass);
  }
  return state;
}

/**
 * Drive a Runner run against `server` to its breach. The Corp gets a rez-window
 * prompt at the server approach (6.9.4e), so it must be cleared between the
 * `run` and `continueRun` moves — `continueRun` is illegal while it is pending.
 */
function runToBreach(state: GameState, server: string): GameState {
  const run = assertDefined(
    engine.getLegalMoves(state, "runner").find((m) => m.kind === "run" && m.server === server),
    `the Runner can run ${server}`,
  );
  state = play(state, "runner", run);
  state = clearRezWindow(state);
  const cont = assertDefined(
    engine.getLegalMoves(state, "runner").find((m) => m.kind === "continueRun"),
    "the Runner can continue the run",
  );
  state = play(state, "runner", cont);
  state = clearRezWindow(state);
  assert(state.breach !== null, `the run breaches ${server}`);
  return state;
}

/** Play the Corp's turn until its discard phase, then drop `dropId` into Archives. */
function discardAssetIntoArchives(state: GameState, dropId: string): GameState {
  for (let i = 0; i < 60 && state.turn.player === "corp" && !state.winner; i++) {
    if (state.prompts.length > 0) {
      const prompt = state.prompts[0]!;
      if (prompt.kind === "discard") {
        return play(state, "corp", { kind: "discard", cardInstanceIds: [dropId] } as Move);
      }
      // Any other prompt: pass it (rez window) or take the first legal move.
      const pass = engine.getLegalMoves(state, "corp").find(
        (m) => m.kind === "prompt.answer" && m.optionId === "pass",
      );
      state = play(state, "corp", pass ?? engine.getLegalMoves(state, "corp")[0]!);
      continue;
    }
    const moves = engine.getLegalMoves(state, "corp");
    if (moves.length === 0) break;
    state = play(state, "corp", moves[0]!);
  }
  return state;
}

Deno.test("servers: a card already in Archives is not trashable (rule 7.1.5b)", async (t) => {
  await t.step(
    "a trashable asset in the discard pile offers no trash during an Archives breach",
    () => {
      const decks = starterDeckConfigs();
      let state = engine.startGame({
        corp: decks.corp,
        runner: decks.runner,
        mode: "starter-decks",
        seed: 42,
      });

      // The Corp starts with 6 cards against a hand size of 5, so its first turn
      // ends in a mandatory discard. Pick a card with a payable trash cost —
      // the case that would have triggered the bug.
      const drop = assertDefined(
        state.corp.hand.find((c) => (cardDef(c.cardId).trashCost ?? 0) > 0),
        "the Corp holds a trashable asset to discard into Archives",
      );
      state = discardAssetIntoArchives(state, drop.id);
      assert(
        state.corp.discard.some((c) => c.id === drop.id),
        "the asset is now in the discard pile (Archives)",
      );

      state = runToBreach(state, "archives");

      // With a single access candidate the engine auto-accesses it, so the
      // access-decision prompt is already pending — no separate accessCard move.
      assertDefined(
        state.prompts.find((p) => p.kind === "access-decision"),
        "an access-decision prompt is pending for the breached card",
      );
      assert(
        !engine.getLegalMoves(state, "runner").some((m) => m.kind === "trashAccessed"),
        "the Runner cannot trash a card already in Archives (rule 7.1.5b)",
      );
    },
  );

  await t.step("the same asset installed in a remote IS trashable (regression)", () => {
    // The zone guard must not swallow the legitimate case: a card installed in
    // a server root, accessed and trashed, is fine (rule 7.1.5a).
    const decks = starterDeckConfigs();
    let state = engine.startGame({
      corp: decks.corp,
      runner: decks.runner,
      mode: "starter-decks",
      seed: 42,
    });
    const install = assertDefined(
      engine.getLegalMoves(state, "corp").find(
        (m) =>
          m.kind === "install" &&
          "server" in m &&
          m.server === "new-remote" &&
          (cardDef(m.cardId).trashCost ?? 0) > 0,
      ) as Move,
      "the Corp can install a trashable asset in a new remote",
    );
    state = play(state, "corp", install);
    // Finish the Corp turn so the Runner gets to act.
    for (let i = 0; i < 60 && state.turn.player === "corp" && !state.winner; i++) {
      const moves = engine.getLegalMoves(state, "corp");
      if (moves.length === 0) break;
      state = play(state, "corp", moves[0]!);
    }
    state = runToBreach(state, "remote-1");
    assert(
      engine.getLegalMoves(state, "runner").some((m) => m.kind === "trashAccessed"),
      "the Runner CAN trash a card installed in a server root",
    );
  });
});
