/**
 * Prompt-dispatch regression tests (BUG B1).
 *
 * The `choose-one` branch of `answerPrompt` (src/engine/apply.ts) used to
 * dispatch on a "corp option + targetId ⇒ rez it" heuristic, so any choose-one
 * option that named a corp card was applied as a REZ instruction no matter
 * what the prompt meant. Two victims:
 *
 *  - Seamless Launch ("Place 2 advancement counters on 1 installed card that
 *    you did not install this turn", rule 1.18.2) rezzed the chosen card and
 *    placed zero counters whenever two or more cards were legal targets.
 *  - Brân 1.0's first subroutine ("You may install 1 piece of ice from HQ or
 *    Archives directly inward from this ice, ignoring all costs", rule 8.5.14)
 *    never installed anything: its option was offered but effectively a no-op.
 *
 * The fix dispatches on `option.effect.kind` (the effect kinds are
 * `rez-card-free`, `rez-card-paid`, `corp-install-ice-inward` and
 * `place-2-advancement`), and `legal-moves.ts` mirrors that dispatch so every
 * offered option is one `applyMove` actually applies. Rules checked in
 * `docs/rules-v26.03.txt`: 1.18.2, 8.1.2d, 8.5.14.
 *
 * Hands are scripted deterministically via `orderedCards` (see
 * `orderedCorpDeck` in src/testing/fixtures.ts).
 */

import { engine, starterDeckConfigs } from "../src/mod.ts";
import type { CardId, DeckConfig, GameState, PlayerSide, Zone } from "../src/types.ts";
import { orderedCorpDeck, play } from "../src/testing/fixtures.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

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

function newGame(corpHand: CardId[]): GameState {
  return engine.startGame({
    corp: corpDeckWithHand(corpHand),
    runner: starterDeckConfigs().runner,
    mode: "starter-decks",
    seed: 3,
  });
}

/** Play first-legal moves for `state.turn.player` until the turn passes over. */
function turnBurn(state: GameState): GameState {
  let cur = state;
  const active = cur.turn.player;
  for (let i = 0; i < 60 && !cur.winner && cur.turn.player === active; i++) {
    const moves = engine.getLegalMoves(cur, active);
    if (moves.length === 0) break;
    cur = play(cur, active, moves[0]!).state;
  }
  return cur;
}

/** Play first-legal moves until it is `side`'s turn. */
function burnUntil(state: GameState, side: PlayerSide): GameState {
  let cur = state;
  for (let i = 0; i < 80 && !cur.winner; i++) {
    if (cur.turn.player === side) return cur;
    const active = cur.turn.player;
    const moves = engine.getLegalMoves(cur, active);
    if (moves.length === 0) return cur;
    cur = play(cur, active, moves[0]!).state;
  }
  return cur;
}

/**
 * Play first-legal moves until it is `side`'s turn, then spend the rest of that
 * turn and advance until `side` is on turn again.
 */
function nextTurnOf(state: GameState, side: PlayerSide): GameState {
  return burnUntil(turnBurn(state), side);
}

/** The first installed corp card with the given card id (root or ice). */
function findInstalled(state: GameState, cardId: CardId) {
  for (const s of state.servers) {
    for (const c of [...s.root, ...s.ice]) if (c.cardId === cardId) return c;
  }
  return undefined;
}

/** Any installed corp card with this instance id (root or ice). */
function findInstance(state: GameState, id: string) {
  for (const s of state.servers) {
    for (const c of [...s.root, ...s.ice]) if (c.id === id) return c;
  }
  return undefined;
}

/** Cards in a zone (corp hand/archives), as instances. */
function cardsIn(state: GameState, side: PlayerSide, zone: Zone): GameState["corp"]["hand"] {
  const p = side === "corp" ? state.corp : state.runner;
  switch (zone) {
    case "hand":
      return p.hand;
    case "discard":
      return p.discard;
    default:
      return [];
  }
}

/** A pending choose-one prompt owned by `side`. */
function chooseOnePrompt(state: GameState, side: PlayerSide) {
  const prompt = state.prompts[0];
  if (prompt && prompt.kind === "choose-one" && prompt.player === side) return prompt;
  return undefined;
}

function answerChooseOne(state: GameState, side: PlayerSide, optionId: string): GameState {
  const prompt = assertDefined(chooseOnePrompt(state, side), "a choose-one prompt is pending");
  const option = assertDefined(
    prompt.options.find((o) => o.id === optionId),
    `option ${optionId} is offered`,
  );
  return play(state, side, {
    kind: "prompt.answer",
    player: side,
    promptId: prompt.id,
    optionId: option.id,
  }).state;
}

