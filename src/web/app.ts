/**
 * App root: setup screen + game screen.
 *
 * Owns the game state, applies human moves, and drives the UCT AI whenever
 * it is the Corp's turn to act. The human side is interchangeable by design:
 * `start(humanSide, seed, strength)` takes the side as a parameter, so
 * human-as-Corp (AI as Runner) needs no other change.
 */

import { defineComponent, markRaw, shallowRef } from "npm:vue@3.5.13/dist/vue.esm-bundler.js";
import type { Ref } from "npm:vue@3.5.13/dist/vue.esm-bundler.js";
import { engine, starterDeckConfigs, UctAI } from "../mod.ts";
import type { GameState, Move, PlayerSide } from "../types.ts";
import GameScreen from "./ui/game.ts";

interface StrengthPreset {
  name: string;
  iterations: number;
  timeBudgetMs: number;
}

const PRESETS: StrengthPreset[] = [
  { name: "Casual", iterations: 30, timeBudgetMs: 600 },
  { name: "Normal", iterations: 60, timeBudgetMs: 1200 },
  { name: "Strong", iterations: 140, timeBudgetMs: 2500 },
];

export default defineComponent({
  name: "NetrunnerApp",
  components: { GameScreen },
  setup() {
    /**
     * The engine state is kept in a *shallow* ref: every transition replaces
     * the whole object, and `markRaw` keeps Vue's reactivity system out of
     * the engine's data structures entirely (the AI deep-clones state).
     */
    const state: Ref<GameState | null> = shallowRef(null);
    const humanSide = shallowRef<PlayerSide>("runner");
    const seed = shallowRef(42);
    const strength = shallowRef(1);
    const thinking = shallowRef(false);
    const lastWarning = shallowRef("");
    let aiOption = { iterations: 60, timeBudgetMs: 1200 };
    let ai: UctAI | null = null;

    function start(side: PlayerSide, gameSeed: number, preset: StrengthPreset) {
      const decks = starterDeckConfigs();
      aiOption = { iterations: preset.iterations, timeBudgetMs: preset.timeBudgetMs };
      ai = new UctAI(aiOption);
      humanSide.value = side;
      seed.value = gameSeed;
      thinking.value = false;
      lastWarning.value = "";
      const fresh = engine.startGame({
        corp: decks.corp,
        runner: decks.runner,
        mode: "starter-decks",
        seed: gameSeed,
      });
      state.value = markRaw(fresh);
      planAiTurn();
    }

    /**
     * If the side to move is the AI's, run its decision (asynchronously so
     * the "Corp is thinking…" state renders first) and apply the result.
     */
    function planAiTurn() {
      const s = state.value;
      if (!s || s.winner || !ai) return;
      const actor = s.prompts[0]?.player ?? s.turn.player;
      if (actor === humanSide.value) return;
      thinking.value = true;
      setTimeout(() => {
        const live = state.value;
        if (!live || live !== s || live.winner || !ai) {
          thinking.value = false;
          return;
        }
        const legal = engine.getLegalMoves(live, actor);
        let move;
        try {
          move = legal.length ? ai.chooseMove(live, actor, legal) : null;
        } catch (err) {
          thinking.value = false;
          lastWarning.value = `AI error: ${err instanceof Error ? err.message : String(err)}`;
          return;
        }
        if (!move) {
          thinking.value = false;
          return;
        }
        apply(actor, move, { fromAi: true });
      }, 60);
    }

    function apply(actor: PlayerSide, move: Move, opts: { fromAi?: boolean } = {}) {
      const live = state.value;
      if (!live) return;
      const result = engine.applyMove(live, actor, move);
      if (result.kind === "illegal-move") {
        if (!opts.fromAi) lastWarning.value = `Illegal move: ${result.reason}`;
        return;
      }
      state.value = markRaw(result.state);
      if (result.warnings.length) {
        lastWarning.value = result.warnings[result.warnings.length - 1]!;
      }
      planAiTurn();
    }

    function onMove(move: Move) {
      apply(humanSide.value, move);
    }

    return {
      state,
      humanSide,
      seed,
      strength,
      thinking,
      lastWarning,
      presets: PRESETS,
      started: () => state.value !== null,
      start,
      onMove,
    };
  },
  template: `
    <div class="app-root">
      <template v-if="state">
        <game-screen
          :state="state"
          :human-side="humanSide"
          :thinking="thinking"
          :last-warning="lastWarning"
          @move="onMove"
          @new-game="state = null"
        />
      </template>

      <!-- ================= SETUP SCREEN ================= -->
      <section v-else class="setup" data-testid="setup">
        <h1>Netrunner — CyberClick Starters</h1>
        <p class="tagline">
          Human Runner vs. a UCT Monte-Carlo AI playing the Corp.
          Pick a side, a seed, and the AI's search strength.
        </p>

        <div class="setup-grid">
          <div class="setup-block">
            <h2>You play</h2>
            <div class="row">
              <button class="pick" :class="{ on: humanSide === 'runner' }" @click="humanSide = 'runner'" data-testid="pick-runner">
                <img class="glyph-side" src="assets/svg/faction-criminal.svg" alt="" />
                Runner <span class="dim">(AI plays Corp)</span>
              </button>
              <button class="pick" :class="{ on: humanSide === 'corp' }" @click="humanSide = 'corp'" data-testid="pick-corp">
                <img class="glyph-side" src="assets/svg/faction-hb.svg" alt="" />
                Corp <span class="dim">(AI plays Runner)</span>
              </button>
            </div>
          </div>

          <div class="setup-block">
            <h2>AI strength</h2>
            <div class="row">
              <button
                v-for="(p, i) in presets"
                :key="p.name"
                class="pick"
                :class="{ on: strength === i }"
                @click="strength = i"
              >{{ p.name }} <span class="dim">({{ p.iterations }} iters / {{ p.timeBudgetMs }}ms)</span></button>
            </div>
          </div>

          <div class="setup-block">
            <h2>Seed</h2>
            <div class="row">
              <input class="seed-field" type="number" v-model.number="seed" data-testid="seed" />
              <button class="ghost-btn" @click="seed = Math.floor(Math.random() * 100000)">Random</button>
            </div>
          </div>
        </div>

        <button class="start-btn" @click="start(humanSide, seed, presets[strength])" data-testid="start-game">
          Start game
        </button>
      </section>
    </div>
  `,
});
