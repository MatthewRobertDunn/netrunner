/**
 * Run-timing regression tests (rules 6.9.3b-d, 6.9.4e, 6.9.4g).
 *
 * Two timing bugs, both found with running repros:
 *
 * 1. A mid-encounter choice prompt re-opened the break window. After the Corp
 *    answered Brân 1.0's install-inward choice (or the Runner declined
 *    Karuna's optional jack-out), the engine re-parked in the encounter with
 *    break moves re-offered — so the Runner could bioroid-break BOTH of
 *    Brân's ETR subroutines for clicks and reach movement with the ETRs
 *    never resolving. Rule 6.9.3b puts the break window ONCE per encounter,
 *    before subroutines resolve; 6.9.3c-d resolve the next unbroken
 *    subroutine immediately after a choice.
 *
 * 2. The Corp had no rez window at the server approach. The only in-run rez
 *    window was the ice-approach one (6.9.2b); an ice-less remote goes
 *    initiation → movement → breach, so a facedown Manegarm Skunkworks in the
 *    root was never rezzable in-run and its approach toll (6.9.4g) could not
 *    fire. Rule 6.9.4e puts an (R) window on the movement step, before the
 *    server is approached — after the jack-out chance (6.9.4c).
 *
 * Corp hands are scripted deterministically via `orderedCards`
 * (`newGameWithCorpHand` → `orderedCorpDeck`); startGame shuffles unordered
 * decks, so nothing here may depend on draw order.
 */

import { engine } from "../src/mod.ts";
import {
  endCorpTurn,
  findInstalled,
  newGameWithCorpHand,
  play,
  setCredits,
} from "./helpers/fixtures.ts";
import type { GameState, Move, Prompt } from "../src/types.ts";
import { isCorpInstall } from "../src/types.ts";
import { assert, assertDefined, assertEquals } from "./helpers/assert.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findMove(state: GameState, side: "corp" | "runner", kind: Move["kind"]): Move | undefined {
  return engine.getLegalMoves(state, side).find((m) => m.kind === kind);
}

/** The pending Corp rez-window prompt, if any (6.9.2b or 6.9.4e). */
function rezWindow(state: GameState): Extract<Prompt, { kind: "rez-window" }> | undefined {
  const p = state.prompts[0];
  return p && p.kind === "rez-window" ? p : undefined;
}

/** The Corp passes the pending rez window (the facedown card stays facedown). */
function corpPassesWindow(state: GameState): GameState {
  assertDefined(rezWindow(state), "a corp rez window is pending");
  const pass = assertDefined(
    engine.getLegalMoves(state, "corp").find(
      (m) => m.kind === "prompt.answer" && m.optionId === "pass",
    ),
    "the corp can pass the rez window",
  );
  return play(state, "corp", pass);
}

/** The Corp rezzes `cardId` from the pending rez window. */
function corpRezzesInWindow(state: GameState, cardId: string): GameState {
  const prompt = assertDefined(rezWindow(state), "a corp rez window is pending");
  const target = assertDefined(findInstalled(state, cardId), `${cardId} is installed`);
  const option = assertDefined(
    prompt.options.find((o) => o.targetId === target.id),
    `the window offers ${cardId}`,
  );
  return play(state, "corp", {
    kind: "prompt.answer",
    promptId: prompt.id,
    optionId: option.id,
  });
}

/**
 * Corp turn 1: install `hand[0]` in a brand-new remote and end the turn
 * without rezzing it — an ice-less remote whose root holds one facedown card.
 * Any further `hand` entries stay in HQ. `extra` runs additional corp moves
 * before the turn ends (e.g. gain credits to afford the rez).
 */
function facedownRootRemote(
  hand: string[],
  extra: (s: GameState) => GameState = (s) => s,
): GameState {
  let s = newGameWithCorpHand(hand, 3);
  const install = assertDefined(
    engine.getLegalMoves(s, "corp").find(
      (m) => isCorpInstall(m) && m.cardId === hand[0] && m.server === "new-remote",
    ),
    `the corp can install ${hand[0]} in a new remote`,
  );
  s = play(s, "corp", install);
  s = extra(s);
  return endCorpTurn(s);
}