// ---------------------------------------------------------------------------
// Victim 1: Seamless Launch with 2+ legal targets
// ---------------------------------------------------------------------------

/**
 * Two installed cards that were not installed this turn: install the upgrade
 * on turn 1 and the advanceable asset on turn 2, then play Seamless Launch on
 * turn 3 so the prompt has two legal targets.
 */
function seamlessMultiTargetState(): GameState {
  let s = newGame(["manegarm_skunkworks", "urtica_cipher", "seamless_launch", "hedge_fund"]);
  // Turn 1: install the upgrade (HQ root; upgrades may also create a remote).
  s = play(s, "corp", { kind: "corp.install", cardId: "manegarm_skunkworks", server: "hq" }).state;
  s = nextTurnOf(s, "corp"); // corp turn 2
  // Turn 2: install the advanceable asset in a new remote, then end the turn.
  s =
    play(s, "corp", { kind: "corp.install", cardId: "urtica_cipher", server: "new-remote" }).state;
  s = nextTurnOf(s, "corp"); // corp turn 3
  // Turn 3: play Seamless Launch (a single target would resolve silently).
  const playOp = engine.getLegalMoves(s, "corp").find((m) =>
    m.kind === "corp.playOperation" && m.cardId === "seamless_launch"
  );
  assertDefined(playOp, "Seamless Launch is playable");
  return play(s, "corp", playOp!).state;
}

Deno.test("seamless launch prompt: every chosen option places 2 counters, never rezzez (1.18.2)", () => {
  const s0 = seamlessMultiTargetState();
  const prompt = assertDefined(chooseOnePrompt(s0, "corp"), "the choose-one prompt is pending");
  assert(prompt.options.length === 2, "both installed cards are legal targets");
  for (const option of prompt.options) {
    const target = assertDefined(findInstance(s0, option.targetId!), "the target is installed");
    const creditsBefore = s0.corp.credits;
    const clicksBefore = s0.corp.clicks;
    const after = answerChooseOne(s0, "corp", option.id);
    const card = assertDefined(findInstance(after, target.id), "the target is still installed");
    assertEquals(card.advancement ?? 0, 2, "the chosen option placed 2 advancement counters");
    assertEquals(
      after.log.filter((e) => e.type === "rez" && e.cardId === card.id).length,
      0,
      "answering the option did not rez the card",
    );
    assertEquals(card.rezzed, target.rezzed, "the card was not rezzed by the answer");
    assertEquals(
      after.corp.credits,
      creditsBefore,
      "placing counters directly spends no credits (1.18.2 is not 'advancing')",
    );
    assertEquals(after.corp.clicks, clicksBefore, "no click was spent");
    assertEquals(after.prompts.length, 0, "the prompt was answered and closed");
  }
});

Deno.test("seamless launch prompt: the second card is targetable and untouched otherwise", () => {
  let s = seamlessMultiTargetState();
  const prompt = assertDefined(chooseOnePrompt(s, "corp"), "the choose-one prompt is pending");
  // Pick the option for the asset (the card that is not the upgrade).
  const upgrade = assertDefined(
    findInstalled(s, "manegarm_skunkworks"),
    "the upgrade is installed",
  );
  const urtica = assertDefined(findInstalled(s, "urtica_cipher"), "the asset is installed");
  const option = assertDefined(
    prompt.options.find((o) => o.targetId === urtica.id),
    "the asset gets its own choose-one option",
  );
  const creditsBefore = s.corp.credits;
  s = answerChooseOne(s, "corp", option.id);
  const asset = assertDefined(findInstalled(s, "urtica_cipher"), "the asset is still installed");
  assertEquals(asset.advancement ?? 0, 2, "the asset holds 2 counters");
  assertEquals(asset.rezzed, urtica.rezzed, "the asset was not rezzed");
  assertEquals(
    s.log.filter((e) => e.type === "rez").length,
    0,
    "no rez event was logged at all",
  );
  assertEquals(s.corp.credits, creditsBefore, "corp credits are unchanged");
  assertEquals(
    findInstalled(s, "manegarm_skunkworks")!.advancement ?? 0,
    upgrade.advancement ?? 0,
    "the upgrade is untouched by the choice",
  );
});

// ---------------------------------------------------------------------------
// Victim 1 (single-target): existing behaviour is kept
// ---------------------------------------------------------------------------

