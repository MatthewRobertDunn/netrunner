/**
 * Card behavior definitions.
 *
 * Printed rules text is stored in the catalogue for reference; behavior is
 * defined here as typed data that the rules engine interprets. Never parse
 * English card text at runtime.
 *
 * The engine NEVER compares a card id string (`cardId === "..."`) to decide a
 * rule: it looks the card up here and consults the typed hook. A card with a
 * new engine-level rule is implemented by adding the hook to its entry — the
 * engine stays generic. Hooks fall into three groups:
 *
 *  - keyword hooks (`subroutines`, `breakAbility`, `pumpAbility`,
 *    `staticStrength`) — ice, icebreaker and virtual-card behaviors;
 *  - ability/trigger hooks (`paidAbilities`, `triggers`) — announced abilities
 *    and delayed/activated abilities the engine dispatches at a fixed point;
 *  - effect hooks (`operationEffect`, `eventEffect`) — what playing the card
 *    resolves beyond paying its cost.
 *
 * Support status:
 *  - "supported": the effect is fully implemented.
 *  - "partial": implemented with a documented simplification (see the note).
 *  - "unsupported": the engine refuses to use the card and reports why.
 */

export type SupportStatus = "supported" | "partial" | "unsupported";

export interface SubroutineDef {
  id: string;
  kind:
    | "net-damage"
    | "gain-credits"
    | "lose-credits"
    | "end-run"
    | "net-damage-then-optional-jack-out"
    | "diviner-damage"
    | "lose-credits-then-conditional-end-run"
    | "install-ice-inward";
  amount?: number;
  /** For lose-credits-then-conditional-end-run: runner credits threshold. */
  creditsAtMost?: number;
}

export interface BreakAbilityDef {
  /** Ice subtypes this ability can break (e.g. "sentry"). Empty = any. */
  breaks: string[];
  /** Number of subroutines broken per use. */
  count: number;
  creditCost: number;
  /** Bran 1.0 style: paid with clicks instead of credits; no strength check. */
  bioroid?: boolean;
}

export interface PumpAbilityDef {
  creditCost: number;
  /**
   * Strength gained per activation. A value here is always a real pump; a card
   * whose strength is STATIC (Unity's "+X = installed icebreakers") declares
   * that in `staticStrength` instead and the engine refuses to pump it.
   */
  amount: number;
}

/**
 * Static strength modifiers, consulted wherever current strength is computed.
 * They are recomputed from the board and never stored in `strengthBoost`, so
 * the pump-expiry sweep (rule 3.9.5b) cannot clobber them.
 */
export type StaticStrengthDef =
  /** Strength equals the number of installed icebreakers (Unity). */
  | { kind: "icebreakers-installed" }
  /** +amount while installed protecting a remote server (Palisade). */
  | { kind: "bonus-if-remote"; amount: number };

/** What a card's paid ability does once its click cost is paid. */
export type PaidAbilityEffectDef =
  /** "Place N credits on this card" (Smartware Distributor). */
  | { kind: "load-credits"; amount: number }
  /** "Take N credits from this card" into the owner's credit pool (Telework Contract, Regolith). */
  | { kind: "take-credits"; amount: number }
  /** "Place N credits on this card, then take all credits from it" (Pennyshaver). */
  | { kind: "load-then-take-all"; amount: number }
  /** "Run a server you have not run this turn" (Red Team, rule 6.3.2a). */
  | { kind: "run-server"; sourcePrefix: string };

export interface PaidAbilityDef {
  id: string;
  title: string;
  clickCost?: number;
  creditCost?: number;
  /** Once per turn (Telework Contract). */
  oncePerTurn?: boolean;
  /** Needs the runner to choose a server (Red Team run ability). */
  needsServer?: "central-not-run-this-turn";
  /** Needs hosted credits >= amount to be useful; used for legality display. */
  requiresHostedCredits?: number;
  /** The registered effect the engine dispatches to when the ability is paid. */
  effect: PaidAbilityEffectDef;
}

