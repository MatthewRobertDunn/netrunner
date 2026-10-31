/**
 * Runner event printed-text tests: VRcation, Creative Commission, Tread
 * Lightly, Overclock (data/cards.json is the specification).
 *
 * Regression tests for four confirmed engine bugs, all in `playRunnerEvent`
 * (src/engine/apply.ts):
 *
 *  - VRcation drew 3 and then forced a discard (implementing the wrong card).
 *    Printed: "Draw 4 cards. If you have any [click] remaining, lose [click]."
 *  - Creative Commission lost a click unconditionally, even with no click left
 *    to lose. Printed: "Gain 5[credit]. If you have any [click] remaining,
 *    lose [click]."
 *  - Tread Lightly could only run HQ: the move was offered without a `server`
 *    field and `playRunnerEvent` defaulted to HQ. Printed: "Run any server."
 *  - Overclock split the event from the run: the engine banked the hostile
 *    credits in `pendingRunFund` for a LATER, separately-clicked run while
 *    `legal-moves.ts` offered `server: hq/rd` variants the applier ignored.
 *    Printed: "... then run any server" (see docs/rules-gotchas.md #8).
 *
 * Rule citations: 5.2.2a (the event's trigger cost is paid before its effects
 * resolve), 5.2.2b (a run initiated during an action's resolution is part of
 * that action — the action is not complete until the run is), 1.11.3b ("lose"
 * and "spend" are not synonymous for clicks), 8.6 (playing an event), 6.9.2b
 * (the rez window for approached ice).
 *
 * Hands are scripted deterministically via `orderedCards`; the runner identity
 * in every fixture is the Catalyst.
 */

import { engine, starterDeckConfigs } from "../src/mod.ts";
import type {
  CardId,
  CardInstance,
  DeckConfig,
  GameEvent,
  GameState,
  Move,
  PlayerSide,
  ServerId,
} from "../src/types.ts";
import { orderedCorpDeck, play } from "../src/testing/fixtures.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

// ---------------------------------------------------------------------------
// Fixtures
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

/** Play first-legal moves until it is `side`'s turn. */
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

/** Bank Corp credits across turns: gain-credit, discard down, burn the
 *  Runner's turn, repeat, until `target` credits are reached. */
function bankCorpCredits(state: GameState, target: number): GameState {
  let cur = state;
  for (let i = 0; i < 60 && cur.corp.credits < target; i++) {
    if (cur.winner) return cur;
    if (cur.turn.player !== "corp") {
      // Burn the Runner's turn (first-legal move) to get back to the Corp.
      const moves = engine.getLegalMoves(cur, "runner");
      if (moves.length === 0) return cur;
      cur = play(cur, "runner", moves[0]!).state;
      continue;
    }
    if (cur.prompts.length > 0) {
      const drop = cur.corp.hand[0]?.id;
      if (!drop) return cur;
      cur = play(cur, "corp", { kind: "discard", player: "corp", cardInstanceIds: [drop] }).state;
      continue;
    }
    const gain = engine.getLegalMoves(cur, "corp").find((m) => m.kind === "corp.gainCredits");
    if (!gain) return cur;
    cur = play(cur, "corp", gain).state;
  }
  return cur;
}

/** First installed corp card with the given card id (root or ice), if any. */
function findInstalled(state: GameState, cardId: CardId): CardInstance | undefined {
  for (const s of state.servers) {
    for (const c of [...s.root, ...s.ice]) if (c.cardId === cardId) return c;
  }
  return undefined;
}

/** Drain the runner's clicks down by `toSpend`, using basic actions. */
function spendRunnerClicks(state: GameState, toSpend: number): GameState {
  let cur = state;
  for (let i = 0; i < toSpend; i++) {
    cur = play(cur, "runner", { kind: "runner.gainCredits" }).state;
  }
  return cur;
}

/** Find a specific `runner.playEvent` move for `cardId` (optionally on `server`). */
function eventMove(state: GameState, cardId: CardId, server?: ServerId): Move | undefined {
  return engine.getLegalMoves(state, "runner").find((m) =>
    m.kind === "runner.playEvent" && m.cardId === cardId &&
    (server === undefined || (m as { server?: ServerId }).server === server)
  );
}

