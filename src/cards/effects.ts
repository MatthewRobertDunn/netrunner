/**
 * Card behavior definitions.
 *
 * Printed rules text is stored in the catalogue for reference; behavior is
 * defined here as typed data that the rules engine interprets. Never parse
 * English card text at runtime.
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
  /** Fixed amount, or a function marker for Unity's +X. */
  amount: number | "icebreakers-installed";
}

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
}

export interface TriggerDef {
  id: string;
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
    note: "Install discount (2 credits) when a successful run was made this turn is supported.",
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
    pumpAbility: { creditCost: 1, amount: "icebreakers-installed" },
  },
  {
    cardId: "sure_gamble",
    support: "supported",
  },
  {
    cardId: "creative_commission",
    support: "supported",
  },
  {
    cardId: "vrcation",
    support: "supported",
  },
  {
    cardId: "jailbreak",
    support: "supported",
  },
  {
    cardId: "overclock",
    support: "supported",
  },
  {
    cardId: "tread_lightly",
    support: "supported",
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
    paidAbilities: [{
      id: "run-central",
      title: "Run a central server you have not run this turn",
      clickCost: 1,
      needsServer: "central-not-run-this-turn",
    }],
  },
  {
    cardId: "smartware_distributor",
    support: "supported",
    triggers: [
      { id: "runner-turn-start-take-credits", kind: "runner-turn-start-take-credits", amount: 1 },
      { id: "click-load-credits", kind: "runner-click-load-credits", amount: 3 },
    ],
    paidAbilities: [{ id: "place-3", title: "Place 3 credits on this resource", clickCost: 1 }],
  },
  {
    cardId: "telework_contract",
    support: "supported",
    triggers: [
      { id: "on-install-load-credits", kind: "on-install-load-credits", amount: 9 },
      { id: "empty-then-trash", kind: "empty-then-trash" },
    ],
    paidAbilities: [{
      id: "take-3",
      title: "Take 3 credits from this resource",
      clickCost: 1,
      oncePerTurn: true,
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
  },
  {
    cardId: "government_subsidy",
    support: "supported",
  },
  {
    cardId: "seamless_launch",
    support: "supported",
    note: "Requires choosing an installed card not installed this turn (enforced).",
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
      { id: "corp-click-take-credits", kind: "corp-click-take-credits", amount: 3 },
      { id: "empty-then-trash", kind: "empty-then-trash" },
    ],
    paidAbilities: [{ id: "take-3", title: "Take 3 credits from this asset", clickCost: 1 }],
  },
  {
    cardId: "urtica_cipher",
    support: "supported",
    triggers: [{ id: "access-damage-installed", kind: "access-damage-installed" }],
  },
  {
    cardId: "manegarm_skunkworks",
    support: "supported",
    triggers: [{ id: "approach-toll", kind: "approach-toll" }],
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
