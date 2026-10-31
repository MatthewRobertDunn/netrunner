/**
 * Corp-action regression tests.
 *
 *  - Advance eligibility (rule 1.18.3): agendas can always be advanced; other
 *    cards only when their printed text says so (Urtica Cipher: "You can
 *    advance this asset."). Ice is never advanceable.
 *  - Advance cost (rule 5.2.6f): "[click], 1[credit]: Advance 1 installed card."
 *  - Upgrades may create a new remote server (rules 8.5.2a / 8.5.2c / 4.6.8b).
 *  - Docklands Pass: "The first time each turn you breach HQ, access 1
 *    additional card" — a prior non-HQ breach must not consume the bonus.
 *  - Seamless Launch: "Place 2 advancement counters on 1 installed card that
 *    you did not install this turn" — any installed card, including upgrades.
 *  - Overclock: "You can spend hosted credits during that run" — the fund must
 *    not survive to a run on a later turn.
 *
 * Hands are scripted deterministically via `orderedCards` (see
 * `orderedCorpDeck` in src/testing/fixtures.ts).
 */

import { engine, starterDeckConfigs } from "../src/mod.ts";
import type { CardId, DeckConfig, GameState, PlayerSide } from "../src/types.ts";
import { continueRun, orderedCorpDeck, play } from "../src/testing/fixtures.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

/** Play the parked movement-phase decision (rule 6.9.4c), if pending. */
function continueMovement(state: GameState): GameState {
  return continueRun(state);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Corp deck whose opening hand starts with `hand` (in order). */
function corpDeckWithHand(hand: CardId[]): DeckConfig {
  const cfg = starterDeckConfigs().corp;
  const rest = cfg.cards.flatMap((e) => Array<CardId>(e.count).fill(e.cardId));
  const front: CardId[] = [];
  for (const id of hand) {
    const i = rest.indexOf(id);
    if (i < 0) throw new Error(`${id} is not in the corp starter pool`);
    front.push(rest.splice(i, 1)[0]!);
  }
  return orderedCorpDeck([...front, ...rest]);
}

/** Runner deck whose opening hand starts with `first` (in order). */
function runnerDeckWithFirst(first: CardId[]): DeckConfig {
  const cfg = starterDeckConfigs().runner;
  const rest = cfg.cards.flatMap((e) => Array<CardId>(e.count).fill(e.cardId));
  const front: CardId[] = [];
  for (const id of first) {
    const i = rest.indexOf(id);
    if (i < 0) throw new Error(`${id} is not in the runner starter pool`);
    front.push(rest.splice(i, 1)[0]!);
  }
  return { identity: cfg.identity, cards: cfg.cards, orderedCards: [...front, ...rest] };
}

function newGame(corpHand: CardId[], runnerFirst: CardId[] = []): GameState {
  return engine.startGame({
    corp: corpDeckWithHand(corpHand),
    runner: runnerDeckWithFirst(runnerFirst),
    mode: "starter-decks",
    seed: 3,
  });
}

/** Play first-legal moves (clicks, discards) until it is `side`'s turn. */
function burnUntil(state: GameState, side: PlayerSide): GameState {
  let cur = state;
  for (let i = 0; i < 60; i++) {
    if (cur.winner || cur.turn.player === side) return cur;
    const active = cur.turn.player;
    const moves = engine.getLegalMoves(cur, active);
    if (moves.length === 0) return cur;
    cur = play(cur, active, moves[0]!).state;
  }
  return cur;
}

/** Finish the current turn, then play first-legal moves until it is `side`'s turn. */
function nextTurnOf(state: GameState, side: PlayerSide): GameState {
  let cur = state;
  const starter = cur.turn.player;
  for (let i = 0; i < 60 && !cur.winner && cur.turn.player === starter; i++) {
    const moves = engine.getLegalMoves(cur, starter);
    if (moves.length === 0) break;
    cur = play(cur, starter, moves[0]!).state;
  }
  return burnUntil(cur, side);
}

/** Resolve an in-progress run/breach (accessing without trashing) until it ends. */
function resolveRun(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 60; i++) {
    if (!cur.run || cur.winner) return cur;
    const moves = engine.getLegalMoves(cur, "runner");
    const m = moves.find((x) => x.kind === "runner.continueRun") ??
      moves.find((x) => x.kind === "runner.finishAccess") ??
      moves.find((x) => x.kind === "runner.accessCard" || x.kind === "runner.accessRandom") ??
      moves.find((x) => x.kind === "prompt.answer");
    if (m) {
      cur = play(cur, "runner", m).state;
      continue;
    }
    const corpMoves = engine.getLegalMoves(cur, "corp");
    if (corpMoves.length > 0) {
      cur = play(cur, "corp", corpMoves[0]!).state;
      continue;
    }
    return cur;
  }
  return cur;
}