/** Every server offered for a card's `runner.playEvent` move. */
function eventServers(state: GameState, cardId: CardId): (ServerId | undefined)[] {
  return engine.getLegalMoves(state, "runner")
    .filter((m) => m.kind === "runner.playEvent" && m.cardId === cardId)
    .map((m) => (m as { server?: ServerId }).server);
}

/** Count log events of one type (optionally filtered by player). */
function countEvents(state: GameState, type: GameEvent["type"], player?: PlayerSide): number {
  return state.log.filter((e) => {
    if (e.type !== type) return false;
    return player === undefined || (e as { player?: PlayerSide }).player === player;
  }).length;
}

/** Events produced by one applied move, narrowed to the ones `type` names. */
function typedEvents(result: ReturnType<typeof play>, type: GameEvent["type"]): GameEvent[] {
  return result.events.filter((e) => e.type === type);
}

/** The rez-window option targeting the ice at the Runner's position. */
function iceRezOption(state: GameState) {
  const prompt = assertDefined(state.prompts[0], "a prompt is pending");
  assert(prompt.kind === "rez-window", "expected a pending corp rez window");
  assert(state.run !== null, "a run is in progress");
  assert(state.run.position !== null, "the runner is approaching ice");
  const server = state.servers.find((s) => s.id === state.run!.server)!;
  const ice = server.ice[state.run!.position!]!;
  const option = prompt.options.find((o) => o.targetId === ice.id);
  assertDefined(option, `the rez window offers an option for ${ice.cardId}`);
  return { prompt, ice, option: option! };
}

/**
 * Corp turn 1: the corp installs `iceId` protecting `server`, then spends its
 * remaining clicks so the turn passes to the Runner. Returns the runner-turn
 * state and the installed ice.
 */
function corpInstallIceThenEndTurn(
  iceId: CardId,
  server: ServerId | "new-remote",
  runnerFirst: CardId[] = [],
): {
  state: GameState;
  ice: CardInstance;
} {
  const s = newGame([iceId], runnerFirst);
  const install = engine.getLegalMoves(s, "corp").find((m) =>
    m.kind === "corp.install" && m.cardId === iceId && m.server === server
  );
  assertDefined(install, `corp can install ${iceId} on ${server}`);
  let cur = play(s, "corp", install!).state;
  const ice = assertDefined(findInstalled(cur, iceId), `${iceId} is installed`);
  while (cur.turn.player === "corp" && !cur.winner) {
    cur = play(cur, "corp", { kind: "corp.gainCredits" }).state;
  }
  assertEquals(cur.turn.player, "runner", "the runner's turn begins");
  return { state: cur, ice };
}

// ---------------------------------------------------------------------------
// VRcation: "Draw 4 cards. If you have any click remaining, lose click."
// ---------------------------------------------------------------------------

Deno.test("vrcation: draws 4, spends the event click, then loses one click", () => {
  let s = newGame([], ["vrcation"]);
  s = burnUntil(s, "runner");
  const clicksBefore = s.runner.clicks;
  const handBefore = s.runner.hand.length;
  const vrcation = assertDefined(eventMove(s, "vrcation"), "VRcation is playable");

  const result = play(s, "runner", vrcation);
  const after = result.state;

  const draws = typedEvents(result, "draw");
  assertEquals(draws.length, 1, "exactly one draw event");
  assertEquals((draws[0] as { count: number }).count, 4, "printed text draws exactly 4 cards");
  assertEquals(
    after.runner.hand.length,
    handBefore + 3,
    "hand grows by 3: the played card leaves the grip and 4 are drawn",
  );
  assertEquals(
    after.runner.clicks,
    clicksBefore - 2,
    "the event click plus the 'lose click' clause both land",
  );
  assertEquals(
    typedEvents(result, "spend-clicks").length,
    1,
    "exactly one spend-clicks(1): the event's trigger cost (rule 5.2.2a)",
  );
  const loses = typedEvents(result, "lose-clicks");
  assertEquals(loses.length, 1, "exactly one lose-clicks(1) from the conditional clause");
  assertEquals(
    countEvents(after, "discard", "runner"),
    0,
    "no discard: VRcation's old 'draw 3 then discard 1' was the wrong card",
  );
  assertEquals(after.prompts.length, 0, "no prompt is left pending");
});

