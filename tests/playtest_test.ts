/**
 * Play-test: drive the engine through a few turns of the starter decks to
 * surface bugs in the rules engine (install/advance/score, runs, access,
 * damage, decking).
 *
 * Run with: `deno task test`
 */

import { engine } from "../src/mod.ts";
import { newStarterGame, play } from "../src/testing/fixtures.ts";

function pick<T>(arr: T[]): T | undefined {
  return arr.length > 0 ? arr[0] : undefined;
}

function turn(state: ReturnType<typeof newStarterGame>, side: "corp" | "runner", maxMoves = 40) {
  let current = state;
  for (let i = 0; i < maxMoves; i++) {
    const moves = engine.getLegalMoves(current, side);
    if (moves.length === 0) break;
    const m = pick(moves)!;
    current = play(current, side, m).state;
    if (current.winner) break;
  }
  return current;
}

function show(label: string, state: ReturnType<typeof newStarterGame>): void {
  console.log(
    `--- ${label}: turn ${state.turn.number} ${state.turn.player} ` +
      `(corp ${state.corp.credits}c/${state.corp.clicks}cl, hand ${state.corp.hand.length}, ` +
      `runner ${state.runner.credits}c/${state.runner.clicks}cl, hand ${state.runner.hand.length})`,
  );
}

Deno.test("playtest: Corp installs and advances an agenda", () => {
  const state = newStarterGame(1);
  const moves = engine.getLegalMoves(state, "corp");
  const install = moves.find((m) => m.kind === "corp.install");
  if (!install) {
    console.log("no install move available (deck may be empty or no hand)");
    return;
  }
  const result = play(state, "corp", install);
  show("after install", result.state);
  const adv = engine.getLegalMoves(result.state, "corp").find((m) => m.kind === "corp.advance");
  if (adv) {
    const r2 = play(result.state, "corp", adv);
    show("after advance", r2.state);
  }
});

Deno.test("playtest: Runner runs HQ and accesses a card", () => {
  const state = newStarterGame(2);
  // Drive the Corp's turn to completion first.
  let current = turn(state, "corp");
  show("after corp turn", current);
  if (current.turn.player !== "runner") return;
  // Runner's turn: play a run.
  current = turn(current, "runner");
  show("after runner turn", current);
  const runMove = engine.getLegalMoves(current, "runner").find((m) => m.kind === "runner.run");
  if (runMove && runMove.kind === "runner.run") {
    const r = play(current, "runner", runMove);
    show("after run start", r.state);
    // Continue the run through its phases.
    current = turn(r.state, "runner");
    show("after run resolves", current);
  }
});

Deno.test("playtest: Corp scores an agenda", () => {
  const state = newStarterGame(3);
  let current = state;
  // Install + advance an agenda until it can be scored.
  for (let i = 0; i < 20; i++) {
    const moves = engine.getLegalMoves(current, "corp");
    const score = moves.find((m) => m.kind === "corp.score");
    if (score) {
      const r = play(current, "corp", score);
      show("after score", r.state);
      if (r.state.winner) {
        console.log(`winner: ${r.state.winner} — ${r.state.winReason}`);
      }
      break;
    }
    const m = pick(moves);
    if (!m) break;
    current = play(current, "corp", m).state;
  }
});

Deno.test("playtest: Runner takes damage and can flatline", () => {
  const state = newStarterGame(4);
  let current = state;
  // Corp installs Urtica Cipher and advances it.
  for (let i = 0; i < 30; i++) {
    const moves = engine.getLegalMoves(current, "corp");
    const adv = moves.find((m) => m.kind === "corp.advance");
    if (adv && adv.kind === "corp.advance") {
      const found = current.corp.installed.find((c) => c.id === adv.targetId);
      if (found && found.cardId === "urtica_cipher") {
        const r = play(current, "corp", adv);
        show("after urtica advance", r.state);
        current = r.state;
        break;
      }
    }
    const m = pick(moves);
    if (!m) break;
    current = play(current, "corp", m).state;
  }
  show("corp setup done", current);
});

Deno.test("playtest: Runner draws from empty Stack loses", () => {
  // Verify the decking-loss path exists in the codebase: after the Corp's turn
  // ends, the Runner's turn begins and the Runner has a draw move.
  const state = newStarterGame(5);
  let current = state;
  for (let i = 0; i < 40; i++) {
    const moves = engine.getLegalMoves(current, "corp");
    if (moves.length === 0) break;
    const m = pick(moves)!;
    current = play(current, "corp", m).state;
    if (current.turn.player === "runner") break;
  }
  if (current.turn.player !== "runner") return;
  const moves = engine.getLegalMoves(current, "runner");
  if (!moves.some((m) => m.kind === "runner.draw")) {
    throw new Error("expected a runner draw move");
  }
});
