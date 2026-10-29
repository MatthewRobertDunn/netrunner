/**
 * Server lifecycle (rule 4.6.10): a remote server with no cards in its root and
 * no ice protecting it ceases to exist at a checkpoint, and a run against it
 * ends (neither successful nor unsuccessful).
 */

import { cardDef, engine, starterDeckConfigs } from "../src/mod.ts";
import type { GameState, Move } from "../src/types.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

function play(state: GameState, actor: "corp" | "runner", m: Move): GameState {
  const r = engine.applyMove(state, actor, m);
  assertDefined(r.kind === "applied" ? r.state : undefined, `move ${m.kind} applies`);
  return (r as { state: GameState }).state;
}

function serverIds(state: GameState): string[] {
  return state.servers.map((s) => s.id);
}

/** Play out the Corp turn (the engine advances when clicks reach zero). */
function finishCorpTurn(state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 60 && current.turn.player === "corp" && !current.winner; i++) {
    const moves = engine.getLegalMoves(current, "corp");
    if (moves.length === 0) break;
    current = play(current, "corp", moves[0]!);
  }
  return current;
}

Deno.test("servers: a remote whose last card is trashed ceases to exist", () => {
  const decks = starterDeckConfigs();
  let state = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed: 42,
  });

  // Corp installs an asset in a brand-new remote.
  const install = engine.getLegalMoves(state, "corp").find((m) =>
    m.kind === "corp.install" && m.server === "new-remote" &&
    (cardDef(m.cardId).type === "asset" || cardDef(m.cardId).type === "agenda")
  ) as Extract<Move, { kind: "corp.install" }> | undefined;
  assertDefined(install, "Corp has an asset or agenda to install");
  state = play(state, "corp", install!);
  assert(serverIds(state).includes("remote-1"), "the new remote exists after installing");

  state = finishCorpTurn(state);
  assertEquals(state.turn.player, "runner");

  // Runner runs the remote; with no ice it breaches the root card.
  const run = engine.getLegalMoves(state, "runner").find((m) =>
    m.kind === "runner.run" && m.server === "remote-1"
  );
  assertDefined(run, "the Runner can run the new remote");
  state = play(state, "runner", run!);
  assert(state.breach !== null, "the run breaches the remote");

  // Access the card (with a single candidate the engine auto-accesses it),
  // then trash it.
  const canAccess = engine.getLegalMoves(state, "runner").some((m) =>
    m.kind === "runner.accessCard"
  );
  if (canAccess) {
    const access = engine.getLegalMoves(state, "runner").find((m) =>
      m.kind === "runner.accessCard"
    )!;
    state = play(state, "runner", access);
  }

  const trash = engine.getLegalMoves(state, "runner").find((m) =>
    m.kind === "runner.trashAccessed"
  );
  assertDefined(trash, "the Runner can pay the trash cost");
  state = play(state, "runner", trash!);

  // The remote has nothing left in its root and no ice: it ceases to exist.
  assert(!serverIds(state).includes("remote-1"), "the empty remote ceases to exist");
  const runStillOffered = engine.getLegalMoves(state, "runner").some((m) =>
    m.kind === "runner.run" && m.server === "remote-1"
  );
  assert(!runStillOffered, "no run is offered against a server that no longer exists");
});

Deno.test("servers: an empty remote is never returned by the public status", () => {
  const decks = starterDeckConfigs();
  const state = engine.startGame({
    corp: decks.corp,
    runner: decks.runner,
    mode: "starter-decks",
    seed: 42,
  });
  const shared = engine.getPublicGameStatus(state);
  for (const s of shared.servers) {
    if (s.id.startsWith("remote")) {
      assert(
        s.root.length > 0 || s.ice.length > 0,
        `remote ${s.id} has something installed`,
      );
    }
  }
});