Deno.test("vrcation: played with no click remaining loses nothing", () => {
  let s = newGame([], ["vrcation"]);
  s = burnUntil(s, "runner");
  // Spend every click but the last one, so playing the event leaves 0.
  s = spendRunnerClicks(s, s.runner.clicks - 1);
  assertEquals(s.runner.clicks, 1, "one click left for the event itself");
  const handBefore = s.runner.hand.length;

  const result = play(s, "runner", eventMove(s, "vrcation")!);
  const after = result.state;

  assertEquals(
    (typedEvents(result, "draw")[0] as { count: number }).count,
    4,
    "still draws exactly 4 cards",
  );
  assertEquals(after.runner.hand.length, handBefore + 3, "hand +3 (the event card left)");
  assertEquals(after.runner.clicks, 0, "the event click was the last one");
  assertEquals(
    typedEvents(result, "lose-clicks").length,
    0,
    "the conditional clause does not fire with no click remaining",
  );
  // The 8-card hand overflows the 5-card limit (rule 5.5.4a), so the discard
  // phase prompts for the overflow — that is the hand-size mechanic, not the
  // event's discard clause (which the old implementation added on top).
  const discard = after.prompts.find((p) => p.kind === "discard");
  assertDefined(discard, "the discard-phase prompt is pending for the hand overflow");
  assertEquals(discard!.count, 3, "the runner must discard 3 cards (8 - 5)");
});

// ---------------------------------------------------------------------------
// Creative Commission: "Gain 5 credits. If you have any click remaining,
// lose click."
// ---------------------------------------------------------------------------

Deno.test("creative commission: gains 5 credits and loses one click", () => {
  let s = newGame([], ["creative_commission"]);
  s = burnUntil(s, "runner");
  const clicksBefore = s.runner.clicks;
  const creditsBefore = s.runner.credits;
  const commission = assertDefined(eventMove(s, "creative_commission"), "the event is playable");

  const result = play(s, "runner", commission);
  const after = result.state;

  assertEquals(
    (typedEvents(result, "gain-credits")[0] as { amount: number }).amount,
    5,
    "gains 5 credits",
  );
  assertEquals(after.runner.credits, creditsBefore + 4, "gains 5, pays the 1-credit play cost");
  assertEquals(after.runner.clicks, clicksBefore - 2, "the event click plus one lost click");
  const loses = typedEvents(result, "lose-clicks");
  assertEquals(loses.length, 1, "exactly one lose-clicks(1) when a click remains");
  assertEquals((loses[0] as { amount: number }).amount, 1, "the clause loses exactly one click");
});

Deno.test("creative commission: loses no click with none remaining", () => {
  let s = newGame([], ["creative_commission"]);
  s = burnUntil(s, "runner");
  s = spendRunnerClicks(s, s.runner.clicks - 1);
  assertEquals(s.runner.clicks, 1, "one click left for the event itself");
  const creditsBefore = s.runner.credits;

  const result = play(s, "runner", eventMove(s, "creative_commission")!);
  const after = result.state;

  assertEquals(after.runner.clicks, 0, "only the event click was spent");
  assertEquals(
    after.runner.credits,
    creditsBefore + 4,
    "the credits still resolve; only the click clause is skipped",
  );
  assertEquals(
    typedEvents(result, "lose-clicks").length,
    0,
    "no click is lost when none remains (the old code logged one anyway)",
  );
});

