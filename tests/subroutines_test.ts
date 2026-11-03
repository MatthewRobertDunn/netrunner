/**
 * Subroutine resolution tests (rules 6.9.3, 8.5.14c, 6.2.6).
 *
 * Two engine bugs are pinned here:
 *  - Whitespace's second subroutine ("If the Runner has 6[credit] or less,
 *    end the run") has NO credit loss; a `?? 3` default in the resolver
 *    invented a phantom second loss and ETR'd runners the card text lets
 *    survive. The threshold must be checked against the credits AFTER only
 *    the losses the card text states.
 *  - Brân 1.0's "install directly inward from this ice" must keep the
 *    encounter against Brân (rule 6.2.6: the Runner's position is an element
 *    of the position sequence, not an index — adding a position inward does
 *    not move the Runner) while the new ice takes the position inward of
 *    Brân (rule 8.5.14c) and is approached later in the run (rule 6.2.6b).
 *
 * Decks are pinned with `orderedCards` (startGame shuffles decks without it);
 * corp filler is operations-only so the scripted burn can never install or
 * score anything but the scenario card.
 */

import { engine, starterDeckConfigs } from "../src/mod.ts";
import { play, setCredits } from "./helpers/fixtures.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";
import type { DeckConfig, GameState, Move, PlayerSide } from "../src/types.ts";
import { isCorpInstall } from "../src/types.ts";

const CORP_IDENTITY = "the_syndicate_profit_over_principle";
const RUNNER_IDENTITY = "the_catalyst_convention_breaker";

function deckConfig(identity: string, ordered: string[]): DeckConfig {
  const counts = new Map<string, number>();
  for (const id of ordered) counts.set(id, (counts.get(id) ?? 0) + 1);
  return {
    identity,
    cards: [...counts].map(([cardId, count]) => ({ cardId, count })),
    orderedCards: ordered,
  };
}

/** Pinned corp deck: `head` first (the opening hand), then operation filler. */
function pinnedCorpDeck(head: string[]): DeckConfig {
  const ordered = [...head];
  while (ordered.length < 30) ordered.push("hedge_fund");
  return deckConfig(CORP_IDENTITY, ordered);
}

/** Pinned runner deck: `head` first, then the starter pool, then events. */
function pinnedRunnerDeck(head: string[]): DeckConfig {
  const pool = starterDeckConfigs().runner.cards.flatMap((e) =>
    Array<string>(e.count).fill(e.cardId)
  );
  const ordered = [...head, ...pool.filter((c) => !head.includes(c))];
  while (ordered.length < 25) ordered.push("sure_gamble");
  return deckConfig(RUNNER_IDENTITY, ordered);
}

function findMove(
  state: GameState,
  side: PlayerSide,
  pred: (m: Move) => boolean,
  what: string,
): Move {
  const m = engine.getLegalMoves(state, side).find(pred);
  return assertDefined(m, `no legal move: ${what}`);
}

/**
 * Spend the corp turn on basic gain-credit clicks only (never installs or
 * operations), until the turn passes to the Runner's action phase.
 */
function burnCorpTurn(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 12 && !cur.winner; i++) {
    if (cur.turn.player !== "corp") return cur;
    const gain = engine.getLegalMoves(cur, "corp").find((m) => m.kind === "gainCredits");
    if (gain) {
      cur = play(cur, "corp", gain);
      continue;
    }
    const moves = engine.getLegalMoves(cur, "corp");
    if (moves.length === 0) return cur; // clicks spent; settle passed the turn
    cur = play(cur, "corp", moves[0]!); // a pending corp prompt (e.g. discard)
  }
  return cur;
}

/** The corp rezzes the option whose label matches `titleRe` in the window. */
function corpRezInWindow(state: GameState, titleRe: RegExp, what: string): GameState {
  const rw = state.prompts[0];
  assert(rw !== undefined && rw.kind === "rez-window", `${what}: corp rez window pending`);
  const opt = rw.kind === "rez-window" ? rw.options.find((o) => titleRe.test(o.label)) : undefined;
  assertDefined(opt, `${what}: matching rez option offered`);
  const m = findMove(
    state,
    "corp",
    (x) => x.kind === "prompt.answer" && x.promptId === rw.id && x.optionId === opt!.id,
    `${what}: answer the rez window`,
  );
  return play(state, "corp", m);
}

