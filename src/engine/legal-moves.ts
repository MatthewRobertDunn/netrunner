/**
 * Legal moves: enumerate every decision a player can make right now.
 *
 * A move carries all typed data needed to apply it (card ids, servers, target
 * instance ids, ability indices), so callers never have to infer details.
 */

import { cardDef } from "../cards/catalogue.ts";
import { behaviors, supportStatus } from "../cards/effects.ts";
import { abilityLegality, serversForAbility } from "./effects.ts";
import { randomAccessCandidateCount, specificAccessCandidates } from "./settle.ts";
import {
  allServers,
  availableCredits,
  findCard,
  isCentral,
  isIcebreaker,
  isRezzedIce,
  memoryLimit,
  memoryUsed,
  player,
  runnerInstallCost,
  serverById,
} from "./state.ts";
import { rezCostFor } from "./runs.ts";
import type { CardInstance, GameState, Move, PlayerSide, Prompt, ServerId } from "../types.ts";

/** Every legal move for `player` in `state`. */
export function getLegalMoves(state: GameState, playerSide: PlayerSide): Move[] {
  if (state.winner) return [];
  const moves: Move[] = [];
  const p = player(state, playerSide);

  // --- Setup: mulligans -----------------------------------------------------
  if (state.turn.phase === "mulligans") {
    const prompt = state.prompts.find((pr) => pr.kind === "mulligan");
    if (prompt && prompt.player === playerSide) {
      moves.push({ kind: "mulligan.take", player: playerSide });
      moves.push({ kind: "mulligan.decline", player: playerSide });
    }
    return moves;
  }

  // --- Discard phase decisions ---------------------------------------------
  if (state.turn.phase === "discard") {
    const prompt = state.prompts.find((pr) => pr.kind === "discard" && pr.player === playerSide);
    if (prompt && prompt.kind === "discard") {
      const cards = player(state, playerSide).hand;
      // Offer all legally-sized subsets of hand cards (bounded to `count` cards).
      const count = Math.min(prompt.count, cards.length);
      const combos = combinations(cards.map((c) => c.id), count);
      for (const combo of combos) {
        moves.push({ kind: "discard", player: playerSide, cardInstanceIds: combo });
      }
      return moves;
    }
    return [];
  }

  // --- Prompts (one actionable prompt at a time) ---------------------------
  const prompt = state.prompts[0];
  if (prompt) {
    const promptMoves = movesForPrompt(state, playerSide, prompt);
    return promptMoves;
  }

  // --- Run decisions -------------------------------------------------------
  if (state.run && !state.breach) {
    return runMoves(state, playerSide);
  }

  // --- Access decisions ----------------------------------------------------
  if (state.breach) {
    return breachMoves(state, playerSide);
  }

  // --- Action phase basics -------------------------------------------------
  if (state.turn.phase !== "action" || p.clicks <= 0) return [];
  if (playerSide === "corp") return corpActionMoves(state);
  return runnerActionMoves(state);
}

// ---------------------------------------------------------------------------
// Prompt-driven moves
// ---------------------------------------------------------------------------

