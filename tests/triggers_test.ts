/**
 * Regression tests for card triggers wired at engine choke points:
 *
 *  - "When you rez this asset, load N credits onto it" (Nico Campaign,
 *    Regolith Mining License) fires from `rezCard` (src/engine/runs.ts), so
 *    every rez path — the corp.rez action, the approach rez window, free
 *    rezzes — loads the credits exactly once. (Before the fix `fireRez` had
 *    no call sites and these cards never loaded anything.)
 *  - "When this run ends, trash this program" (Mayfly) fires from
 *    `finishRun`, which every run end funnels through. (Before the fix
 *    `trashMayfly` had no call sites and Mayfly survived every run.)
 *  - Install triggers ("when you install, load N credits") still fire on
 *    install only (Telework Contract) — rezzing never re-fires them.
 */

import { engine, starterDeckConfigs } from "../src/mod.ts";
import {
  endCorpTurn,
  newGameWithCorpHand,
  orderedCorpDeck,
  play,
} from "../src/testing/fixtures.ts";
import type { DeckConfig, GameEvent, GameState, Move, PlayerSide } from "../src/types.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All log events of one type, narrowed. */
function eventsOf<T extends GameEvent["type"]>(state: GameState, type: T) {
  return state.log.filter((e) => e.type === type) as Extract<GameEvent, { type: T }>[];
}

/** A corp card installed in some server's root or ice. */
function findInstalled(state: GameState, cardId: string) {
  return state.servers.flatMap((s) => [...s.root, ...s.ice]).find((c) => c.cardId === cardId);
}

/** Find a legal move or fail the test with `what`. */
function moveWhere(
  state: GameState,
  side: PlayerSide,
  pred: (m: Move) => boolean,
  what: string,
): Move {
  const m = engine.getLegalMoves(state, side).find(pred);
  return assertDefined(m, `expected a legal move: ${what}`);
}

/** A runner deck whose top-to-bottom order starts with `top`. */
function orderedRunnerDeck(top: string[]): DeckConfig {
  const base = starterDeckConfigs().runner;
  const pool = base.cards.flatMap((e) => Array<string>(e.count).fill(e.cardId));
  for (const t of top) {
    const i = pool.indexOf(t);
    if (i >= 0) pool.splice(i, 1);
  }
  const ordered = [...top, ...pool];
  const counts = new Map<string, number>();
  for (const id of ordered) counts.set(id, (counts.get(id) ?? 0) + 1);
  return {
    identity: base.identity,
    cards: [...counts].map(([cardId, count]) => ({ cardId, count })),
    orderedCards: ordered,
  };
}

/** Start a game with scripted opening hands for both sides (deterministic). */
function gameWithHands(corpTop: string[], runnerTop: string[], seed = 3): GameState {
  const filler = Array.from({ length: 30 }, () => "hedge_fund");
  const corp = orderedCorpDeck([...corpTop, ...filler]);
  return engine.startGame({
    corp,
    runner: orderedRunnerDeck(runnerTop),
    mode: "starter-decks",
    seed,
  });
}

/** Spend the runner's remaining clicks (and any discard) until the Corp's turn. */
function endRunnerTurn(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 10; i++) {
    if (cur.turn.player !== "runner" || cur.winner) break;
    const legal = engine.getLegalMoves(cur, "runner");
    if (legal.length === 0) break;
    const gain = legal.find((m) => m.kind === "runner.gainCredits") ?? legal[0]!;
    cur = play(cur, "runner", gain).state;
  }
  return cur;
}

/** Install `cardId` from the corp hand into a brand-new remote and rez it. */
function installAndRez(state: GameState, cardId: string): GameState {
  let s = play(
    state,
    "corp",
    moveWhere(
      state,
      "corp",
      (m) => m.kind === "corp.install" && m.cardId === cardId && m.server === "new-remote",
      `install ${cardId}`,
    ),
  ).state;
  const card = assertDefined(findInstalled(s, cardId), `${cardId} installed`);
  s = play(
    s,
    "corp",
    moveWhere(s, "corp", (m) => m.kind === "corp.rez" && m.targetId === card.id, `rez ${cardId}`),
  ).state;
  return s;
}