// ---------------------------------------------------------------------------
// Corp operations: printed gain amounts (not net deltas).
// ---------------------------------------------------------------------------
// Hedge Fund: "Gain 9 credits." (cost 5, net +4). Government Subsidy:
// "Gain 15 credits." (cost 10, net +5). The resolver must gain the printed
// amount — `playCorpOperation` already spends the cost separately — so a
// hardcoded net amount silently refunds the play cost.

Deno.test("hedge fund: gains the printed 9 credits", () => {
  let s = newGame(["hedge_fund"]);
  s = burnUntil(s, "corp");
  const creditsBefore = s.corp.credits;
  const move = assertDefined(
    engine.getLegalMoves(s, "corp").find((m) =>
      m.kind === "corp.playOperation" && m.cardId === "hedge_fund"
    ),
    "hedge fund is playable",
  );
  const result = play(s, "corp", move);
  const after = result.state;

  assertEquals(
    (typedEvents(result, "gain-credits")[0] as { amount: number }).amount,
    9,
    "gains the printed 9 credits",
  );
  assertEquals(after.corp.credits, creditsBefore + 4, "gains 9, pays the 5-credit play cost");
});

Deno.test("government subsidy: gains the printed 15 credits", () => {
  let s = newGame(["government_subsidy"]);
  s = burnUntil(s, "corp");
  // Government Subsidy costs 10 and the Corp opens with 5 credits — bank
  // credits across turns until it is affordable.
  s = bankCorpCredits(s, 10);
  const creditsBefore = s.corp.credits;
  const move = assertDefined(
    engine.getLegalMoves(s, "corp").find((m) =>
      m.kind === "corp.playOperation" && m.cardId === "government_subsidy"
    ),
    "government subsidy is playable",
  );
  const result = play(s, "corp", move);
  const after = result.state;

  assertEquals(
    (typedEvents(result, "gain-credits")[0] as { amount: number }).amount,
    15,
    "gains the printed 15 credits",
  );
  assertEquals(after.corp.credits, creditsBefore + 5, "gains 15, pays the 10-credit play cost");
});

// ---------------------------------------------------------------------------
// Tread Lightly: "Run any server. During that run, the rez cost of each piece
// of ice is increased by 3 credits."
// ---------------------------------------------------------------------------

Deno.test("tread lightly: the runner chooses the server and the run starts on it", () => {
  // Corp turn 1: Palisade (rez cost 3) protecting R&D, then end the turn.
  const setup = corpInstallIceThenEndTurn("palisade", "rd", ["tread_lightly"]);
  const s0 = setup.state;

  // Every server is offered — not just HQ (the old bare-move bug).
  assertEquals(
    eventServers(s0, "tread_lightly"),
    ["hq", "rd", "archives"],
    "Tread Lightly runs ANY server: the three centrals are all offered",
  );

  const tread = assertDefined(eventMove(s0, "tread_lightly", "rd"), "R&D is offered");
  const result = play(s0, "runner", tread);
  const after = result.state;

  assertEquals(after.run?.server, "rd", "the run initiated on the chosen server (R&D)");
  assertEquals(after.run?.source, "tread_lightly", "the run's source is the event");
  assertEquals(after.run?.phase, "approach-ice", "the run progressed to the approach ice phase");
  assertEquals(after.runner.clicks, 3, "only the event click was spent (the run is part of it)");
  assert(
    after.runner.ranServersThisTurn.includes("rd"),
    "R&D counts as run this turn",
  );
  assertEquals(
    typedEvents(result, "run-start").length,
    1,
    "the run started inside the event's resolution (rule 5.2.2b)",
  );
});

