/**
 * Core public and internal types for the Netrunner Engine.
 *
 * All game state is plain, JSON-serializable data. The engine applies moves to
 * deep copies of state, so a rejected move can never partially mutate the
 * original state.
 */

// ---------------------------------------------------------------------------
// Basic identifiers
// ---------------------------------------------------------------------------

export type PlayerSide = "corp" | "runner";

/** NetrunnerDB card id, e.g. "hedge_fund". */
export type CardId = string;

/** Unique per-game card instance id, e.g. "corp-12". */
export type CardInstanceId = string;

export type ServerId = "hq" | "rd" | "archives" | `remote-${number}`;

// ---------------------------------------------------------------------------
// Deck configuration
// ---------------------------------------------------------------------------

export interface DeckEntry {
  cardId: CardId;
  count: number;
}

export interface DeckConfig {
  identity: CardId;
  cards: DeckEntry[];
  /** Exact top-to-bottom order for deterministic tests or custom scenarios. */
  orderedCards?: CardId[];
}

export interface GameConfig {
  corp: DeckConfig;
  runner: DeckConfig;
  mode: "starter-decks" | "open-play";
  seed?: number;
  agendaPointTarget?: number;
  /** When false (default) both players decline mulligans automatically. */
  allowMulligan?: boolean;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type DeckValidationIssueCode =
  | "unknown-card"
  | "unknown-identity"
  | "identity-side-mismatch"
  | "identity-count"
  | "invalid-count"
  | "over-deck-limit"
  | "under-minimum-deck-size"
  | "over-influence-limit"
  | "not-in-supported-cards"
  | "ordered-deck-mismatch"
  | "empty-deck";

export interface DeckValidationIssue {
  code: DeckValidationIssueCode;
  message: string;
  cardId?: CardId;
}

export interface DeckValidationResult {
  valid: boolean;
  issues: DeckValidationIssue[];
}

// ---------------------------------------------------------------------------
// Card instances and zones
// ---------------------------------------------------------------------------

export type Zone =
  | "identity"
  | "hand"
  | "deck"
  | "discard"
  | "score"
  | "play-area"; // installed corp or runner cards (server placement in `server`)

export interface CardInstance {
  id: CardInstanceId;
  cardId: CardId;
  owner: PlayerSide;
  zone: Zone;