/** Install Whitespace on a fresh remote, run it, and rez it at the window. */
function whitespaceEncounter(seed: number): GameState {
  let s = engine.startGame({
    corp: pinnedCorpDeck(["whitespace"]),
    runner: pinnedRunnerDeck(["unity", "sure_gamble"]),
    mode: "starter-decks",
    seed,
  });
  s = setCredits(s, "corp", 50);
  s = play(
    s,
    "corp",
    findMove(
      s,
      "corp",
      (m) => isCorpInstall(m) && m.cardId === "whitespace" && m.server === "new-remote",
      "corp installs whitespace on a new remote",
    ),
  );
  s = burnCorpTurn(s);
  s = setCredits(s, "runner", 50);
  s = play(
    s,
    "runner",
    findMove(
      s,
      "runner",
      (m) => m.kind === "install" && m.cardId === "unity",
      "runner installs unity",
    ),
  );
  s = play(
    s,
    "runner",
    findMove(
      s,
      "runner",
      (m) => m.kind === "run" && m.server === "remote-1",
      "runner runs remote-1",
    ),
  );
  s = corpRezInWindow(s, /Whitespace/i, "whitespace scenario");
  return s;
}

Deno.test("Whitespace: second subroutine loses nothing — 10 credits lose 3, 7 > 6, no ETR", () => {
  let s = whitespaceEncounter(21);
  assertEquals(s.run?.phase, "encounter-ice", "encountering whitespace");
  s = setCredits(s, "runner", 10);
  const logMark = s.log.length;
  s = play(
    s,
    "runner",
    findMove(s, "runner", (m) => m.kind === "resolveSubroutines", "resolve subroutines"),
  );
  // Sub 1: "The Runner loses 3[credit]" (10 → 7). Sub 2: "If the Runner has
  // 6[credit] or less, end the run" — NO loss; 7 > 6 → the run survives.
  assertEquals(s.runner.credits, 7, "exactly one 3-credit loss: 10 → 7");
  const losses = s.log.slice(logMark).filter((e) => e.type === "lose-credits");
  assertEquals(losses.length, 1, "only sub 1 loses credits (sub 2 has no loss)");
  assertEquals((losses[0] as { amount?: number }).amount, 3, "the loss is sub 1's 3[credit]");
  assertDefined(s.run, "the run is not ended by the conditional ETR");
  assertEquals(s.run!.phase, "movement", "run reaches the movement phase (7 credits > 6)");
  assertEquals(s.run!.resolved, [0, 1], "both subroutines resolved");
});

Deno.test("Whitespace: 9 credits lose 3 → 6 ≤ 6 → the ETR fires on the single loss", () => {
  let s = whitespaceEncounter(21);
  s = setCredits(s, "runner", 9);
  const logMark = s.log.length;
  s = play(
    s,
    "runner",
    findMove(s, "runner", (m) => m.kind === "resolveSubroutines", "resolve subroutines"),
  );
  assertEquals(s.runner.credits, 6, "single loss: 9 → 6 (no phantom second loss)");
  const losses = s.log.slice(logMark).filter((e) => e.type === "lose-credits");
  assertEquals(losses.length, 1, "one lose-credits event, not two");
  assertEquals(s.run, null, "6 ≤ 6 ends the run");
});

