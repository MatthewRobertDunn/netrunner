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
  /** Indices of subroutines broken during the current encounter. */
  brokenSubroutines?: number[];
  /** True when the card is known to the runner via a prior access this breach. */
  faceup?: boolean;
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
export type TurnPhase = "mulligans" | "draw" | "action" | "discard" | "game-over";

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
  /** Extra random accesses during breach (Jailbreak). */
  extraAccess?: number;
  /** Manegarm Skunkworks toll has been satisfied this run. */
  tollPaid?: boolean;
  /** True while a choice prompt is gating a subroutine's remaining resolution. */
  awaitingChoice?: boolean;
  /** Subroutine index to resume after a runner choice (Karuna). */
  resumeSubIndex?: number;
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
  | { kind: "corp-draw"; amount: number }
  | { kind: "corp-install-ice-inward"; iceId: CardInstanceId; targetId: CardInstanceId }
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
  rezzed?: boolean;
  advancement?: number;
  hostedCredits?: number;
  strength?: number;
  iceIndex?: number;
  zone: Zone;
  server?: ServerId;
}

export interface PlayerView {
  viewer: PlayerSide;
  turn: GameState["turn"];
  winner: PlayerSide | "draw" | null;
  agendaPointTarget: number;
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
  };
  run: {
    server: ServerId;
    phase: RunPhase;
    position: number | null;
    currentIce?: ViewCard;
    broken: number[];
  } | null;
  breach: {
    server: ServerId;
    randomAccessLimit: number;
    remaining: number;
    accessing?: ViewCard;
  } | null;
  prompts: Prompt[];
  events: GameEvent[];
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
  // Approach toll (Manegarm Skunkworks)
  | { kind: "runner.payToll"; method: "credits" | "clicks" }
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

/** Returned when a move is not legal; the original state is untouched. */
export interface IllegalMove {
  kind: "illegal-move";
  reason: string;
  move: Move;
}

// ---------------------------------------------------------------------------
// Public game status (rule 1.10)
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
  /** Actionable prompts (both players see the prompt text; only the active player may answer). */
  prompts: Prompt[];
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
  /** Cards in the server's root, hidden when unrezzed Corp cards (rule 1.10). */
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
  applyMove(state: GameState, player: PlayerSide, move: Move): ApplyMoveResult | IllegalMove;
  /** Public game status (rule 1.10): same value for either viewer. */
  getPublicGameStatus(state: GameState): PublicGameStatus;
  /** Public game status as seen by `viewer`; Corp may see its own installed card ids. */
  getPublicGameStatusFor(state: GameState, viewer: PlayerSide): PublicGameStatus;
  getPlayerView(state: GameState, player: PlayerSide): PlayerView;
}