/** First installed corp card with the given card id (root or ice), if any. */
function findInstalled(state: GameState, cardId: CardId) {
  for (const s of state.servers) {
    for (const c of [...s.root, ...s.ice]) if (c.cardId === cardId) return c;
  }
  return undefined;
}

function advanceTargetIds(state: GameState): string[] {
  return engine.getLegalMoves(state, "corp")
    .filter((m) => m.kind === "corp.advance")
    .map((m) => (m as { targetId: string }).targetId);
}

// ---------------------------------------------------------------------------
// Rule 1.18.3: advance eligibility
// ---------------------------------------------------------------------------

Deno.test("advance: ice cannot be advanced; Urtica Cipher and agendas can (rule 1.18.3)", () => {
  let s = newGame(["urtica_cipher", "palisade", "offworld_office"]);
  s =
    play(s, "corp", { kind: "corp.install", cardId: "urtica_cipher", server: "new-remote" }).state;
  s = play(s, "corp", { kind: "corp.install", cardId: "palisade", server: "hq" }).state;

  const urtica = assertDefined(findInstalled(s, "urtica_cipher"), "Urtica Cipher is installed");
  const palisade = assertDefined(findInstalled(s, "palisade"), "ice is installed");
  const targets = advanceTargetIds(s);
  assert(
    targets.includes(urtica.id),
    "Urtica Cipher ('You can advance this asset.') is advanceable",
  );
  assert(!targets.includes(palisade.id), "ice is never advanceable");

  // Spend the last click advancing Urtica; next turn the agenda must also be advanceable.
  s = play(s, "corp", { kind: "corp.advance", targetId: urtica.id }).state;
  s = nextTurnOf(s, "corp");
  s = play(s, "corp", { kind: "corp.install", cardId: "offworld_office", server: "new-remote" })
    .state;
  const agenda = assertDefined(findInstalled(s, "offworld_office"), "the agenda is installed");
  const targets2 = advanceTargetIds(s);
  assert(targets2.includes(agenda.id), "agendas can always be advanced");
  assert(targets2.includes(urtica.id), "Urtica Cipher remains advanceable");
  assert(!targets2.includes(palisade.id), "ice is still not advanceable");
});

// ---------------------------------------------------------------------------
// Rule 5.2.6f: advance costs 1 credit
// ---------------------------------------------------------------------------

Deno.test("advance: costs 1 click and 1 credit, and is not offered at 0 credits (rule 5.2.6f)", () => {
  let s = newGame(["urtica_cipher"]);
  s =
    play(s, "corp", { kind: "corp.install", cardId: "urtica_cipher", server: "new-remote" }).state;
  const urtica = assertDefined(findInstalled(s, "urtica_cipher"), "Urtica Cipher is installed");

  const creditsBefore = s.corp.credits;
  s = play(s, "corp", { kind: "corp.advance", targetId: urtica.id }).state;
  assertEquals(s.corp.credits, creditsBefore - 1, "advancing spent exactly 1 credit");
  assertEquals(findInstalled(s, "urtica_cipher")!.advancement ?? 0, 1, "one counter was placed");

  // Drain the corp to 0 credits by advancing across two more turns.
  s = play(s, "corp", { kind: "corp.advance", targetId: urtica.id }).state; // turn 1, last click
  s = nextTurnOf(s, "corp"); // corp turn 2
  for (let i = 0; i < 3; i++) {
    s = play(s, "corp", { kind: "corp.advance", targetId: urtica.id }).state;
  }
  assertEquals(s.corp.credits, 0, "the corp is at 0 credits");
  s = nextTurnOf(s, "corp"); // corp turn 3: 3 clicks, 0 credits, action phase

  assertEquals(
    advanceTargetIds(s).length,
    0,
    "corp.advance is not offered when the corp has 0 credits",
  );
  const rejected = engine.applyMove(s, "corp", { kind: "corp.advance", targetId: urtica.id });
  assert(rejected.kind === "illegal-move", "corp.advance is rejected at 0 credits");
});

// ---------------------------------------------------------------------------
// Rules 8.5.2a / 8.5.2c / 4.6.8b: upgrades may create a new remote
// ---------------------------------------------------------------------------

Deno.test("install: an upgrade may be installed into a new remote server (rules 8.5.2a/8.5.2c, 4.6.8b)", () => {
  const s = newGame(["manegarm_skunkworks"]);
  const install = engine.getLegalMoves(s, "corp").find((m) =>
    m.kind === "corp.install" && m.cardId === "manegarm_skunkworks" && m.server === "new-remote"
  );
  assertDefined(install, "an upgrade is offered for a new remote server");
  const after = play(s, "corp", install!).state;
  const remote = after.servers.find((x) => x.id === "remote-1");
  assert(remote !== undefined, "installing the upgrade created remote-1");
  assert(
    remote!.root.some((c) => c.cardId === "manegarm_skunkworks"),
    "the upgrade sits in the new remote's root",
  );
});

