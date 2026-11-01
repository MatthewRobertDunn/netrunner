/**
 * Test fixtures: the `starter-decks-cyberclick-v1` deck configuration.
 *
 * Test data only. Nothing here is an official opening sequence; tests that need
 * a specific card order supply `orderedCards` explicitly.
 *
 * MUTATION CONTRACT: the engine owns `GameState` — tests never write its
 * fields directly. The `set*` helpers below are the sanctioned escape hatch
 * for scenario setup that legal moves cannot reach: each one CLONES first and
 * mutates only the copy, so the caller's state is never aliased (mirroring the
 * engine's own `applyMove`-returns-a-copy invariant). Anything a helper does
 * not cover should be driven through legal moves instead of hand-editing.
 */

import { engine } from "../../src/engine/facade.ts";
import { starterDeckConfigs } from "../../src/decks/starter-decks-cyberclick-v1.ts";
import type {
  CardInstance,
  DeckConfig,
  GameEvent,
  GameState,
  Move,
  PlayerSide,
} from "../../src/types.ts";
import { deepClone } from "./assert.ts";

export function starterDeckPair(): { corp: DeckConfig; runner: DeckConfig } {
  return starterDeckConfigs();
}

export function newStarterGame(
  seed = 1,
  overrides: Partial<{ runner: DeckConfig; corp: DeckConfig }> = {},
): GameState {
  const decks = starterDeckPair();
  return engine.startGame({
    corp: overrides.corp ?? decks.corp,
    runner: overrides.runner ?? decks.runner,
    mode: "starter-decks",
    seed,
  });
}

