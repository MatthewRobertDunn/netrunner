/**
 * Public game status: every field of `PublicGameStatus` is information both
 * players are always entitled to see (rules 10.2.2/10.2.3, 4.3.4, 4.6.2/4.6.3).
 *
 * The two entry points are:
 *  - `getPublicGameStatus(state)`       -- viewer-agnostic, no hidden info at all
 *  - `getPublicGameStatusFor(state, v)` -- same DTO, but the Corp sees the ids
 *    of its own installed cards (rules 4.6.3: facedown cards are examined by
 *    the player controlling them)
 *
 * Cases that share the opening state are grouped as `t.step`s under one
 * top-level test, so a regression reports the exact field that leaked.
 */

import { engine } from "../src/mod.ts";
import type { GameState, ServerId, ViewCard } from "../src/types.ts";
import { isCorpInstall } from "../src/types.ts";
import {
  endCorpTurn,
  newGameWithCorpHand,
  newStarterGame,
  play,
  rezWindowState,
} from "./helpers/fixtures.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

function cardIds(cards: ViewCard[]): string[] {
  return cards.map((c) => c.cardId);
}

Deno.test("public status: the shared DTO exposes both players' public information", async (t) => {
  await t.step("credits, clicks and tags are visible to both players", () => {
    const state = newStarterGame(1);
    const shared = engine.getPublicGameStatus(state);
    assertEquals(shared.players.corp.credits, 5, "Corp starts with 5 credits");
    assertEquals(shared.players.runner.credits, 5, "Runner starts with 5 credits");
    assertEquals(shared.players.corp.clicks, 3, "Corp has 3 clicks on its turn");
    assertEquals(shared.players.runner.clicks, 0, "Runner gets no clicks on the Corp's turn");
    assertEquals(shared.players.corp.tags, 0);
    assertEquals(shared.players.runner.tags, 0);
  });

  await t.step("hand, deck and discard counts are visible to both players", () => {
    const state = newStarterGame(1);
    const shared = engine.getPublicGameStatus(state);
    assertEquals(shared.players.corp.handCount, 6, "Corp opens with 6 cards in hand");
    assert(shared.players.runner.handCount > 0, "Runner has cards in hand");
    assert(shared.players.corp.deckCount > 0, "Corp still has cards in deck");
    assertEquals(shared.players.corp.discardCount, 0, "Nobody has discarded yet");
    assertEquals(shared.players.corp.handSize, 5, "base hand size 5, no modifier");
    assertEquals(shared.players.runner.handSize, 5, "base hand size 5, no modifier");
  });

  await t.step("agenda points, identity and score area are public", () => {
    const state = newStarterGame(1);
    const shared = engine.getPublicGameStatus(state);
    assertEquals(shared.agendaPointTarget, 7, "first to 7 agenda points wins");
    assertEquals(shared.players.corp.agendaPoints, 0);
    assertEquals(shared.players.runner.agendaPoints, 0);
    assertEquals(shared.players.corp.identity.cardId, state.corp.identity.cardId);
    assertEquals(shared.players.runner.identity.cardId, state.runner.identity.cardId);
    assertEquals(cardIds(shared.players.corp.score), [], "Corp has nothing scored");
    assertEquals(cardIds(shared.players.runner.score), [], "Runner has nothing scored");
  });

  await t.step("turn, phase, run and breach progress are public", () => {
    const state = newStarterGame(1);
    const shared = engine.getPublicGameStatus(state);
    assertEquals(shared.turn.player, "corp", "turn holder is public");
    assertEquals(shared.turn.phase, "action", "action phase is public");
    assertEquals(shared.run, null, "no run in the opening action phase");
    assertEquals(shared.breach, null, "no breach yet");
    assertEquals(shared.winner, null, "game has not been decided");
    assertEquals(shared.winReason, null, "no win reason yet");
    assert(Array.isArray(shared.prompts), "prompts are public");
    assert(Array.isArray(shared.warnings), "support warnings are public");
  });

  await t.step("server placement and counts are public", () => {
    const state = newStarterGame(1);
    const shared = engine.getPublicGameStatus(state);
    const central = shared.servers.filter((s) =>
      s.id === "hq" || s.id === "rd" || s.id === "archives"
    );
    assertEquals(central.length, 3, "central servers always appear");
    for (const server of shared.servers) {
      assert(Array.isArray(server.root), "server.root is an array");
      assert(Array.isArray(server.ice), "server.ice is an array");
      // Physical placement is open information (rule 4.6.2): root cards and ice
      // are marked, so a viewer always knows ice-vs-root even when the identity
      // of an unrezzed card is hidden (rule 4.6.6f keeps the root TYPE hidden).
      for (const card of server.root) assertEquals(card.position, "root");
      for (const card of server.ice) assertEquals(card.position, "ice");
    }
  });

  await t.step("warnings mirror the authoritative state", () => {
    const state = newStarterGame(1);
    const shared = engine.getPublicGameStatus(state);
    assertEquals(shared.warnings, [...state.supportWarnings]);
  });

  await t.step("no hand, deck or discard arrays leak into the DTO", () => {
    const state = newStarterGame(1);
    const json = JSON.stringify(engine.getPublicGameStatus(state));
    const parsed = JSON.parse(json) as {
      players: Record<string, Record<string, unknown>>;
    };
    for (const side of ["corp", "runner"] as string[]) {
      const playerStatus = assertDefined(parsed.players[side]);
      const keys = Object.keys(playerStatus);
      assert(keys.includes("handCount"), `${side} exposes handCount`);
      assert(keys.includes("deckCount"), `${side} exposes deckCount`);
      assert(keys.includes("discardCount"), `${side} exposes discardCount`);
      assert(!keys.includes("hand"), `${side} must not expose a hand array`);
      assert(!keys.includes("deck"), `${side} must not expose a deck array`);
      assert(!keys.includes("discard"), `${side} must not expose a discard array`);
    }
  });

  await t.step("works through the engine facade", () => {
    const state = newStarterGame(1);
    const shared = engine.getPublicGameStatus(state);
    assertEquals(shared.players.corp.credits, 5);
    const forRunner = engine.getPublicGameStatusFor(state, "runner");
    assertEquals(
      forRunner.players.corp.credits,
      shared.players.corp.credits,
      "counts agree between the two entry points",
    );
  });

  await t.step("same DTO for either viewer", () => {
    const state = newStarterGame(7);
    const a = engine.getPublicGameStatus(state);
    const b = engine.getPublicGameStatus(state);
    assertEquals(a, b, "public status is deterministic for a fixed state");
  });
});