/** The pending Manegarm toll prompt, if any. */
function tollPrompt(state: GameState): Extract<Prompt, { kind: "choose-one" }> | undefined {
  const p = state.prompts[0];
  return p && p.kind === "choose-one" && p.options.some((o) => o.id === "toll-credits")
    ? p
    : undefined;
}

// ---------------------------------------------------------------------------
// Bug 2: the Corp rez window at the server approach (rule 6.9.4e)
// ---------------------------------------------------------------------------

Deno.test("run timing: the corp rez window opens at the server approach of an ice-less remote", async (t) => {
  await t.step("passing the window charges no toll: the runner breaches free", () => {
    let s = facedownRootRemote(["manegarm_skunkworks"]);
    const manegarm = assertDefined(findInstalled(s, "manegarm_skunkworks"));
    assertEquals(manegarm.rezzed, false, "Manegarm starts facedown");

    const run = assertDefined(
      engine.getLegalMoves(s, "runner").find(
        (m) => m.kind === "run" && m.server === "remote-1",
      ),
      "the runner can run the ice-less remote",
    );
    s = play(s, "runner", run);
    assertEquals(s.run?.phase, "movement", "the run parks in the movement phase (6.9.4c)");

    // Jack-out happens at the movement park (6.9.4c) — no window yet.
    assertEquals(rezWindow(s), undefined, "no rez window before the runner declines to jack out");
    const cont = assertDefined(findMove(s, "runner", "continueRun"));
    s = play(s, "runner", cont);

    // The window (6.9.4e) parks the run BEFORE the approach toll (6.9.4g).
    const window = assertDefined(
      rezWindow(s),
      "the corp rez window parks the run at the server approach",
    );
    assert(
      window.options.some((o) => o.targetId === manegarm.id),
      "the window offers the facedown Manegarm in the attacked server's root",
    );
    assert(
      s.run?.phase === "movement" && s.breach === null,
      "the run has not reached the server while the window is pending",
    );

    // The Corp passes: no toll (Manegarm is still facedown), breach happens.
    s = corpPassesWindow(s);
    assert(
      !s.prompts.some((p) => p.kind === "choose-one"),
      "no toll prompt: the passed window leaves Manegarm facedown",
    );
    assert(s.breach !== null, "the runner breaches the server");
    assertEquals(
      findInstalled(s, "manegarm_skunkworks")?.rezzed,
      false,
      "Manegarm was never rezzed and never charged its toll",
    );
  });

  await t.step(
    "rezzing Manegarm at the window fires the toll, charged exactly 5 once, and the breach follows",
    () => {
      let s = facedownRootRemote(["manegarm_skunkworks"]);
      s = setCredits(s, "corp", 50);
      s = setCredits(s, "runner", 50);

      const run = assertDefined(
        engine.getLegalMoves(s, "runner").find(
          (m) => m.kind === "run" && m.server === "remote-1",
        ),
      );
      s = play(s, "runner", run);
      const cont = assertDefined(findMove(s, "runner", "continueRun"));
      s = play(s, "runner", cont);

      // The Corp rezzes Manegarm AT the window.
      const window = assertDefined(rezWindow(s), "the corp rez window is pending");
      const manegarm = assertDefined(findInstalled(s, "manegarm_skunkworks"));
      const rezOption = assertDefined(
        window.options.find((o) => o.targetId === manegarm.id),
        "the window offers Manegarm",
      );
      s = play(s, "corp", {
        kind: "prompt.answer",
        promptId: window.id,
        optionId: rezOption.id,
      });
      assertEquals(
        findInstalled(s, "manegarm_skunkworks")?.rezzed,
        true,
        "Manegarm was rezzed at the window",
      );
      assertEquals(
        s.corp.credits,
        50 - 2,
        "the rez charged Manegarm's printed cost (2) exactly once",
      );

      // The approach toll (6.9.4g) fires next — not another rez window.
      assertDefined(
        tollPrompt(s),
        "the Manegarm toll prompt is pending after the window rez",
      );
      assertEquals(
        s.prompts.filter((p) => p.kind === "rez-window").length,
        0,
        "the window does not re-open after it was answered",
      );

      // Pay the toll in credits: exactly 5, once.
      const pay = assertDefined(
        engine.getLegalMoves(s, "runner").find(
          (m) => m.kind === "prompt.answer" && m.optionId === "toll-credits",
        ),
        "the 5-credit toll option is offered",
      );
      s = play(s, "runner", pay);
      assertEquals(s.runner.credits, 50 - 5, "exactly 5 credits were charged");
      assertEquals(
        s.log.filter((e) => e.type === "spend-credits" && e.player === "runner" && e.amount === 5)
          .length,
        1,
        "exactly one spend-credits(5) event for the runner",
      );
      assertEquals(s.run?.tollPaid, true, "run.tollPaid is set");
      assert(tollPrompt(s) === undefined, "the toll prompt does not re-appear");
      assert(
        !s.prompts.some((p) => p.kind === "rez-window"),
        "the rez window never re-opens after the toll",
      );
      assert(s.breach !== null, "the run proceeds to the breach");

      // Drive the breach to completion: the run ends successful.
      let cur = s;
      for (let i = 0; i < 30 && cur.run && !cur.winner; i++) {
        const moves = engine.getLegalMoves(cur, "runner");
        const m = moves.find((x) => x.kind === "accessCard") ??
          moves.find((x) => x.kind === "accessRandom") ??
          moves.find((x) => x.kind === "finishAccess");
        if (!m) break;
        cur = play(cur, "runner", m);
      }
      assertEquals(cur.run, null, "the run finished");
      const runEnd = cur.log.find((e) => e.type === "run-end");
      assertDefined(runEnd, "the run-end event is logged");
      assertEquals(
        (runEnd as { successful: boolean }).successful,
        true,
        "the run ended successful",
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Bug 1: a mid-encounter choice must not re-open the break window (6.9.3b-d)
// ---------------------------------------------------------------------------

/**
 * Brân 1.0 encountered on a remote, its first subroutine (install-ice-inward)
 * resolved and the Corp's choose-one prompt pending. Brân is rezzed at the
 * 6.9.2b window; the Runner declined to break anything (6.9.3b) and resolved.
 */
function branInstallPromptState(): GameState {
  let s = facedownRootRemote(
    ["bran_1_0", "palisade"],
    (cur) => play(cur, "corp", { kind: "gainCredits" }),
  );
  const run = assertDefined(
    engine.getLegalMoves(s, "runner").find(
      (m) => m.kind === "run" && m.server === "remote-1",
    ),
    "the runner can run the Brân remote",
  );
  s = play(s, "runner", run);
  s = corpRezzesInWindow(s, "bran_1_0");
  assertEquals(s.run?.phase, "encounter-ice", "Brân is encountered after the rez");
  const resolve = assertDefined(
    findMove(s, "runner", "resolveSubroutines"),
    "the break window offers the resolve move",
  );
  s = play(s, "runner", resolve);
  const prompt = s.prompts[0];
  assert(
    prompt?.kind === "choose-one" && prompt.title.includes("install 1 piece of ice"),
    "Brân's install-ice-inward choice is pending for the corp",
  );
  return s;
}

Deno.test("run timing: answering Brân's install choice resolves the next subroutine immediately", async (t) => {
  await t.step("passing the choice: sub 1 (ETR) resolves now — no break moves re-offered", () => {
    const s = branInstallPromptState();
    const clicksBefore = s.runner.clicks;
    const prompt = assertDefined(s.prompts[0]);
    assert(prompt.kind === "choose-one", "the corp choice is pending");

    const pass = assertDefined(
      engine.getLegalMoves(s, "corp").find(
        (m) => m.kind === "prompt.answer" && m.optionId === "pass",
      ),
      "the corp can pass the install choice",
    );
    const after = play(s, "corp", pass);

    // If the break window were re-offered, the run would sit in the
    // encounter-ice phase with break moves. Instead sub 1's ETR resolved
    // immediately and ended the run.
    assertEquals(after.run, null, "sub 1 (ETR) resolved right after the choice: the run ended");
    assertEquals(
      after.runner.clicks,
      clicksBefore,
      "the runner never got break moves: the ETR subs cost no clicks",
    );
    const resolved = after.log
      .filter((e) => e.type === "resolve-subroutine")
      .map((e) => (e as { subIndex: number }).subIndex);
    assert(resolved.includes(0), "sub 0 (the choice) resolved");
    assert(resolved.includes(1), "sub 1 (the first ETR) resolved immediately (6.9.3c-d)");
    assertEquals(after.prompts.length, 0, "no prompt lingers after the choice");
  });

  await t.step("answering the choice with an install: sub 1 (ETR) still resolves now", () => {
    const s = branInstallPromptState();
    const prompt = assertDefined(s.prompts[0]);
    assert(prompt.kind === "choose-one", "the corp choice is pending");
    const palisade = assertDefined(
      s.corp.hand.find((c) => c.cardId === "palisade"),
      "an ice card is in HQ for the install option",
    );
    const option = assertDefined(
      prompt.options.find((o) => o.targetId === palisade.id),
      "the HQ ice is an offered install option",
    );
    const after = play(s, "corp", {
      kind: "prompt.answer",
      promptId: prompt.id,
      optionId: option.id,
    });

    // The install happened (pinned in prompts_dispatch_test.ts), and the
    // subroutine loop continued instead of re-offering break moves.
    const server = findInstalled(after, "bran_1_0")?.server;
    assertDefined(server, "Brân's server is known");
    assert(
      after.servers.find((x) => x.id === server)?.ice.some((c) => c.id === palisade.id),
      "the chosen ice was installed directly inward",
    );
    assertEquals(after.run, null, "sub 1 (ETR) resolved right after the install: the run ended");
    const resolved = after.log
      .filter((e) => e.type === "resolve-subroutine")
      .map((e) => (e as { subIndex: number }).subIndex);
    assert(resolved.includes(1), "sub 1 (the first ETR) resolved immediately (6.9.3c-d)");
    assertEquals(after.prompts.length, 0, "no prompt lingers after the choice");
  });
});

// ---------------------------------------------------------------------------
// Karuna: the declined optional jack-out flows into the next subroutine
// ---------------------------------------------------------------------------

Deno.test("run timing: declining Karuna's jack-out resolves the remaining subroutine immediately", () => {
  let s = facedownRootRemote(["karuna"]);
  const run = assertDefined(
    engine.getLegalMoves(s, "runner").find(
      (m) => m.kind === "run" && m.server === "remote-1",
    ),
    "the runner can run the Karuna remote",
  );
  s = play(s, "runner", run);
  s = corpRezzesInWindow(s, "karuna");
  assertEquals(s.run?.phase, "encounter-ice", "Karuna is encountered after the rez");

  const resolve = assertDefined(findMove(s, "runner", "resolveSubroutines"));
  s = play(s, "runner", resolve);

  // Sub 0: net 2, then the optional jack-out choice (a runner choose-one).
  const jackOut = assertDefined(s.prompts[0]);
  assert(
    jackOut.kind === "choose-one" && /jack out/i.test(jackOut.title),
    "Karuna's optional jack-out prompt is pending",
  );
  assertEquals(
    s.log.filter((e) => e.type === "damage").length,
    1,
    "sub 0 dealt its net damage before the choice",
  );

  // The Runner declines: "Resolve remaining subroutines" (the pass option).
  const pass = assertDefined(
    jackOut.options.find((o) => o.id === "pass"),
    "the pass option resolves the remaining subroutines",
  );
  s = play(s, "runner", {
    kind: "prompt.answer",
    promptId: jackOut.id,
    optionId: pass.id,
  });

  // The re-drive resolved sub 1 (net 2) and completed the encounter — no
  // break window re-offered, the run is in the movement phase.
  assertEquals(s.run?.phase, "movement", "the encounter completed after the declined jack-out");
  assertEquals(s.run?.resolved, [0, 1], "both subroutines resolved this encounter");
  assertEquals(
    s.log.filter((e) => e.type === "damage").length,
    2,
    "sub 1's net damage resolved immediately after the choice",
  );
  const moves = engine.getLegalMoves(s, "runner");
  assert(
    !moves.some((m) => m.kind === "breakSubroutine" || m.kind === "pumpIcebreaker"),
    "no break moves are offered after the encounter completed",
  );
});