Deno.test("Brân 1.0: install directly inward keeps the encounter on Brân; new ice approached later", () => {
  let s = engine.startGame({
    corp: pinnedCorpDeck(["bran_1_0", "tithe"]),
    runner: pinnedRunnerDeck(["unity", "sure_gamble"]),
    mode: "starter-decks",
    seed: 6,
  });
  s = setCredits(s, "corp", 50);
  s = play(
    s,
    "corp",
    findMove(
      s,
      "corp",
      (m) => isCorpInstall(m) && m.cardId === "bran_1_0" && m.server === "new-remote",
      "corp installs Brân on a new remote",
    ),
  );
  s = burnCorpTurn(s);
  s = setCredits(s, "runner", 50);
  s = play(
    s,
    "runner",
    findMove(
      s,
      "runner",
      (m) => m.kind === "install" && m.cardId === "unity",
      "runner installs unity",
    ),
  );
  s = play(
    s,
    "runner",
    findMove(
      s,
      "runner",
      (m) => m.kind === "run" && m.server === "remote-1",
      "runner runs remote-1",
    ),
  );
  s = corpRezInWindow(s, /Brân/i, "Brân scenario");
  assertEquals(s.run?.phase, "encounter-ice", "encountering Brân");
  const branId = s.run!.currentIceId!;
  const server = () => s.servers.find((x) => x.id === "remote-1")!;
  assertEquals(server().ice.length, 1, "Brân is the only ice so far");
  assertEquals(server().ice[0]!.id, branId);

  // Rule 6.9.3b: the break window occurs ONCE, before any subroutine resolves;
  // 6.9.3c-d then resolve the remaining subroutines in order with NO further
  // break window. So the two ETR subs (1 and 2) must be broken HERE, in that
  // window (1 click each via Brân's bioroid ability). Leaving either unbroken
  // would ETR the run at 6.9.3c before sub 0's install could resolve.
  for (const sub of [1, 2]) {
    s = play(
      s,
      "runner",
      findMove(
        s,
        "runner",
        (m) => m.kind === "bioroidBreak" && m.subIndex === sub,
        `break Brân sub ${sub} in the single 6.9.3b window`,
      ),
    );
  }
  assertEquals(s.runner.clicks, 0, "the two ETR subs cost the two remaining clicks");

  // Sub 0 ("install 1 piece of ice from HQ or Archives directly inward from
  // this ice") is the only subroutine left: resolving it queues the corp choice.
  s = play(
    s,
    "runner",
    findMove(s, "runner", (m) => m.kind === "resolveSubroutines", "resolve subroutines"),
  );
  const prompt = s.prompts[0];
  assert(
    prompt !== undefined && prompt.kind === "choose-one" && /Brân/i.test(prompt.title),
    "corp install prompt pending",
  );
  const titheOpt = prompt.kind === "choose-one"
    ? prompt.options.find((o) => /Tithe from HQ/i.test(o.label))
    : undefined;
  assertDefined(titheOpt, "Tithe (from HQ) offered as the inward install");
  s = play(
    s,
    "corp",
    findMove(
      s,
      "corp",
      (x) => x.kind === "prompt.answer" && x.promptId === prompt.id && x.optionId === titheOpt!.id,
      "corp installs Tithe directly inward",
    ),
  );

  // Rules 8.5.14c + 6.2.6 + 6.9.3d-e: Tithe takes the position directly INWARD
  // of Brân (the ice array runs innermost-first: index 0 adjoins the server, and
  // the Runner's position counts DOWN as it moves inward), the Runner's position
  // is re-pointed to stay on the engaged element (rule 6.2.6: the position is an
  // element, not an index — the array index shifted, the position did not), and —
  // every subroutine being broken or resolved — the encounter completes in the
  // same step rather than re-offering a break window (6.9.3d returns to (c)).
  const run = s.run!;
  const ice = server().ice;
  assertEquals(ice.length, 2, "Tithe installed");
  assertEquals(ice[0]!.cardId, "tithe", "Tithe sits directly inward of Brân (toward the server)");
  assertEquals(ice[1]!.id, branId, "Brân shifted one step outward");
  assertEquals(run.position, 1, "the Runner's position follows the element (rule 6.2.6)");
  assertEquals(ice[run.position!]!.id, branId, "ice[run.position] is still Brân");
  assertEquals(
    run.phase,
    "movement",
    "all subs broken/resolved: the encounter completes (6.9.3d-e)",
  );
  assertEquals(s.prompts.length, 0, "no spurious prompt for the inward-installed ice");

  // Rule 6.2.6b: a position inward of the Runner's position was added — the
  // Runner must approach the newly installed ice later in this run.
  s = play(
    s,
    "runner",
    findMove(s, "runner", (m) => m.kind === "continueRun", "continue the run"),
  );
  const titheId = server().ice[0]!.id;
  assertEquals(s.run!.phase, "approach-ice", "the inward-installed ice is approached next");
  assertEquals(s.run!.position, 0, "Tithe's position");
  assertEquals(s.run!.currentIceId, titheId, "approaching the newly installed Tithe");
  assertEquals(s.prompts[0]?.kind, "rez-window", "corp rez window for the approached Tithe");
});