export interface TriggerDef {
  id: string;
  /**
   * Delayed/activated ability the engine dispatches at its trigger point.
   *
   * Doc-only kinds — the engine has no generic dispatch point for them, so the
   * registry stays honest by saying which hook implements the printed text:
   *  - "corp-click-take-credits", "runner-click-take-credits",
   *    "runner-click-load-credits": not dispatched — the "[click]:" ability is
   *    the card's `paidAbilities` entry (see `PaidAbilityEffectDef`).
   */
  kind:
    | "on-install-load-credits"
    | "on-rez-load-credits"
    | "turn-start-take-credits"
    | "runner-turn-start-take-credits"
    | "corp-click-take-credits"
    | "runner-click-load-credits"
    | "runner-click-take-credits"
    | "successful-run-place-credit"
    | "successful-run-take-credits"
    | "empty-then-trash"
    | "empty-then-trash-and-draw"
    | "access-damage-installed"
    | "approach-toll"
    | "score-gain-credits"
    | "score-optional-draw"
    | "scored-or-stolen-optional-rez-ice"
    | "run-trash-program"
    | "first-basic-draw-double"
    | "first-hq-breach-extra-access"
    | "console"
    | "identity";
  amount?: number;
  optional?: boolean;
  /** For approach-toll: what the Runner must pay or the run ends (Manegarm). */
  creditCost?: number;
  /** For approach-toll: how many clicks the Runner may spend instead. */
  clickCost?: number;
}

/** What playing a Corp operation resolves, beyond paying its cost. */
export interface OperationEffectDef {
  kind: "gain-credits" | "place-advancement-on-installed";
  /** Credits gained, or advancement counters placed. */
  amount?: number;
}

/** What playing a Runner event resolves, beyond paying its cost (rule 5.2.2). */
export interface EventEffectDef {
  kind: "gain-credits" | "draw" | "run";
  /** Credits gained (gain-credits) or cards drawn (draw). */
  amount?: number;
  /** Only for run events: which servers the event names ("HQ or R&D" / "any"). */
  runServers?: "hq-or-rd" | "any";
  /** Credits banked on the run the event initiates (Overclock, rule 5.2.2b). */
  fundCredits?: number;
  /** Rez-cost increase on the ice of the run the event initiates (Tread Lightly). */
  rezCostIncrease?: number;
  /** Cards drawn when the initiated run becomes successful (Jailbreak, rule 6.7.2). */
  onSuccessfulRunDraw?: number;
  /** Access N additional cards when breaching the initiated run's server (rule 7.3.5). */
  breachAccessBonus?: number;
  /**
   * The resolution loses 1 click when the player still has one. Printed as
   * "If you have any [click] remaining, lose [click]" (rule 5.2.2a) — rule
   * 1.11.3b says "lose" is not "spend", so only an available click is lost.
   */
  thenLoseClickIfAny?: boolean;
}

export interface CardBehavior {
  cardId: string;
  support: SupportStatus;
  /** Human-readable note about partial support or limitations. */
  note?: string;
  subroutines?: SubroutineDef[];
  breakAbility?: BreakAbilityDef;
  pumpAbility?: PumpAbilityDef;
  paidAbilities?: PaidAbilityDef[];
  triggers?: TriggerDef[];
  // ------------------------------------------------------------------
  // Static engine hooks. The engine consults these instead of comparing
  // card ids; adding a card with a new engine rule is a matter of filling in
  // the hook here (and, if the rule is novel, teaching the engine's single
  // dispatch point to read it).
  // ------------------------------------------------------------------
  /** The Corp can advance this non-agenda card (rule 1.18.3 — Urtica Cipher). */
  advanceable?: boolean;
  /** Install-cost discount (Carmen: 2 less after a successful run this turn). */
  installDiscount?: { kind: "after-successful-run"; amount: number };
  /** Static strength modifier (Unity / Palisade) — never a pump. */
  staticStrength?: StaticStrengthDef;
  /** Restriction this card imposes on all runs (Red Team, rule 6.3.2a). */
  runRestriction?: { kind: "central-once-per-turn" };
  /** Maximum-hand-size bonus while the card sits in the Corp's score area. */
  handSizeBonus?: { kind: "while-scored"; amount: number };
  /** What playing this operation resolves. */
  operationEffect?: OperationEffectDef;
  /** What playing this event resolves. */
  eventEffect?: EventEffectDef;
}