Deno.test("public status: unrezzed Corp card ids are hidden except from the Corp", async (t) => {
  await t.step("unrezzed Corp card ids are hidden from the shared DTO", () => {
    const state = newStarterGame(1);
    const install = assertDefined(
      engine.getLegalMoves(state, "corp").find(
        (m) => isCorpInstall(m) && m.server === "new-remote",
      ),
    );
    const after = play(state, "corp", install);
    const shared = engine.getPublicGameStatus(after);
    assert(
      shared.players.corp.installed.every((c) => c.cardId === "hidden"),
      "unrezzed Corp card ids must not appear in the shared DTO",
    );
  });

  await t.step("Corp sees its own installed card ids", () => {
    const state = newStarterGame(1);
    const install = assertDefined(
      engine.getLegalMoves(state, "corp").find(
        (m) => isCorpInstall(m) && m.server === "new-remote",
      ),
    );
    const after = play(state, "corp", install);
    const forCorp = engine.getPublicGameStatusFor(after, "corp");
    assert(
      forCorp.players.corp.installed.some((c) => c.cardId !== "hidden"),
      "Corp sees the ids of its own installed cards",
    );
  });
});

Deno.test("public status: unrezzed ice stays in position as hidden entries", async (t) => {
  // Rule 4.6.2: the ice STACK ORDER is open information; rule 4.6.3 keeps the
  // identity of unrezzed ice hidden from the Runner. The DTO therefore keeps
  // every ice card in its physical slot — unrezzed ones redacted in place —
  // instead of reducing them to a count (which let the UI draw mixed-rez
  // stacks inside-out).

  /** A remote with Tithe installed innermost and Palisade outermost. */
  function twoIceState(): GameState {
    let state = newGameWithCorpHand(["tithe", "palisade"], 3);
    const installs: [string, ServerId | "new-remote"][] = [
      ["tithe", "new-remote"],
      ["palisade", "remote-1"],
    ];
    for (const [cardId, server] of installs) {
      const install = assertDefined(
        engine.getLegalMoves(state, "corp").find(
          (m) => isCorpInstall(m) && m.cardId === cardId && m.server === server,
        ),
      );
      state = play(state, "corp", install);
    }
    return state;
  }

  await t.step("mixed-rez stack: hidden entries keep the engine order", () => {
    // Tithe installs first (innermost), Palisade second (outermost).
    const state = twoIceState();
    const trueIce = state.servers.find((s) => s.id === "remote-1")!.ice;
    assertEquals(trueIce.map((c) => c.cardId), ["tithe", "palisade"]);

    const shared = engine.getPublicGameStatus(state);
    const sharedIce = shared.servers.find((s) => s.id === "remote-1")!.ice;
    assertEquals(
      sharedIce.map((c) => c.cardId),
      ["hidden", "hidden"],
      "unrezzed ice is redacted in place, not filtered out",
    );
    assertEquals(
      sharedIce.map((c) => c.id),
      trueIce.map((c) => c.id),
      "the redacted entries keep the real instance ids (stack order is open)",
    );
    for (const card of sharedIce) assertEquals(card.position, "ice");

    const forCorp = engine.getPublicGameStatusFor(state, "corp");
    assertEquals(
      forCorp.servers.find((s) => s.id === "remote-1")!.ice.map((c) => c.cardId),
      ["tithe", "palisade"],
      "the Corp sees its own unrezzed ice ids in position",
    );
  });

  await t.step("a rezzed outer ice stays public while the inner one stays hidden", () => {
    let state = twoIceState();
    // Rez the OUTER ice (Palisade) out of a rez window: run the remote, and
    // the corp rezzes the approached (outermost) ice.
    state = endCorpTurn(state);
    const run = assertDefined(
      engine.getLegalMoves(state, "runner").find(
        (m) => m.kind === "run" && m.server === "remote-1",
      ),
    );
    state = play(state, "runner", run);
    const prompt = state.prompts[0]!;
    assert(prompt.kind === "rez-window", "a corp rez window is pending");
    // The approached ice is the outermost one (Palisade — rule 4.6.9d: newly
    // installed ice protects the server outermost).
    const option = assertDefined(
      prompt.options.find((o) => {
        if (o.targetId === undefined) return false;
        const card = state.servers.find((s) => s.id === "remote-1")!.ice
          .find((c) => c.id === o.targetId);
        return card?.cardId === "palisade";
      }),
    );
    const answer = assertDefined(
      engine.getLegalMoves(state, "corp").find(
        (m) => m.kind === "prompt.answer" && m.optionId === option.id,
      ),
    );
    state = play(state, "corp", answer);

    const shared = engine.getPublicGameStatus(state);
    const sharedIce = shared.servers.find((s) => s.id === "remote-1")!.ice;
    assertEquals(
      sharedIce.map((c) => [c.cardId, c.rezzed] as const),
      [["hidden", false], ["palisade", true]],
      "rezzed ice is public in its true position; the inner unrezzed ice stays hidden in place",
    );
  });
});