function movesForPrompt(state: GameState, playerSide: PlayerSide, prompt: Prompt): Move[] {
  if (prompt.player !== playerSide) return [];
  switch (prompt.kind) {
    case "mulligan":
      return [
        { kind: "mulligan.take", player: playerSide },
        { kind: "mulligan.decline", player: playerSide },
      ];
    case "discard": {
      const cards = player(state, playerSide).hand;
      const count = Math.min(prompt.count, cards.length);
      return combinations(cards.map((c) => c.id), count).map((combo) => ({
        kind: "discard" as const,
        player: playerSide,
        cardInstanceIds: combo,
      }));
    }
    case "choose-one": {
      const moves: Move[] = [];
      for (const option of prompt.options) {
        if (option.creditCost && availableCredits(state, playerSide) < option.creditCost) continue;
        if (option.clickCost && player(state, playerSide).clicks < option.clickCost) continue;
        // Dispatch on the option's effect kind, mirroring answerPrompt in
        // apply.ts (BUG B1: the old "corp + targetId ⇒ rez" heuristic offered
        // rez moves for Seamless Launch and misfiltered Brân's install option).
        const kind = option.effect?.kind;
        if (kind === "rez-card-free" && option.targetId) {
          const found = findCard(state, option.targetId);
          if (!found || found.card.rezzed === true) continue;
        } else if (kind === "rez-card-paid" && option.targetId) {
          const found = findCard(state, option.targetId);
          if (!found || found.card.rezzed === true) continue;
          if (rezCostFor(state, found.card) > state.corp.credits) continue;
        } else if (kind === "corp-install-ice-inward" && option.targetId) {
          // The effect's targetId is the ice to install (from HQ/Archives);
          // it must exist in the corp's hand or discard, and the `from` ice
          // (effect.iceId) must be installed and protecting a server so that
          // "directly inward" has a position (rule 8.5.14).
          const found = findCard(state, option.targetId);
          if (!found) continue;
          const from = findCard(state, option.effect.iceId);
          if (!from || from.card.zone !== "play-area" || !from.card.server) continue;
          if (found.card.zone !== "hand" && found.card.zone !== "discard") continue;
        } else if (kind === "place-2-advancement" && option.targetId) {
          const found = findCard(state, option.targetId);
          if (!found || found.card.zone !== "play-area") continue;
        }
        moves.push({
          kind: "prompt.answer",
          player: playerSide,
          promptId: prompt.id,
          optionId: option.id,
        });
      }
      return moves;
    }
    case "rez-window": {
      const moves: Move[] = [];
      for (const option of prompt.options) {
        if ((option.creditCost ?? 0) > state.corp.credits) continue;
        moves.push({
          kind: "prompt.answer",
          player: "corp",
          promptId: prompt.id,
          optionId: option.id,
        });
      }
      moves.push({ kind: "prompt.answer", player: "corp", promptId: prompt.id, optionId: "pass" });
      return moves;
    }
    case "access-decision": {
      const found = findCard(state, prompt.cardId);
      if (!found) return [{ kind: "runner.finishAccess" }];
      const moves: Move[] = [{ kind: "runner.finishAccess" }];
      const trashCost = cardDef(found.card.cardId).trashCost;
      if (trashCost !== null && trashCost > 0 && state.runner.credits >= trashCost) {
        moves.push({ kind: "runner.trashAccessed" });
      }
      return moves;
    }
  }
}

// ---------------------------------------------------------------------------
// Corp action phase
// ---------------------------------------------------------------------------

