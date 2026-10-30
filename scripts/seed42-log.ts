/** Play seed 42 with the AI; verify every installed card lands in a server. */
import { engine, makeAIDecisionContext, RandomAI, starterDeckConfigs } from "../src/mod.ts";
import type { CardInstance, GameState, Move, PlayerSide } from "../src/types.ts";

const ai = new RandomAI();
const decks = starterDeckConfigs();
let state = engine.startGame({
  corp: decks.corp,
  runner: decks.runner,
  mode: "starter-decks",
  seed: 42,
});

/** Where a card instance lives — "LOST" means it is nowhere it should be. */
function locate(st: GameState, id: string): string {
  const corpLists: [string, CardInstance[]][] = [
    ["corp.hand", st.corp.hand],
    ["corp.deck", st.corp.deck],
    ["corp.discard", st.corp.discard],
  ];
  for (const [name, list] of corpLists) {
    if (list.some((c) => c.id === id)) return name;
  }
  for (const s of st.servers) {
    if (s.ice.some((c) => c.id === id)) return `${s.id}.ice`;
    if (s.root.some((c) => c.id === id)) return `${s.id}.root`;
  }
  if (st.runner.installed.some((c) => c.id === id)) return "runner.installed";
  for (
    const list of [
      st.runner.hand,
      st.runner.deck,
      st.runner.discard,
      st.runner.score,
      st.corp.score,
    ]
  ) {
    if (list.some((c) => c.id === id)) return "other";
  }
  return "LOST";
}

/** Every card instance that should exist somewhere in the game. */
function allInstanceIds(st: GameState): Set<string> {
  const ids = new Set<string>();
  for (const p of [st.corp, st.runner]) {
    for (const list of [p.hand, p.deck, p.discard, p.score, p.installed, [p.identity]]) {
      for (const c of list) ids.add(c.id);
    }
  }
  for (const s of st.servers) {
    for (const c of [...s.root, ...s.ice]) ids.add(c.id);
  }
  return ids;
}

let installs = 0;
let lost = 0;
let moves = 0;
while (!state.winner && moves < 400) {
  const actor: PlayerSide = state.prompts[0]?.player ?? state.turn.player;
  const legal = engine.getLegalMoves(state, actor);
  if (legal.length === 0) break;
  const view = engine.getPlayerView(state, actor);
  const ctx = makeAIDecisionContext(state, actor, (state.rngState ^ (moves + 1)) | 0);
  const move: Move = legal.length === 1 ? legal[0]! : ai.chooseMove(view, legal, ctx);

  // Track corp installs: the hand instance must end up in a server.
  let tracked: { id: string; server: string } | null = null;
  if (move.kind === "corp.install") {
    const inst = state.corp.hand.find((c) => c.cardId === move.cardId);
    if (inst) tracked = { id: inst.id, server: move.server };
  }

  const result = engine.applyMove(state, actor, move);
  if (result.kind === "illegal-move") {
    console.log(`ILLEGAL MOVE rejected: ${JSON.stringify(move)}`);
    break;
  }
  state = result.state;
  moves++;

  if (tracked) {
    const where = locate(state, tracked.id);
    installs++;
    const ok = where !== "LOST" && where !== "corp.hand";
    if (!ok) lost++;
    console.log(
      `${ok ? "ok " : "BAD"} corp.install -> ${tracked.server}: card ${tracked.id} now at ${where}`,
    );
  }

  // Periodic full sweep for lost cards.
  if (moves % 100 === 0) {
    let missing = 0;
    for (const id of allInstanceIds(state)) {
      const where = locate(state, id);
      if (where === "LOST") missing++;
    }
    if (missing > 0) {
      lost += missing;
      console.log(`BAD: ${missing} cards LOST at move ${moves}`);
    }
  }
}

console.log(
  `moves: ${moves}, installs tracked: ${installs}, lost: ${lost}, winner: ${state.winner}`,
);
if (lost === 0) console.log("SEED 42 VERIFICATION PASSED");