  /** Server this card is installed in (corp cards). */
  server?: ServerId;
  /**
   * For ice: 0 is the innermost piece (closest to the server), higher indices
   * are further out. Undefined for root cards.
   */
  iceIndex?: number;
  /** Corp cards: rezzed status. Runner installed cards are always active. */
  rezzed?: boolean;
  /** Advancement counters (agendas, advanceable assets). */
  advancement?: number;
  /** Credits/other counters loaded onto the card ("load" / hosted credits). */
  hostedCredits?: number;
  /** Temporary strength boost gained this encounter (icebreakers). */
  strengthBoost?: number;
}

export interface ServerState {
  id: ServerId;
  /** Root cards: upgrades, one asset/agenda for remotes. */
  root: CardInstance[];
  /** Ice protecting the server. ice[0] is innermost. */
  ice: CardInstance[];
}
// ---------------------------------------------------------------------------
// Runs and breaches
// ---------------------------------------------------------------------------

/** The phases a turn can be in (rule 5.3-5.7). */
export type TurnPhase = "mulligans" | "action" | "discard" | "game-over";

export type RunPhase =
  | "initiation"
  | "approach-ice"
  | "encounter-ice"
  | "movement"
  | "success"
  | "run-ends";

export interface RunState {
  server: ServerId;
  /** Index into server.ice of the ice at the Runner's position; null = at the server. */
  position: number | null;
  phase: RunPhase;
  /** Instance id of the ice being approached/encountered, if any. */
  currentIceId?: CardInstanceId;
  /** Subroutine indices already broken during the current encounter. */
  broken: number[];
  /** Subroutine indices resolved during the current encounter. */
  resolved: number[];
  successful: boolean;
  unsuccessful: boolean;
  /** True once the Runner has had the chance to jack out during movement. */
  jackOutOffered?: boolean;
  /** Ability/card that initiated this run (e.g. "jailbreak", "red_team"). */
  source?: string;
  /** Credits available only during this run (Overclock). */
  fundCredits?: number;
  /** Rez cost increase for ice during this run (Tread Lightly). */
  rezCostIncrease?: number;
  /** Manegarm Skunkworks toll has been satisfied this run. */
  tollPaid?: boolean;
  /** Encounter has begun for the current approach (guards duplicate logs). */
  encounterStarted?: boolean;
}

export interface BreachState {
  server: ServerId;
  /** Random access limit for HQ/R&D breaches (rule 7.3.5). */
  randomAccessLimit: number;
  /** Number of random (hand/deck) accesses used so far. */
  randomAccessesUsed: number;
  /** Instance ids already chosen for access during this breach. */
  chosen: CardInstanceId[];
  /** The card currently being accessed, awaiting the access prompt. */
  accessing?: CardInstanceId;
}

// ---------------------------------------------------------------------------
// Prompts (pending player decisions)
// ---------------------------------------------------------------------------

/** Effect carried by a prompt option; applied by the move resolver. */
export type ChoiceEffect =
  | { kind: "no-op" }
  | { kind: "end-run" }
  | { kind: "pay-toll-credits" }
  | { kind: "pay-toll-clicks" }
  | { kind: "rez-card-free"; targetId: CardInstanceId }
  | { kind: "rez-card-paid"; targetId: CardInstanceId }
  | { kind: "corp-draw"; amount: number }
  | { kind: "corp-install-ice-inward"; iceId: CardInstanceId; targetId: CardInstanceId }
  | { kind: "place-2-advancement"; targetId: CardInstanceId }
  | { kind: "runner-take-3-red-team" };

export interface PromptOption {
  id: string;
  label: string;
  targetId?: CardInstanceId;
  /** Credit cost paid when this option is chosen. */
  creditCost?: number;
  /** Clicks spent when this option is chosen. */
  clickCost?: number;
  effect?: ChoiceEffect;
}

export type Prompt =
  | {
    kind: "mulligan";
    id: number;
    player: PlayerSide;
  }
  | {
    kind: "discard";
    id: number;
    player: PlayerSide;
    count: number;
  }
  | {
    /** Corp rez window during a run: rez any of the offered cards or pass. */
    kind: "rez-window";
    id: number;
    player: "corp";
    options: PromptOption[];
  }
  | {
    /** Generic choose-one prompt for one player. */
    kind: "choose-one";
    id: number;
    player: PlayerSide;
    title: string;
    options: PromptOption[];
  }
  | {
    /** Access decision: pay the trash cost to trash, or finish the access. */
    kind: "access-decision";
    id: number;
    player: "runner";
    cardId: CardInstanceId;
  };

/**
 * A redacted prompt, safe to show to players who are not its owner: the kind,
 * the id, and whose decision it is, with every option/param that can carry
 * hidden information (option labels naming unrezzed cards, counts, targetIds,
 * cardIds) removed. Used by `PlayerView` for opponent prompts and by
 * `PublicGameStatus` for all prompts.
 */
export interface PromptStub {
  kind: Prompt["kind"];
  id: number;
  player: PlayerSide;
}

// ---------------------------------------------------------------------------
// Game events (structured log of what happened)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: "game-started" }
  | { type: "mulligan"; player: PlayerSide; taken: boolean }
  | { type: "turn-start"; player: PlayerSide; turn: number }
  | { type: "turn-end"; player: PlayerSide; turn: number }
  | { type: "mandatory-draw"; player: PlayerSide }
  | { type: "draw"; player: PlayerSide; count: number }
  | { type: "gain-credits"; player: PlayerSide; amount: number }
  | { type: "lose-credits"; player: PlayerSide; amount: number }
  | { type: "spend-credits"; player: PlayerSide; amount: number }
  | { type: "spend-clicks"; player: PlayerSide; amount: number }
  | { type: "gain-clicks"; player: PlayerSide; amount: number }
  | { type: "lose-clicks"; player: PlayerSide; amount: number }
  | { type: "load-credits"; targetId: CardInstanceId; amount: number }
  | { type: "take-credits"; targetId: CardInstanceId; amount: number; player: PlayerSide }
  | { type: "install"; cardId: CardInstanceId; player: PlayerSide; server?: ServerId }
  | { type: "play"; cardId: CardInstanceId; player: PlayerSide }
  | { type: "rez"; cardId: CardInstanceId }
  | { type: "derez"; cardId: CardInstanceId }
  | { type: "advance"; cardId: CardInstanceId; amount: number }
  | { type: "score"; cardId: CardInstanceId; points: number }
  | { type: "steal"; cardId: CardInstanceId; points: number }
  | { type: "trash"; cardId: CardInstanceId; from: string }
  | { type: "discard"; cardId: CardInstanceId; player: PlayerSide }
  | {
    type: "damage";
    player: PlayerSide;
    amount: number;
    kind: "net" | "meat" | "core";
    trashed: CardInstanceId[];
  }
  | { type: "flatline" }
  | { type: "decked"; player: PlayerSide }
  | { type: "run-start"; server: ServerId; source?: string }
  | { type: "approach-ice"; cardId: CardInstanceId }
  | { type: "encounter-ice"; cardId: CardInstanceId }
  | { type: "break-subroutine"; cardId: CardInstanceId; subIndex: number }
  | { type: "resolve-subroutine"; cardId: CardInstanceId; subIndex: number }
  | { type: "pass-ice"; cardId: CardInstanceId }
  | { type: "jack-out" }
  | { type: "run-successful"; server: ServerId }
  | { type: "run-unsuccessful"; server: ServerId }
  | { type: "run-end"; server: ServerId; successful: boolean }
  | { type: "breach"; server: ServerId }
  | { type: "access"; cardId: CardInstanceId; server: ServerId }
  | { type: "pump-strength"; cardId: CardInstanceId; amount: number }
  | { type: "game-end"; winner: PlayerSide | "draw"; reason: string };

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export interface PlayerState {
  side: PlayerSide;
  identity: CardInstance;
  credits: number;
  clicks: number;
  hand: CardInstance[];
  /** deck[0] is the top of the deck. */
  deck: CardInstance[];
  discard: CardInstance[];
  score: CardInstance[];
  /** Runner: hardware, programs, resources. Corp: normally empty (uses servers). */
  installed: CardInstance[];
  baseHandSize: number;
  maxHandSizeMod: number;
  memoryLimitMod: number;
  tags: number;
  agendaPoints: number;
  /** Instance ids of cards this player installed during the current turn. */
  installedThisTurn: CardInstanceId[];
  /** True once a basic draw happened this turn (Verbal Plasticity). */
  basicDrawThisTurn: boolean;
  /** True once a successful run happened this turn (Carmen discount). */
  successfulRunThisTurn: boolean;
  /** Central servers run this turn (Red Team restriction). */
  ranServersThisTurn: ServerId[];
  /** Number of HQ breaches this turn (Docklands Pass). */
  hqBreachesThisTurn: number;
  /** Once-per-turn ability tracking, keyed `${instanceId}:${abilityIndex}`. */
  usedOncePerTurn: string[];
  /** Credits banked for the next run this turn (Overclock). */
  pendingRunFund: number;
}

export interface GameState {
  /** Monotonic counter for prompts. */
  nextPromptId: number;
  turn: {
    number: number;
    player: PlayerSide;
    phase: TurnPhase;
  };
  corp: PlayerState;
  runner: PlayerState;
  /**
   * All servers, central and remote, in a uniform shape. The three central
   * servers (hq, rd, archives) always exist; remotes are created on demand.
   * Only breach/access behaviour differs between central and remote servers.
   */
  servers: ServerState[];
  run: RunState | null;
  breach: BreachState | null;
  prompts: Prompt[];
  /** Structured event log (newest last). */
  log: GameEvent[];
  /** Seeded PRNG state; advancing it keeps games deterministic. */
  rngState: number;
  /**
   * How draws resolve. The real game always draws from the top of the deck —
   * deck order is hidden information (rules 10.2.2, 4.3.4) and neither player
   * knows it. AI simulations set this to `"random"` so a playout can't exploit
   * a specific draw order the search memorised; the multiset of cards in the
   * opponent's deck is still visible, which is an accepted concession.
   */
  drawMode: "top" | "random";
  agendaPointTarget: number;
  winner: PlayerSide | "draw" | null;
  winReason: string | null;
  mode: "starter-decks" | "open-play";
  /** Cards whose support status is "partial"; events explain what was skipped. */
  supportWarnings: string[];
}

// ---------------------------------------------------------------------------
// Player view (safe projection)
// ---------------------------------------------------------------------------

export interface ViewCard {
  id: CardInstanceId;
  /** Card definition id; hidden information is replaced by "hidden". */
  cardId: CardId | "hidden";
  /** Whose card this is — always open information (rule 10.2). */
  owner: PlayerSide;
  rezzed?: boolean;
  advancement?: number;
  hostedCredits?: number;
  /** Printed strength. Hidden together with the card id (it fingerprints the
   * card; rules 10.2.2, 4.6.3). Temporary pumps ride in `strengthBoost`. */
  strength?: number;
  /** Temporary strength boost gained this encounter (icebreakers) — an open
   * counter (rule 10.2), suppressed for cards whose id is hidden. */
  strengthBoost?: number;
  /**
   * Legacy stack-position field. The current engine never assigns it (ice
   * position is carried by array order and exposed as `position`), so it is
   * always undefined in views produced today; kept for shape compatibility.
   * Never use it as an ice-vs-root discriminator, and beware that `0` would
   * be falsy anyway — test `!== undefined`.
   */
  iceIndex?: number;
  /**
   * Open physical placement inside the server (rule 4.6.2): "ice" for a card
   * in the server's ice stack, "root" for a card in the server root;
   * undefined away from servers. This is the authoritative ice-vs-root
   * discriminator. It deliberately reveals placement without revealing type:
   * rule 4.6.6f keeps the TYPE of a root card (asset vs agenda vs upgrade)
   * hidden — only ice-vs-root is open.
   */
  position?: "ice" | "root";
  zone: Zone;
  server?: ServerId;
}

/**
 * A player's within-turn progress. Every field here is open information
 * (rule 10.2): installs, draws, runs, breaches, and ability activations are
 * announced actions, and banked run funds derive from a played (announced)
 * event. The viewer is entitled to these for both sides — which is also what
 * lets the engine reconstruct a hypothetical state from the view alone.
 */
export interface PlayerTurnState {
  /** Instance ids this player installed during the current turn (rule 4.6.2). */
  installedThisTurn: CardInstanceId[];
  /** True once this player took a basic draw action this turn (Verbal Plasticity). */
  basicDrawThisTurn: boolean;
  /** True once this player made a successful run this turn (Carmen). */
  successfulRunThisTurn: boolean;
  /** Central servers this player ran this turn (Red Team / recon restrictions). */
  ranServersThisTurn: ServerId[];
  /** HQ breaches this player made this turn (Docklands Pass). */
  hqBreachesThisTurn: number;
  /** Once-per-turn ability activations, keyed `${instanceId}:${abilityIndex}`. */
  usedOncePerTurn: string[];
  /** Credits banked for the next run this turn (Overclock). */
  pendingRunFund: number;
}

export interface PlayerView {
  viewer: PlayerSide;
  turn: GameState["turn"];
  winner: PlayerSide | "draw" | null;
  winReason: string | null;
  agendaPointTarget: number;
  /** Game format — public (both players know what they sat down to play). */
  mode: GameState["mode"];
  corp: {
    credits: number;
    clicks: number;
    handSize: number;
    handCount: number;
    deckCount: number;
    discardCount: number;
    agendaPoints: number;
    tags: number;
    identity: ViewCard;
    score: ViewCard[];
    /** All installed corp cards with open info; unrezzed cardIds are hidden. */
    installed: ViewCard[];
    /**
     * The Corp's hand. Populated with real card ids for the Corp viewer only
     * (a player may look at their own hand, rule 4.3.2); every other viewer
     * gets `[]` and reads `handCount` instead (rule 4.3.4).
     */
    hand: ViewCard[];
    /**
     * The Corp's discard pile (Archives). Real card ids for the Corp viewer
     * (rules 4.4.6c/1.21.2a: facedown Archives cards are examined by the
     * player controlling them). For any other viewer every entry carries
     * `cardId: "hidden"`: this engine does not yet model which Archives cards
     * are faceup vs facedown (see the TODO in `moveCardTo`, src/engine/state.ts),
     * so it conservatively hides the whole pile from the Runner rather than
     * leaking facedown cards. Documented deviation, not a rules claim.
     */
    discard: ViewCard[];
    turnState: PlayerTurnState;
  };
  runner: {
    credits: number;
    clicks: number;
    handSize: number;
    handCount: number;
    deckCount: number;
    discardCount: number;
    agendaPoints: number;
    identity: ViewCard;
    score: ViewCard[];
    installed: ViewCard[];
    /**
     * The Runner's hand: real card ids for the Runner viewer (rule 4.3.2),
     * `[]` for anyone else.
     */
    hand: ViewCard[];
    /**
     * The Runner's discard heap: open information to every viewer
     * (rule 4.4.7b — the heap is public).
     */
    discard: ViewCard[];
    /** Tags are always public information (rule 10.2). */
    tags: number;
    turnState: PlayerTurnState;
  };
  run: {
    server: ServerId;
    phase: RunPhase;
    position: number | null;
    currentIce?: ViewCard;
    broken: number[];
    /** Subroutine indices already resolved this encounter (open, rule 10.2). */
    resolved: number[];
    /** What started the run, e.g. "jailbreak" (announced at run-start). */
    source?: string;
    /** Credits banked on this run (Overclock) — public credit information. */
    fundCredits?: number;
    /** Rez-cost increase on ice this run (Tread Lightly). */
    rezCostIncrease?: number;
    /** The Manegarm Skunkworks approach toll has been satisfied this run. */
    tollPaid?: boolean;
  } | null;
  breach: {
    server: ServerId;
    randomAccessLimit: number;
    remaining: number;
    /**
     * Instance ids already accessed during this breach. Accesses are public
     * actions (rules 7.3, 10.2); the ids let a viewer reconstruct which
     * candidates remain without revealing any card identity.
     */
    chosen: CardInstanceId[];
    accessing?: ViewCard;
  } | null;
  /** Pending prompts, per-viewer: the owner gets the full prompt, anyone else
   * gets a `PromptStub` saying whose decision it is. */
  prompts: (Prompt | PromptStub)[];
  /** Event log, redacted per viewer (hidden card ids become "hidden"). */
  events: GameEvent[];
  /** Non-fatal notices about partially supported card effects. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// AI information boundary (rules 10.2, 1.21, 4.2.2, 4.3.2)
// ---------------------------------------------------------------------------

/**
 * What an AI may know beyond its `PlayerView` when making a decision:
 * definition-id multisets of hidden cards plus a seed. Nothing else.
 *
 * The context carries NO instance-level information beyond what the view
 * already shows — no zones, no placement, no instance ids, no order. Both
 * arrays are canonical sorted multisets ("bags"): a player knows the
 * *composition* of hidden zones (this is a decklist-format game) but never
 * their order (rules 4.2.2, 4.3.4), so the arrays must be treated as
 * unordered. The seed is derived by the trusted shell per decision; an AI
 * never sees `state.rngState`.
 */
export interface AIDecisionContext {
  /** The deciding player. */
  side: PlayerSide;
  /**
   * Multiset (sorted) of the deciding player's own remaining deck, by
   * definition id. Known from their decklist minus everything that has left
   * the deck; the order is hidden (rule 4.2.2).
   */
  ownDeck: CardId[];
  /**
   * Multiset (sorted) of every hidden card identity the deciding player does
   * NOT know: the opponent's hand, the opponent's remaining deck (accepted
   * multiset concession — decklist game), and every card shown as `cardId:
   * "hidden"` in the view (unrezzed corp installs and facedown Archives for a
   * runner viewer).
   */
  unseen: CardId[];
  /** Per-decision RNG seed, derived by the trusted shell from the true game
   * state. Never reveals the engine's `rngState`. */
  seed: number;
}

/**
 * An AI player under the information boundary (rules 10.2, 1.21, 4.2.2).
 *
 * `chooseMove` receives ONLY a sanitized `PlayerView`, the legal moves
 * computed by the engine, and an `AIDecisionContext` of hidden-card multisets.
 * It never receives a `GameState` — that is enforced by this signature.
 *
 * An AI is free to use the rules engine (`applyMove`, `getLegalMoves`) on
 * hypothetical states it builds itself with `determinize(view, ctx, rng)`;
 * it must return one of `legal`, must not mutate the view, and must not
 * fabricate moves it was not offered.
 */
export interface GameAI {
  /** Short human-readable name, used in test output and tournament logs. */
  readonly name: string;
  /** Pick a move from `legal` for `ctx.side`, seeing only `view` and `ctx`. */
  chooseMove(view: PlayerView, legal: Move[], ctx: AIDecisionContext): Move;
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

/** A typed decision a player can make. Apply it with `applyMove`. */
export type Move =
  // Setup
  | { kind: "mulligan.take"; player: PlayerSide }
  | { kind: "mulligan.decline"; player: PlayerSide }
  // Discard phase
  | { kind: "discard"; player: PlayerSide; cardInstanceIds: CardInstanceId[] }
  // Corp basic actions
  | { kind: "corp.gainCredits" }
  | { kind: "corp.draw" }
  | { kind: "corp.install"; cardId: CardId; server: ServerId | "new-remote" }
  | { kind: "corp.playOperation"; cardId: CardId; targetId?: CardInstanceId }
  | { kind: "corp.advance"; targetId: CardInstanceId }
  | { kind: "corp.score"; targetId: CardInstanceId }
  | { kind: "corp.rez"; targetId: CardInstanceId }
  | { kind: "corp.ability"; targetId: CardInstanceId; abilityIndex: number; server?: ServerId }
  // Runner basic actions
  | { kind: "runner.gainCredits" }
  | { kind: "runner.draw" }
  | { kind: "runner.install"; cardId: CardId }
  | { kind: "runner.playEvent"; cardId: CardId; server?: ServerId }
  | { kind: "runner.run"; server: ServerId }
  | { kind: "runner.ability"; targetId: CardInstanceId; abilityIndex: number; server?: ServerId }
  // Run interaction
  | { kind: "runner.continueRun" }
  | { kind: "runner.jackOut" }
  | { kind: "runner.breakSubroutine"; programId: CardInstanceId; subIndex: number }
  | { kind: "runner.pumpIcebreaker"; programId: CardInstanceId }
  | { kind: "runner.bioroidBreak"; iceId: CardInstanceId; subIndex: number }
  | { kind: "runner.resolveSubroutines" }
  // Access decisions
  | { kind: "runner.accessCard"; targetId: CardInstanceId }
  | { kind: "runner.accessRandom" }
  | { kind: "runner.trashAccessed" }
  | { kind: "runner.finishAccess" }
  // Answers to pending prompts (generic; the option carries the effect)
  | { kind: "prompt.answer"; player: PlayerSide; promptId: number; optionId: string };

// ---------------------------------------------------------------------------
// Apply result
// ---------------------------------------------------------------------------

export interface ApplyMoveResult {
  /** Discriminator so callers can narrow without `in` checks. */
  kind: "applied";
  state: GameState;
  /** Events produced by this move (subset of the full log). */
  events: GameEvent[];
  /** Non-fatal notices, e.g. partially supported card effects. */
  warnings: string[];
}

/**
 * Options for `applyMove`. AI simulations that own their own state can pass
 * `mutate: true` to skip the defensive copy — the dominant cost in a
 * Monte-Carlo search. Callers must not reuse the original state afterwards.
 */
export interface ApplyMoveOptions {
  mutate?: boolean;
}

/** Returned when a move is not legal; the original state is untouched. */
export interface IllegalMove {
  kind: "illegal-move";
  reason: string;
  move: Move;
}

// ---------------------------------------------------------------------------
// Public game status (rules 10.2.2/10.2.3)
// ---------------------------------------------------------------------------

/**
 * A pure public-knowledge snapshot: every field here is information that both
 * players are always entitled to see, regardless of who is asking. Because
 * the DTO deliberately excludes hidden information (opponent hand/deck card
 * identities, unrezzed Corp card ids), `getPublicGameStatus(state)` returns the
 * same value for either viewer.
 */
export interface PublicGameStatus {
  turn: { number: number; player: PlayerSide; phase: TurnPhase };
  winner: PlayerSide | "draw" | null;
  winReason: string | null;
  agendaPointTarget: number;
  /** The two players' publicly visible resources. */
  players: Record<PlayerSide, PublicPlayerStatus>;
  /** Servers the Corp has installed cards in. */
  servers: PublicServerStatus[];
  /** The current run, if any (public: server, position, rezzed ice). */
  run: PublicRunStatus | null;
  /** The current breach, if any (public: server, whether a card is being accessed). */
  breach: PublicBreachStatus | null;
  /** Pending prompts, redacted to stubs for every viewer: option labels can
   * name hidden cards, so the shared DTO only says a decision is pending. */
  prompts: PromptStub[];
  /** Non-fatal notices about partially supported card effects. */
  warnings: string[];
}

export interface PublicPlayerStatus {
  side: PlayerSide;
  credits: number;
  clicks: number;
  tags: number;
  agendaPoints: number;
  handCount: number;
  handSize: number;
  deckCount: number;
  discardCount: number;
  /** Always public: the identity card and every scored agenda. */
  identity: ViewCard;
  score: ViewCard[];
  /** Installed Runner cards are always public. Installed Corp cards are only
   * public to the Corp; to the Runner they appear as counts per server. */
  installed: ViewCard[];
}

export interface PublicServerStatus {
  id: ServerId;
  /** Cards in the server's root, hidden when unrezzed Corp cards (rules 4.6.2/4.6.3). */
  root: ViewCard[];
  /** Rezzed ice protecting the server, outermost last. */
  ice: ViewCard[];
  /** Number of unrezzed ice protecting this server (public to both players). */
  unrezzedIceCount: number;
}

export interface PublicRunStatus {
  server: ServerId;
  phase: RunPhase;
  position: number | null;
  /** Rezzed ice at the Runner's current position (public). */
  currentIce: ViewCard | null;
  brokenSubroutines: number[];
}

export interface PublicBreachStatus {
  server: ServerId;
  randomAccessLimit: number;
  randomAccessesUsed: number;
  /** True while a card is being accessed (the card id itself is public only
   * once accessed, but its existence is always public). */
  accessing: boolean;
}

// ---------------------------------------------------------------------------
// Engine facade
// ---------------------------------------------------------------------------

export interface GameEngine {
  validateDeck(deck: DeckConfig, side: PlayerSide, mode?: GameConfig["mode"]): DeckValidationResult;
  startGame(config: GameConfig): GameState;
  getLegalMoves(state: GameState, player: PlayerSide): Move[];
  /** Apply a legal move, or get a structured `IllegalMove` explanation. */
  applyMove(
    state: GameState,
    player: PlayerSide,
    move: Move,
    opts?: ApplyMoveOptions,
  ): ApplyMoveResult | IllegalMove;
  /** Public game status (rules 10.2.2/10.2.3): same value for either viewer. */
  getPublicGameStatus(state: GameState): PublicGameStatus;
  /** Public game status as seen by `viewer`; Corp may see its own installed card ids. */
  getPublicGameStatusFor(state: GameState, viewer: PlayerSide): PublicGameStatus;
  getPlayerView(state: GameState, player: PlayerSide): PlayerView;
}
