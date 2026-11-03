/**
 * Rule 7.1.6: "If, after resolving mid-access abilities, the Runner is still
 * accessing an agenda, they must steal it." Stealing is mandatory and happens
 * exactly once per accessed agenda — whether the Runner trashes it during the
 * mid-access window or passes.
 *
 * This also covers rule 7.2.3: an agenda accessed is stolen, and the basic
 * trash ability cannot be used on an agenda that has no trash cost (rule
 * 7.1.5a) — so the only way to resolve an agenda access is to steal it.
 */

import { cardDef, engine, starterDeckConfigs } from "../src/mod.ts";
import { continueRun, play } from "./helpers/fixtures.ts";
import type { GameState, Move } from "../src/types.ts";
import { isCorpInstall } from "../src/types.ts";
import { assert, assertDefined } from "./helpers/assert.ts";

function finishCorpTurn(state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 60 && current.turn.player === "corp" && !current.winner; i++) {
    const moves = engine.getLegalMoves(current, "corp");
    if (moves.length === 0) break;
    current = play(current, "corp", moves[0]!);
  }
  return current;
}

/** Find a seed where the Corp's opening hand contains an agenda. */
function findAgendaSeed(): { seed: number; agendaId: string } | null {
  for (let seed = 1; seed <= 50; seed++) {
    const state = engine.startGame({
      corp: starterDeckConfigs().corp,
      runner: starterDeckConfigs().runner,
      mode: "starter-decks",
      seed,
    });
    for (const c of state.corp.hand) {
      if (cardDef(c.cardId).type === "agenda") return { seed, agendaId: c.cardId };
    }
  }
  return null;
}

Deno.test("access: an accessed agenda is stolen exactly once and cannot be trashed (rules 7.1.6, 7.1.5a)", async (t) => {
  const found = findAgendaSeed();
  // Fail loudly instead of silently skipping: a re-imported decklist that
  // removes the agenda from every opening hand must not vaporize this pin.
  assert(
    found !== null,
    "no seed has an agenda in the Corp's opening hand — the mandatory-steal pin needs a fixture update",
  );
  const { seed, agendaId } = found;

  await t.step("the accessed agenda is stolen exactly once when the Runner passes", () => {
    let state = engine.startGame({
      corp: starterDeckConfigs().corp,
      runner: starterDeckConfigs().runner,
      mode: "starter-decks",
      seed,
    });

    // Install the agenda in a brand-new remote.
    const install = engine.getLegalMoves(state, "corp").find((m) =>
      isCorpInstall(m) && m.cardId === agendaId && m.server === "new-remote"
    ) as Move | undefined;
    assertDefined(install, "the agenda can be installed in a new remote");
    state = play(state, "corp", install!);
    state = finishCorpTurn(state);

    // Run the remote; with no ice it breaches the root card.
    const run = engine.getLegalMoves(state, "runner").find((m) =>
      m.kind === "run" && m.server === "remote-1"
    ) as Move | undefined;
    assertDefined(run, "the Runner can run the new remote");
    state = continueRun(play(state, "runner", run!));
    assert(state.breach !== null, "the run breaches the remote");

    // Access the agenda (single candidate → auto-accessed).
    const canAccess = engine.getLegalMoves(state, "runner").some((m) => m.kind === "accessCard");
    if (canAccess) {
      const access = engine.getLegalMoves(state, "runner").find((m) => m.kind === "accessCard")!;
      state = play(state, "runner", access);
    }

    // An agenda has no trash cost (rule 7.1.5a), so the only access decision is
    // to finish the access — which must steal it.
    const moves = engine.getLegalMoves(state, "runner");
    const finish = moves.find((m) => m.kind === "finishAccess");
    assertDefined(finish, "the Runner can finish the access");
    const before = state.runner.score.length;
    state = play(state, "runner", finish!);
    assert(state.runner.score.length === before + 1, "the agenda is stolen");
    assert(
      state.runner.score.some((c) => c.cardId === agendaId),
      "the stolen card is the accessed agenda",
    );
  });

  await t.step("an agenda cannot be trashed during access (no trash cost)", () => {
    // An agenda in the starter pool has no trash cost, so the basic trash
    // ability is never offered during its access (rule 7.1.5a).
    assert(cardDef(agendaId).trashCost === null, `${agendaId} has no trash cost`);
  });
});
