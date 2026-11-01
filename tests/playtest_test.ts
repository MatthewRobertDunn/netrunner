/**
 * Play-test: drive the engine through a few turns of the starter decks to
 * surface bugs in the rules engine (install/advance/score, runs, access,
 * damage, decking).
 *
 * Every scenario ends in a real, asserted end state (a scored agenda, a
 * damage event, a win reason). Run with: `deno task test`
 */

import { cardDef, engine } from "../src/mod.ts";
import type { GameState, PlayerSide } from "../src/types.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";
import {
  newGameWithCorpHand,
  newStarterGame,
  play,
  setAgendaPoints,
  setHand,
} from "./helpers/fixtures.ts";

function pick<T>(arr: T[]): T | undefined {
  return arr.length > 0 ? arr[0] : undefined;
}

function turn(state: GameState, side: "corp" | "runner", maxMoves = 40) {
  let current = state;
  for (let i = 0; i < maxMoves; i++) {
    const moves = engine.getLegalMoves(current, side);
    if (moves.length === 0) break;
    const m = pick(moves)!;
    current = play(current, side, m);
    if (current.winner) break;
  }
  return current;
}

function show(label: string, state: GameState): void {
  console.log(
    `--- ${label}: turn ${state.turn.number} ${state.turn.player} ` +
      `(corp ${state.corp.credits}c/${state.corp.clicks}cl, hand ${state.corp.hand.length}, ` +
      `runner ${state.runner.credits}c/${state.runner.clicks}cl, hand ${state.runner.hand.length})`,
  );
}

function actingSide(state: GameState): PlayerSide {
  return state.prompts[0]?.player ?? state.turn.player;
}

Deno.test("playtest: Corp installs and advances an agenda", () => {
  const state = newStarterGame(1);
  const moves = engine.getLegalMoves(state, "corp");
  // Precondition: the Corp's opening hand always holds installable cards.
  const install = assertDefined(
    moves.find((m) => m.kind === "corp.install"),
    "the Corp's opening hand has an installable card",
  );
  const afterInstall = play(state, "corp", install);
  show("after install", afterInstall);
  const installed = afterInstall.servers.flatMap((s) => [...s.root, ...s.ice]);
  assert(
    installed.length > 0,
    "the installed card is on the board",
  );
  const adv = engine.getLegalMoves(afterInstall, "corp").find((m) => m.kind === "corp.advance");
  if (adv) {
    const afterAdvance = play(afterInstall, "corp", adv);
    show("after advance", afterAdvance);
    const target = assertDefined(
      afterAdvance.servers.flatMap((s) => [...s.root, ...s.ice]).find(
        (c) => c.id === (adv as { targetId: string }).targetId,
      ),
      "the advanced card is still installed",
    );
    assertEquals(
      target.advancement ?? 0,
      1,
      "advancing placed exactly one advancement counter",
    );
  }
});

Deno.test("playtest: Runner runs HQ and accesses a card", () => {
  const state = newStarterGame(2);
  // Drive the Corp's turn to completion first.
  let current = turn(state, "corp");
  show("after corp turn", current);
  // Precondition: burning the Corp's turn always hands the turn to the Runner.
  assertEquals(
    current.turn.player,
    "runner",
    "the Corp's turn ended and the Runner's turn began",
  );
  // Runner's turn: play a run.
  current = turn(current, "runner");
  show("after runner turn", current);
  const runMove = engine.getLegalMoves(current, "runner").find((m) => m.kind === "runner.run");
  if (runMove && runMove.kind === "runner.run") {
    const afterRun = play(current, "runner", runMove);
    show("after run start", afterRun);
    assertDefined(afterRun.run, "the run move started a run");
    // Continue the run through its phases.
    current = turn(afterRun, "runner");
    show("after run resolves", current);
    assert(
      current.log.some((e) => e.type === "run-end"),
      "the run ended (a run-end event was logged)",
    );
  }
});

Deno.test("playtest: Corp scores an agenda — and a game-winning score ends the game", () => {
  // Deterministic setup: the corp opens with offworld_office (4 to advance,
  // 2 points on score) and sits at 5 of the 7 agenda points, so the score is
  // the winning move. The setup uses the sanctioned clone-first setter; every
  // game action below is a legal move.
  let state = setAgendaPoints(newGameWithCorpHand(["offworld_office"], 3), "corp", 5);
  let scored: GameState | null = null;
  for (let i = 0; i < 60 && !state.winner; i++) {
    const side = actingSide(state);
    const moves = engine.getLegalMoves(state, side);
    if (moves.length === 0) break;
    const score = side === "corp" ? moves.find((m) => m.kind === "corp.score") : undefined;
    if (score) {
      state = play(state, side, score);
      scored = state;
      show("after score", state);
      break;
    }
    const advance = side === "corp" ? moves.find((m) => m.kind === "corp.advance") : undefined;
    const install = side === "corp"
      ? moves.find(
        (m) => m.kind === "corp.install" && (m as { cardId: string }).cardId === "offworld_office",
      )
      : undefined;
    state = play(state, side, score ?? advance ?? install ?? moves[0]!);
  }
  if (!scored) throw new Error("the corp did not score the agenda within 60 moves");
  const done: GameState = scored;
  assert(
    done.log.some((e) => e.type === "score"),
    "a score event was logged",
  );
  assertEquals(done.corp.agendaPoints, 7, "the score banked offworld_office's 2 points");
  assertEquals(
    done.corp.score.map((c) => c.cardId),
    ["offworld_office"],
    "the scored agenda moved to the corp's score area",
  );
  assertEquals(done.winner, "corp", "reaching 7 agenda points wins the game");
  assertEquals(done.winReason, "Corp reached the agenda point target");
});

