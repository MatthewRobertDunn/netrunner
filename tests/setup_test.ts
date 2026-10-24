/**
 * Setup tests: deck validation, game start, mulligans.
 */

import { engine, starterDeckConfigs } from "../src/mod.ts";
import { newStarterGame } from "../src/testing/fixtures.ts";
import { assert, assertEquals } from "./helpers/assert.ts";

Deno.test("setup: starter decks validate for their side", () => {
  const decks = starterDeckConfigs();
  // Starter decks are validated in "starter-decks" mode, where the influence
  // limit and minimum-deck-size rules are relaxed (the starter identities
  // have no printed influence limit).
  const runner = engine.validateDeck(decks.runner, "runner", "starter-decks");
  assert(runner.valid, `runner deck invalid: ${JSON.stringify(runner)}`);
  const corp = engine.validateDeck(decks.corp, "corp", "starter-decks");
  assert(corp.valid, `corp deck invalid: ${JSON.stringify(corp)}`);
});

Deno.test("setup: starter decks have the expected card counts", () => {
  const decks = starterDeckConfigs();
  const runnerCards = decks.runner.cards.reduce((sum, e) => sum + e.count, 0) + 1;
  const corpCards = decks.corp.cards.reduce((sum, e) => sum + e.count, 0) + 1;
  assertEquals(runnerCards, 31);
  assertEquals(corpCards, 35);
});

Deno.test("setup: startGame sets up deterministic state", () => {
  const a = newStarterGame(1);
  const b = newStarterGame(1);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

Deno.test("setup: startGame sets credits and clicks", () => {
  const state = newStarterGame(7);
  // Rule 1.6.4: both players start with 5 credits. The Corp takes the first
  // turn (rule 1.6.7) so the Corp has 3 clicks and the Runner has 0.
  assertEquals(state.corp.credits, 5);
  assertEquals(state.corp.clicks, 3);
  assertEquals(state.runner.credits, 5);
  assertEquals(state.runner.clicks, 0);
});

Deno.test("setup: agenda point target is 7", () => {
  const state = newStarterGame(1);
  assertEquals(state.agendaPointTarget, 7);
});

Deno.test("setup: both players have their identity installed", () => {
  const state = newStarterGame(1);
  assert(state.corp.identity.cardId === "the_syndicate_profit_over_principle");
  assert(state.runner.identity.cardId === "the_catalyst_convention_breaker");
});

Deno.test("setup: illegal deck fails validation", () => {
  const decks = starterDeckConfigs();
  // A runner deck with a Corp card should be invalid.
  const bad = {
    ...decks.runner,
    cards: [...decks.runner.cards, { cardId: "hedge_fund", count: 1 }],
  };
  const result = engine.validateDeck(bad, "runner", "starter-decks");
  assert(!result.valid, "expected a runner deck containing a Corp card to be invalid");
});

Deno.test("setup: starter game starts in the Corp's action phase", () => {
  const state = newStarterGame(1);
  assert(state.turn.phase === "action");
  assert(state.prompts.length === 0);
});