Deno.test("public status: credits update after a Corp basic action", () => {
  const state = newStarterGame(1);
  const gain = assertDefined(
    engine.getLegalMoves(state, "corp").find((m) => m.kind === "gainCredits"),
  );
  const after = play(state, "corp", gain);
  const shared = engine.getPublicGameStatus(after);
  assertEquals(shared.players.corp.credits, 6, "gaining credits is public knowledge");
  assertEquals(shared.players.corp.clicks, 2, "clicks spent are public knowledge");
});

Deno.test("public status: installed Runner cards are always public", () => {
  let state: GameState = newStarterGame(1);
  assertEquals(state.turn.player, "corp", "test assumes the Corp's turn");
  const install = assertDefined(
    engine.getLegalMoves(state, "corp").find(
      (m) => isCorpInstall(m) && m.server === "new-remote",
    ),
  );
  state = play(state, "corp", install);
  const shared = engine.getPublicGameStatus(state);
  for (const card of shared.players.runner.installed) {
    assert(
      card.cardId !== "hidden",
      `Runner program/resource ${card.id} should be public knowledge`,
    );
  }
  // Installing a runner card keeps its id public to both players. The runner
  // can only install on its own turn, so finish the Corp's turn first — the old
  // code looked for a runner.install move while it was still the Corp's turn,
  // found none, and returned silently.
  state = endCorpTurn(state);
  assertEquals(state.turn.player, "runner", "the runner's turn begins");
  const runnerInstall = assertDefined(
    engine.getLegalMoves(state, "runner").find((m) => m.kind === "install"),
    "the runner has an install move (the starter deck's first card is installable)",
  );
  state = play(state, "runner", runnerInstall);
  const forCorp = engine.getPublicGameStatusFor(state, "corp");
  const forRunner = engine.getPublicGameStatusFor(state, "runner");
  assertEquals(
    cardIds(forCorp.players.runner.installed),
    cardIds(forRunner.players.runner.installed),
    "Runner installs are public to both players",
  );
  for (const card of forCorp.players.runner.installed) {
    assert(card.cardId !== "hidden", "Runner programs/resources are public");
  }
});

