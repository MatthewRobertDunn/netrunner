/**
 * Fixtures for UI component tests.
 *
 * Builds an engine state the same way the install/legal-moves tests do, then
 * applies a list of moves so component tests land on a deterministic board.
 * `publicStatusFor` mirrors how GameScreen feeds `engine.getPublicGameStatusFor`
 * into the public-status DTO (viewer-aware for installed cards).
 */

import { engine, starterDeckConfigs } from "../../src/mod.ts";
import type { GameState, Move, PlayerSide } from "../../src/types.ts";
import { assertDefined } from "../helpers/assert.ts";

function fresh(seed: number): GameState {
  return engine.startGame({
    corp: starterDeckConfigs().corp,
    runner: starterDeckConfigs().runner,
    mode: "starter-decks",
    seed,
  });
}

function play(state: GameState, side: "corp" | "runner", m: Move): GameState {
  const r = engine.applyMove(state, side, m);
  if (r.kind !== "applied") {
    throw new Error(`move ${m.kind} rejected: ${(r as { reason: string }).reason}`);
  }
  return r.state;
}

/** Build a deterministic game state reached by playing `moves` in order. */
export function createTestFixture(
  seed = 1,
  humanSide: PlayerSide = "runner",
  moves: Move[] = [],
): { state: GameState; humanSide: PlayerSide } {
  let state = fresh(seed);
  for (const m of moves) {
    const actor = (m as { player?: PlayerSide }).player ??
      (m.kind.startsWith("corp") ? "corp" : "runner");
    state = play(state, actor, m);
  }
  return { state, humanSide };
}

/** Public game status for `humanSide`, like GameScreen renders. */
export function publicStatusFor(state: GameState, humanSide: PlayerSide) {
  return engine.getPublicGameStatusFor(state, humanSide);
}

/** Palisade ids currently in `side`'s hand, for building duplicated hands. */
export function palisadeInHand(state: GameState, side: "corp" | "runner"): string[] {
  const hand = side === "corp" ? state.corp.hand : state.runner.hand;
  return hand.filter((c) => c.cardId === "palisade").map((c) => c.cardId);
}

export function freshCorpHandWithExtraPalisade(seed = 42): GameState {
  const state = fresh(seed);
  const palisade = state.corp.hand.find((c) => c.cardId === "palisade");
  assertDefined(palisade, "seed 42 corp hand should hold Palisade");
  state.corp.hand.push({ ...palisade!, id: `${palisade!.id}-dup` });
  return state;
}
