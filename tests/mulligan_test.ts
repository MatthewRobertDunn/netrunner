/**
 * Mulligan tests (rule 1.6.6a): each player's mulligan reshuffles their OWN
 * starting hand, and declining keeps the hand as dealt.
 *
 * Regression (settled 2026-11): `takeMulligan` read the mulligan player AFTER
 * popping the prompt — `pendingMulliganPlayer` then found the *next* mulligan
 * prompt (or fell back to "corp"), so the Corp's mulligan reshuffled the
 * Runner's hand and vice versa. Decks here are pinned with `orderedCards`:
 * `startGame` shuffles unordered decks even in starter-decks mode, so only
 * pinned openings make the "which hand changed" assertions meaningful.
 */

import { engine } from "../src/mod.ts";
import type { DeckConfig, GameState } from "../src/types.ts";
import { assert, assertEquals } from "./helpers/assert.ts";
import { orderedCorpDeck, orderedRunnerDeck, play } from "./helpers/fixtures.ts";

/** Five DISTINCT cards per side so a reshuffle cannot reproduce the dealt hand. */
const CORP_HAND = ["hedge_fund", "nico_campaign", "tithe", "seamless_launch", "urtica_cipher"];
const RUNNER_HAND = ["sure_gamble", "unity", "carmen", "cleaver", "jailbreak"];

function cycled(hand: string[]): string[] {
  return Array.from({ length: 30 }, (_, i) => hand[i % hand.length]!);
}

function mulliganGame(seed = 11): GameState {
  const corp: DeckConfig = orderedCorpDeck([...CORP_HAND, ...cycled(CORP_HAND)]);
  const runner: DeckConfig = orderedRunnerDeck([...RUNNER_HAND, ...cycled(RUNNER_HAND)]);
  return engine.startGame({
    corp,
    runner,
    mode: "starter-decks",
    seed,
    allowMulligan: true,
  });
}

Deno.test("mulligan: each mulligan reshuffles the prompted player's own hand (rule 1.6.6a)", async (t) => {
  await t.step("the Corp's mulligan changes the Corp's hand and never the Runner's", () => {
    const s0 = mulliganGame();
    // Rule 1.6.6a: the Corp decides first — its mulligan prompt is at the front.
    assertEquals(
      s0.prompts.map((p) => (p.kind === "mulligan" ? p.player : p.kind)),
      ["corp", "runner"],
    );
    const corpHandBefore = JSON.stringify(s0.corp.hand);
    const runnerHandBefore = JSON.stringify(s0.runner.hand);

    const s1 = play(s0, "corp", { kind: "mulligan.take", player: "corp" });

    // The Corp's own hand was reshuffled from its own deck: instance ids differ
    // from the dealt hand (and the cards stay the Corp's own corp-N instances).
    assert(
      JSON.stringify(s1.corp.hand) !== corpHandBefore,
      "the corp's mulligan must change the corp's hand",
    );
    for (const c of s1.corp.hand) {
      assert(c.id.startsWith("corp-"), `mulliganed corp card ${c.id} is not a corp instance`);
    }
    // Wrong-player regression: the corp-take must not touch runner.hand.
    assertEquals(
      JSON.stringify(s1.runner.hand),
      runnerHandBefore,
      "the corp's mulligan must leave the runner's hand byte-identical",
    );
    // The Runner's decision is still pending.
    assertEquals(
      s1.prompts.map((p) => (p.kind === "mulligan" ? p.player : p.kind)),
      ["runner"],
    );
  });

  await t.step("the Runner's mulligan is symmetric", () => {
    let s = mulliganGame();
    s = play(s, "corp", { kind: "mulligan.take", player: "corp" });
    const corpHandAfterCorpMulligan = s.corp.hand.map((c) => JSON.stringify(c));
    const runnerHandBefore = JSON.stringify(s.runner.hand);

    s = play(s, "runner", { kind: "mulligan.take", player: "runner" });

    assert(
      JSON.stringify(s.runner.hand) !== runnerHandBefore,
      "the runner's mulligan must change the runner's hand",
    );
    for (const c of s.runner.hand) {
      assert(c.id.startsWith("runner-"), `mulliganed runner card ${c.id} is not a runner instance`);
    }
    // The runner's decision was the LAST one, so the corp's first turn starts
    // (rule 1.6.7) and its mandatory draw (rule 5.6.1e) appends a 6th card —
    // the five mulliganed cards themselves must be untouched.
    assertEquals(
      s.corp.hand.slice(0, 5).map((c) => JSON.stringify(c)),
      corpHandAfterCorpMulligan,
      "the runner's mulligan must leave the corp's (already mulliganed) hand untouched",
    );
    assertEquals(s.corp.hand.length, 6, "the corp's mandatory draw opened its first turn");
    assertEquals(s.prompts.length, 0);
    assertEquals(s.turn.phase, "action");
    assertEquals(s.turn.player, "corp");
  });

  await t.step("declining keeps the dealt hand exactly", () => {
    const s0 = mulliganGame();
    const corpHandBefore = JSON.stringify(s0.corp.hand);
    const runnerHandBefore = JSON.stringify(s0.runner.hand);

    let s = play(s0, "corp", { kind: "mulligan.decline", player: "corp" });
    assertEquals(
      JSON.stringify(s.corp.hand),
      corpHandBefore,
      "declining must keep the corp's dealt hand",
    );
    assertEquals(
      s.prompts.map((p) => (p.kind === "mulligan" ? p.player : p.kind)),
      ["runner"],
    );

    s = play(s, "runner", { kind: "mulligan.decline", player: "runner" });
    assertEquals(
      JSON.stringify(s.runner.hand),
      runnerHandBefore,
      "declining must keep the runner's dealt hand",
    );
    assertEquals(s.prompts.length, 0);
    assertEquals(s.turn.phase, "action");
  });

  await t.step("a mixed decision (corp declines, runner takes) hits both hands correctly", () => {
    const s0 = mulliganGame();
    const corpDealtHand = s0.corp.hand.map((c) => JSON.stringify(c));
    const runnerHandBefore = JSON.stringify(s0.runner.hand);

    let s = play(s0, "corp", { kind: "mulligan.decline", player: "corp" });
    s = play(s, "runner", { kind: "mulligan.take", player: "runner" });

    // The runner's take was the LAST decision: the corp's first turn opened
    // with its mandatory draw appended to the kept (declined) hand.
    assertEquals(
      s.corp.hand.slice(0, 5).map((c) => JSON.stringify(c)),
      corpDealtHand,
      "the corp declined — its hand is the dealt hand (plus the mandatory draw)",
    );
    assertEquals(s.corp.hand.length, 6);
    assert(
      JSON.stringify(s.runner.hand) !== runnerHandBefore,
      "the runner took — its hand was reshuffled",
    );
    for (const c of s.runner.hand) {
      assert(c.id.startsWith("runner-"), `mulliganed runner card ${c.id} is not a runner instance`);
    }
    assertEquals(s.prompts.length, 0);
    assertEquals(s.turn.phase, "action");
  });
});