// ---------------------------------------------------------------------------
// BUG 6: "load credits on rez" triggers
// ---------------------------------------------------------------------------

Deno.test("triggers: rezzing Nico Campaign via corp.rez loads 9 credits", () => {
  let state = newGameWithCorpHand(["nico_campaign"], 3);
  state = installAndRez(state, "nico_campaign");
  const nico = assertDefined(findInstalled(state, "nico_campaign"), "nico still installed");
  assert(nico.rezzed === true, "nico is rezzed");
  assertEquals(nico.hostedCredits, 9, "rez loads 9 credits onto nico");
  const load = assertDefined(
    eventsOf(state, "load-credits").find((e) => e.targetId === nico.id),
    "a load-credits event is logged",
  );
  assertEquals(load.amount, 9);
});

Deno.test("triggers: rezzing Nico Campaign in the approach rez window loads 9 credits", () => {
  let state = newGameWithCorpHand(["tithe", "nico_campaign"], 3);
  state = play(
    state,
    "corp",
    moveWhere(
      state,
      "corp",
      (m) => m.kind === "corp.install" && m.cardId === "tithe" && m.server === "new-remote",
      "install tithe",
    ),
  ).state;
  state = play(
    state,
    "corp",
    moveWhere(
      state,
      "corp",
      (m) => m.kind === "corp.install" && m.cardId === "nico_campaign" && m.server === "remote-1",
      "install nico in remote-1",
    ),
  ).state;
  state = endCorpTurn(state);
  state = play(
    state,
    "runner",
    moveWhere(
      state,
      "runner",
      (m) => m.kind === "runner.run" && m.server === "remote-1",
      "run remote-1",
    ),
  ).state;

  const prompt = assertDefined(state.prompts[0], "a prompt is pending after approaching ice");
  assert(prompt.kind === "rez-window", "the pending prompt is the corp rez window");
  const nico = assertDefined(findInstalled(state, "nico_campaign"), "nico installed");
  const option = assertDefined(
    prompt.options.find((o) => o.targetId === nico.id),
    "the rez window offers nico",
  );
  state = play(
    state,
    "corp",
    moveWhere(
      state,
      "corp",
      (m) => m.kind === "prompt.answer" && m.optionId === option.id,
      "rez nico",
    ),
  ).state;

  const after = assertDefined(findInstalled(state, "nico_campaign"), "nico still installed");
  assert(after.rezzed === true, "nico is rezzed from the rez window");
  assertEquals(after.hostedCredits, 9, "the rez window also loads 9 credits");
});

Deno.test("triggers: Nico Campaign empties over three corp turn starts, trashes and draws", () => {
  let state = newGameWithCorpHand(["nico_campaign"], 3);
  state = installAndRez(state, "nico_campaign");
  const nico = assertDefined(findInstalled(state, "nico_campaign"));
  assertEquals(nico.hostedCredits, 9);

  // Each corp turn start takes 3: 9 -> 6 -> 3 -> 0 (then trash + draw).
  for (let i = 0; i < 3; i++) {
    state = endRunnerTurn(endCorpTurn(state));
  }

  assertDefined(state.corp.discard.find((c) => c.id === nico.id), "nico is in Archives");
  assert(findInstalled(state, "nico_campaign") === undefined, "nico is no longer installed");
  const trashEvents = eventsOf(state, "trash").filter((e) => e.cardId === nico.id);
  assertEquals(trashEvents.length, 1, "exactly one trash event for nico");
  assertEquals(trashEvents[0]!.from, "emptied");
  const takes = eventsOf(state, "take-credits").filter((e) => e.targetId === nico.id);
  assertEquals(takes.length, 3, "three turn-start take-3 events");
  assert(takes.every((e) => e.amount === 3), "each takes 3 credits");
  // "When it is empty, trash it and draw 1 card": a corp draw follows the trash.
  const trashIdx = state.log.findIndex((e) => e.type === "trash" && e.cardId === nico.id);
  const next = state.log[trashIdx + 1];
  assert(
    next !== undefined && next.type === "draw" && next.player === "corp" && next.count === 1,
    "the corp draws 1 card when nico empties",
  );

  // Still empty-checked on later turn starts: no duplicate trash.
  state = endRunnerTurn(endCorpTurn(state));
  assertEquals(
    eventsOf(state, "trash").filter((e) => e.cardId === nico.id).length,
    1,
    "no second trash event on later turn starts",
  );
});