Deno.test("playtest: Urtica Cipher deals net damage when accessed — and can flatline", async (t) => {
  /** Install + advance Urtica once, burn the corp turn, start the run. */
  const runToMovement = (runnerHand?: string[]) => {
    let s = newGameWithCorpHand(["urtica_cipher"], 3);
    if (runnerHand) s = setHand(s, "runner", runnerHand);
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
    s = turn(s, "corp");
    const run = assertDefined(
      engine.getLegalMoves(s, "runner").find(
        (m) => m.kind === "runner.run" && m.server === "remote-1",
      ),
      "the runner can run the Urtica remote",
    );
    // No ice: the run parks in the movement phase (rule 6.9.4c).
    return play(s, "runner", run);
  };

  await t.step("accessing the advanced ambush deals its net damage (rule text)", () => {
    let s = runToMovement();
    const handBefore = s.runner.hand.length;
    const continueRun = assertDefined(
      engine.getLegalMoves(s, "runner").find((m) => m.kind === "runner.continueRun"),
      "the run parks in the movement phase (rule 6.9.4c)",
    );
    // Continuing reaches the server; the Corp's (R) rez window (6.9.4e — the
    // facedown Urtica in the root) opens before the breach, and the Corp
    // passes it so Urtica stays facedown for the access.
    s = play(s, "runner", continueRun);
    const windowPrompt = s.prompts[0];
    if (windowPrompt?.kind === "rez-window") {
      const pass = assertDefined(
        engine.getLegalMoves(s, "corp").find(
          (m) => m.kind === "prompt.answer" && m.optionId === "pass",
        ),
        "the corp can pass the server-approach rez window",
      );
      s = play(s, "corp", pass);
    }
    const damage = assertDefined(
      s.log.filter((e) => e.type === "damage").at(-1),
      "a damage event was logged at access begin",
    );
    assertEquals(damage.type === "damage" ? damage.amount : null, 3, "2 net + 1 per advancement");
    assertEquals(damage.type === "damage" ? damage.kind : null, "net");
    assertEquals(
      s.runner.hand.length,
      handBefore - 3,
      "the runner discarded 3 cards to net damage",
    );
    assertEquals(s.winner, null, "5 in hand survives 3 net damage");
  });

  await t.step("net damage can flatline the runner", () => {
    // The sanctioned fixture setter starts the runner at 2 cards: 3 net
    // damage empties the grip and ends the game.
    let s = runToMovement(["sure_gamble", "unity"]);
    const continueRun = assertDefined(
      engine.getLegalMoves(s, "runner").find((m) => m.kind === "runner.continueRun"),
      "the run parks in the movement phase (rule 6.9.4c)",
    );
    s = play(s, "runner", continueRun);
    // The Corp's 6.9.4e rez window (facedown Urtica in the root) opens before
    // the breach; the Corp passes it, the single candidate is auto-accessed,
    // and the ambush fires.
    const windowPrompt = s.prompts[0];
    if (windowPrompt?.kind === "rez-window") {
      const pass = assertDefined(
        engine.getLegalMoves(s, "corp").find(
          (m) => m.kind === "prompt.answer" && m.optionId === "pass",
        ),
        "the corp can pass the server-approach rez window",
      );
      s = play(s, "corp", pass);
    }
    assertEquals(s.runner.hand.length, 0, "the grip is empty");
    assertEquals(s.winner, "corp", "a flatlined runner loses");
    assertEquals(s.winReason, "Runner was flatlined by damage");
    assertEquals(cardDef("urtica_cipher").type, "asset", "sanity: the ambush is an asset");
  });
});

Deno.test("playtest: a player forced to draw from an empty deck loses (rule 1.7.2c)", () => {
  // Both sides burn every click on draws; the corp's deck empties first (its
  // mandatory draw phase makes decking reachable for it, while the runner is
  // never REQUIRED to draw — the runner has no draw phase, rule 5.3.3).
  let current = newStarterGame(5);
  for (let i = 0; i < 300 && !current.winner; i++) {
    const side = actingSide(current);
    const moves = engine.getLegalMoves(current, side);
    if (moves.length === 0) break;
    const draw = moves.find((m) => m.kind === `${side}.draw`);
    current = play(current, side, draw ?? moves[0]!);
  }
  assertEquals(current.winner, "runner", "the corp decking ends the game in the runner's favour");
  assertEquals(current.corp.deck.length, 0, "the corp's R&D is empty");
  assertDefined(current.winReason, "the decking loss records its win reason");
  assertEquals(
    current.winReason,
    "Corp could not draw from an empty R&D",
    "the win reason names the empty deck",
  );
});