const B: CardBehavior[] = [
  // ------------------------------------------------------------------ Runner
  {
    cardId: "the_catalyst_convention_breaker",
    support: "supported",
    triggers: [{ id: "identity", kind: "identity" }],
    note: "Starter game only identity; no special abilities.",
  },
  {
    cardId: "carmen",
    support: "supported",
    breakAbility: { breaks: ["sentry"], count: 1, creditCost: 1 },
    pumpAbility: { creditCost: 2, amount: 3 },
    installDiscount: { kind: "after-successful-run", amount: 2 },
    note:
      "Install discount (2 credits) when a successful run was made this turn is supported (installDiscount hook).",
  },
  {
    cardId: "cleaver",
    support: "supported",
    breakAbility: { breaks: ["barrier"], count: 2, creditCost: 1 },
    pumpAbility: { creditCost: 2, amount: 1 },
  },
  {
    cardId: "mayfly",
    support: "supported",
    breakAbility: { breaks: [], count: 1, creditCost: 1 },
    pumpAbility: { creditCost: 1, amount: 1 },
    triggers: [{ id: "run-trash-program", kind: "run-trash-program" }],
    note:
      "Interpreted as: trashed at the end of any run while installed (see docs/rules-questions.md).",
  },
  {
    cardId: "unity",
    support: "supported",
    breakAbility: { breaks: ["code_gate"], count: 1, creditCost: 1 },
    pumpAbility: { creditCost: 1, amount: 1 },
    // Unity prints "1[credit]: +1 strength", but its strength is STATIC
    // ("+X = installed icebreakers"), so the pump entry only serves to offer
    // the (no-op) pump move; the engine computes strength from staticStrength
    // and refuses to pump a card that has it (rule 3.9.5b).
    staticStrength: { kind: "icebreakers-installed" },
  },
  {
    cardId: "sure_gamble",
    support: "supported",
    eventEffect: { kind: "gain-credits", amount: 9 },
    note: "Printed: 'Gain 9[credit].' (cost 5, net +4).",
  },
  {
    cardId: "creative_commission",
    support: "supported",
    eventEffect: { kind: "gain-credits", amount: 5, thenLoseClickIfAny: true },
  },
  {
    cardId: "vrcation",
    support: "supported",
    eventEffect: { kind: "draw", amount: 4, thenLoseClickIfAny: true },
  },
  {
    cardId: "jailbreak",
    support: "supported",
    eventEffect: {
      kind: "run",
      runServers: "hq-or-rd",
      onSuccessfulRunDraw: 1,
      breachAccessBonus: 1,
    },
    note:
      "Rule 5.2.2b: the run is part of the event's resolution, so its bonuses ride the run it initiates (rule 6.7.2, 7.3.5).",
  },
  {
    cardId: "overclock",
    support: "supported",
    eventEffect: { kind: "run", runServers: "any", fundCredits: 5 },
  },
  {
    cardId: "tread_lightly",
    support: "supported",
    eventEffect: { kind: "run", runServers: "any", rezCostIncrease: 3 },
  },
  {
    cardId: "docklands_pass",
    support: "supported",
    triggers: [{
      id: "first-hq-breach-extra-access",
      kind: "first-hq-breach-extra-access",
      amount: 1,
    }],
  },
  {
    cardId: "pennyshaver",
    support: "supported",
    triggers: [
      { id: "console", kind: "console", amount: 1 },
      { id: "successful-run-place-credit", kind: "successful-run-place-credit", amount: 1 },
      {
        id: "click-place-and-take",
        kind: "runner-click-load-credits",
        amount: 1,
      },
    ],
    paidAbilities: [{
      id: "place-and-take-all",
      title: "Place 1 credit on this, then take all credits from it",
      clickCost: 1,
      effect: { kind: "load-then-take-all", amount: 1 },
    }],
  },
  {
    cardId: "red_team",
    support: "supported",
    triggers: [
      { id: "on-install-load-credits", kind: "on-install-load-credits", amount: 12 },
      { id: "empty-then-trash", kind: "empty-then-trash" },
      { id: "successful-run-take-credits", kind: "successful-run-take-credits", amount: 3 },
    ],
    runRestriction: { kind: "central-once-per-turn" },
    paidAbilities: [{
      id: "run-central",
      title: "Run a central server you have not run this turn",
      clickCost: 1,
      needsServer: "central-not-run-this-turn",
      effect: { kind: "run-server", sourcePrefix: "red-team" },
    }],
  },
  {
    cardId: "smartware_distributor",
    support: "supported",
    triggers: [
      { id: "runner-turn-start-take-credits", kind: "runner-turn-start-take-credits", amount: 1 },
      // The printed "[click]: Place 3[credit] on this resource" is the
      // paidAbilities entry below; the trigger records it and is not dispatched.
      { id: "click-load-credits", kind: "runner-click-load-credits", amount: 3 },
    ],
    paidAbilities: [{
      id: "place-3",
      title: "Place 3 credits on this resource",
      clickCost: 1,
      effect: { kind: "load-credits", amount: 3 },
    }],
  },
  {
    cardId: "telework_contract",
    support: "supported",
    triggers: [
      { id: "on-install-load-credits", kind: "on-install-load-credits", amount: 9 },
      { id: "empty-then-trash", kind: "empty-then-trash" },
      // The printed "Once per turn -> [click]: Take 3[credit] from this
      // resource" is the paidAbilities entry below; not dispatched here.
      { id: "click-take-3", kind: "runner-click-take-credits", amount: 3 },
    ],
    paidAbilities: [{
      id: "take-3",
      title: "Take 3 credits from this resource",
      clickCost: 1,
      oncePerTurn: true,
      effect: { kind: "take-credits", amount: 3 },
    }],
  },
  {
    cardId: "verbal_plasticity",
    support: "supported",
    triggers: [{ id: "first-basic-draw-double", kind: "first-basic-draw-double" }],
  },

  // -------------------------------------------------------------------- Corp
  {
    cardId: "the_syndicate_profit_over_principle",
    support: "supported",
    triggers: [{ id: "identity", kind: "identity" }],
    note: "Starter game only identity; no special abilities.",
  },
  {
    cardId: "hedge_fund",
    support: "supported",
    operationEffect: { kind: "gain-credits", amount: 9 },
  },
  {
    cardId: "government_subsidy",
    support: "supported",
    operationEffect: { kind: "gain-credits", amount: 15 },
    note: "Printed: 'Gain 15[credit].' (cost 10, net +5).",
  },
  {
    cardId: "seamless_launch",
    support: "supported",
    operationEffect: { kind: "place-advancement-on-installed", amount: 2 },
    note:
      "Rule 1.18.2: placing counters directly is not advancing — requires choosing an installed card not installed this turn (enforced).",
  },
  {
    cardId: "nico_campaign",
    support: "supported",
    triggers: [
      { id: "on-rez-load-credits", kind: "on-rez-load-credits", amount: 9 },
      { id: "corp-turn-start-take-3", kind: "turn-start-take-credits", amount: 3 },
      { id: "empty-then-trash-and-draw", kind: "empty-then-trash-and-draw" },
    ],
  },
  {
    cardId: "regolith_mining_license",
    support: "supported",
    triggers: [
      { id: "on-rez-load-credits", kind: "on-rez-load-credits", amount: 15 },
      // The printed "[click]: Take 3[credit] from this asset" is the
      // paidAbilities entry below; not dispatched here.
      { id: "corp-click-take-credits", kind: "corp-click-take-credits", amount: 3 },
      { id: "empty-then-trash", kind: "empty-then-trash" },
    ],
    paidAbilities: [{
      id: "take-3",
      title: "Take 3 credits from this asset",
      clickCost: 1,
      effect: { kind: "take-credits", amount: 3 },
    }],
  },
  {
    cardId: "urtica_cipher",
    support: "supported",
    advanceable: true,
    triggers: [{
      id: "access-damage-installed",
      kind: "access-damage-installed",
      amount: 2,
    }],
    note: "Damage is 2 plus 1 per hosted advancement counter while installed.",
  },
  {
    cardId: "manegarm_skunkworks",
    support: "supported",
    triggers: [{
      id: "approach-toll",
      kind: "approach-toll",
      creditCost: 5,
      clickCost: 2,
    }],
  },
  {
    cardId: "offworld_office",
    support: "supported",
    triggers: [{ id: "score-gain-7", kind: "score-gain-credits", amount: 7 }],
  },
  {
    cardId: "superconducting_hub",
    support: "supported",
    triggers: [{ id: "score-optional-draw-2", kind: "score-optional-draw", amount: 2 }],
    handSizeBonus: { kind: "while-scored", amount: 2 },
    note: "+2 maximum hand size while in the Corp score area is a static effect (supported).",
  },
  {
    cardId: "send_a_message",
    support: "supported",
    triggers: [{
      id: "scored-or-stolen-rez-ice",
      kind: "scored-or-stolen-optional-rez-ice",
      optional: true,
    }],
  },
  {
    cardId: "tithe",
    support: "supported",
    subroutines: [
      { id: "net-1", kind: "net-damage", amount: 1 },
      { id: "gain-1", kind: "gain-credits", amount: 1 },
    ],
  },
  {
    cardId: "palisade",
    support: "supported",
    subroutines: [{ id: "etr", kind: "end-run" }],
    staticStrength: { kind: "bonus-if-remote", amount: 2 },
    note: "+2 strength while protecting a remote server (static, supported).",
  },
  {
    cardId: "whitespace",
    support: "supported",
    subroutines: [
      { id: "lose-3", kind: "lose-credits", amount: 3 },
      { id: "etr-if-6-or-less", kind: "lose-credits-then-conditional-end-run", creditsAtMost: 6 },
    ],
  },
  {
    cardId: "diviner",
    support: "supported",
    subroutines: [{ id: "net-1-odd-etr", kind: "diviner-damage" }],
    note: "Odd printed play/install cost of the trashed card ends the run (0 is not odd).",
  },
  {
    cardId: "karuna",
    support: "supported",
    subroutines: [
      { id: "net-2-jackout", kind: "net-damage-then-optional-jack-out", amount: 2 },
      { id: "net-2", kind: "net-damage", amount: 2 },
    ],
  },
  {
    cardId: "bran_1_0",
    support: "supported",
    subroutines: [
      { id: "install-ice-inward", kind: "install-ice-inward" },
      { id: "etr-1", kind: "end-run" },
      { id: "etr-2", kind: "end-run" },
    ],
    breakAbility: { breaks: [], count: 1, creditCost: 0, bioroid: true },
    note:
      "Runner breaks subroutines with 'lose [click]' instead of credits; no strength requirement.",
  },
];