Deno.test("seamless launch single target: counters placed without a prompt (no prompt or answered)", () => {
  let s = newGame(["manegarm_skunkworks", "seamless_launch"]);
  s = play(s, "corp", { kind: "corp.install", cardId: "manegarm_skunkworks", server: "hq" }).state;
  s = nextTurnOf(s, "corp"); // corp turn 2
  const playOp = engine.getLegalMoves(s, "corp").find((m) =>
    m.kind === "corp.playOperation" && m.cardId === "seamless_launch"
  );
  assertDefined(playOp, "Seamless Launch is playable");
  s = play(s, "corp", playOp!).state;
  // Only one legal target: no prompt is needed (or it is answered trivially).
  if (s.prompts.length > 0) {
    const prompt = assertDefined(chooseOnePrompt(s, "corp"), "a choose-one prompt is pending");
    s = answerChooseOne(s, "corp", prompt.options[0]!.id);
  }
  const upgrade = assertDefined(
    findInstalled(s, "manegarm_skunkworks"),
    "the upgrade is installed",
  );
  assertEquals(upgrade.advancement ?? 0, 2, "Seamless Launch placed 2 counters on the only target");
  assertEquals(upgrade.rezzed, false, "the card was not rezzed");
  assertEquals(
    s.log.filter((e) => e.type === "rez").length,
    0,
    "no rez event was logged at all",
  );
});

// ---------------------------------------------------------------------------
// Victim 2: Brân 1.0 install-ice-inward
// ---------------------------------------------------------------------------

/**
 * Brân 1.0 installed and rezzed on a remote, an ice card still in HQ, and the
 * Runner running that remote: the Corp's choose-one prompt appears during the
 * encounter of Brân's first subroutine.
 */
function branEncounterState(): GameState {
  let s = newGame(["bran_1_0", "palisade", "hedge_fund", "hedge_fund", "government_subsidy"]);
  // Turn 1: install Brân in a new remote, then gain the credits to rez it.
  s = play(s, "corp", { kind: "corp.install", cardId: "bran_1_0", server: "new-remote" }).state;
  s = play(s, "corp", { kind: "corp.gainCredits" }).state;
  s = nextTurnOf(s, "runner"); // end corp turn 1; the runner now acts
  // The corp keeps at least one ice card in HQ for the subroutine to install.
  const palisadeInHand = cardsIn(s, "corp", "hand").find((c) => c.cardId === "palisade");
  assertDefined(palisadeInHand, "an ice card is still in HQ");
  // Runner turn: run the remote.
  const run = engine.getLegalMoves(s, "runner").find((m) =>
    m.kind === "runner.run" && m.server === "remote-1"
  );
  assertDefined(run, "the runner can run the remote");
  return play(s, "runner", run!).state;
}

/** Answer the corp's rez window by rezzing `cardId`, or return the state. */
function answerRezWindow(state: GameState, cardId: CardId): GameState {
  const prompt = state.prompts[0];
  if (!prompt || prompt.kind !== "rez-window") return state;
  const option = prompt.options.find((o) => o.targetId === findInstalled(state, cardId)?.id);
  if (!option) return state;
  return play(state, "corp", {
    kind: "prompt.answer",
    player: "corp",
    promptId: prompt.id,
    optionId: option.id,
  }).state;
}

/**
 * The state with Brân 1.0's install-ice-inward choose-one prompt pending: rez
 * Brân in the rez window, then advance the encounter to its first subroutine.
 */
function branPromptState(): GameState {
  let s = answerRezWindow(branEncounterState(), "bran_1_0");
  let prompt = chooseOnePrompt(s, "corp");
  for (let i = 0; i < 20 && s.run && !prompt && !s.winner; i++) {
    const side: PlayerSide = s.prompts[0]?.player ?? "runner";
    const moves = engine.getLegalMoves(s, side);
    const pick = moves.find((m) => m.kind === "runner.continueRun") ??
      moves.find((m) => m.kind === "runner.resolveSubroutines") ??
      moves.find((m) => m.kind === "prompt.answer") ??
      moves[0];
    if (!pick) break;
    s = play(s, side, pick).state;
    prompt = chooseOnePrompt(s, "corp");
  }
  const branPrompt = assertDefined(
    prompt,
    "Brân 1.0's install-ice-inward subroutine queues a corp choose-one prompt",
  );
  assert(
    branPrompt.title.includes("install 1 piece of ice from HQ or Archives"),
    "the prompt is Brân's ice-install subroutine",
  );
  return s;
}