Deno.test("triggers: Regolith Mining License loads 15 on rez and trashes when its click ability empties it", () => {
  let state = newGameWithCorpHand(["regolith_mining_license"], 3);
  state = installAndRez(state, "regolith_mining_license");
  const reg = assertDefined(findInstalled(state, "regolith_mining_license"));
  assertEquals(reg.hostedCredits, 15, "rez loads 15 credits onto regolith");

  const take3 = (s: GameState): Move =>
    moveWhere(
      s,
      "corp",
      (m) => m.kind === "corp.ability" && m.targetId === reg.id && m.abilityIndex === 0,
      "take 3 from regolith",
    );
  // Turn 1: install (1 click) + 2 takes. Turn 2: 3 takes -> 15 - 15 = 0 -> trashed.
  state = play(state, "corp", take3(state)).state;
  state = play(state, "corp", take3(state)).state;
  state = endRunnerTurn(endCorpTurn(state));
  state = play(state, "corp", take3(state)).state;
  state = play(state, "corp", take3(state)).state;
  state = play(state, "corp", take3(state)).state;

  const takes = eventsOf(state, "take-credits").filter((e) => e.targetId === reg.id);
  assertEquals(takes.length, 5, "five take-3 uses");
  assertEquals(takes.reduce((a, e) => a + e.amount, 0), 15, "all 15 credits were taken");
  assertDefined(state.corp.discard.find((c) => c.id === reg.id), "regolith is in Archives");
  const trash = assertDefined(
    eventsOf(state, "trash").find((e) => e.cardId === reg.id),
    "a trash event is logged for regolith",
  );
  assertEquals(trash.from, "emptied");
});

Deno.test("triggers: install triggers still fire on install (Telework Contract loads 9)", () => {
  let state = gameWithHands([], ["telework_contract"], 3);
  state = endCorpTurn(state);
  state = play(
    state,
    "runner",
    moveWhere(
      state,
      "runner",
      (m) => m.kind === "runner.install" && m.cardId === "telework_contract",
      "install telework",
    ),
  ).state;
  const tw = assertDefined(
    state.runner.installed.find((c) => c.cardId === "telework_contract"),
    "telework installed",
  );
  assertEquals(tw.hostedCredits, 9, "install (not rez) loads 9 credits onto telework");
  const load = assertDefined(
    eventsOf(state, "load-credits").find((e) => e.targetId === tw.id),
    "a load-credits event is logged",
  );
  assertEquals(load.amount, 9);
});

// ---------------------------------------------------------------------------
// BUG 7: Mayfly "when this run ends, trash this program"
// ---------------------------------------------------------------------------

Deno.test("triggers: Mayfly is trashed when a successful run ends", () => {
  let state = gameWithHands([], ["mayfly"], 3);
  state = endCorpTurn(state);
  state = play(
    state,
    "runner",
    moveWhere(
      state,
      "runner",
      (m) => m.kind === "runner.install" && m.cardId === "mayfly",
      "install mayfly",
    ),
  ).state;
  const mayfly = assertDefined(
    state.runner.installed.find((c) => c.cardId === "mayfly"),
    "mayfly installed",
  );
  state = play(
    state,
    "runner",
    moveWhere(
      state,
      "runner",
      (m) => m.kind === "runner.run" && m.server === "archives",
      "run archives",
    ),
  ).state;
  // The run parks in the movement phase (rule 6.9.4c); continuing reaches the
  // server. The breach auto-accesses the single Archives card; finish the
  // access to end the run.
  const cont = engine.getLegalMoves(state, "runner").find((m) => m.kind === "runner.continueRun");
  assertDefined(cont, "continueRun is offered in the movement phase");
  state = play(state, "runner", cont!).state;
  if (state.run !== null) {
    state = play(
      state,
      "runner",
      moveWhere(state, "runner", (m) => m.kind === "runner.finishAccess", "finish access"),
    ).state;
  }

  assert(state.run === null, "the run has ended");
  assertDefined(state.runner.discard.find((c) => c.id === mayfly.id), "mayfly is in the heap");
  const trash = assertDefined(
    eventsOf(state, "trash").find((e) => e.cardId === mayfly.id),
    "a trash event is logged for mayfly",
  );
  assertEquals(trash.from, "run ends");
  const runEnd = assertDefined(eventsOf(state, "run-end").at(-1), "a run-end event is logged");
  assertEquals(runEnd.successful, true);
});

