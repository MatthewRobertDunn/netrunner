/**
 * Test fixtures: the `starter-decks-cyberclick-v1` deck configuration.
 *
 * Test data only. Nothing here is an official opening sequence; tests that need
 * a specific card order supply `orderedCards` explicitly.
 */

import { engine, starterDeckConfigs } from "../mod.ts";
import type { DeckConfig, GameState, Move, PlayerSide } from "../types.ts";
import type { ApplyMoveResult } from "../types.ts";

export function starterFixtures(): { corp: DeckConfig; runner: DeckConfig } {
  return starterDeckConfigs();
}

export function newStarterGame(
  seed = 1,
  overrides: Partial<{ runner: DeckConfig; corp: DeckConfig }> = {},
): GameState {
  const decks = starterFixtures();
  return engine.startGame({
    corp: overrides.corp ?? decks.corp,
    runner: overrides.runner ?? decks.runner,
    mode: "starter-decks",
    seed,
  });
}

const ORDERED_CORP_IDENTITY = "the_syndicate_profit_over_principle";

/** Filler cards from the corp starter pool (used after a scripted hand). */
const CORP_FILLER = [
  "hedge_fund",
  "hedge_fund",
  "hedge_fund",
  "government_subsidy",
  "government_subsidy",
  "offworld_office",
  "offworld_office",
  "send_a_message",
  "send_a_message",
  "nico_campaign",
  "nico_campaign",
  "urtica_cipher",
  "urtica_cipher",
  "regolith_mining_license",
  "regolith_mining_license",
  "seamless_launch",
  "seamless_launch",
  "tithe",
  "tithe",
];

/**
 * A corp deck whose top-to-bottom order is exactly `ordered` — the first five
 * cards become the starting hand (plus the mandatory draw), so tests can
 * script the corp's opening hand deterministically.
 */
export function orderedCorpDeck(ordered: string[]): DeckConfig {
  const counts = new Map<string, number>();
  for (const id of ordered) counts.set(id, (counts.get(id) ?? 0) + 1);
  return {
    identity: ORDERED_CORP_IDENTITY,
    cards: [...counts].map(([cardId, count]) => ({ cardId, count })),
    orderedCards: ordered,
  };
}

/** Start a game whose corp hand opens with exactly `hand` (in order). */
export function newGameWithCorpHand(hand: string[], seed = 3): GameState {
  const decks = starterFixtures();
  return engine.startGame({
    corp: orderedCorpDeck([...hand, ...CORP_FILLER]),
    runner: decks.runner,
    mode: "starter-decks",
    seed,
  });
}

/**
 * Spend the corp's remaining clicks (and answer its discard prompt) until the
 * turn passes to the runner.
 */
export function endCorpTurn(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 10; i++) {
    if (cur.turn.player !== "corp" || cur.winner) break;
    const legal = engine.getLegalMoves(cur, "corp");
    if (legal.length === 0) break;
    const gain = legal.find((m) => m.kind === "corp.gainCredits") ?? legal[0]!;
    cur = play(cur, "corp", gain).state;
  }
  return cur;
}

/** Corp turn 1: install `cardId` in a brand-new remote, then end the turn. */
export function installInNewRemoteAndEndTurn(cardId: string, seed = 3): GameState {
  const state = newGameWithCorpHand([cardId], seed);
  const install = engine.getLegalMoves(state, "corp").find(
    (m) => m.kind === "corp.install" && m.cardId === cardId && m.server === "new-remote",
  );
  if (!install || install.kind !== "corp.install") {
    throw new Error(`corp cannot install ${cardId} in a new remote`);
  }
  return endCorpTurn(play(state, "corp", install).state);
}

/**
 * The runner ran remote-1 whose ice is unrezzed: the corp's rez window is
 * pending (its option labels name the facedown card).
 */
export function rezWindowState(seed = 3): GameState {
  const state = installInNewRemoteAndEndTurn("tithe", seed);
  const run = engine.getLegalMoves(state, "runner").find(
    (m) => m.kind === "runner.run" && m.server === "remote-1",
  );
  if (!run || run.kind !== "runner.run") throw new Error("runner cannot run the remote");
  const after = play(state, "runner", run).state;
  const prompt = after.prompts[0];
  if (!prompt || prompt.kind !== "rez-window") {
    throw new Error("expected a pending corp rez window");
  }
  return after;
}

export type Outcome = { state: GameState; result: ApplyMoveResult };

/** Apply a move and return the new state (asserts the move was legal). */
export function play(state: GameState, side: PlayerSide, move: Move): ApplyMoveResult {
  const result = engine.applyMove(state, side, move);
  if (result.kind === "illegal-move") {
    throw new Error(
      `Illegal move ${JSON.stringify(move)} for ${side}: ${result.reason}`,
    );
  }
  return result;
}

/** Apply a sequence of moves, returning the final state. */
export function playAll(state: GameState, steps: { side: PlayerSide; move: Move }[]): GameState {
  let current = state;
  for (const step of steps) {
    const result = play(current, step.side, step.move);
    current = result.state;
  }
  return current;
}

/** Convenience: moves of a given kind. */
export function movesOfKind(state: GameState, side: PlayerSide, kind: Move["kind"]): Move[] {
  return engine.getLegalMoves(state, side).filter((m) => m.kind === kind);
}

export { engine };