/** Filler cards from the corp starter pool (used after a scripted hand). */
export const CORP_FILLER = [
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

/** The corp starter identity every ordered corp deck uses. */
const ORDERED_CORP_IDENTITY = "the_syndicate_profit_over_principle";

/** `count` copies of one card — deep-deck filler for scripted scenarios. */
export function repeated(cardId: string, count: number): string[] {
  return Array.from({ length: count }, () => cardId);
}

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

/**
 * A runner deck whose top-to-bottom order is exactly `ordered` (the runner
 * mirror of `orderedCorpDeck`).
 */
export function orderedRunnerDeck(ordered: string[]): DeckConfig {
  const cfg = starterDeckPair().runner;
  const counts = new Map<string, number>();
  for (const id of ordered) counts.set(id, (counts.get(id) ?? 0) + 1);
  return {
    identity: cfg.identity,
    cards: [...counts].map(([cardId, count]) => ({ cardId, count })),
    orderedCards: ordered,
  };
}

/**
 * Pull each id in `first` from the starter corp pool and put them at the
 * FRONT of the deck order (the rest keeps its original order), so the corp's
 * opening hand starts with `first` while the deck stays the real starter
 * deck. Throws when a requested card is not in the pool.
 */
export function corpDeckStartingWith(first: string[]): DeckConfig {
  const cfg = starterDeckPair().corp;
  const pool = cfg.cards.flatMap((e) => Array<string>(e.count).fill(e.cardId));
  for (const id of first) {
    const i = pool.indexOf(id);
    if (i < 0) throw new Error(`${id} is not in the corp starter pool`);
    pool.splice(i, 1);
  }
  return orderedCorpDeck([...first, ...pool]);
}

/**
 * The runner mirror of `corpDeckStartingWith`: `first` becomes the opening
 * hand (in order), the rest of the starter pool follows in its own order.
 */
export function runnerDeckStartingWith(first: string[]): DeckConfig {
  const cfg = starterDeckPair().runner;
  const pool = cfg.cards.flatMap((e) => Array<string>(e.count).fill(e.cardId));
  for (const id of first) {
    const i = pool.indexOf(id);
    if (i < 0) throw new Error(`${id} is not in the runner starter pool`);
    pool.splice(i, 1);
  }
  return orderedRunnerDeck([...first, ...pool]);
}

/** Start a game whose corp hand opens with exactly `hand` (in order). */
export function newGameWithCorpHand(hand: string[], seed = 3): GameState {
  const decks = starterDeckPair();
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
export function endCorpTurn(state: GameState, maxIters = 10): GameState {
  let cur = state;
  for (let i = 0; i < maxIters; i++) {
    if (cur.turn.player !== "corp" || cur.winner) break;
    const legal = engine.getLegalMoves(cur, "corp");
    if (legal.length === 0) break;
    const gain = legal.find((m) => m.kind === "corp.gainCredits") ?? legal[0]!;
    cur = play(cur, "corp", gain);
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
  return endCorpTurn(play(state, "corp", install));
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
  const after = play(state, "runner", run);
  const prompt = after.prompts[0];
  if (!prompt || prompt.kind !== "rez-window") {
    throw new Error("expected a pending corp rez window");
  }
  return after;
}

/**
 * Apply a move and return the new state (throws if the move is illegal — the
 * engine's own `applyMove` never mutates, and neither does this wrapper).
 */
export function play(state: GameState, side: PlayerSide, move: Move): GameState {
  const result = engine.applyMove(state, side, move);
  if (result.kind === "illegal-move") {
    throw new Error(
      `Illegal move ${JSON.stringify(move)} for ${side}: ${result.reason}`,
    );
  }
  return result.state;
}

/**
 * Play the movement-phase `runner.continueRun` decision if it is pending
 * (rule 6.9.4c: the run parks in the movement phase until the Runner jacks
 * out or continues). No-op when no such move is legal.
 */
export function continueRun(state: GameState): GameState {
  const m = engine.getLegalMoves(state, "runner").find((x) => x.kind === "runner.continueRun");
  return m ? play(state, "runner", m) : state;
}

// ---------------------------------------------------------------------------
// Scenario setters — the sanctioned escape hatch for fixture tweaking.
// Each CLONES the state first and mutates only the copy, so the caller's
// state is never aliased or mutated in place (see the header contract).
// ---------------------------------------------------------------------------

/**
 * Replace `side`'s hand with `cards` (definition ids), in a fresh clone.
 *
 * The cloned state is rebuilt zone-by-zone: cards named by `cards` are pulled
 * (in order) from the clone's deck+hand; every other card stays in the deck.
 * Note `cards: []` therefore empties the HAND only — the cards return to the
 * deck, they are not destroyed. To empty the whole deck, drive legal draws.
 */
export function setHand(state: GameState, side: PlayerSide, cards: string[]): GameState {
  const s = deepClone(state);
  const pool = s[side].deck.concat(s[side].hand);
  s[side].hand = cards.map((cardId) => {
    const at = pool.findIndex((c) => c.cardId === cardId);
    if (at < 0) throw new Error(`${cardId} is not in ${side}'s deck/hand`);
    return pool.splice(at, 1)[0]!;
  });
  s[side].deck = pool;
  return s;
}

/** Set `side`'s scored agenda points to `n`, in a fresh clone. */
export function setAgendaPoints(state: GameState, side: PlayerSide, n: number): GameState {
  const s = deepClone(state);
  s[side].agendaPoints = n;
  return s;
}

/** Set `side`'s credits to `n`, in a fresh clone. */
export function setCredits(state: GameState, side: PlayerSide, n: number): GameState {
  const s = deepClone(state);
  s[side].credits = n;
  return s;
}

/** Set the advancement counters on an installed card, in a fresh clone. */
export function setInstalledAdvancement(
  state: GameState,
  cardInstanceId: string,
  advancement: number,
): GameState {
  const s = deepClone(state);
  const found = s.servers
    .flatMap((srv) => [...srv.root, ...srv.ice])
    .find((c) => c.id === cardInstanceId);
  if (!found) throw new Error(`no installed card ${cardInstanceId}`);
  found.advancement = advancement;
  return s;
}

// ---------------------------------------------------------------------------
// State inspection helpers
// ---------------------------------------------------------------------------

/** First card with `cardId` installed in any server's root or ice, if any. */
export function findInstalled(
  state: GameState,
  cardId: string,
): CardInstance | undefined {
  return state.servers
    .flatMap((s) => [...s.root, ...s.ice])
    .find((c) => c.cardId === cardId);
}

/** Count log events of one type (optionally filtered by player). */
export function countEvents(
  state: GameState,
  type: GameEvent["type"],
  player?: PlayerSide,
): number {
  return state.log.filter((e) => {
    if (e.type !== type) return false;
    return player === undefined || (e as { player?: PlayerSide }).player === player;
  }).length;
}

export { engine };