// ---------------------------------------------------------------------------
// Docklands Pass: first HQ breach of the turn (rule 7.3.5)
// ---------------------------------------------------------------------------

Deno.test("breach: Docklands Pass still applies to the first HQ breach after a non-HQ breach", () => {
  let s = newGame([], ["docklands_pass"]);
  s = burnUntil(s, "runner");
  s = play(s, "runner", { kind: "runner.install", cardId: "docklands_pass" }).state;

  // Breach a non-HQ server first (Archives): must not consume the bonus.
  s = play(s, "runner", { kind: "runner.run", server: "archives" }).state;
  assertEquals(
    s.runner.hqBreachesThisTurn,
    0,
    "a non-HQ breach does not count toward the once-per-turn HQ counter",
  );
  s = resolveRun(s);

  // Now breach HQ: Docklands Pass grants +1 access on the first HQ breach.
  s = play(s, "runner", { kind: "runner.run", server: "hq" }).state;
  s = continueMovement(s); // the run parks in movement (6.9.4c) before the breach
  assert(s.breach !== null && s.breach.server === "hq", "the HQ breach began");
  assertEquals(
    s.breach!.randomAccessLimit,
    2,
    "first HQ breach of the turn with Docklands Pass installed: access 2",
  );
  s = resolveRun(s);

  // A second HQ breach the same turn gets no bonus (once per turn).
  s = play(s, "runner", { kind: "runner.run", server: "hq" }).state;
  s = continueMovement(s);
  assert(s.breach !== null && s.breach.server === "hq", "the second HQ breach began");
  assertEquals(s.breach!.randomAccessLimit, 1, "second HQ breach of the turn: access 1 only");
});

// ---------------------------------------------------------------------------
// Seamless Launch printed text: any installed card, including upgrades
// ---------------------------------------------------------------------------

Deno.test("seamless launch: places 2 advancement counters on an upgrade", () => {
  let s = newGame(["manegarm_skunkworks", "seamless_launch"]);
  // Turn 1: install the upgrade only (it must not count as "installed this turn"
  // for Seamless Launch on a later turn).
  s = play(s, "corp", { kind: "corp.install", cardId: "manegarm_skunkworks", server: "hq" }).state;
  s = nextTurnOf(s, "corp"); // corp turn 2 (the upgrade was not installed this turn)
  const playOp = engine.getLegalMoves(s, "corp").find((m) =>
    m.kind === "corp.playOperation" && m.cardId === "seamless_launch"
  );
  assertDefined(playOp, "Seamless Launch is playable");
  s = play(s, "corp", playOp!).state;
  const upgrade = assertDefined(
    findInstalled(s, "manegarm_skunkworks"),
    "the upgrade is installed",
  );
  assertEquals(
    upgrade.advancement ?? 0,
    2,
    "Seamless Launch placed 2 counters on the upgrade ('1 installed card')",
  );
});

// ---------------------------------------------------------------------------
// Overclock: the fund is bound to a run made during the same turn
// ---------------------------------------------------------------------------

Deno.test("overclock: the run fund applies to a same-turn run but not to a later turn's run", () => {
  const overclockMove = (state: GameState) =>
    engine.getLegalMoves(state, "runner").find((m) =>
      m.kind === "runner.playEvent" && m.cardId === "overclock" && m.server === "hq"
    );

  // A run made during the same turn carries the fund.
  let s = newGame([], ["overclock"]);
  s = burnUntil(s, "runner");
  const oc1 = assertDefined(overclockMove(s), "Overclock is playable");
  s = play(s, "runner", oc1).state;
  assertEquals(s.runner.pendingRunFund, 5, "Overclock placed 5 credits on the event");
  s = play(s, "runner", { kind: "runner.run", server: "archives" }).state;
  assertEquals(s.run?.fundCredits, 5, "the same-turn run can spend the hosted credits");

  // No run made: the fund must not survive into the next runner turn.
  let t = newGame([], ["overclock"]);
  t = burnUntil(t, "runner");
  const oc2 = assertDefined(overclockMove(t), "Overclock is playable");
  t = play(t, "runner", oc2).state;
  assertEquals(t.runner.pendingRunFund, 5, "Overclock placed 5 credits on the event");
  t = nextTurnOf(t, "runner"); // finish runner turn 1 without running
  assertEquals(
    t.runner.pendingRunFund,
    0,
    "the Overclock fund is cleared by the next runner turn",
  );
  t = play(t, "runner", { kind: "runner.run", server: "archives" }).state;
  assert(
    t.run?.fundCredits === undefined,
    "a run on a later turn has no Overclock fund ('during that run')",
  );
});