function corpActionMoves(state: GameState): Move[] {
  const moves: Move[] = [];
  const corp = state.corp;
  if (corp.clicks <= 0) return moves;
  moves.push({ kind: "corp.gainCredits" });
  if (corp.deck.length > 0) moves.push({ kind: "corp.draw" });

  // Install: hand cards that can be installed in their legal servers.
  // Install/play moves key on the definition id (apply resolves the first
  // matching instance), so emit one move set per definition — a second copy
  // in hand must not double the buttons (or the AI's softmax mass).
  const installed = new Set<string>();
  for (const card of corp.hand) {
    if (installed.has(card.cardId)) continue;
    const def = cardDef(card.cardId);
    const servers = installServersFor(state, card);
    if (servers.length === 0) continue;
    installed.add(card.cardId);
    if (def.type === "ice") {
      // Ice install cost = number of ice already protecting that server.
      for (const server of servers) {
        if (server === "new-remote") {
          // Installing ice in a brand-new remote costs 0 (no ice protecting it).
          moves.push({ kind: "corp.install", cardId: card.cardId, server });
          continue;
        }
        const cost = serverById(state, server).ice.length;
        if (cost <= state.corp.credits) {
          moves.push({ kind: "corp.install", cardId: card.cardId, server });
        }
      }
    } else {
      // Asset/upgrade/agenda installs are free (rule 1.16.6c).
      for (const server of servers) {
        moves.push({ kind: "corp.install", cardId: card.cardId, server });
      }
    }
  }

  // Play operations from hand (one move per definition id — see above).
  const operated = new Set<string>();
  for (const card of corp.hand) {
    if (operated.has(card.cardId)) continue;
    const def = cardDef(card.cardId);
    if (def.type !== "operation") continue;
    if (def.cost !== null && def.cost > state.corp.credits) continue;
    operated.add(card.cardId);
    moves.push({ kind: "corp.playOperation", cardId: card.cardId });
  }

  // Advance and score installed cards.
  for (const card of corpInstalledCardsLocal(state)) {
    const def = cardDef(card.cardId);
    // Rule 1.18.3: Agendas can always be advanced; non-agenda cards only if printed
    // card text explicitly permits it (e.g. Urtica Cipher: "You can advance this asset.").
    // Rule 5.2.6f: Advancing costs 1 click and 1 credit.
    const isAdvanceable = def.type === "agenda" || card.cardId === "urtica_cipher";
    if (isAdvanceable && state.corp.credits >= 1) {
      moves.push({ kind: "corp.advance", targetId: card.id });
    }
    if (def.type === "agenda") {
      const adv = card.advancement ?? 0;
      const requirement = def.advancementRequirement ?? 0;
      if (adv >= requirement) moves.push({ kind: "corp.score", targetId: card.id });
    }
  }

  // Rez installed non-ice cards (ice is rezzed during runs only).
  for (const card of corpInstalledCardsLocal(state)) {
    const def = cardDef(card.cardId);
    if (def.type !== "asset" && def.type !== "upgrade") continue;
    if (card.rezzed === true) continue;
    if (rezCostFor(state, card) <= state.corp.credits) {
      moves.push({ kind: "corp.rez", targetId: card.id });
    }
  }

  // Paid abilities on installed cards.
  addAbilityMoves(state, "corp", corpInstalledCardsLocal(state), moves);
  return moves;
}