Deno.test("bran 1.0 subroutine: the offered option installs the ice inward, unrezzed, ignoring costs", () => {
  const s = branPromptState();
  const branPrompt = assertDefined(chooseOnePrompt(s, "corp"), "the Brân prompt is pending");
  const option = assertDefined(
    branPrompt.options.find((o) => o.id.startsWith("install-")),
    "the HQ ice is an offered option",
  );
  const installTarget = assertDefined(
    cardsIn(s, "corp", "hand").find((c) => c.id === option.targetId),
    "the option points at an ice card in HQ",
  );
  const handBefore = s.corp.hand.length;
  const creditsBefore = s.corp.credits;
  const server = findInstalled(s, "bran_1_0")!.server!;
  const rezEventsBefore = s.log.filter((e) => e.type === "rez").length;
  const s2 = answerChooseOne(s, "corp", option.id);

  // HQ lost exactly one ice card.
  assertEquals(s2.corp.hand.length, handBefore - 1, "HQ lost the ice card");
  // The run server's ice stack contains it, and it is unrezzed.
  const iceList = s2.servers.find((x) => x.id === server)!.ice;
  const installed = iceList.find((c) => c.cardId === installTarget.cardId);
  assertDefined(installed, "the ice card is now installed in the same server as Brân");
  assertEquals(installed!.rezzed, false, "installed ice is not rezzed");
  // Rule 8.5.14: "directly inward from this ice" — the new card is inserted at
  // Brân's index, pushing Brân outward (Brân was the only ice, so the new card
  // becomes the innermost ice, index 0, and Brân moves outward).
  assertEquals(iceList[0]!.id, installed!.id, "the new ice is directly inward of Brân");
  assertEquals(
    iceList[iceList.length - 1]!.cardId,
    "bran_1_0",
    "Brân 1.0 is pushed outward by the new ice",
  );
  // "ignoring all costs": no credits were spent by the install.
  assertEquals(s2.corp.credits, creditsBefore, "installing inward spent no credits");
  assertEquals(
    s2.log.filter((e) => e.type === "rez").length,
    rezEventsBefore,
    "answering the option did not rez anything",
  );
});

// ---------------------------------------------------------------------------
// Truthfulness: every offered prompt.answer move must be accepted by applyMove
// ---------------------------------------------------------------------------

Deno.test("choose-one offers: every corp option is accepted by applyMove (offer ⟺ apply)", () => {
  for (const promptState of [seamlessMultiTargetState(), branPromptState()]) {
    const offer = engine.getLegalMoves(promptState, "corp").filter((m) =>
      m.kind === "prompt.answer"
    );
    assert(offer.length > 0, "prompt answers are offered to the corp");
    for (const move of offer) {
      const result = engine.applyMove(promptState, "corp", move);
      assert(
        result.kind === "applied",
        `applyMove accepted ${JSON.stringify(move)}: ${
          result.kind === "illegal-move" ? result.reason : ""
        }`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Regression: no choose-one option may rez a card that is not a rez instruction
// ---------------------------------------------------------------------------

Deno.test("regression: answering a choose-one option never rezzez a card (rule 8.1.2d)", () => {
  // Sweep every option of the corp choose-one prompts this engine produces and
  // assert that applying any of them rezzez nothing that was not already
  // rezzed. A rez instruction is the only thing that may rez a card, and it
  // must say so in its effect kind (rez-card-free / rez-card-paid) — the point
  // of the fix is that "corp + targetId" is no longer such an instruction.
  for (const promptState of [seamlessMultiTargetState(), branPromptState()]) {
    const prompt = promptState.prompts[0];
    assert(
      prompt !== undefined && prompt.kind === "choose-one",
      "a choose-one prompt is pending",
    );
    const rezzedBefore = new Set(
      promptState.servers.flatMap((srv) => [...srv.root, ...srv.ice])
        .filter((c) => c.rezzed === true)
        .map((c) => c.id),
    );
    const offered = engine.getLegalMoves(promptState, "corp").filter((m) =>
      m.kind === "prompt.answer"
    );
    assert(offered.length > 0, "corp prompt answers are offered");
    for (const move of offered) {
      const option = assertDefined(
        prompt.options.find((o) => o.id === move.optionId),
        "the offered option exists",
      );
      const kind = option.effect?.kind;
      const isRezInstruction = kind === "rez-card-free" || kind === "rez-card-paid";
      if (isRezInstruction) continue; // a genuine rez instruction: handled above
      const after = play(promptState, "corp", move).state;
      const rezEvents = after.log.filter((e) => e.type === "rez");
      for (const event of rezEvents) {
        assert(
          rezzedBefore.has(event.cardId),
          `option '${option.id}' (effect ${kind}) rezzed a card without a rez instruction`,
        );
      }
      assertEquals(
        after.corp.credits,
        promptState.corp.credits,
        `option '${option.id}' (effect ${kind}) charged no credits`,
      );
    }
  }
});