Deno.test("tread lightly: +3 rez cost shows and charges on the run it initiates (rules 6.9.2b, 1.16.8)", () => {
  // Palisade's printed rez cost is 3; the run adds 3 to it (rule 6.9.2b via
  // `run.rezCostIncrease`, the single source of truth `rezCostFor`).
  const setup = corpInstallIceThenEndTurn("palisade", "rd", ["tread_lightly"]);
  const s0 = setup.state;

  const tread = assertDefined(eventMove(s0, "tread_lightly", "rd"), "R&D is offered");
  const after = play(s0, "runner", tread).state;
  assertEquals(after.run?.rezCostIncrease, 3, "the run carries the +3 rez-cost increase");

  const { ice, option } = iceRezOption(after);
  assertEquals(ice.cardId, "palisade", "the approached ice is Palisade");
  assertEquals(option.creditCost, 6, "the rez-window option costs printed 3 + 3");
  assertEquals(option.label, "Rez Palisade (6[credit])", "the label shows printed+3");

  const before = after.corp.credits;
  const rezzed = play(after, "corp", {
    kind: "prompt.answer",
    player: "corp",
    promptId: after.prompts[0]!.id,
    optionId: option.id,
  }).state;
  assertEquals(before - rezzed.corp.credits, 6, "rezzing charges printed+3 exactly once");
  assertEquals(findInstalled(rezzed, "palisade")!.rezzed, true, "the ice is rezzed");
  // The encounter now begins: Palisade's one subroutine can end the run.
  assertEquals(rezzed.run?.phase, "encounter-ice", "the ice encounter began after the rez");
});

// ---------------------------------------------------------------------------
// Overclock: "Place 5 credits on this event, then run any server. You can
// spend hosted credits during that run."
// ---------------------------------------------------------------------------

Deno.test("overclock: the run initiates as part of the event, with the 5 hosted credits on it", () => {
  let s = newGame([], ["overclock"]);
  s = burnUntil(s, "runner");
  const clicksBefore = s.runner.clicks;

  // The card names "any server" (no corp installs here, so the three centrals).
  assertEquals(
    eventServers(s, "overclock"),
    ["hq", "rd", "archives"],
    "Overclock's printed 'run any server' enumerates every runnable server",
  );

  const overclock = assertDefined(eventMove(s, "overclock", "rd"), "R&D is offered");
  const result = play(s, "runner", overclock);
  const after = result.state;

  assertDefined(after.run, "the event initiated the run itself (rule 5.2.2b)");
  assertEquals(after.run!.server, "rd", "the run is on the chosen server");
  assertEquals(after.run!.source, "overclock", "the run's source is the event");
  assertEquals(
    after.run!.fundCredits,
    5,
    "the 5 hosted credits sit on the run state, spendable during that run",
  );
  assertEquals(
    after.runner.pendingRunFund,
    0,
    "nothing is banked for a later run: 'during that run' cannot leak (gotchas #8)",
  );
  assertEquals(
    after.runner.clicks,
    clicksBefore - 1,
    "only the event click was spent — no extra click for a separate run",
  );
  assertEquals(
    typedEvents(result, "run-start").length,
    1,
    "the run started inside the event's resolution (rule 5.2.2b)",
  );
});