/** Installation servers for a Corp hand card. */
function installServersFor(state: GameState, card: CardInstance): (ServerId | "new-remote")[] {
  const def = cardDef(card.cardId);
  if (def.type === "ice") {
    // Ice can protect any server (rule 4.6.6d), outermost position (rule 8.5.2d, 4.6.9d).
    return [...allServers(state), "new-remote"];
  }
  if (def.type === "agenda" || def.type === "asset") {
    // Assets and agendas cannot be installed in central roots (rule 4.6.6e),
    // and a remote root may hold at most one of them (rule 8.5.6a) — but an
    // upgrade may share the root, so the filter is on asset/agenda count,
    // not on root length.
    return [
      ...(state.servers
        .filter((s) =>
          !isCentral(s.id) && !s.root.some((c) => {
            const t = cardDef(c.cardId).type;
            return t === "asset" || t === "agenda";
          })
        )
        .map((s) => s.id) as ServerId[]),
      "new-remote",
    ];
  }
  if (def.type === "upgrade") {
    // Upgrades may be installed in the root of any server (rule 8.5.2c), and
    // the Corp may declare a new remote server as the install destination
    // (rules 8.5.2a / 4.6.8b).
    // (Central-only upgrade restrictions from rule 8.5.12 are not modelled;
    // no starter upgrade has one.)
    return [...allServers(state), "new-remote"];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Runner action phase
// ---------------------------------------------------------------------------

function runnerActionMoves(state: GameState): Move[] {
  const moves: Move[] = [];
  const runner = state.runner;
  if (runner.clicks <= 0) return moves;
  moves.push({ kind: "runner.gainCredits" });
  if (runner.deck.length > 0) moves.push({ kind: "runner.draw" });

  // Install programs/hardware/resources from hand (one move per definition id).
  const runnerInstalled = new Set<string>();
  for (const card of runner.hand) {
    if (runnerInstalled.has(card.cardId)) continue;
    const def = cardDef(card.cardId);
    if (def.type !== "program" && def.type !== "hardware" && def.type !== "resource") continue;
    // Effective cost incl. discounts (Carmen after a successful run this turn).
    const cost = runnerInstallCost(state, card.cardId);
    if (cost > runner.credits) continue;
    if (def.type === "program" && memoryUsed(state) + (def.memoryCost ?? 0) > memoryLimit(state)) {
      continue;
    }
    runnerInstalled.add(card.cardId);
    moves.push({ kind: "runner.install", cardId: card.cardId });
  }

  // Play events from hand (one move set per definition id).
  const evented = new Set<string>();
  for (const card of runner.hand) {
    if (evented.has(card.cardId)) continue;
    const def = cardDef(card.cardId);
    if (def.type !== "event") continue;
    if (def.cost !== null && def.cost > runner.credits) continue;
    if (def.minimumDeckSize !== null) continue;
    evented.add(card.cardId);
    if (
      card.cardId === "jailbreak" || card.cardId === "overclock" || card.cardId === "tread_lightly"
    ) {
      // These events initiate a run as part of their resolution (rule 5.2.2b),
      // so the Runner must choose the attacked server when playing them.
      // Jailbreak names "HQ or R&D"; Overclock and Tread Lightly name "any
      // server", so they enumerate every server that could be run (central or
      // existing remote), subject to the same Red Team restriction as a basic
      // run (the event's run is still a run).
      const servers: ServerId[] = card.cardId === "jailbreak"
        ? ["hq", "rd"]
        : allServers(state).filter((s) => !cardRestrictsRun(state, s));
      for (const server of servers) {
        moves.push({ kind: "runner.playEvent", cardId: card.cardId, server });
      }
    } else {
      moves.push({ kind: "runner.playEvent", cardId: card.cardId });
    }
  }

  // Run any server (central or existing remote).
  for (const server of allServers(state)) {
    if (cardRestrictsRun(state, server)) continue;
    moves.push({ kind: "runner.run", server });
  }

  // Paid abilities on installed Runner cards.
  addAbilityMoves(state, "runner", runner.installed, moves);
  return moves;
}

/** Red Team forbids running the same central server twice per turn. */
function cardRestrictsRun(state: GameState, server: ServerId): boolean {
  if (!server.startsWith("remote-") && state.runner.ranServersThisTurn.includes(server)) {
    // Only Red Team imposes this; if it is not installed the restriction does not apply.
    if (state.runner.installed.some((c) => c.cardId === "red_team")) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Run and breach moves
// ---------------------------------------------------------------------------

function runMoves(state: GameState, playerSide: PlayerSide): Move[] {
  const run = state.run!;
  const moves: Move[] = [];
  if (playerSide === "corp") {
    // Corp decisions during a run come through prompts (rez windows).
    return moves;
  }
  if (run.phase === "encounter-ice") {
    // Break window: icebreakers may break/pump, then resolve.
    const ice = run.currentIceId ? findCard(state, run.currentIceId)?.card ?? null : null;
    if (ice && isRezzedIce(ice)) {
      addBreakMoves(state, ice, moves);
    }
    moves.push({ kind: "runner.resolveSubroutines" });
    return moves;
  }
  if (run.phase === "movement") {
    // Rule 6.9.4c / 6.6.3: during the movement phase the Runner may jack out
    // or continue (pass the ice / approach the server).
    moves.push({ kind: "runner.continueRun" });
    moves.push({ kind: "runner.jackOut" });
    return moves;
  }
  return moves;
}

/** Icebreaker break/pump options during an encounter. */
function addBreakMoves(state: GameState, ice: CardInstance, moves: Move[]): void {
  const subs = behaviors.get(ice.cardId)?.subroutines ?? [];
  const unbroken = subs.map((_, i) => i).filter((i) => {
    const run = state.run!;
    return !run.broken.includes(i) && !run.resolved.includes(i);
  });
  if (unbroken.length === 0) return;
  const iceStrength = currentIceStrength(state, ice);

  for (const program of state.runner.installed) {
    if (!isIcebreaker(program)) continue;
    const strengthOk = currentIceStrength(state, program) >= iceStrength;
    for (const subIndex of unbroken) {
      // Bran 1.0: lose [click] to break 1 subroutine; any installed icebreaker,
      // no strength requirement.
      if (ice.cardId === "bran_1_0") {
        if (state.runner.clicks >= 1) {
          moves.push({
            kind: "runner.breakSubroutine",
            programId: program.id,
            subIndex,
          });
        }
        continue;
      }
      if (strengthOk) {
        const breakDef = behaviors.get(program.cardId)?.breakAbility;
        const cost = breakDef?.creditCost ?? 1;
        const breaks = breakDef?.breaks ?? [];
        const iceSubtypes = cardDef(ice.cardId).subtypes;
        const canBreak = breaks.length === 0 || iceSubtypes.some((s) => breaks.includes(s));
        if (canBreak && availableCredits(state, "runner") >= cost) {
          moves.push({
            kind: "runner.breakSubroutine",
            programId: program.id,
            subIndex,
          });
        }
      }
    }
    // Pump.
    const pumpDef = behaviors.get(program.cardId)?.pumpAbility;
    if (pumpDef && availableCredits(state, "runner") >= pumpDef.creditCost) {
      moves.push({ kind: "runner.pumpIcebreaker", programId: program.id });
    }
  }
}

/** Strength of an ice/icebreaker, including static modifiers. */
function currentIceStrength(state: GameState, card: CardInstance): number {
  const printed = cardDef(card.cardId).strength ?? 0;
  let extra = card.strengthBoost ?? 0;
  if (card.cardId === "unity") {
    // Unity's +X is static (not a pump): its strength equals installed icebreakers.
    const count = state.runner.installed.filter((c) => isIcebreaker(c)).length;
    extra = count - 1; // printed strength 1 already counted
  }
  if (card.cardId === "palisade" && (card.server?.startsWith("remote-") ?? false)) {
    return printed + 2 + (card.strengthBoost ?? 0);
  }
  return printed + extra;
}

function breachMoves(state: GameState, playerSide: PlayerSide): Move[] {
  const moveList: Move[] = [];
  if (playerSide === "corp") {
    // Corp decisions during a breach come through prompts.
    return moveList;
  }
  const breach = state.breach!;
  if (breach.accessing) return moveList; // access-decision prompt handles this
  // Enumeration must stay pure (no PRNG advance): candidate lists are computed
  // without sampling. applyMove's accessRandom handler performs the actual
  // random selection, and the same move is validated there via sameMove.
  const specific = specificAccessCandidates(state);
  const randomCount = randomAccessCandidateCount(state);
  const total = specific.length + randomCount;
  if (total === 0) return moveList;
  if (total === 1) return moveList; // auto-selected by settle
  for (const id of specific) {
    moveList.push({ kind: "runner.accessCard", targetId: id });
  }
  if (randomCount > 0) {
    moveList.push({ kind: "runner.accessRandom" });
  }
  return moveList;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function addAbilityMoves(
  state: GameState,
  side: PlayerSide,
  cards: CardInstance[],
  moves: Move[],
): void {
  for (const card of cards) {
    const abilityCount = behaviors.get(card.cardId)?.paidAbilities?.length ?? 0;
    if (supportStatus(card.cardId) === "unsupported") continue;
    for (let i = 0; i < abilityCount; i++) {
      const legality = abilityLegality(state, side, card, i);
      if (!legality.ok) continue;
      const servers = serversForAbility(state, card, i);
      if (servers.length > 0) {
        for (const server of servers) {
          moves.push(
            { kind: `${side}.ability`, targetId: card.id, abilityIndex: i, server } as Move,
          );
        }
      } else {
        moves.push({ kind: `${side}.ability`, targetId: card.id, abilityIndex: i } as Move);
      }
    }
  }
}

/** All Corp cards installed in servers (root cards and ice). */
function corpInstalledCardsLocal(state: GameState): CardInstance[] {
  return state.servers.flatMap((s) => [...s.root, ...s.ice]);
}

function combinations(ids: string[], size: number): string[][] {
  if (size <= 0) return [[]];
  if (size > ids.length) return [];
  const result: string[][] = [];
  const list = [...ids].sort();
  const walk = (start: number, chosen: string[]): void => {
    if (chosen.length === size) {
      result.push([...chosen]);
      return;
    }
    for (let i = start; i < list.length; i++) {
      chosen.push(list[i]!);
      walk(i + 1, chosen);
      chosen.pop();
    }
  };
  walk(0, []);
  return result;
}

export {};
