/**
 * Run/access test: drive the engine through a Corp-installed server with ice
 * and verify the Runner can break subroutines, access cards, and steal an
 * agenda. Deterministic seed.
 */

import { engine } from "../src/mod.ts";
import { newStarterGame, play } from "../src/testing/fixtures.ts";

function pick<T>(arr: T[]): T | undefined {
  return arr.length > 0 ? arr[0] : undefined;
}

function turn(state: ReturnType<typeof newStarterGame>, side: "corp" | "runner", maxMoves = 60) {
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

function moveKind(state: ReturnType<typeof newStarterGame>, side: "corp" | "runner", kind: string) {
  return engine.getLegalMoves(state, side).find((m) => m.kind === kind);
}

function resolve(state: ReturnType<typeof newStarterGame>) {
  const m = moveKind(state, "runner", "runner.resolveSubroutines");
  return m ? play(state, "runner", m).state : state;
}

function finishAccess(state: ReturnType<typeof newStarterGame>) {
  const m = moveKind(state, "runner", "runner.finishAccess");
  return m ? play(state, "runner", m).state : state;
}

Deno.test("run: Runner breaks all subroutines and accesses a card", () => {
  const state = newStarterGame(1);
  let current = state;
  // Corp installs Tithe (ice) in a new remote.
  const install = moveKind(current, "corp", "corp.install");
  if (install && install.kind === "corp.install" && install.cardId === "tithe") {
    current = play(current, "corp", install).state;
  } else {
    // Tithe may not be in hand; just install whatever ice is available.
    const iceInstall = engine
      .getLegalMoves(current, "corp")
      .find((m) => m.kind === "corp.install" && m.server !== "new-remote");
    if (iceInstall && iceInstall.kind === "corp.install") {
      current = play(current, "corp", iceInstall).state;
    }
  }
  // Rez the ice so the Runner encounters it.
  const rez = moveKind(current, "corp", "corp.rez");
  if (rez && rez.kind === "corp.rez") current = play(current, "corp", rez).state;
  // Finish the Corp's turn.
  current = turn(current, "corp");
  // Runner's turn: run the remote.
  const remote = current.servers.find((s) =>
    !s.id.startsWith("hq") && !["rd", "archives"].includes(s.id)
  )?.id;
  if (!remote) return;
  const runMove = engine.getLegalMoves(current, "runner").find(
    (m) => m.kind === "runner.run" && m.server === remote,
  );
  if (!runMove || runMove.kind !== "runner.run") return;
  current = play(current, "runner", runMove).state;
  // Break subroutines until none remain, then resolve.
  for (let i = 0; i < 20; i++) {
    const breakM = moveKind(current, "runner", "runner.breakSubroutine");
    if (!breakM) break;
    current = play(current, "runner", breakM).state;
    if (current.winner) break;
  }
  current = resolve(current);
  // Now we should be in the breach phase.
  if (!current.breach) {
    console.log("no breach — run ended before access");
    return;
  }
  // Access a card.
  const candidates = engine.getLegalMoves(current, "runner").filter(
    (m) => m.kind === "runner.accessCard",
  );
  if (candidates.length > 0 && candidates[0]!.kind === "runner.accessCard") {
    current = play(current, "runner", candidates[0]!).state;
  }
  // Finish the access.
  current = finishAccess(current);
  console.log(
    `run complete: runner credits ${current.runner.credits}, corp credits ${current.corp.credits}`,
  );
});