Deno.test("overclock: hosted credits can pay the Manegarm toll during that run", () => {
  // Fixture from tests/toll_test.ts: a rezzed Manegarm Skunkworks in remote-1
  // raises a 5-credit toll when the Runner approaches the server.
  let s = newGame(["nico_campaign", "manegarm_skunkworks"], ["overclock"]);

  const installAsset = engine.getLegalMoves(s, "corp").find((m) =>
    m.kind === "corp.install" && m.cardId === "nico_campaign" && m.server === "new-remote"
  );
  assertDefined(installAsset, "the corp can install Nico Campaign in a new remote");
  s = play(s, "corp", installAsset!).state;
  const installUpgrade = engine.getLegalMoves(s, "corp").find((m) =>
    m.kind === "corp.install" && m.cardId === "manegarm_skunkworks" && m.server === "remote-1"
  );
  assertDefined(installUpgrade, "the corp can install the upgrade in remote-1");
  s = play(s, "corp", installUpgrade!).state;
  const manegarm = assertDefined(
    findInstalled(s, "manegarm_skunkworks"),
    "the upgrade is installed",
  );
  const rez = engine.getLegalMoves(s, "corp").find((m) =>
    m.kind === "corp.rez" && m.targetId === manegarm.id
  );
  assertDefined(rez, "corp.rez is offered for the installed upgrade");
  s = play(s, "corp", rez!).state;
  while (s.turn.player === "corp" && !s.winner) {
    s = play(s, "corp", { kind: "corp.gainCredits" }).state;
  }
  s = burnUntil(s, "runner");
  assert(
    s.servers.some((x) => x.id === "remote-1"),
    "remote-1 exists with cards in its root",
  );

  // Keep only the 1 credit the event needs to be playable: with 1 credit the
  // 5-credit toll is unaffordable from the bank, so the ONLY way to pay it is
  // the Overclock fund (availableCredits counts the fund during the run).
  s.runner.credits = 1;
  assertEquals(s.runner.credits, 1, "the runner cannot pay the toll from the bank");
  const overclock = assertDefined(eventMove(s, "overclock", "remote-1"), "remote-1 is offered");
  const after = play(s, "runner", overclock).state;
  assertEquals(after.run?.server, "remote-1", "the event started a run on remote-1");
  assertEquals(after.run?.fundCredits, 5, "the run carries the 5 hosted credits");

  // Approach the server: the movement phase parks for the jack-out choice.
  const cont = engine.getLegalMoves(after, "runner").find((m) => m.kind === "runner.continueRun");
  assertDefined(cont, "the run parks in the movement phase");
  let cur = play(after, "runner", cont!).state;
  const toll = cur.prompts[0];
  assert(toll && toll.kind === "choose-one", "the Manegarm toll prompt is pending");

  const creditsOption = engine.getLegalMoves(cur, "runner").find((m) =>
    m.kind === "prompt.answer" && m.optionId === "toll-credits"
  );
  assertDefined(
    creditsOption,
    "the 5-credit toll option is offered — availableCredits counts the run fund",
  );
  cur = play(cur, "runner", creditsOption!).state;

  assertEquals(cur.run?.fundCredits, 0, "the toll was paid from the hosted run fund (5 -> 0)");
  assertEquals(
    cur.runner.credits,
    0,
    "the runner's bank was already spent on the event (1 -> 0); the toll took no more",
  );
  assertEquals(cur.run?.tollPaid, true, "the toll is marked paid and the run proceeds");
});

Deno.test("overclock: the hosted fund is bound to that run, not to a later one", () => {
  // The fund is placed on the run the event initiates (rule 5.2.2b), so a run
  // on a LATER turn has nothing to spend: "during that run" cannot leak.
  let s = newGame([], ["overclock"]);
  s = burnUntil(s, "runner");
  s = play(s, "runner", eventMove(s, "overclock")!).state;
  assertEquals(s.run?.fundCredits, 5, "the event's run carries the 5 hosted credits");

  // Play the event's run out to the end (no ice on HQ: approach, breach, access).
  s = play(s, "runner", { kind: "runner.continueRun" }).state;
  for (let i = 0; i < 20 && (s.run || s.breach) && !s.winner; i++) {
    const moves = engine.getLegalMoves(s, "runner");
    const next = moves.find((m) =>
      m.kind === "runner.accessRandom" || m.kind === "runner.accessCard"
    ) ?? moves.find((m) => m.kind === "runner.finishAccess");
    assertDefined(next, "the breach offers an access or finish-access move");
    s = play(s, "runner", next!).state;
  }
  assertEquals(s.run, null, "the event's run has ended");

  // Pass the rest of the turn and the corp's turn; the next runner turn's run
  // must have no fund to spend.
  for (const side of ["runner", "corp"] as PlayerSide[]) {
    while (s.turn.player === side && !s.winner) {
      const moves = engine.getLegalMoves(s, s.turn.player);
      if (moves.length === 0) break;
      s = play(s, s.turn.player, moves[0]!).state;
    }
  }
  assertEquals(s.turn.player, "runner", "the next runner turn has begun");
  assertEquals(
    s.runner.pendingRunFund,
    0,
    "the hosted credits never survive to a later turn's run",
  );
  s = play(s, "runner", { kind: "runner.run", server: "archives" }).state;
  assertEquals(
    s.run?.fundCredits,
    undefined,
    "a run on a later turn has no Overclock fund ('during that run')",
  );
});
