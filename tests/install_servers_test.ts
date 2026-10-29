/**
 * Regression tests for `installServersFor` (rule 8.5.6a).
 *
 * A remote server root may hold at most one asset or agenda, but an upgrade
 * may share the root with either. Before a fix, `installServersFor` filtered
 * remotes by `root.length === 0`, which wrongly excluded a remote whose root
 * held only an upgrade — so the Corp could not install an asset next to its
 * upgrade.
 */

import { cardDef, engine, starterDeckConfigs } from "../src/mod.ts";
import type { GameState, Move } from "../src/types.ts";
import { assert, assertDefined } from "./helpers/assert.ts";

function play(state: GameState, side: "corp" | "runner", m: Move): GameState {
  const r = engine.applyMove(state, side, m);
  if (r.kind !== "applied") {
    throw new Error(`move ${m.kind} rejected: ${(r as { reason: string }).reason}`);
  }
  return r.state;
}

/** Find a seed where the Corp's opening hand contains an asset and an upgrade. */
function findAssetUpgradeSeed(): { seed: number; assetId: string; upgradeId: string } | null {
  for (let seed = 1; seed <= 50; seed++) {
    const state = engine.startGame({
      corp: starterDeckConfigs().corp,
      runner: starterDeckConfigs().runner,
      mode: "starter-decks",
      seed,
    });
    let assetId: string | null = null;
    let upgradeId: string | null = null;
    for (const c of state.corp.hand) {
      const t = cardDef(c.cardId).type;
      if (t === "asset" || t === "agenda") assetId = c.cardId;
      if (t === "upgrade") upgradeId = c.cardId;
    }
    if (assetId && upgradeId) return { seed, assetId, upgradeId };
  }
  return null;
}

Deno.test("install: an asset may be installed in a remote whose root holds only an upgrade", () => {
  const found = findAssetUpgradeSeed();
  if (!found) {
    console.log("no seed has both an asset and an upgrade in the Corp's opening hand — skip");
    return;
  }
  const { seed, assetId, upgradeId } = found;

  let state = engine.startGame({
    corp: starterDeckConfigs().corp,
    runner: starterDeckConfigs().runner,
    mode: "starter-decks",
    seed,
  });

  // Install the asset in a brand-new remote (assets create remotes).
  const assetInstall = engine.getLegalMoves(state, "corp").find((m) =>
    m.kind === "corp.install" && m.cardId === assetId && m.server === "new-remote"
  );
  assertDefined(assetInstall, "the asset can be installed in a new remote");
  state = play(state, "corp", assetInstall!);

  // Now the upgrade must be installable in the same remote root.
  const upgradeMoves = engine.getLegalMoves(state, "corp").filter((m) =>
    m.kind === "corp.install" && m.cardId === upgradeId && m.server === "remote-1"
  );
  assert(upgradeMoves.length > 0, "an upgrade can be installed next to the asset");
  state = play(state, "corp", upgradeMoves[0]!);

  // And a second asset/agenda must not be installable in the same root.
  const secondAsset = engine.getLegalMoves(state, "corp").filter((m) =>
    m.kind === "corp.install" && m.server === "remote-1" &&
    (cardDef(m.cardId).type === "asset" || cardDef(m.cardId).type === "agenda")
  );
  assert(secondAsset.length === 0, "a second asset/agenda is rejected");
});

Deno.test("install: an upgrade may be installed in the root of any server", () => {
  const found = findAssetUpgradeSeed();
  if (!found) {
    console.log("no seed has both an asset and an upgrade in the Corp's opening hand — skip");
    return;
  }
  const { seed, upgradeId } = found;
  const state = engine.startGame({
    corp: starterDeckConfigs().corp,
    runner: starterDeckConfigs().runner,
    mode: "starter-decks",
    seed,
  });
  for (const server of ["hq", "rd", "archives"] as const) {
    const moves = engine.getLegalMoves(state, "corp").filter((m) =>
      m.kind === "corp.install" && m.server === server &&
      cardDef(m.cardId).type === "upgrade"
    );
    assert(moves.length > 0, `an upgrade can be installed in ${server}`);
  }
});

Deno.test("install: assets and agendas may not be installed in central roots", () => {
  const state = engine.startGame({
    corp: starterDeckConfigs().corp,
    runner: starterDeckConfigs().runner,
    mode: "starter-decks",
    seed: 1,
  });
  for (const server of ["hq", "rd", "archives"] as const) {
    const moves = engine.getLegalMoves(state, "corp").filter((m) =>
      m.kind === "corp.install" && m.server === server &&
      (cardDef(m.cardId).type === "asset" || cardDef(m.cardId).type === "agenda")
    );
    assert(moves.length === 0, `no asset/agenda may be installed in ${server}`);
  }
});