export const behaviors: ReadonlyMap<string, CardBehavior> = new Map(
  B.map((b) => [b.cardId, b]),
);

export function behavior(cardId: string): CardBehavior | undefined {
  return behaviors.get(cardId);
}

/** Ice subtypes an icebreaker can break, or undefined if not an icebreaker. */
export function breakAbilityDef(cardId: string): BreakAbilityDef | undefined {
  return behaviors.get(cardId)?.breakAbility;
}

export function pumpAbilityDef(cardId: string): PumpAbilityDef | undefined {
  return behaviors.get(cardId)?.pumpAbility;
}

export function subroutinesOf(cardId: string): SubroutineDef[] {
  return behaviors.get(cardId)?.subroutines ?? [];
}

export function paidAbilitiesOf(cardId: string): PaidAbilityDef[] {
  return behaviors.get(cardId)?.paidAbilities ?? [];
}

export function triggersOf(cardId: string): TriggerDef[] {
  return behaviors.get(cardId)?.triggers ?? [];
}

export function supportStatus(cardId: string): SupportStatus {
  return behaviors.get(cardId)?.support ?? "unsupported";
}

/**
 * "While scored" maximum-hand-size bonus across a set of scored card ids
 * (Superconducting Hub: "+2 maximum hand size while in the Corp's score
 * area"). Totalled over the score area, so the engine never names a card.
 */
export function handSizeBonusOf(cardIds: string[]): number {
  let bonus = 0;
  for (const id of cardIds) {
    const b = behaviors.get(id);
    if (b?.handSizeBonus?.kind === "while-scored") bonus += b.handSizeBonus.amount;
  }
  return bonus;
}

/** Aggregate support status across a set of card ids. */
export function cardSupportReport(cardIds: string[]): {
  supported: string[];
  partial: string[];
  unsupported: string[];
} {
  const supported: string[] = [];
  const partial: string[] = [];
  const unsupported: string[] = [];
  for (const id of cardIds) {
    const status = supportStatus(id);
    if (status === "supported") supported.push(id);
    else if (status === "partial") partial.push(id);
    else unsupported.push(id);
  }
  return { supported, partial, unsupported };
}
