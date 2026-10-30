/**
 * Random AI: picks uniformly among the legal moves.
 *
 * Under the information boundary (rules 10.2, 4.2.2) it receives only a
 * sanitized `PlayerView`, the legal moves, and an `AIDecisionContext` — it
 * deliberately ignores the view. Its choice is a pure function of the
 * decision seed in `ctx.seed` and the move list: no constructor seed (a game
 * seed would let it recompute the setup shuffle — i.e. the opponent's deck
 * order), no engine `rngState`, and merely *asking* it for a decision cannot
 * perturb the game or depend on anything its player may not see.
 */

import { makeRng } from "../engine/rng.ts";
import type { AIDecisionContext, GameAI, Move, PlayerView } from "../types.ts";

export class RandomAI implements GameAI {
  readonly name = "random";

  chooseMove(_view: PlayerView, legal: Move[], ctx: AIDecisionContext): Move {
    const rng = makeRng(ctx.seed);
    const idx = Math.floor(rng.next() * legal.length);
    return legal[idx] ?? legal[0]!;
  }
}

export const randomAI = new RandomAI();