Deno.test("triggers: Mayfly is trashed when the Runner jacks out from Karuna's prompt (run ends immediately)", () => {
  let state = gameWithHands(["bran_1_0", "karuna"], ["mayfly"], 3);
  state = play(
    state,
    "corp",
    moveWhere(
      state,
      "corp",
      (m) => m.kind === "corp.install" && m.cardId === "bran_1_0" && m.server === "hq",
      "install bran on hq",
    ),
  ).state;
  state = play(
    state,
    "corp",
    moveWhere(
      state,
      "corp",
      (m) => m.kind === "corp.install" && m.cardId === "karuna" && m.server === "hq",
      "install karuna on hq (outermost)",
    ),
  ).state;
  state = endCorpTurn(state);
  state = play(
    state,
    "runner",
    moveWhere(
      state,
      "runner",
      (m) => m.kind === "runner.install" && m.cardId === "mayfly",
      "install mayfly",
    ),
  ).state;
  const mayfly = assertDefined(state.runner.installed.find((c) => c.cardId === "mayfly"));
  state = play(
    state,
    "runner",
    moveWhere(state, "runner", (m) => m.kind === "runner.run" && m.server === "hq", "run hq"),
  ).state;

  // Corp rez window: rez the approached (outermost) ice, Karuna.
  const prompt = assertDefined(state.prompts[0], "rez window pending");
  assert(prompt.kind === "rez-window", "the pending prompt is the corp rez window");
  const karuna = assertDefined(
    state.servers.find((s) => s.id === "hq")?.ice.at(-1),
    "outermost ice on hq",
  );
  assertEquals(karuna.cardId, "karuna");
  const rezOption = assertDefined(
    prompt.options.find((o) => o.targetId === karuna.id),
    "the rez window offers karuna",
  );
  state = play(
    state,
    "corp",
    moveWhere(
      state,
      "corp",
      (m) => m.kind === "prompt.answer" && m.optionId === rezOption.id,
      "rez karuna",
    ),
  ).state;

  // Resolve the encounter: Karuna sub 0 (2 net damage, may jack out) queues a prompt.
  state = play(
    state,
    "runner",
    moveWhere(
      state,
      "runner",
      (m) => m.kind === "runner.resolveSubroutines",
      "resolve subroutines",
    ),
  ).state;
  const choice = assertDefined(state.prompts[0], "Karuna's jack-out prompt is pending");
  assert(choice.kind === "choose-one", "the pending prompt is a choice");
  assert(
    choice.kind === "choose-one" && choice.options.some((o) => o.id === "jack-out"),
    "Karuna offers a jack-out choice",
  );
  state = play(
    state,
    "runner",
    moveWhere(
      state,
      "runner",
      (m) => m.kind === "prompt.answer" && m.optionId === "jack-out",
      "jack out",
    ),
  ).state;

  assert(state.run === null, "the run ends immediately on the jack-out choice");
  const subs = eventsOf(state, "resolve-subroutine").filter((e) => e.cardId === karuna.id);
  assertEquals(subs.length, 1, "only Karuna's first subroutine resolved");
  assertDefined(state.runner.discard.find((c) => c.id === mayfly.id), "mayfly trashed at run end");
  const trash = assertDefined(
    eventsOf(state, "trash").find((e) => e.cardId === mayfly.id),
    "a trash event is logged for mayfly",
  );
  assertEquals(trash.from, "run ends");
});