Deno.test("public status: prompts are redacted to stubs in the shared DTO", () => {
  // A pending corp rez window whose option labels name the facedown ice.
  const state = rezWindowState();
  const pending = state.prompts[0]!;
  assert(pending.kind === "rez-window", "a corp rez window is pending");

  const shared = engine.getPublicGameStatus(state);
  assertEquals(shared.prompts.length, 1, "the pending prompt is reported");
  assertEquals(shared.prompts[0], { kind: "rez-window", id: pending.id, player: "corp" });
  assertEquals(
    Object.keys(shared.prompts[0]!).sort(),
    ["id", "kind", "player"],
    "stubs carry only kind, id and player",
  );

  // Viewer-agnostic: both entry points agree, and no corp-only option or label
  // appears for either viewer.
  assertEquals(engine.getPublicGameStatusFor(state, "corp").prompts, shared.prompts);
  assertEquals(engine.getPublicGameStatusFor(state, "runner").prompts, shared.prompts);
});

Deno.test("public status: run.currentIce respects the viewer", async (t) => {
  await t.step("unrezzed approached ice is hidden from the non-owner", () => {
    // The corp installed an unrezzed ice in a remote and the runner approached
    // it: the corp always knows its own cards, the shared/runner view does not.
    let state = newGameWithCorpHand(["tithe"], 3);
    const install = assertDefined(
      engine.getLegalMoves(state, "corp").find(
        (m) => isCorpInstall(m) && m.cardId === "tithe" && m.server === "new-remote",
      ),
    );
    state = endCorpTurn(play(state, "corp", install));
    const run = assertDefined(
      engine.getLegalMoves(state, "runner").find(
        (m) => m.kind === "run" && m.server === "remote-1",
      ),
    );
    state = play(state, "runner", run);
    assert(state.run !== null && state.run.currentIceId !== undefined, "ice is approached");

    const forCorp = engine.getPublicGameStatusFor(state, "corp");
    assertEquals(
      forCorp.run?.currentIce?.cardId,
      "tithe",
      "the corp sees its own unrezzed approached ice",
    );
    assertEquals(forCorp.run?.currentIce?.strength, 1);

    const shared = engine.getPublicGameStatus(state);
    assertEquals(shared.run?.currentIce?.cardId, "hidden", "the shared DTO hides it");
    assertEquals(shared.run?.currentIce?.strength, undefined);

    const forRunner = engine.getPublicGameStatusFor(state, "runner");
    assertEquals(forRunner.run?.currentIce?.cardId, "hidden", "the runner cannot see it");
  });

  await t.step("rezzed approached ice is public in every view", () => {
    let state = newGameWithCorpHand(["tithe"], 3);
    const install = assertDefined(
      engine.getLegalMoves(state, "corp").find(
        (m) => isCorpInstall(m) && m.cardId === "tithe" && m.server === "new-remote",
      ),
    );
    state = endCorpTurn(play(state, "corp", install));
    const run = assertDefined(
      engine.getLegalMoves(state, "runner").find(
        (m) => m.kind === "run" && m.server === "remote-1",
      ),
    );
    state = play(state, "runner", run);
    // The corp rezzes the approached ice out of its rez window.
    const prompt = state.prompts[0]!;
    assert(prompt.kind === "rez-window", "the rez window is pending");
    const option = assertDefined(prompt.options.find((o) => o.targetId !== undefined));
    const answer = assertDefined(
      engine.getLegalMoves(state, "corp").find(
        (m) => m.kind === "prompt.answer" && m.optionId === option.id,
      ),
    );
    state = play(state, "corp", answer);

    for (
      const view of [
        engine.getPublicGameStatus(state),
        engine.getPublicGameStatusFor(state, "corp"),
        engine.getPublicGameStatusFor(state, "runner"),
      ]
    ) {
      assertEquals(view.run?.currentIce?.cardId, "tithe", "rezzed ice is public");
    }
  });
});
