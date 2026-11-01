/**
 * Settle contract: a game-over state must not carry a live run/breach
 * (the winner cleanup at the top of `settle`, rules 10.4 / 1.7.2d).
 *
 * Regression: lethal damage mid-breach — accessing an installed Urtica Cipher
 * with an empty-able grip — set the winner inside `stepBreach` AFTER
 * `breach.accessing` had been assigned. The step then parked (returned true),
 * settle exited, and the final state carried `winner` with a live run
 * (`phase: "success"`) and breach (`accessing` set): 24/120 corpus games ended
 * that way. `stepBreach` now returns false once a winner exists so the loop's
 * winner cleanup clears prompts/run/breach.
 *
 * Decks are pinned with `orderedCards` (via `newGameWithCorpHand`'s corp deck =
 * Urtica + starter fillers); the 2-card grip uses the sanctioned `setHand`
 * fixture setter.
 */

import { engine } from "../src/mod.ts";
import type { GameState } from "../src/types.ts";
import { assertDefined, assertEquals } from "./helpers/assert.ts";
import {
  declineRezWindow,
  findInstalled,
  newGameWithCorpHand,
  play,
  setHand,
} from "./helpers/fixtures.ts";

/**
 * Install + advance Urtica Cipher in a new remote, burn the corp turn, and run
 * the remote: the run parks in the movement phase (rule 6.9.4c) with the
 * 2-card grip about to eat 3 net damage.
 */
function runAtUrtica(): GameState {
  let s = newGameWithCorpHand(["urtica_cipher"], 3);
  s = setHand(s, "runner", ["sure_gamble", "unity"]);
  s = play(
    s,
    "corp",
    assertDefined(
      engine.getLegalMoves(s, "corp").find(
        (m) =>
          m.kind === "corp.install" && (m as { cardId: string }).cardId === "urtica_cipher" &&
          (m as { server: string }).server === "new-remote",
      ),
      "the corp can install Urtica Cipher in a new remote",
    ),
  );
  const advance = engine.getLegalMoves(s, "corp").find((m) => m.kind === "corp.advance");
  if (advance) s = play(s, "corp", advance);
  while (s.turn.player === "corp" && !s.winner) {
    const moves = engine.getLegalMoves(s, "corp");
    if (moves.length === 0) break;
    s = play(s, "corp", moves.find((m) => m.kind === "corp.gainCredits") ?? moves[0]!);
  }
  const run = assertDefined(
    engine.getLegalMoves(s, "runner").find(
      (m) => m.kind === "runner.run" && m.server === "remote-1",
    ),
    "the runner can run the Urtica remote",
  );
  return play(s, "runner", run);
}

Deno.test("settle: a game won mid-breach leaves no live run/breach (rule 10.4 cleanup)", async (t) => {
  await t.step("auto-access of the lone breach candidate flatlines mid-settle", () => {
    let s = runAtUrtica();
    const continueRun = assertDefined(
      engine.getLegalMoves(s, "runner").find((m) => m.kind === "runner.continueRun"),
      "the run parks in the movement phase (rule 6.9.4c)",
    );
    // Continuing reaches the server's approach: the Corp gets the 6.9.4e rez
    // window over the remote's root, then — declining it — the run breaches.
    // The single root candidate (the ambush) is auto-accessed and its access
    // trigger deals 3 net damage at access begin — 3 > 2 cards in grip, so the
    // runner flatlines mid-settle.
    s = play(s, "runner", continueRun);
    s = declineRezWindow(s);

    assertEquals(s.winner, "corp", "a flatlined runner loses");
    assertEquals(s.winReason, "Runner was flatlined by damage");
    assertEquals(s.turn.phase, "game-over");
    // The regression: settle used to park here with the run in its success
    // phase and the breach still holding the accessed card.
    assertEquals(s.run, null, "the winner cleanup must clear the run");
    assertEquals(s.breach, null, "the winner cleanup must clear the breach");
    assertEquals(s.prompts.length, 0, "the winner cleanup must clear the prompts");
  });

  await t.step("a chosen access that kills also ends with a clean state", () => {
    // Two root cards make the breach multi-candidate: the runner CHOOSES the
    // ambush via `runner.accessCard` and the winner is set inside the move
    // handler — the same contract must hold for that settle entry.
    // (An asset's root slot is unique per server, so the second candidate is
    // the Manegarm Skunkworks upgrade, rule 4.2.4.)
    let s = newGameWithCorpHand(["urtica_cipher", "manegarm_skunkworks"], 3);
    s = setHand(s, "runner", ["sure_gamble", "unity"]);
    s = play(
      s,
      "corp",
      assertDefined(
        engine.getLegalMoves(s, "corp").find(
          (m) =>
            m.kind === "corp.install" && (m as { cardId: string }).cardId === "urtica_cipher" &&
            (m as { server: string }).server === "new-remote",
        ),
        "the corp can install Urtica Cipher in a new remote",
      ),
    );
    s = play(
      s,
      "corp",
      assertDefined(
        engine.getLegalMoves(s, "corp").find(
          (m) =>
            m.kind === "corp.install" &&
            (m as { cardId: string }).cardId === "manegarm_skunkworks" &&
            (m as { server: string }).server === "remote-1",
        ),
        "the corp can install an upgrade in the same remote",
      ),
    );
    const sAfterInstalls = s;
    const urtica = assertDefined(
      findInstalled(sAfterInstalls, "urtica_cipher"),
      "the ambush is installed in the remote",
    );
    // Advance the ambush once: 2 net + 1 per advancement = 3 damage, one more
    // than the 2-card grip can pay (the first step's 5-card grip survives it).
    s = play(
      s,
      "corp",
      assertDefined(
        engine.getLegalMoves(s, "corp").find(
          (m) => m.kind === "corp.advance" && (m as { targetId: string }).targetId === urtica.id,
        ),
        "the corp can advance Urtica Cipher",
      ),
    );
    while (s.turn.player === "corp" && !s.winner) {
      const moves = engine.getLegalMoves(s, "corp");
      if (moves.length === 0) break;
      s = play(s, "corp", moves.find((m) => m.kind === "corp.gainCredits") ?? moves[0]!);
    }
    const run = assertDefined(
      engine.getLegalMoves(s, "runner").find(
        (m) => m.kind === "runner.run" && m.server === "remote-1",
      ),
      "the runner can run the remote",
    );
    s = play(s, "runner", run);
    const continueRun = assertDefined(
      engine.getLegalMoves(s, "runner").find((m) => m.kind === "runner.continueRun"),
      "the run parks in the movement phase (rule 6.9.4c)",
    );
    s = play(s, "runner", continueRun);
    s = declineRezWindow(s);
    const access = assertDefined(
      engine.getLegalMoves(s, "runner").find(
        (m) => m.kind === "runner.accessCard" && (m as { targetId: string }).targetId === urtica.id,
      ),
      "the runner can choose which candidate to access",
    );
    s = play(s, "runner", access);

    assertEquals(s.winner, "corp");
    assertEquals(s.turn.phase, "game-over");
    assertEquals(s.run, null);
    assertEquals(s.breach, null);
    assertEquals(s.prompts.length, 0);
  });
});
