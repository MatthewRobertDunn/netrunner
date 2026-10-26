// data/cards.json
var cards_default = {
  _source: {
    provider: "NetrunnerDB",
    api_base: "https://api.netrunnerdb.com/api/v3/public",
    runner_decklist_id: "4b9cf488-5bd9-4415-a57a-0864d4d0e600",
    corp_decklist_id: "382f2e2d-eabf-47c8-ae55-adb93b3df3e9",
    runner_decklist_url: "https://api.netrunnerdb.com/api/v3/public/decklists/4b9cf488-5bd9-4415-a57a-0864d4d0e600",
    corp_decklist_url: "https://api.netrunnerdb.com/api/v3/public/decklists/382f2e2d-eabf-47c8-ae55-adb93b3df3e9",
    runner_cards_url: "https://api.netrunnerdb.com/api/v3/public/cards?filter[decklist_id]=4b9cf488-5bd9-4415-a57a-0864d4d0e600",
    corp_cards_url: "https://api.netrunnerdb.com/api/v3/public/cards?filter[decklist_id]=382f2e2d-eabf-47c8-ae55-adb93b3df3e9",
    retrieved_at: "2026-10-24",
    api_meta: {
      runner: {
        stats: {
          total: {
            count: 17
          }
        }
      },
      corp: {
        stats: {
          total: {
            count: 17
          }
        }
      }
    }
  },
  cards: [
    {
      id: "carmen",
      netrunnerdb_id: "carmen",
      title: "Carmen",
      stripped_title: "Carmen",
      text: "If you made a successful run this turn, this program costs 2[credit] less to install.\nInterface \u2192 <strong>1[credit]:</strong> Break 1 <strong>sentry</strong> subroutine.\n<strong>2[credit]:</strong> +3 strength.",
      stripped_text: "If you made a successful run this turn, this program costs 2 credits less to install. Interface -> 1 credit: Break 1 sentry subroutine. 2 credits: +3 strength.",
      card_type_id: "program",
      side_id: "runner",
      faction_id: "criminal",
      cost: "5",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: 1,
      minimum_deck_size: null,
      strength: 2,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "icebreaker",
        "killer"
      ],
      display_subtypes: "Icebreaker - Killer",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:29+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30015",
      printing_ids: [
        "30015"
      ]
    },
    {
      id: "cleaver",
      netrunnerdb_id: "cleaver",
      title: "Cleaver",
      stripped_title: "Cleaver",
      text: "Interface \u2192 <strong>1[credit]:</strong> Break up to 2 <strong>barrier</strong> subroutines.\n<strong>2[credit]:</strong> +1 strength.",
      stripped_text: "Interface -> 1 credit: Break up to 2 barrier subroutines. 2 credits: +1 strength.",
      card_type_id: "program",
      side_id: "runner",
      faction_id: "anarch",
      cost: "3",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: 1,
      minimum_deck_size: null,
      strength: 3,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "fracter",
        "icebreaker"
      ],
      display_subtypes: "Icebreaker - Fracter",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:29+00:00",
      in_restriction: true,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30006",
      printing_ids: [
        "30006"
      ]
    },
    {
      id: "creative_commission",
      netrunnerdb_id: "creative_commission",
      title: "Creative Commission",
      stripped_title: "Creative Commission",
      text: "Gain 5[credit]. If you have any [click] remaining, lose [click].",
      stripped_text: "Gain 5 credits. If you have any click remaining, lose click.",
      card_type_id: "event",
      side_id: "runner",
      faction_id: "shaper",
      cost: "1",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [],
      display_subtypes: null,
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:29+00:00",
      in_restriction: true,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30020",
      printing_ids: [
        "30020"
      ]
    },
    {
      id: "docklands_pass",
      netrunnerdb_id: "docklands_pass",
      title: "Docklands Pass",
      stripped_title: "Docklands Pass",
      text: "The first time each turn you breach HQ, access 1 additional card.",
      stripped_text: "The first time each turn you breach HQ, access 1 additional card.",
      card_type_id: "hardware",
      side_id: "runner",
      faction_id: "criminal",
      cost: "2",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: true,
      card_subtype_ids: [],
      display_subtypes: null,
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:29+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30013",
      printing_ids: [
        "30013"
      ]
    },
    {
      id: "jailbreak",
      netrunnerdb_id: "jailbreak",
      title: "Jailbreak",
      stripped_title: "Jailbreak",
      text: "Run HQ or R&D. If successful, draw 1 card and when you breach the attacked server, access 1 additional card.",
      stripped_text: "Run HQ or R&D. If successful, draw 1 card and when you breach the attacked server, access 1 additional card.",
      card_type_id: "event",
      side_id: "runner",
      faction_id: "neutral_runner",
      cost: "0",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "run"
      ],
      display_subtypes: "Run",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30028",
      printing_ids: [
        "30028"
      ]
    },
    {
      id: "mayfly",
      netrunnerdb_id: "mayfly",
      title: "Mayfly",
      stripped_title: "Mayfly",
      text: "Interface \u2192 <strong>1[credit]:</strong> Break 1 subroutine. When this run ends, trash this program.\n<strong>1[credit]:</strong> +1 strength.",
      stripped_text: "Interface -> 1 credit: Break 1 subroutine. When this run ends, trash this program. 1 credit: +1 strength.",
      card_type_id: "program",
      side_id: "runner",
      faction_id: "neutral_runner",
      cost: "1",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: 2,
      minimum_deck_size: null,
      strength: 1,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "ai",
        "icebreaker"
      ],
      display_subtypes: "Icebreaker - AI",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30032",
      printing_ids: [
        "30032"
      ]
    },
    {
      id: "overclock",
      netrunnerdb_id: "overclock",
      title: "Overclock",
      stripped_title: "Overclock",
      text: "Place 5[credit] on this event, then run any server. You can spend hosted credits during that run.",
      stripped_text: "Place 5 credits on this event, then run any server. You can spend hosted credits during that run.",
      card_type_id: "event",
      side_id: "runner",
      faction_id: "neutral_runner",
      cost: "1",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "run"
      ],
      display_subtypes: "Run",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30029",
      printing_ids: [
        "30029"
      ]
    },
    {
      id: "pennyshaver",
      netrunnerdb_id: "pennyshaver",
      title: "Pennyshaver",
      stripped_title: "Pennyshaver",
      text: "+1[mu]\nWhenever you make a successful run, place 1[credit] on this hardware.\n[click]<strong>:</strong> Place 1[credit] on this hardware, then take all credits from it.\nLimit 1 <strong>console</strong> per player.",
      stripped_text: "+1 mu Whenever you make a successful run, place 1 credit on this hardware. click: Place 1 credit on this hardware, then take all credits from it. Limit 1 console per player.",
      card_type_id: "hardware",
      side_id: "runner",
      faction_id: "criminal",
      cost: "3",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 3,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: true,
      card_subtype_ids: [
        "console"
      ],
      display_subtypes: "Console",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30014",
      printing_ids: [
        "30014"
      ]
    },
    {
      id: "red_team",
      netrunnerdb_id: "red_team",
      title: "Red Team",
      stripped_title: "Red Team",
      text: "When you install this resource, load 12[credit] onto it. When it is empty, trash it.\n[click]<strong>:</strong> Run a central server you have not run this turn. If successful, take 3[credit] from this resource.",
      stripped_text: "When you install this resource, load 12 credits onto it. When it is empty, trash it. click: Run a central server you have not run this turn. If successful, take 3 credits from this resource.",
      card_type_id: "resource",
      side_id: "runner",
      faction_id: "criminal",
      cost: "5",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "job"
      ],
      display_subtypes: "Job",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30018",
      printing_ids: [
        "30018"
      ]
    },
    {
      id: "smartware_distributor",
      netrunnerdb_id: "smartware_distributor",
      title: "Smartware Distributor",
      stripped_title: "Smartware Distributor",
      text: "[click]<strong>:</strong> Place 3[credit] on this resource.\nWhen your turn begins, take 1[credit] from this resource.",
      stripped_text: "click: Place 3 credits on this resource. When your turn begins, take 1 credit from this resource.",
      card_type_id: "resource",
      side_id: "runner",
      faction_id: "neutral_runner",
      cost: "0",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "connection"
      ],
      display_subtypes: "Connection",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30033",
      printing_ids: [
        "30033"
      ]
    },
    {
      id: "sure_gamble",
      netrunnerdb_id: "sure_gamble",
      title: "Sure Gamble",
      stripped_title: "Sure Gamble",
      text: "Gain 9[credit].",
      stripped_text: "Gain 9 credits.",
      card_type_id: "event",
      side_id: "runner",
      faction_id: "neutral_runner",
      cost: "5",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [],
      display_subtypes: null,
      date_release: "2012-09-06",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 4,
      designed_by: "fantasy_flight_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30030",
      printing_ids: [
        "30030",
        "25059",
        "20056",
        "01050"
      ]
    },
    {
      id: "telework_contract",
      netrunnerdb_id: "telework_contract",
      title: "Telework Contract",
      stripped_title: "Telework Contract",
      text: "When you install this resource, load 9[credit] onto it. When it is empty, trash it.\nOnce per turn \u2192 [click]<strong>:</strong> Take 3[credit] from this resource.",
      stripped_text: "When you install this resource, load 9[credit] onto it. When it is empty, trash it. Once per turn -> click: Take 3[credit] from this resource.",
      card_type_id: "resource",
      side_id: "runner",
      faction_id: "shaper",
      cost: "1",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "job"
      ],
      display_subtypes: "Job",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30027",
      printing_ids: [
        "30027"
      ]
    },
    {
      id: "the_catalyst_convention_breaker",
      netrunnerdb_id: "the_catalyst_convention_breaker",
      title: "The Catalyst: Convention Breaker",
      stripped_title: "The Catalyst: Convention Breaker",
      text: "Starter game only.",
      stripped_text: "Starter game only.",
      card_type_id: "runner_identity",
      side_id: "runner",
      faction_id: "neutral_runner",
      cost: null,
      advancement_requirement: null,
      agenda_points: null,
      base_link: 0,
      deck_limit: 1,
      influence_cost: null,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: 30,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "natural"
      ],
      display_subtypes: "Natural",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      pronouns: "they/them",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30076",
      printing_ids: [
        "30076"
      ]
    },
    {
      id: "tread_lightly",
      netrunnerdb_id: "tread_lightly",
      title: "Tread Lightly",
      stripped_title: "Tread Lightly",
      text: "Run any server. During that run, the rez cost of each piece of ice is increased by 3[credit].",
      stripped_text: "Run any server. During that run, the rez cost of each piece of ice is increased by 3 credits.",
      card_type_id: "event",
      side_id: "runner",
      faction_id: "criminal",
      cost: "1",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 1,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "run"
      ],
      display_subtypes: "Run",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30012",
      printing_ids: [
        "30012"
      ]
    },
    {
      id: "unity",
      netrunnerdb_id: "unity",
      title: "Unity",
      stripped_title: "Unity",
      text: "Interface \u2192 <strong>1[credit]:</strong> Break 1 <strong>code gate</strong> subroutine.\n<strong>1[credit]:</strong> +X strength. X is equal to the number of installed <strong>icebreakers</strong> <em>(including this one)</em>.",
      stripped_text: "Interface -> 1 credit: Break 1 code gate subroutine. 1 credit: +X strength. X is equal to the number of installed icebreakers (including this one).",
      card_type_id: "program",
      side_id: "runner",
      faction_id: "shaper",
      cost: "3",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: 1,
      minimum_deck_size: null,
      strength: 1,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "decoder",
        "icebreaker"
      ],
      display_subtypes: "Icebreaker - Decoder",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30026",
      printing_ids: [
        "30026"
      ]
    },
    {
      id: "verbal_plasticity",
      netrunnerdb_id: "verbal_plasticity",
      title: "Verbal Plasticity",
      stripped_title: "Verbal Plasticity",
      text: "The first time each turn you take the basic action to draw 1 card, instead draw 2 cards.",
      stripped_text: "The first time each turn you take the basic action to draw 1 card, instead draw 2 cards.",
      card_type_id: "resource",
      side_id: "runner",
      faction_id: "neutral_runner",
      cost: "3",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: true,
      card_subtype_ids: [
        "genetics"
      ],
      display_subtypes: "Genetics",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30034",
      printing_ids: [
        "30034"
      ]
    },
    {
      id: "vrcation",
      netrunnerdb_id: "vrcation",
      title: "VRcation",
      stripped_title: "VRcation",
      text: "Draw 4 cards. If you have any [click] remaining, lose [click].",
      stripped_text: "Draw 4 cards. If you have any click remaining, lose click.",
      card_type_id: "event",
      side_id: "runner",
      faction_id: "shaper",
      cost: "1",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [],
      display_subtypes: null,
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30021",
      printing_ids: [
        "30021"
      ]
    },
    {
      id: "bran_1_0",
      netrunnerdb_id: "bran_1_0",
      title: "Br\xE2n 1.0",
      stripped_title: "Bran 1.0",
      text: "<strong>Lose [click]:</strong> Break 1 subroutine on this ice. Only the Runner can use this ability.\n[subroutine] You may install 1 piece of ice from HQ or Archives directly inward from this ice, ignoring all costs.\n[subroutine] End the run.\n[subroutine] End the run.",
      stripped_text: "Lose click: Break 1 subroutine on this ice. Only the Runner can use this ability. Subroutine You may install 1 piece of ice from HQ or Archives directly inward from this ice, ignoring all costs. Subroutine End the run. Subroutine End the run.",
      card_type_id: "ice",
      side_id: "corp",
      faction_id: "haas_bioroid",
      cost: "6",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: 6,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "barrier",
        "bioroid"
      ],
      display_subtypes: "Barrier - Bioroid",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:29+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30039",
      printing_ids: [
        "30039"
      ]
    },
    {
      id: "diviner",
      netrunnerdb_id: "diviner",
      title: "Diviner",
      stripped_title: "Diviner",
      text: "[subroutine] Do 1 net damage. If you trash a card this way with a printed play or install cost that is an odd number, end the run. <em>(0 is not odd.)</em>",
      stripped_text: "Subroutine Do 1 net damage. If you trash a card this way with a printed play or install cost that is an odd number, end the run. (0 is not odd.)",
      card_type_id: "ice",
      side_id: "corp",
      faction_id: "jinteki",
      cost: "2",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: 3,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "ap",
        "code_gate"
      ],
      display_subtypes: "Code Gate - AP",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:29+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30046",
      printing_ids: [
        "30046"
      ]
    },
    {
      id: "government_subsidy",
      netrunnerdb_id: "government_subsidy",
      title: "Government Subsidy",
      stripped_title: "Government Subsidy",
      text: "Gain 15[credit].",
      stripped_text: "Gain 15 credits.",
      card_type_id: "operation",
      side_id: "corp",
      faction_id: "weyland_consortium",
      cost: "10",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 1,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "transaction"
      ],
      display_subtypes: "Transaction",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:29+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30064",
      printing_ids: [
        "30064"
      ]
    },
    {
      id: "hedge_fund",
      netrunnerdb_id: "hedge_fund",
      title: "Hedge Fund",
      stripped_title: "Hedge Fund",
      text: "Gain 9[credit].",
      stripped_text: "Gain 9 credits.",
      card_type_id: "operation",
      side_id: "corp",
      faction_id: "neutral_corp",
      cost: "5",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "transaction"
      ],
      display_subtypes: "Transaction",
      date_release: "2012-09-06",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 4,
      designed_by: "fantasy_flight_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30075",
      printing_ids: [
        "30075",
        "25146",
        "20132",
        "01110"
      ]
    },
    {
      id: "karuna",
      netrunnerdb_id: "karuna",
      title: "Karun\u0101",
      stripped_title: "Karuna",
      text: "[subroutine] Do 2 net damage. The Runner may jack out.\n[subroutine] Do 2 net damage.",
      stripped_text: "Subroutine Do 2 net damage. The Runner may jack out. Subroutine Do 2 net damage.",
      card_type_id: "ice",
      side_id: "corp",
      faction_id: "jinteki",
      cost: "4",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: 3,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "ap",
        "sentry"
      ],
      display_subtypes: "Sentry - AP",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30047",
      printing_ids: [
        "30047"
      ]
    },
    {
      id: "manegarm_skunkworks",
      netrunnerdb_id: "manegarm_skunkworks",
      title: "Manegarm Skunkworks",
      stripped_title: "Manegarm Skunkworks",
      text: "Whenever the Runner approaches this server, end the run unless they either spend [click][click] or pay 5[credit].",
      stripped_text: "Whenever the Runner approaches this server, end the run unless they either spend click click or pay 5 credits.",
      card_type_id: "upgrade",
      side_id: "corp",
      faction_id: "haas_bioroid",
      cost: "2",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 3,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: 3,
      is_unique: true,
      card_subtype_ids: [],
      display_subtypes: null,
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30042",
      printing_ids: [
        "30042"
      ]
    },
    {
      id: "nico_campaign",
      netrunnerdb_id: "nico_campaign",
      title: "Nico Campaign",
      stripped_title: "Nico Campaign",
      text: "When you rez this asset, load 9[credit] onto it. When it is empty, trash it and draw 1 card.\nWhen your turn begins, take 3[credit] from this asset.",
      stripped_text: "When you rez this asset, load 9 credits onto it. When it is empty, trash it and draw 1 card. When your turn begins, take 3 credits from this asset.",
      card_type_id: "asset",
      side_id: "corp",
      faction_id: "haas_bioroid",
      cost: "2",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: 2,
      is_unique: false,
      card_subtype_ids: [
        "advertisement"
      ],
      display_subtypes: "Advertisement",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30037",
      printing_ids: [
        "30037"
      ]
    },
    {
      id: "offworld_office",
      netrunnerdb_id: "offworld_office",
      title: "Offworld Office",
      stripped_title: "Offworld Office",
      text: "When you score this agenda, gain 7[credit].",
      stripped_text: "When you score this agenda, gain 7 credits.",
      card_type_id: "agenda",
      side_id: "corp",
      faction_id: "neutral_corp",
      cost: null,
      advancement_requirement: "4",
      agenda_points: 2,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "expansion"
      ],
      display_subtypes: "Expansion",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: true,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30067",
      printing_ids: [
        "30067"
      ]
    },
    {
      id: "palisade",
      netrunnerdb_id: "palisade",
      title: "Palisade",
      stripped_title: "Palisade",
      text: "While this ice is protecting a remote server, it gets +2 strength.\n[subroutine] End the run.",
      stripped_text: "While this ice is protecting a remote server, it gets +2 strength. Subroutine End the run.",
      card_type_id: "ice",
      side_id: "corp",
      faction_id: "neutral_corp",
      cost: "3",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: 2,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "barrier"
      ],
      display_subtypes: "Barrier",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30072",
      printing_ids: [
        "30072"
      ]
    },
    {
      id: "regolith_mining_license",
      netrunnerdb_id: "regolith_mining_license",
      title: "Regolith Mining License",
      stripped_title: "Regolith Mining License",
      text: "When you rez this asset, load 15[credit] onto it. When it is empty, trash it.\n[click]<strong>:</strong> Take 3[credit] from this asset.",
      stripped_text: "When you rez this asset, load 15 credits onto it. When it is empty, trash it. click: Take 3 credits from this asset.",
      card_type_id: "asset",
      side_id: "corp",
      faction_id: "neutral_corp",
      cost: "2",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: 3,
      is_unique: false,
      card_subtype_ids: [],
      display_subtypes: null,
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30071",
      printing_ids: [
        "30071"
      ]
    },
    {
      id: "seamless_launch",
      netrunnerdb_id: "seamless_launch",
      title: "Seamless Launch",
      stripped_title: "Seamless Launch",
      text: "Place 2 advancement counters on 1 installed card that you did not install this turn.",
      stripped_text: "Place 2 advancement counters on 1 installed card that you did not install this turn.",
      card_type_id: "operation",
      side_id: "corp",
      faction_id: "haas_bioroid",
      cost: "1",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [],
      display_subtypes: null,
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: true,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30040",
      printing_ids: [
        "30040"
      ]
    },
    {
      id: "send_a_message",
      netrunnerdb_id: "send_a_message",
      title: "Send a Message",
      stripped_title: "Send a Message",
      text: "When this agenda is scored or stolen, you may rez 1 installed piece of ice, ignoring all costs.",
      stripped_text: "When this agenda is scored or stolen, you may rez 1 installed piece of ice, ignoring all costs.",
      card_type_id: "agenda",
      side_id: "corp",
      faction_id: "neutral_corp",
      cost: null,
      advancement_requirement: "5",
      agenda_points: 3,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "security"
      ],
      display_subtypes: "Security",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30069",
      printing_ids: [
        "30069"
      ]
    },
    {
      id: "superconducting_hub",
      netrunnerdb_id: "superconducting_hub",
      title: "Superconducting Hub",
      stripped_title: "Superconducting Hub",
      text: "When you score this agenda, you may draw 2 cards.\nYou get +2 maximum hand size.",
      stripped_text: "When you score this agenda, you may draw 2 cards. You get +2 maximum hand size.",
      card_type_id: "agenda",
      side_id: "corp",
      faction_id: "neutral_corp",
      cost: null,
      advancement_requirement: "3",
      agenda_points: 1,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "expansion"
      ],
      display_subtypes: "Expansion",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30070",
      printing_ids: [
        "30070"
      ]
    },
    {
      id: "the_syndicate_profit_over_principle",
      netrunnerdb_id: "the_syndicate_profit_over_principle",
      title: "The Syndicate: Profit over Principle",
      stripped_title: "The Syndicate: Profit over Principle",
      text: "Starter game only.",
      stripped_text: "Starter game only.",
      card_type_id: "corp_identity",
      side_id: "corp",
      faction_id: "neutral_corp",
      cost: null,
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 1,
      influence_cost: null,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: 30,
      strength: null,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "megacorp"
      ],
      display_subtypes: "Megacorp",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30077",
      printing_ids: [
        "30077"
      ]
    },
    {
      id: "tithe",
      netrunnerdb_id: "tithe",
      title: "Tithe",
      stripped_title: "Tithe",
      text: "[subroutine] Do 1 net damage.\n[subroutine] Gain 1[credit].",
      stripped_text: "Subroutine Do 1 net damage. Subroutine Gain 1 credit.",
      card_type_id: "ice",
      side_id: "corp",
      faction_id: "neutral_corp",
      cost: "1",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: 1,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "ap",
        "sentry"
      ],
      display_subtypes: "Sentry - AP",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30073",
      printing_ids: [
        "30073"
      ]
    },
    {
      id: "urtica_cipher",
      netrunnerdb_id: "urtica_cipher",
      title: "Urtica Cipher",
      stripped_title: "Urtica Cipher",
      text: "You can advance this asset.\nWhen the Runner accesses this asset while it is installed, do 2 net damage plus 1 net damage for each hosted advancement counter.",
      stripped_text: "You can advance this asset. When the Runner accesses this asset while it is installed, do 2 net damage plus 1 net damage for each hosted advancement counter.",
      card_type_id: "asset",
      side_id: "corp",
      faction_id: "jinteki",
      cost: "0",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 2,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: null,
      trash_cost: 2,
      is_unique: false,
      card_subtype_ids: [
        "ambush"
      ],
      display_subtypes: "Ambush",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:30+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30045",
      printing_ids: [
        "30045"
      ]
    },
    {
      id: "whitespace",
      netrunnerdb_id: "whitespace",
      title: "Whitespace",
      stripped_title: "Whitespace",
      text: "[subroutine] The Runner loses 3[credit].\n[subroutine] If the Runner has 6[credit] or less, end the run.",
      stripped_text: "Subroutine The Runner loses 3 credits. Subroutine If the Runner has 6 credits or less, end the run.",
      card_type_id: "ice",
      side_id: "corp",
      faction_id: "neutral_corp",
      cost: "2",
      advancement_requirement: null,
      agenda_points: null,
      base_link: null,
      deck_limit: 3,
      influence_cost: 0,
      influence_limit: null,
      memory_cost: null,
      minimum_deck_size: null,
      strength: 0,
      trash_cost: null,
      is_unique: false,
      card_subtype_ids: [
        "code_gate"
      ],
      display_subtypes: "Code Gate",
      date_release: "2021-03-28",
      updated_at: "2026-08-12T01:54:31+00:00",
      in_restriction: false,
      num_printings: 1,
      designed_by: "null_signal_games",
      layout_id: "normal",
      num_extra_faces: 0,
      latest_printing_id: "30074",
      printing_ids: [
        "30074"
      ]
    }
  ]
};

// src/cards/catalogue.ts
function toCardDef(rawCard) {
  const num = (v) => {
    if (v === null || v === void 0) return null;
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: rawCard.id,
    title: rawCard.title ?? rawCard.id,
    strippedTitle: rawCard.stripped_title ?? rawCard.id,
    text: rawCard.text ?? "",
    strippedText: rawCard.stripped_text ?? "",
    type: rawCard.card_type_id ?? "operation",
    side: rawCard.side_id ?? "corp",
    faction: rawCard.faction_id ?? "neutral",
    cost: num(rawCard.cost),
    advancementRequirement: num(rawCard.advancement_requirement),
    agendaPoints: num(rawCard.agenda_points),
    baseLink: num(rawCard.base_link),
    deckLimit: num(rawCard.deck_limit),
    influenceCost: num(rawCard.influence_cost),
    influenceLimit: num(rawCard.influence_limit),
    memoryCost: num(rawCard.memory_cost),
    minimumDeckSize: num(rawCard.minimum_deck_size),
    strength: num(rawCard.strength),
    trashCost: num(rawCard.trash_cost),
    unique: rawCard.is_unique ?? false,
    subtypes: rawCard.card_subtype_ids ?? [],
    displaySubtypes: rawCard.display_subtypes ?? null,
    printingIds: rawCard.printing_ids ?? [],
    updatedAt: rawCard.updated_at ?? null
  };
}
var data = cards_default;
var cards = new Map(data.cards.map((c) => [
  c.id,
  toCardDef(c)
]));
function cardDef(cardId) {
  const def = cards.get(cardId);
  if (!def) throw new Error(`Unknown card id: ${cardId}`);
  return def;
}
function tryCardDef(cardId) {
  return cards.get(cardId);
}
function isIce(def) {
  return def.type === "ice";
}

// src/cards/effects.ts
var B = [
  // ------------------------------------------------------------------ Runner
  {
    cardId: "the_catalyst_convention_breaker",
    support: "supported",
    triggers: [
      {
        id: "identity",
        kind: "identity"
      }
    ],
    note: "Starter game only identity; no special abilities."
  },
  {
    cardId: "carmen",
    support: "supported",
    breakAbility: {
      breaks: [
        "sentry"
      ],
      count: 1,
      creditCost: 1
    },
    pumpAbility: {
      creditCost: 2,
      amount: 3
    },
    note: "Install discount (2 credits) when a successful run was made this turn is supported."
  },
  {
    cardId: "cleaver",
    support: "supported",
    breakAbility: {
      breaks: [
        "barrier"
      ],
      count: 2,
      creditCost: 1
    },
    pumpAbility: {
      creditCost: 2,
      amount: 1
    }
  },
  {
    cardId: "mayfly",
    support: "supported",
    breakAbility: {
      breaks: [],
      count: 1,
      creditCost: 1
    },
    pumpAbility: {
      creditCost: 1,
      amount: 1
    },
    triggers: [
      {
        id: "run-trash-program",
        kind: "run-trash-program"
      }
    ],
    note: "Interpreted as: trashed at the end of any run while installed (see docs/rules-questions.md)."
  },
  {
    cardId: "unity",
    support: "supported",
    breakAbility: {
      breaks: [
        "code_gate"
      ],
      count: 1,
      creditCost: 1
    },
    pumpAbility: {
      creditCost: 1,
      amount: "icebreakers-installed"
    }
  },
  {
    cardId: "sure_gamble",
    support: "supported"
  },
  {
    cardId: "creative_commission",
    support: "supported"
  },
  {
    cardId: "vrcation",
    support: "supported"
  },
  {
    cardId: "jailbreak",
    support: "supported"
  },
  {
    cardId: "overclock",
    support: "supported"
  },
  {
    cardId: "tread_lightly",
    support: "supported"
  },
  {
    cardId: "docklands_pass",
    support: "supported",
    triggers: [
      {
        id: "first-hq-breach-extra-access",
        kind: "first-hq-breach-extra-access",
        amount: 1
      }
    ]
  },
  {
    cardId: "pennyshaver",
    support: "supported",
    triggers: [
      {
        id: "console",
        kind: "console",
        amount: 1
      },
      {
        id: "successful-run-place-credit",
        kind: "successful-run-place-credit",
        amount: 1
      },
      {
        id: "click-place-and-take",
        kind: "runner-click-load-credits",
        amount: 1
      }
    ],
    paidAbilities: [
      {
        id: "place-and-take-all",
        title: "Place 1 credit on this, then take all credits from it",
        clickCost: 1
      }
    ]
  },
  {
    cardId: "red_team",
    support: "supported",
    triggers: [
      {
        id: "on-install-load-credits",
        kind: "on-install-load-credits",
        amount: 12
      },
      {
        id: "empty-then-trash",
        kind: "empty-then-trash"
      },
      {
        id: "successful-run-take-credits",
        kind: "successful-run-take-credits",
        amount: 3
      }
    ],
    paidAbilities: [
      {
        id: "run-central",
        title: "Run a central server you have not run this turn",
        clickCost: 1,
        needsServer: "central-not-run-this-turn"
      }
    ]
  },
  {
    cardId: "smartware_distributor",
    support: "supported",
    triggers: [
      {
        id: "runner-turn-start-take-credits",
        kind: "runner-turn-start-take-credits",
        amount: 1
      },
      {
        id: "click-load-credits",
        kind: "runner-click-load-credits",
        amount: 3
      }
    ],
    paidAbilities: [
      {
        id: "place-3",
        title: "Place 3 credits on this resource",
        clickCost: 1
      }
    ]
  },
  {
    cardId: "telework_contract",
    support: "supported",
    triggers: [
      {
        id: "on-install-load-credits",
        kind: "on-install-load-credits",
        amount: 9
      },
      {
        id: "empty-then-trash",
        kind: "empty-then-trash"
      }
    ],
    paidAbilities: [
      {
        id: "take-3",
        title: "Take 3 credits from this resource",
        clickCost: 1,
        oncePerTurn: true
      }
    ]
  },
  {
    cardId: "verbal_plasticity",
    support: "supported",
    triggers: [
      {
        id: "first-basic-draw-double",
        kind: "first-basic-draw-double"
      }
    ]
  },
  // -------------------------------------------------------------------- Corp
  {
    cardId: "the_syndicate_profit_over_principle",
    support: "supported",
    triggers: [
      {
        id: "identity",
        kind: "identity"
      }
    ],
    note: "Starter game only identity; no special abilities."
  },
  {
    cardId: "hedge_fund",
    support: "supported"
  },
  {
    cardId: "government_subsidy",
    support: "supported"
  },
  {
    cardId: "seamless_launch",
    support: "supported",
    note: "Requires choosing an installed card not installed this turn (enforced)."
  },
  {
    cardId: "nico_campaign",
    support: "supported",
    triggers: [
      {
        id: "on-rez-load-credits",
        kind: "on-rez-load-credits",
        amount: 9
      },
      {
        id: "corp-turn-start-take-3",
        kind: "turn-start-take-credits",
        amount: 3
      },
      {
        id: "empty-then-trash-and-draw",
        kind: "empty-then-trash-and-draw"
      }
    ]
  },
  {
    cardId: "regolith_mining_license",
    support: "supported",
    triggers: [
      {
        id: "on-rez-load-credits",
        kind: "on-rez-load-credits",
        amount: 15
      },
      {
        id: "corp-click-take-credits",
        kind: "corp-click-take-credits",
        amount: 3
      },
      {
        id: "empty-then-trash",
        kind: "empty-then-trash"
      }
    ],
    paidAbilities: [
      {
        id: "take-3",
        title: "Take 3 credits from this asset",
        clickCost: 1
      }
    ]
  },
  {
    cardId: "urtica_cipher",
    support: "supported",
    triggers: [
      {
        id: "access-damage-installed",
        kind: "access-damage-installed"
      }
    ]
  },
  {
    cardId: "manegarm_skunkworks",
    support: "supported",
    triggers: [
      {
        id: "approach-toll",
        kind: "approach-toll"
      }
    ]
  },
  {
    cardId: "offworld_office",
    support: "supported",
    triggers: [
      {
        id: "score-gain-7",
        kind: "score-gain-credits",
        amount: 7
      }
    ]
  },
  {
    cardId: "superconducting_hub",
    support: "supported",
    triggers: [
      {
        id: "score-optional-draw-2",
        kind: "score-optional-draw",
        amount: 2
      }
    ],
    note: "+2 maximum hand size while in the Corp score area is a static effect (supported)."
  },
  {
    cardId: "send_a_message",
    support: "supported",
    triggers: [
      {
        id: "scored-or-stolen-rez-ice",
        kind: "scored-or-stolen-optional-rez-ice",
        optional: true
      }
    ]
  },
  {
    cardId: "tithe",
    support: "supported",
    subroutines: [
      {
        id: "net-1",
        kind: "net-damage",
        amount: 1
      },
      {
        id: "gain-1",
        kind: "gain-credits",
        amount: 1
      }
    ]
  },
  {
    cardId: "palisade",
    support: "supported",
    subroutines: [
      {
        id: "etr",
        kind: "end-run"
      }
    ],
    note: "+2 strength while protecting a remote server (static, supported)."
  },
  {
    cardId: "whitespace",
    support: "supported",
    subroutines: [
      {
        id: "lose-3",
        kind: "lose-credits",
        amount: 3
      },
      {
        id: "etr-if-6-or-less",
        kind: "lose-credits-then-conditional-end-run",
        creditsAtMost: 6
      }
    ]
  },
  {
    cardId: "diviner",
    support: "supported",
    subroutines: [
      {
        id: "net-1-odd-etr",
        kind: "diviner-damage"
      }
    ],
    note: "Odd printed play/install cost of the trashed card ends the run (0 is not odd)."
  },
  {
    cardId: "karuna",
    support: "supported",
    subroutines: [
      {
        id: "net-2-jackout",
        kind: "net-damage-then-optional-jack-out",
        amount: 2
      },
      {
        id: "net-2",
        kind: "net-damage",
        amount: 2
      }
    ]
  },
  {
    cardId: "bran_1_0",
    support: "supported",
    subroutines: [
      {
        id: "install-ice-inward",
        kind: "install-ice-inward"
      },
      {
        id: "etr-1",
        kind: "end-run"
      },
      {
        id: "etr-2",
        kind: "end-run"
      }
    ],
    breakAbility: {
      breaks: [],
      count: 1,
      creditCost: 0,
      bioroid: true
    },
    note: "Runner breaks subroutines with 'lose [click]' instead of credits; no strength requirement."
  }
];
var behaviors = new Map(B.map((b) => [
  b.cardId,
  b
]));
function supportStatus(cardId) {
  return behaviors.get(cardId)?.support ?? "unsupported";
}
function cardSupportReport(cardIds) {
  const supported = [];
  const partial = [];
  const unsupported = [];
  for (const id of cardIds) {
    const status = supportStatus(id);
    if (status === "supported") supported.push(id);
    else if (status === "partial") partial.push(id);
    else unsupported.push(id);
  }
  return {
    supported,
    partial,
    unsupported
  };
}

// data/starter-decks.json
var starter_decks_default = {
  _source: {
    provider: "NetrunnerDB",
    retrieved_at: "2026-10-24",
    fixtures: [
      {
        name: "starter-decks-cyberclick-v1",
        runner_decklist_id: "4b9cf488-5bd9-4415-a57a-0864d4d0e600",
        corp_decklist_id: "382f2e2d-eabf-47c8-ae55-adb93b3df3e9"
      }
    ]
  },
  decks: {
    runner: {
      decklist_id: "4b9cf488-5bd9-4415-a57a-0864d4d0e600",
      name: "[System Gateway] Runner Starter Deck",
      user_id: "CyberClick",
      side: "runner",
      identity: "the_catalyst_convention_breaker",
      cards: {
        carmen: 2,
        cleaver: 2,
        creative_commission: 2,
        docklands_pass: 1,
        jailbreak: 3,
        mayfly: 2,
        overclock: 2,
        pennyshaver: 1,
        red_team: 1,
        smartware_distributor: 2,
        sure_gamble: 3,
        telework_contract: 2,
        the_catalyst_convention_breaker: 1,
        tread_lightly: 2,
        unity: 2,
        verbal_plasticity: 1,
        vrcation: 2
      },
      num_cards: 30,
      influence_spent: 33,
      follows_basic_deckbuilding_rules: true
    },
    corp: {
      decklist_id: "382f2e2d-eabf-47c8-ae55-adb93b3df3e9",
      name: "[System Gateway] Corp Starter Deck",
      user_id: "CyberClick",
      side: "corp",
      identity: "the_syndicate_profit_over_principle",
      cards: {
        bran_1_0: 2,
        diviner: 2,
        government_subsidy: 2,
        hedge_fund: 3,
        karuna: 2,
        manegarm_skunkworks: 1,
        nico_campaign: 2,
        offworld_office: 3,
        palisade: 3,
        regolith_mining_license: 2,
        seamless_launch: 2,
        send_a_message: 2,
        superconducting_hub: 2,
        the_syndicate_profit_over_principle: 1,
        tithe: 2,
        urtica_cipher: 2,
        whitespace: 2
      },
      num_cards: 34,
      influence_spent: 29,
      follows_basic_deckbuilding_rules: true
    }
  }
};

// src/decks/starter-decks-cyberclick-v1.ts
var data2 = starter_decks_default;
var importedCardIds = new Set(cards_default.cards.map((c) => c.id));
function starterDeckConfigs() {
  const toConfig = (entry) => ({
    identity: entry.identity,
    cards: Object.entries(entry.cards).filter(([cardId, count]) => count > 0 && cardId !== entry.identity).map(([cardId, count]) => ({
      cardId,
      count
    }))
  });
  return {
    corp: toConfig(data2.decks.corp),
    runner: toConfig(data2.decks.runner)
  };
}
function starterPoolCardIds() {
  const s = starterDeckConfigs();
  const ids = [
    s.runner.identity,
    s.corp.identity,
    ...s.runner.cards.map((e) => e.cardId),
    ...s.corp.cards.map((e) => e.cardId)
  ];
  return [
    ...new Set(ids)
  ];
}
function verifyFixtureAgainstSnapshot() {
  const problems = [];
  for (const side of [
    "runner",
    "corp"
  ]) {
    const entry = data2.decks[side];
    for (const [cardId, count] of Object.entries(entry.cards)) {
      if (!importedCardIds.has(cardId)) {
        problems.push(`${side}: ${cardId} missing from card catalogue`);
      }
      if (count < 1) problems.push(`${side}: ${cardId} has count ${count}`);
    }
  }
  return problems;
}

// src/engine/state.ts
function player(state, side) {
  return side === "corp" ? state.corp : state.runner;
}
function installedInRoot(state, id) {
  return state.corp.installed.filter((c) => c.zone === "play-area" && c.server === id);
}
function centralServer(state, id) {
  return {
    id,
    root: installedInRoot(state, id),
    ice: []
  };
}
function serverById(state, id) {
  if (id === "hq" || id === "rd" || id === "archives") return centralServer(state, id);
  return state.remotes.find((s) => s.id === id);
}
function nextRemoteId(state) {
  let n = 1;
  const ids = new Set(state.remotes.map((s) => s.id));
  while (ids.has(`remote-${n}`)) n++;
  return `remote-${n}`;
}
function createRemote(state) {
  const server = {
    id: nextRemoteId(state),
    root: [],
    ice: []
  };
  state.remotes.push(server);
  return server;
}
function pruneEmptyRemotes(state) {
  state.remotes = state.remotes.filter((s) => s.root.length > 0 || s.ice.length > 0);
}
function findCard(state, instanceId) {
  for (const side of [
    "corp",
    "runner"
  ]) {
    const p = player(state, side);
    if (p.identity.id === instanceId) return {
      card: p.identity,
      side
    };
    for (const list of [
      p.hand,
      p.deck,
      p.discard,
      p.score,
      p.installed
    ]) {
      const c = list.find((x) => x.id === instanceId);
      if (c) return {
        card: c,
        side
      };
    }
  }
  for (const s of state.remotes) {
    const c = [
      ...s.root,
      ...s.ice
    ].find((x) => x.id === instanceId);
    if (c) return {
      card: c,
      side: "corp"
    };
  }
  return null;
}
function drawCards(state, side, count) {
  const p = player(state, side);
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    const card = p.deck.shift();
    if (!card) break;
    card.zone = "hand";
    p.hand.push(card);
    drawn++;
  }
  if (drawn > 0) state.log.push({
    type: "draw",
    player: side,
    count: drawn
  });
  return drawn;
}
function availableCredits(state, side) {
  const p = player(state, side);
  if (side === "runner" && state.run?.fundCredits) return p.credits + state.run.fundCredits;
  return p.credits;
}
function spendCredits(state, side, amount) {
  const p = player(state, side);
  let left = amount;
  if (side === "runner" && state.run?.fundCredits) {
    const fromFund = Math.min(left, state.run.fundCredits);
    state.run.fundCredits -= fromFund;
    left -= fromFund;
  }
  p.credits = Math.max(0, p.credits - left);
  state.log.push({
    type: "spend-credits",
    player: side,
    amount
  });
}
function gainCredits(state, side, amount) {
  player(state, side).credits += amount;
  state.log.push({
    type: "gain-credits",
    player: side,
    amount
  });
}
function loseCredits(state, side, amount) {
  const p = player(state, side);
  const lost = Math.min(p.credits, amount);
  p.credits -= lost;
  if (lost > 0) state.log.push({
    type: "lose-credits",
    player: side,
    amount: lost
  });
  return lost;
}
function spendClicks(state, side, amount) {
  const p = player(state, side);
  const spent = Math.min(p.clicks, amount);
  p.clicks -= spent;
  if (spent > 0) state.log.push({
    type: "spend-clicks",
    player: side,
    amount: spent
  });
  return spent;
}
function detachFromPlayer(p, card) {
  if (p.identity.id === card.id) return;
  for (const list of [
    p.hand,
    p.deck,
    p.discard,
    p.score,
    p.installed
  ]) {
    const i = list.findIndex((c) => c.id === card.id);
    if (i >= 0) list.splice(i, 1);
  }
}
function moveCardTo(state, card, zone, side, opts = {}) {
  const from = findCard(state, card.id);
  if (from) detachFromPlayer(player(state, from.side), card);
  for (const s of state.remotes) {
    const i = s.root.findIndex((c) => c.id === card.id);
    if (i >= 0) s.root.splice(i, 1);
    const j = s.ice.findIndex((c) => c.id === card.id);
    if (j >= 0) s.ice.splice(j, 1);
  }
  card.zone = zone;
  if (zone !== "play-area") card.server = void 0;
  card.iceIndex = void 0;
  const p = player(state, side);
  switch (zone) {
    case "hand":
      p.hand.push(card);
      break;
    case "deck":
      if (opts.topOfDeck) p.deck.unshift(card);
      else p.deck.push(card);
      break;
    case "discard":
      p.discard.unshift(card);
      break;
    case "score":
      p.score.push(card);
      card.advancement = 0;
      break;
    case "play-area":
      p.installed.push(card);
      if (opts.server) card.server = opts.server;
      break;
  }
}
function toDiscard(state, card, reason) {
  moveCardTo(state, card, "discard", card.owner);
  state.log.push({
    type: "trash",
    cardId: card.id,
    from: reason
  });
}
function dealDamage(state, amount, kind = "net", rng) {
  if (amount <= 0) return [];
  const rp = state.runner;
  if (amount > rp.hand.length) {
    const trashed2 = [
      ...rp.hand
    ];
    for (const c of trashed2) moveCardTo(state, c, "discard", "runner");
    state.log.push({
      type: "damage",
      player: "runner",
      amount,
      kind,
      trashed: trashed2.map((c) => c.id)
    });
    state.log.push({
      type: "flatline"
    });
    setWinner(state, "corp", "Runner was flatlined by damage");
    return trashed2.map((c) => c.id);
  }
  const trashed = [];
  let left = amount;
  while (left > 0 && rp.hand.length > 0) {
    const idx = Math.floor(rng() * rp.hand.length);
    trashed.push(...rp.hand.splice(idx, 1));
    left--;
  }
  for (const c of trashed) {
    c.zone = "discard";
    rp.discard.unshift(c);
  }
  state.log.push({
    type: "damage",
    player: "runner",
    amount,
    kind,
    trashed: trashed.map((c) => c.id)
  });
  return trashed.map((c) => c.id);
}
function setWinner(state, winner, reason) {
  if (state.winner) return;
  state.winner = winner;
  state.winReason = reason;
  state.turn.phase = "game-over";
  state.log.push({
    type: "game-end",
    winner,
    reason
  });
}
function memoryUsed(state) {
  let used = 0;
  for (const c of state.runner.installed) used += cardDef(c.cardId).memoryCost ?? 0;
  return used;
}
function memoryLimit(state) {
  let limit = 4;
  limit += state.runner.memoryLimitMod;
  for (const c of state.runner.installed) {
    const b = behaviors.get(c.cardId);
    if (b?.triggers?.some((t) => t.kind === "console" && t.amount === 1)) limit += 1;
  }
  return limit;
}
function isIcebreaker(card) {
  const def = cardDef(card.cardId);
  return def.type === "program" && def.subtypes.includes("icebreaker");
}
function isRezzedIce(card) {
  return isIce(cardDef(card.cardId)) && card.rezzed === true;
}
function addHostedCredits(state, card, amount) {
  card.hostedCredits = (card.hostedCredits ?? 0) + amount;
  state.log.push({
    type: "load-credits",
    targetId: card.id,
    amount
  });
}
function takeCreditsFrom(state, card, amount) {
  const have = card.hostedCredits ?? 0;
  const taken = Math.min(have, amount);
  card.hostedCredits = have - taken;
  state.log.push({
    type: "take-credits",
    targetId: card.id,
    amount: taken,
    player: card.owner
  });
  return taken;
}

// src/engine/rng.ts
function rngNext(state) {
  state.rngState = state.rngState + 1831565813 | 0;
  let t = state.rngState;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function rngInt(state, n) {
  return Math.floor(rngNext(state) * n);
}
function shuffle(state, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rngInt(state, i + 1);
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

// src/engine/runs.ts
function iceAt(state, server) {
  if (server === "hq" || server === "rd" || server === "archives") return [];
  return serverById(state, server).ice;
}
function rezCostFor(state, card) {
  const def = cardDef(card.cardId);
  let cost;
  if (isIce(def)) {
    cost = serverById(state, card.server).ice.length;
  } else {
    cost = def.cost ?? 0;
  }
  if (isIce(def) && state.run?.rezCostIncrease) cost += state.run.rezCostIncrease;
  return cost;
}
function rezCard(state, card, free = false) {
  if (card.rezzed) return true;
  if (!free) {
    const cost = rezCostFor(state, card);
    if (cost > state.corp.credits) return false;
    spendCredits(state, "corp", cost);
  }
  card.rezzed = true;
  state.log.push({
    type: "rez",
    cardId: card.id
  });
  return true;
}
function initiateRun(state, server, source) {
  const fund = state.runner.pendingRunFund;
  state.runner.pendingRunFund = 0;
  state.run = {
    server,
    position: null,
    phase: "initiation",
    broken: [],
    resolved: [],
    successful: false,
    unsuccessful: false,
    source,
    fundCredits: fund > 0 ? fund : void 0
  };
  state.breach = null;
  state.log.push({
    type: "run-start",
    server,
    source
  });
}
function completeInitiation(state) {
  const run = state.run;
  const ice = iceAt(state, run.server);
  if (ice.length > 0) {
    run.position = ice.length - 1;
    run.currentIceId = ice[run.position].id;
    run.phase = "approach-ice";
    state.log.push({
      type: "approach-ice",
      cardId: run.currentIceId
    });
    return;
  }
  run.position = null;
  run.currentIceId = void 0;
  run.phase = "movement";
}
function beginEncounter(state) {
  const run = state.run;
  const ice = iceAt(state, run.server);
  const current = run.position !== null ? ice[run.position] : void 0;
  if (!current) {
    run.phase = "movement";
    return;
  }
  run.currentIceId = current.id;
  run.phase = "encounter-ice";
  run.broken = [];
  run.resolved = [];
  run.encounterStarted = true;
  run.awaitingChoice = false;
  state.log.push({
    type: "encounter-ice",
    cardId: current.id
  });
}
function passIce(state) {
  const run = state.run;
  const ice = iceAt(state, run.server);
  const current = run.position !== null ? ice[run.position] : null;
  if (current) state.log.push({
    type: "pass-ice",
    cardId: current.id
  });
  if (run.position === null || run.position === 0) {
    run.position = null;
    run.currentIceId = void 0;
    run.phase = "success";
    return;
  }
  run.position -= 1;
  run.phase = "approach-ice";
  run.currentIceId = ice[run.position].id;
  run.encounterStarted = false;
  state.log.push({
    type: "approach-ice",
    cardId: run.currentIceId
  });
}
function declareSuccess(state) {
  const run = state.run;
  run.successful = true;
  run.phase = "success";
  state.log.push({
    type: "run-successful",
    server: run.server
  });
  state.runner.successfulRunThisTurn = true;
}
function endRun(state) {
  const run = state.run;
  if (!run) return;
  run.phase = "run-ends";
}
function finishRun(state) {
  const run = state.run;
  const successful = run.successful;
  state.log.push({
    type: "run-end",
    server: run.server,
    successful
  });
  state.run = null;
}

// src/engine/effects.ts
function queuePrompt(state, prompt) {
  state.prompts.push(prompt);
}
function fireInstall(state, card) {
  const b = behaviors.get(card.cardId);
  if (!b) return;
  for (const t of b.triggers ?? []) {
    if (t.kind === "on-install-load-credits") addHostedCredits(state, card, t.amount ?? 0);
  }
}
function fireAccessBegin(state, card) {
  if (card.cardId !== "urtica_cipher") return;
  if (card.zone !== "play-area") return;
  const amount = 2 + (card.advancement ?? 0);
  dealDamage(state, amount, "net", () => rngNext(state));
}
function fireScore(state, card) {
  const b = behaviors.get(card.cardId);
  if (!b) return;
  for (const t of b.triggers ?? []) {
    if (t.kind === "score-gain-credits") gainCredits(state, "corp", t.amount ?? 0);
    if (t.kind === "score-optional-draw") {
      queuePrompt(state, {
        kind: "choose-one",
        id: state.nextPromptId++,
        player: "corp",
        title: `${cardDef(card.cardId).title}: draw ${t.amount} cards?`,
        options: [
          {
            id: "draw",
            label: "Draw 2 cards",
            effect: {
              kind: "corp-draw",
              amount: t.amount ?? 2
            }
          },
          {
            id: "pass",
            label: "Pass",
            effect: {
              kind: "no-op"
            }
          }
        ]
      });
    }
    if (t.kind === "scored-or-stolen-optional-rez-ice") queueFreeRezPrompt(state, card);
  }
}
function fireSteal(state, card) {
  const b = behaviors.get(card.cardId);
  if (!b) return;
  for (const t of b.triggers ?? []) {
    if (t.kind === "scored-or-stolen-optional-rez-ice") queueFreeRezPrompt(state, card);
  }
}
function queueFreeRezPrompt(state, card) {
  if (card.cardId !== "send_a_message") return;
  const unrezzedIce = iceAtAllServers(state).filter((c) => c.rezzed !== true);
  queuePrompt(state, {
    kind: "choose-one",
    id: state.nextPromptId++,
    player: "corp",
    title: "Send a Message: rez 1 installed piece of ice, ignoring all costs?",
    options: [
      ...unrezzedIce.map((c) => ({
        id: `rez-${c.id}`,
        label: `Rez ${cardDef(c.cardId).title} (free)`,
        targetId: c.id,
        effect: {
          kind: "rez-card-free",
          targetId: c.id
        }
      })),
      {
        id: "pass",
        label: "Pass",
        effect: {
          kind: "no-op"
        }
      }
    ]
  });
}
function iceAtAllServers(state) {
  const ids = [];
  for (const s of state.remotes) ids.push(...s.ice);
  for (const s of [
    "hq",
    "rd",
    "archives"
  ]) ids.push(...iceAt(state, s));
  for (const c of state.corp.installed) if (c.zone === "play-area" && c.server) ids.push(c);
  return ids;
}
function fireSuccessfulRun(state) {
  const run = state.run;
  if (!run) return;
  const runner = state.runner;
  for (const c of runner.installed) {
    if (c.cardId === "pennyshaver") addHostedCredits(state, c, 1);
  }
  if (run.source === "jailbreak") drawCards(state, "runner", 1);
  if (run.source?.startsWith("red-team:")) {
    const id = run.source.slice("red-team:".length);
    const found = runner.installed.find((c) => c.id === id);
    if (found) {
      const taken = takeCreditsFrom(state, found, 3);
      if (taken > 0) {
        runner.credits += taken;
        checkEmpty(state, found);
      }
    }
  }
}
function subroutineCount(card) {
  return behaviors.get(card.cardId)?.subroutines?.length ?? 0;
}
function resolveSubroutine(state, ice, index) {
  const sub = behaviors.get(ice.cardId)?.subroutines?.[index];
  if (!sub) return;
  state.run.resolved.push(index);
  state.log.push({
    type: "resolve-subroutine",
    cardId: ice.id,
    subIndex: index
  });
  switch (sub.kind) {
    case "net-damage":
      dealDamage(state, sub.amount ?? 1, "net", () => rngNext(state));
      break;
    case "gain-credits":
      gainCredits(state, "corp", sub.amount ?? 1);
      break;
    case "lose-credits":
      loseCredits(state, "runner", sub.amount ?? 3);
      break;
    case "end-run":
      endRun(state);
      break;
    case "net-damage-then-optional-jack-out": {
      dealDamage(state, sub.amount ?? 2, "net", () => rngNext(state));
      if (state.winner) return;
      queuePrompt(state, {
        kind: "choose-one",
        id: state.nextPromptId++,
        player: "runner",
        title: "Karuna: the Runner may jack out",
        options: [
          {
            id: "jack-out",
            label: "Jack out",
            effect: {
              kind: "end-run"
            }
          },
          {
            id: "pass",
            label: "Resolve remaining subroutines",
            effect: {
              kind: "no-op"
            }
          }
        ]
      });
      break;
    }
    case "diviner-damage": {
      const trashed = dealDamage(state, 1, "net", () => rngNext(state));
      if (state.winner) return;
      if (oddCostTrashed(state, trashed)) endRun(state);
      break;
    }
    case "lose-credits-then-conditional-end-run": {
      loseCredits(state, "runner", sub.amount ?? 3);
      if ((sub.creditsAtMost ?? 6) >= state.runner.credits) endRun(state);
      break;
    }
    case "install-ice-inward": {
      queuePrompt(state, {
        kind: "choose-one",
        id: state.nextPromptId++,
        player: "corp",
        title: `${cardDef(ice.cardId).title}: install 1 piece of ice from HQ or Archives, ignoring all costs`,
        options: [
          ...state.corp.hand.filter((c) => cardDef(c.cardId).type === "ice").map((c) => ({
            id: `install-${c.id}`,
            label: `Install ${cardDef(c.cardId).title} from HQ`,
            targetId: c.id,
            effect: {
              kind: "corp-install-ice-inward",
              iceId: ice.id
            }
          })),
          ...state.corp.discard.filter((c) => cardDef(c.cardId).type === "ice").map((c) => ({
            id: `install-${c.id}`,
            label: `Install ${cardDef(c.cardId).title} from Archives`,
            targetId: c.id,
            effect: {
              kind: "corp-install-ice-inward",
              iceId: ice.id
            }
          })),
          {
            id: "pass",
            label: "Pass",
            effect: {
              kind: "no-op"
            }
          }
        ]
      });
      break;
    }
  }
}
function oddCostTrashed(state, trashed) {
  for (const id of trashed) {
    const found = findCard(state, id);
    if (!found) continue;
    const cost = cardDef(found.card.cardId).cost ?? null;
    if (cost !== null && cost % 2 === 1) return true;
  }
  return false;
}
function applyChoice(state, effect) {
  if (!effect) return;
  switch (effect.kind) {
    case "no-op":
      break;
    case "end-run":
      endRun(state);
      break;
    case "pay-toll-credits":
      spendToll(state, true);
      break;
    case "pay-toll-clicks":
      spendToll(state, false);
      break;
    case "rez-card-free": {
      const found = findCard(state, effect.targetId);
      if (found) rezCard(state, found.card, true);
      break;
    }
    case "corp-draw":
      drawCards(state, "corp", effect.amount);
      break;
    case "corp-install-ice-inward": {
      installIceInward(state, effect.targetId, effect.iceId);
      break;
    }
    case "runner-take-3-red-team":
      break;
  }
}
function spendToll(state, credits) {
  const run = state.run;
  if (!run) return;
  if (credits) {
    if (state.runner.credits < 5) return;
    state.runner.credits -= 5;
    state.log.push({
      type: "lose-credits",
      player: "runner",
      amount: 5
    });
  } else {
    if (state.runner.clicks < 2) return;
    state.runner.clicks -= 2;
    state.log.push({
      type: "lose-clicks",
      player: "runner",
      amount: 2
    });
  }
  run.tollPaid = true;
}
function installIceInward(state, targetId, fromIceId) {
  const found = findCard(state, targetId);
  const from = findCard(state, fromIceId);
  if (!found || !from) return;
  const card = found.card;
  const server = from.card.server;
  const detach = (list) => {
    const i = list.findIndex((c) => c.id === card.id);
    if (i >= 0) list.splice(i, 1);
  };
  detach(state.corp.hand);
  detach(state.corp.discard);
  detach(state.corp.deck);
  detach(state.corp.installed);
  card.zone = "play-area";
  card.server = server;
  card.advancement = 0;
  card.rezzed = false;
  const iceList = iceAt(state, server);
  const fromIndex = iceList.findIndex((c) => c.id === fromIceId);
  if (fromIndex < 0) return;
  iceList.splice(fromIndex, 0, card);
  state.log.push({
    type: "install",
    cardId: card.id,
    player: "corp",
    server
  });
}
function abilityLegality(state, side, card, abilityIndex) {
  const b = behaviors.get(card.cardId);
  const ability = b?.paidAbilities?.[abilityIndex];
  if (!ability) return {
    ok: false,
    reason: "No such ability",
    title: "",
    index: abilityIndex
  };
  const onceKey = `${card.id}:${abilityIndex}`;
  if (ability.oncePerTurn && player(state, side).usedOncePerTurn.includes(onceKey)) {
    return {
      ok: false,
      reason: "Once per turn",
      title: ability.title,
      index: abilityIndex
    };
  }
  if (ability.clickCost && player(state, side).clicks < ability.clickCost) {
    return {
      ok: false,
      reason: "Not enough clicks",
      title: ability.title,
      index: abilityIndex
    };
  }
  if (ability.requiresHostedCredits && (card.hostedCredits ?? 0) < ability.requiresHostedCredits) {
    return {
      ok: false,
      reason: "No hosted credits",
      title: ability.title,
      index: abilityIndex
    };
  }
  if (ability.needsServer === "central-not-run-this-turn") {
    const available = centralServersNotRunThisTurn(state);
    if (available.length === 0) {
      return {
        ok: false,
        reason: "No central server to run",
        title: ability.title,
        index: abilityIndex
      };
    }
  }
  return {
    ok: true,
    title: ability.title,
    index: abilityIndex
  };
}
function centralServersNotRunThisTurn(state) {
  const all = [
    "hq",
    "rd",
    "archives"
  ];
  return all.filter((s) => !state.runner.ranServersThisTurn.includes(s));
}
function serversForAbility(state, card, abilityIndex) {
  const ability = behaviors.get(card.cardId)?.paidAbilities?.[abilityIndex];
  if (!ability?.needsServer) return [];
  if (ability.needsServer === "central-not-run-this-turn") {
    return centralServersNotRunThisTurn(state);
  }
  return [];
}
function applyPaidAbility(state, side, card, abilityIndex, server) {
  const legality = abilityLegality(state, side, card, abilityIndex);
  if (!legality.ok) return false;
  const ability = behaviors.get(card.cardId)?.paidAbilities?.[abilityIndex];
  if (ability.clickCost) {
    state.log.push({
      type: "spend-clicks",
      player: side,
      amount: ability.clickCost
    });
    player(state, side).clicks -= ability.clickCost;
  }
  if (ability.oncePerTurn) {
    player(state, side).usedOncePerTurn.push(`${card.id}:${abilityIndex}`);
  }
  const runner = state.runner;
  if (card.cardId === "smartware_distributor") {
    addHostedCredits(state, card, 3);
    return true;
  }
  if (card.cardId === "telework_contract") {
    const taken = takeCreditsFrom(state, card, 3);
    runner.credits += taken;
    checkEmpty(state, card);
    return true;
  }
  if (card.cardId === "pennyshaver") {
    addHostedCredits(state, card, 1);
    const taken = takeCreditsFrom(state, card, 999);
    runner.credits += taken;
    return true;
  }
  if (card.cardId === "red_team" && ability.id === "run-central") {
    if (!server) return false;
    initiateRun(state, server, `red-team:${card.id}`);
    return true;
  }
  if (card.cardId === "regolith_mining_license" && ability.id === "take-3") {
    const taken = takeCreditsFrom(state, card, 3);
    state.corp.credits += taken;
    checkEmpty(state, card);
    return true;
  }
  return false;
}
function checkEmpty(state, card) {
  if ((card.hostedCredits ?? 0) > 0) return;
  const b = behaviors.get(card.cardId);
  if (!b) return;
  const trigger = (b.triggers ?? []).find((t) => t.kind === "empty-then-trash" || t.kind === "empty-then-trash-and-draw");
  if (!trigger) return;
  const draw = trigger.kind === "empty-then-trash-and-draw";
  state.log.push({
    type: "trash",
    cardId: card.id,
    from: "emptied"
  });
  toDiscard(state, card, "emptied");
  if (draw) drawCards(state, "corp", 1);
}

// src/engine/turns.ts
var CORP_CLICKS = 3;
var RUNNER_CLICKS = 4;
function resetTurnState(state, side) {
  const p = player(state, side);
  p.installedThisTurn = [];
  p.basicDrawThisTurn = false;
  p.successfulRunThisTurn = false;
  p.ranServersThisTurn = [];
  p.hqBreachesThisTurn = 0;
  p.usedOncePerTurn = [];
  p.pendingRunFund = 0;
}
function beginCorpTurn(state) {
  resetTurnState(state, "corp");
  state.prompts = [];
  state.run = null;
  state.breach = null;
  state.turn.number += 1;
  state.turn.player = "corp";
  state.turn.phase = "action";
  const corp = state.corp;
  corp.clicks = CORP_CLICKS;
  state.log.push({
    type: "turn-start",
    player: "corp",
    turn: state.turn.number
  });
  if (state.winner) return;
  const nicos = state.remotes.flatMap((s) => s.root).filter((c) => c.cardId === "nico_campaign" && c.rezzed);
  for (const nico of nicos) {
    const taken = Math.min(nico.hostedCredits ?? 0, 3);
    nico.hostedCredits = (nico.hostedCredits ?? 0) - taken;
    state.corp.credits += taken;
    if (taken > 0) {
      state.log.push({
        type: "take-credits",
        targetId: nico.id,
        amount: taken,
        player: "corp"
      });
    }
    checkEmptyAsset(state, nico, true);
  }
  if (state.winner) return;
  state.log.push({
    type: "mandatory-draw",
    player: "corp"
  });
  if (state.corp.deck.length === 0) {
    state.log.push({
      type: "decked",
      player: "corp"
    });
    setGameOver(state, "runner", "Corp could not draw from an empty R&D");
    state.turn.phase = "game-over";
    return;
  }
  drawCards(state, "corp", 1);
}
function beginRunnerTurn(state) {
  resetTurnState(state, "runner");
  state.prompts = [];
  state.run = null;
  state.breach = null;
  state.turn.player = "runner";
  state.turn.phase = "action";
  state.runner.clicks = RUNNER_CLICKS;
  state.log.push({
    type: "turn-start",
    player: "runner",
    turn: state.turn.number
  });
  for (const card of [
    ...state.runner.installed
  ]) {
    if (card.cardId !== "smartware_distributor") continue;
    const taken = Math.min(card.hostedCredits ?? 0, 1);
    card.hostedCredits = (card.hostedCredits ?? 0) - taken;
    state.runner.credits += taken;
    if (taken > 0) {
      state.log.push({
        type: "take-credits",
        targetId: card.id,
        amount: taken,
        player: "runner"
      });
    }
  }
}
function enterDiscardPhase(state) {
  if (state.winner) return;
  const side = state.turn.player;
  const p = player(state, side);
  state.turn.phase = "discard";
  if (side === "runner" && maxHandSize(state, "runner") < 0) {
    setGameOver(state, "corp", "Runner's maximum hand size dropped below 0");
    return;
  }
  const max = maxHandSize(state, side);
  if (p.hand.length > max) {
    state.prompts.push({
      kind: "discard",
      id: state.nextPromptId++,
      player: side,
      count: p.hand.length - max
    });
    return;
  }
  finishTurn(state);
}
function finishTurn(state) {
  if (state.winner) return;
  const side = state.turn.player;
  const leftover = player(state, side).clicks;
  if (leftover > 0) state.log.push({
    type: "lose-clicks",
    player: side,
    amount: leftover
  });
  player(state, side).clicks = 0;
  state.log.push({
    type: "turn-end",
    player: side,
    turn: state.turn.number
  });
  if (side === "corp") beginRunnerTurn(state);
  else beginCorpTurn(state);
}
function maxHandSize(state, side) {
  const p = player(state, side);
  const hubBonus = side === "corp" && state.corp.score.some((c) => c.cardId === "superconducting_hub") ? 2 : 0;
  return p.baseHandSize + p.maxHandSizeMod + hubBonus;
}
function checkEmptyAsset(state, card, drawOne) {
  if ((card.hostedCredits ?? 0) > 0) return;
  state.log.push({
    type: "trash",
    cardId: card.id,
    from: "emptied"
  });
  toDiscard(state, card, "emptied");
  if (drawOne) drawCards(state, "corp", 1);
}
function setGameOver(state, winner, reason) {
  if (state.winner) return;
  state.winner = winner;
  state.winReason = reason;
  state.turn.phase = "game-over";
  state.log.push({
    type: "game-end",
    winner,
    reason
  });
}

// src/engine/settle.ts
function settle(state) {
  let guard = 0;
  while (guard++ < 1e3) {
    if (state.winner) {
      state.prompts = [];
      state.run = null;
      state.breach = null;
      return;
    }
    if (state.prompts.length > 0) return;
    if (state.run) {
      if (state.breach) {
        if (stepBreach(state)) return;
        continue;
      }
      if (stepRun(state)) return;
      continue;
    }
    if (state.turn.phase === "action" && player(state, state.turn.player).clicks === 0) {
      state.turn.phase = "discard";
      promptOrFinishDiscard(state);
      if (state.prompts.length > 0) return;
      continue;
    }
    return;
  }
}
function promptOrFinishDiscard(state) {
  const side = state.turn.player;
  const p = player(state, side);
  if (side === "runner" && maxHandSize2(state, "runner") < 0) {
    setGameOver(state, "corp", "Runner's maximum hand size dropped below 0");
    return;
  }
  const max = maxHandSize2(state, side);
  if (p.hand.length > max) {
    state.prompts.push({
      kind: "discard",
      id: state.nextPromptId++,
      player: side,
      count: p.hand.length - max
    });
    return;
  }
  finishTurn2(state);
}
function finishTurn2(state) {
  if (state.winner) return;
  const side = state.turn.player;
  const leftover = player(state, side).clicks;
  if (leftover > 0) state.log.push({
    type: "lose-clicks",
    player: side,
    amount: leftover
  });
  player(state, side).clicks = 0;
  state.log.push({
    type: "turn-end",
    player: side,
    turn: state.turn.number
  });
  if (side === "corp") beginRunnerTurn(state);
  else beginCorpTurn(state);
}
function maxHandSize2(state, side) {
  const p = player(state, side);
  const hubBonus = side === "corp" && state.corp.score.some((c) => c.cardId === "superconducting_hub") ? 2 : 0;
  return p.baseHandSize + p.maxHandSizeMod + hubBonus;
}
function stepRun(state) {
  const run = state.run;
  switch (run.phase) {
    case "initiation":
      completeInitiation(state);
      return false;
    case "approach-ice":
      return approachIceStep(state);
    case "encounter-ice":
      return encounterStep(state);
    case "movement":
      return movementStep(state);
    case "success":
      successStep(state);
      return false;
    case "run-ends":
      finishRun(state);
      return false;
  }
}
function approachIceStep(state) {
  const run = state.run;
  const ice = currentIce(state);
  if (!ice) {
    run.phase = "movement";
    return false;
  }
  if (ice.rezzed === true) {
    beginEncounter(state);
    return false;
  }
  const options = corpRezOptions(state);
  if (options.length > 0) {
    state.prompts.push({
      kind: "rez-window",
      id: state.nextPromptId++,
      player: "corp",
      options
    });
    return true;
  }
  passIce(state);
  return false;
}
function currentIce(state) {
  const run = state.run;
  const ice = iceAt(state, run.server);
  return run.position !== null ? ice[run.position] ?? null : null;
}
function corpRootCards(state, server) {
  const root = state.corp.installed.filter((c) => c.zone === "play-area" && c.server === server);
  if (server.startsWith("remote")) {
    const s = state.remotes.find((x) => x.id === server);
    if (s) root.push(...s.root);
  }
  return root;
}
function corpRezOptions(state) {
  const run = state.run;
  const options = [];
  const ice = currentIce(state);
  if (ice && ice.rezzed !== true) {
    options.push({
      id: `rez-${ice.id}`,
      label: `Rez ${cardDef(ice.cardId).title} (${rezSafeCost(state, ice)}[credit])`,
      targetId: ice.id,
      creditCost: rezSafeCost(state, ice)
    });
  }
  for (const c of corpRootCards(state, run.server)) {
    if (c.rezzed === true) continue;
    const def = cardDef(c.cardId);
    if (def.type !== "asset" && def.type !== "upgrade") continue;
    options.push({
      id: `rez-${c.id}`,
      label: `Rez ${def.title} (${rezSafeCost(state, c)}[credit])`,
      targetId: c.id,
      creditCost: rezSafeCost(state, c)
    });
  }
  return options;
}
function rezSafeCost(state, card) {
  const def = cardDef(card.cardId);
  if (def.type === "ice") {
    const server = state.remotes.find((s) => s.ice.some((c) => c.id === card.id));
    if (server) return server.ice.length;
  }
  return def.cost ?? 0;
}
function encounterStep(state) {
  const run = state.run;
  const ice = currentIce(state);
  if (!ice) {
    run.phase = "movement";
    return false;
  }
  const total = subroutineCount(ice);
  const allHandled = Array.from({
    length: total
  }, (_, i) => i).every((i) => run.resolved.includes(i) || run.broken.includes(i));
  if (allHandled) {
    run.currentIceId = void 0;
    run.phase = "movement";
    run.jackOutOffered = false;
    return false;
  }
  return true;
}
function movementStep(state) {
  const run = state.run;
  const ice = iceAt(state, run.server);
  if (run.position === null) {
    if (approachToll(state)) return true;
    declareSuccess(state);
    return false;
  }
  run.currentIceId = void 0;
  if (run.position === 0) {
    run.position = null;
    run.phase = "movement";
    if (approachToll(state)) return true;
    declareSuccess(state);
    return false;
  }
  run.position -= 1;
  run.currentIceId = ice[run.position].id;
  run.phase = "approach-ice";
  return false;
}
function approachToll(state) {
  const run = state.run;
  if (run.tollPaid) return false;
  const manegarm = corpRootCards(state, run.server).find((c) => c.cardId === "manegarm_skunkworks" && c.rezzed === true);
  if (!manegarm) return false;
  state.prompts.push({
    kind: "choose-one",
    id: state.nextPromptId++,
    player: "runner",
    title: "Manegarm Skunkworks: end the run unless you spend [click][click] or pay 5[credit]",
    options: [
      {
        id: "toll-credits",
        label: "Pay 5 credits",
        creditCost: 5,
        effect: {
          kind: "pay-toll-credits"
        }
      },
      {
        id: "toll-clicks",
        label: "Spend [click][click]",
        clickCost: 2,
        effect: {
          kind: "pay-toll-clicks"
        }
      },
      {
        id: "toll-end",
        label: "End the run",
        effect: {
          kind: "end-run"
        }
      }
    ]
  });
  return true;
}
function successStep(state) {
  fireSuccessfulRun(state);
  if (state.winner) return;
  beginBreach(state, state.run.server);
}
function beginBreach(state, server) {
  const run = state.run;
  let limit = 1;
  if (server === "hq" || server === "rd") {
    if (run.source === "jailbreak") limit += 1;
    if (server === "hq" && state.runner.hqBreachesThisTurn === 0) {
      if (state.runner.installed.some((c) => c.cardId === "docklands_pass")) limit += 1;
    }
  }
  state.runner.hqBreachesThisTurn += 1;
  state.breach = {
    server,
    randomAccessLimit: limit,
    randomAccessesUsed: 0,
    chosen: []
  };
  state.log.push({
    type: "breach",
    server
  });
}
function stepBreach(state) {
  const breach = state.breach;
  if (breach.accessing) return true;
  const remaining = candidatesForBreach(state).filter((c) => !breach.chosen.includes(c.instanceId));
  if (remaining.length === 0) {
    state.breach = null;
    state.run.phase = "run-ends";
    return false;
  }
  if (remaining.length === 1) {
    doAccessChoice(state, remaining[0].instanceId);
    return Boolean(state.breach?.accessing) || state.prompts.length > 0;
  }
  return true;
}
function candidatesForBreach(state) {
  const run = state.run;
  const breach = state.breach;
  const server = run.server;
  const result = [];
  const push = (c, random) => {
    if (breach.chosen.includes(c.id)) return;
    result.push({
      instanceId: c.id,
      random
    });
  };
  for (const c of corpRootCards(state, server)) push(c, false);
  if (server === "hq") {
    if (breach.randomAccessesUsed < breach.randomAccessLimit) {
      for (const c of state.corp.hand) push(c, true);
    }
  } else if (server === "rd") {
    if (breach.randomAccessesUsed < breach.randomAccessLimit) {
      const top = state.corp.deck[0];
      if (top) push(top, true);
    }
  } else if (server === "archives") {
    for (const c of state.corp.discard) push(c, false);
  }
  return result;
}
function chooseRandomAccess(state) {
  const breach = state.breach;
  const random = candidatesForBreach(state).filter((c) => c.random && !breach.chosen.includes(c.instanceId));
  if (random.length === 0) return null;
  const idx = Math.floor(rngNext(state) * random.length);
  return random[idx].instanceId;
}
function doAccessChoice(state, instanceId) {
  const breach = state.breach;
  const found = findCard(state, instanceId);
  if (!found) return;
  breach.chosen.push(instanceId);
  if (found.card.zone === "hand" || found.card.zone === "deck") breach.randomAccessesUsed += 1;
  breach.accessing = instanceId;
  state.log.push({
    type: "access",
    cardId: instanceId,
    server: breach.server
  });
  fireAccessBegin(state, found.card);
  if (state.winner) return;
  state.prompts.push({
    kind: "access-decision",
    id: state.nextPromptId++,
    player: "runner",
    cardId: instanceId
  });
}
function finishAccess(state, trashed) {
  const breach = state.breach;
  const accessing = breach.accessing;
  const found = findCard(state, accessing);
  breach.accessing = void 0;
  if (!found) return;
  const card = found.card;
  const def = cardDef(card.cardId);
  if (trashed) {
    spendCredits(state, "runner", def.trashCost ?? 0);
    state.log.push({
      type: "trash",
      cardId: card.id,
      from: "access"
    });
    const wasAgenda = def.type === "agenda";
    toDiscard(state, card, "access");
    if (wasAgenda) {
      stealAgendaInstance(state, card.id);
      fireSteal(state, card);
    }
  }
  state.prompts = state.prompts.filter((pr) => pr.kind !== "access-decision");
  if (def.type === "agenda") {
    stealAgendaInstance(state, card.id);
    fireSteal(state, card);
  }
}
function stealAgendaInstance(state, cardId) {
  const found = findCard(state, cardId);
  if (!found) return;
  const card = found.card;
  const def = cardDef(card.cardId);
  card.zone = "score";
  card.rezzed = void 0;
  card.server = void 0;
  card.iceIndex = void 0;
  card.advancement = 0;
  for (const s of state.remotes) {
    const i = s.root.findIndex((c) => c.id === cardId);
    if (i >= 0) s.root.splice(i, 1);
  }
  for (const list of [
    state.corp.installed,
    state.corp.hand,
    state.corp.discard,
    state.corp.deck
  ]) {
    const i = list.findIndex((c) => c.id === cardId);
    if (i >= 0) list.splice(i, 1);
  }
  state.runner.score.push(card);
  state.runner.agendaPoints += def.agendaPoints ?? 0;
  state.log.push({
    type: "steal",
    cardId: card.id,
    points: def.agendaPoints ?? 0
  });
  checkVictory(state);
}
function scoreAgenda(state, cardId) {
  const found = findCard(state, cardId);
  if (!found) return;
  const card = found.card;
  const def = cardDef(card.cardId);
  card.zone = "score";
  card.rezzed = void 0;
  card.server = void 0;
  card.iceIndex = void 0;
  card.advancement = 0;
  for (const s of state.remotes) {
    const i = s.root.findIndex((c) => c.id === cardId);
    if (i >= 0) s.root.splice(i, 1);
  }
  for (const list of [
    state.corp.installed,
    state.corp.hand,
    state.corp.discard,
    state.corp.deck
  ]) {
    const i = list.findIndex((c) => c.id === cardId);
    if (i >= 0) list.splice(i, 1);
  }
  state.corp.score.push(card);
  state.corp.agendaPoints += def.agendaPoints ?? 0;
  state.log.push({
    type: "score",
    cardId: card.id,
    points: def.agendaPoints ?? 0
  });
  checkVictory(state);
  fireScore(state, card);
}
function checkVictory(state) {
  if (state.winner) return;
  if (state.corp.agendaPoints >= state.agendaPointTarget) {
    setGameOver(state, "corp", "Corp reached the agenda point target");
    return;
  }
  if (state.runner.agendaPoints >= state.agendaPointTarget) {
    setGameOver(state, "runner", "Runner reached the agenda point target");
  }
}
function takeMulligan(state) {
  if (state.prompts.length > 0) state.prompts.shift();
  const side = pendingMulliganPlayer(state);
  const p = player(state, side);
  for (const card of p.hand) {
    card.zone = "deck";
    p.deck.push(card);
  }
  p.hand = [];
  const rng = () => rngNext(state);
  for (let i = p.deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p.deck[i];
    p.deck[i] = p.deck[j];
    p.deck[j] = tmp;
  }
  let drawn = 0;
  for (let i = 0; i < 5; i++) {
    const card = p.deck.shift();
    if (!card) break;
    card.zone = "hand";
    p.hand.push(card);
    drawn++;
  }
  if (drawn > 0) state.log.push({
    type: "draw",
    player: p.side,
    count: drawn
  });
}
function pendingMulliganPlayer(state) {
  return state.prompts.find((p) => p.kind === "mulligan")?.player ?? "corp";
}

// src/engine/legal-moves.ts
function getLegalMoves(state, playerSide) {
  if (state.winner) return [];
  const moves = [];
  const p = player(state, playerSide);
  if (state.turn.phase === "mulligans") {
    const prompt2 = state.prompts.find((pr) => pr.kind === "mulligan");
    if (prompt2 && prompt2.player === playerSide) {
      moves.push({
        kind: "mulligan.take",
        player: playerSide
      });
      moves.push({
        kind: "mulligan.decline",
        player: playerSide
      });
    }
    return moves;
  }
  if (state.turn.phase === "discard") {
    const prompt2 = state.prompts.find((pr) => pr.kind === "discard" && pr.player === playerSide);
    if (prompt2 && prompt2.kind === "discard") {
      const cards2 = player(state, playerSide).hand;
      const count = Math.min(prompt2.count, cards2.length);
      const combos = combinations(cards2.map((c) => c.id), count);
      for (const combo of combos) {
        moves.push({
          kind: "discard",
          player: playerSide,
          cardInstanceIds: combo
        });
      }
      return moves;
    }
    return [];
  }
  const prompt = state.prompts[0];
  if (prompt) {
    const promptMoves = movesForPrompt(state, playerSide, prompt);
    return promptMoves;
  }
  if (state.run && !state.breach) {
    return runMoves(state, playerSide);
  }
  if (state.breach) {
    return breachMoves(state, playerSide);
  }
  if (state.turn.phase !== "action" || p.clicks <= 0) return [];
  if (playerSide === "corp") return corpActionMoves(state);
  return runnerActionMoves(state);
}
function movesForPrompt(state, playerSide, prompt) {
  if (prompt.player !== playerSide) return [];
  switch (prompt.kind) {
    case "mulligan":
      return [
        {
          kind: "mulligan.take",
          player: playerSide
        },
        {
          kind: "mulligan.decline",
          player: playerSide
        }
      ];
    case "discard": {
      const cards2 = player(state, playerSide).hand;
      const count = Math.min(prompt.count, cards2.length);
      return combinations(cards2.map((c) => c.id), count).map((combo) => ({
        kind: "discard",
        player: playerSide,
        cardInstanceIds: combo
      }));
    }
    case "choose-one": {
      const moves = [];
      for (const option of prompt.options) {
        if (option.creditCost && availableCredits(state, playerSide) < option.creditCost) continue;
        if (option.clickCost && player(state, playerSide).clicks < option.clickCost) continue;
        if (option.effect?.kind === "rez-card-free" && option.targetId) {
          const found = findCard(state, option.targetId);
          if (!found || found.card.rezzed === true) continue;
        }
        if (option.effect?.kind === "corp-install-ice-inward") {
          const found = findCard(state, option.effect.targetId);
          if (!found) continue;
        }
        moves.push({
          kind: "prompt.answer",
          player: playerSide,
          promptId: prompt.id,
          optionId: option.id
        });
      }
      return moves;
    }
    case "rez-window": {
      const moves = [];
      for (const option of prompt.options) {
        if ((option.creditCost ?? 0) > state.corp.credits) continue;
        moves.push({
          kind: "prompt.answer",
          player: "corp",
          promptId: prompt.id,
          optionId: option.id
        });
      }
      moves.push({
        kind: "prompt.answer",
        player: "corp",
        promptId: prompt.id,
        optionId: "pass"
      });
      return moves;
    }
    case "access-decision": {
      const found = findCard(state, prompt.cardId);
      if (!found) return [
        {
          kind: "runner.finishAccess"
        }
      ];
      const moves = [
        {
          kind: "runner.finishAccess"
        }
      ];
      const trashCost = cardDef(found.card.cardId).trashCost;
      if (trashCost !== null && trashCost > 0 && state.runner.credits >= trashCost) {
        moves.push({
          kind: "runner.trashAccessed"
        });
      }
      return moves;
    }
  }
}
function corpActionMoves(state) {
  const moves = [];
  const corp = state.corp;
  if (corp.clicks <= 0) return moves;
  moves.push({
    kind: "corp.gainCredits"
  });
  if (corp.deck.length > 0) moves.push({
    kind: "corp.draw"
  });
  for (const card of corp.hand) {
    const def = cardDef(card.cardId);
    const servers = installServersFor(state, card);
    if (servers.length === 0) continue;
    if (def.type === "ice") {
      for (const server of servers) {
        if (server === "new-remote") {
          moves.push({
            kind: "corp.install",
            cardId: card.cardId,
            server
          });
          continue;
        }
        const cost = serverById(state, server).ice.length;
        if (cost <= state.corp.credits) {
          moves.push({
            kind: "corp.install",
            cardId: card.cardId,
            server
          });
        }
      }
    } else {
      for (const server of servers) {
        moves.push({
          kind: "corp.install",
          cardId: card.cardId,
          server
        });
      }
    }
  }
  for (const card of corp.hand) {
    const def = cardDef(card.cardId);
    if (def.type !== "operation") continue;
    if (def.cost !== null && def.cost > state.corp.credits) continue;
    moves.push({
      kind: "corp.playOperation",
      cardId: card.cardId
    });
  }
  for (const card of corpInstalledCardsLocal(state)) {
    const def = cardDef(card.cardId);
    if (def.advancementRequirement === null && def.type !== "ice") continue;
    moves.push({
      kind: "corp.advance",
      targetId: card.id
    });
    if (def.type === "agenda") {
      const adv = card.advancement ?? 0;
      const requirement = def.advancementRequirement ?? 0;
      if (adv >= requirement) moves.push({
        kind: "corp.score",
        targetId: card.id
      });
    }
  }
  for (const card of corpInstalledCardsLocal(state)) {
    const def = cardDef(card.cardId);
    if (def.type !== "asset" && def.type !== "upgrade") continue;
    if (card.rezzed === true) continue;
    if (rezCostFor(state, card) <= state.corp.credits) {
      moves.push({
        kind: "corp.rez",
        targetId: card.id
      });
    }
  }
  addAbilityMoves(state, "corp", corpInstalledCardsLocal(state), moves);
  return moves;
}
function installServersFor(state, card) {
  const def = cardDef(card.cardId);
  if (def.type === "ice") {
    return [
      "hq",
      "rd",
      "archives",
      ...state.remotes.map((s) => s.id),
      "new-remote"
    ];
  }
  if (def.type === "agenda" || def.type === "asset") {
    return [
      ...state.remotes.filter((s) => s.root.length === 0).map((s) => s.id),
      "new-remote"
    ];
  }
  if (def.type === "upgrade") {
    return [
      "hq",
      "rd",
      "archives",
      ...state.remotes.map((s) => s.id)
    ];
  }
  return [];
}
function runnerActionMoves(state) {
  const moves = [];
  const runner = state.runner;
  if (runner.clicks <= 0) return moves;
  moves.push({
    kind: "runner.gainCredits"
  });
  if (runner.deck.length > 0) moves.push({
    kind: "runner.draw"
  });
  for (const card of runner.hand) {
    const def = cardDef(card.cardId);
    if (def.type !== "program" && def.type !== "hardware" && def.type !== "resource") continue;
    const cost = def.cost ?? 0;
    if (cost > runner.credits) continue;
    if (def.type === "program" && memoryUsed(state) + (def.memoryCost ?? 0) > memoryLimit(state)) {
      continue;
    }
    moves.push({
      kind: "runner.install",
      cardId: card.cardId
    });
  }
  for (const card of runner.hand) {
    const def = cardDef(card.cardId);
    if (def.type !== "event") continue;
    if (def.cost !== null && def.cost > runner.credits) continue;
    if (def.minimumDeckSize !== null) continue;
    if (card.cardId === "jailbreak" || card.cardId === "overclock") {
      for (const server of [
        "hq",
        "rd"
      ]) {
        moves.push({
          kind: "runner.playEvent",
          cardId: card.cardId,
          server
        });
      }
    } else {
      moves.push({
        kind: "runner.playEvent",
        cardId: card.cardId
      });
    }
  }
  for (const server of [
    "hq",
    "rd",
    "archives",
    ...state.remotes.map((s) => s.id)
  ]) {
    if (cardRestrictsRun(state, server)) continue;
    moves.push({
      kind: "runner.run",
      server
    });
  }
  addAbilityMoves(state, "runner", runner.installed, moves);
  return moves;
}
function cardRestrictsRun(state, server) {
  if (!server.startsWith("remote-") && state.runner.ranServersThisTurn.includes(server)) {
    if (state.runner.installed.some((c) => c.cardId === "red_team")) return true;
  }
  return false;
}
function runMoves(state, playerSide) {
  const run = state.run;
  const moves = [];
  if (playerSide === "corp") {
    return moves;
  }
  if (run.phase === "encounter-ice") {
    const ice = run.currentIceId ? findCard(state, run.currentIceId)?.card ?? null : null;
    if (ice && isRezzedIce(ice)) {
      addBreakMoves(state, ice, moves);
    }
    moves.push({
      kind: "runner.resolveSubroutines"
    });
    return moves;
  }
  if (run.phase === "movement") {
    moves.push({
      kind: "runner.jackOut"
    });
    return moves;
  }
  return moves;
}
function addBreakMoves(state, ice, moves) {
  const subs = behaviors.get(ice.cardId)?.subroutines ?? [];
  const unbroken = subs.map((_, i) => i).filter((i) => {
    const run = state.run;
    return !run.broken.includes(i) && !run.resolved.includes(i);
  });
  if (unbroken.length === 0) return;
  const iceStrength = currentIceStrength(state, ice);
  for (const program of state.runner.installed) {
    if (!isIcebreaker(program)) continue;
    const strengthOk = currentIceStrength(state, program) >= iceStrength;
    for (const subIndex of unbroken) {
      if (ice.cardId === "bran_1_0") {
        if (state.runner.clicks >= 1) {
          moves.push({
            kind: "runner.breakSubroutine",
            programId: program.id,
            subIndex
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
            subIndex
          });
        }
      }
    }
    const pumpDef = behaviors.get(program.cardId)?.pumpAbility;
    if (pumpDef && availableCredits(state, "runner") >= pumpDef.creditCost) {
      moves.push({
        kind: "runner.pumpIcebreaker",
        programId: program.id
      });
    }
  }
}
function currentIceStrength(state, card) {
  const printed = cardDef(card.cardId).strength ?? 0;
  let extra = card.strengthBoost ?? 0;
  if (card.cardId === "unity") {
    const count = state.runner.installed.filter((c) => isIcebreaker(c)).length;
    extra = count - 1;
  }
  if (card.cardId === "palisade" && (card.server?.startsWith("remote-") ?? false)) {
    return printed + 2 + (card.strengthBoost ?? 0);
  }
  return printed + extra;
}
function breachMoves(state, playerSide) {
  const moveList = [];
  if (playerSide === "corp") {
    return moveList;
  }
  const breach = state.breach;
  if (breach.accessing) return moveList;
  const candidates = candidatesForBreach(state).filter((c) => !breach.chosen.includes(c.instanceId));
  if (candidates.length === 0) return moveList;
  if (candidates.length === 1) return moveList;
  const random = candidates.filter((c) => c.random);
  const specific = candidates.filter((c) => !c.random);
  for (const c of specific) {
    moveList.push({
      kind: "runner.accessCard",
      targetId: c.instanceId
    });
  }
  if (random.length > 0 && chooseRandomAccess(state)) {
    moveList.push({
      kind: "runner.accessRandom"
    });
  }
  return moveList;
}
function addAbilityMoves(state, side, cards2, moves) {
  for (const card of cards2) {
    const abilityCount = behaviors.get(card.cardId)?.paidAbilities?.length ?? 0;
    if (supportStatus(card.cardId) === "unsupported") continue;
    for (let i = 0; i < abilityCount; i++) {
      const legality = abilityLegality(state, side, card, i);
      if (!legality.ok) continue;
      const servers = serversForAbility(state, card, i);
      if (servers.length > 0) {
        for (const server of servers) {
          moves.push({
            kind: `${side}.ability`,
            targetId: card.id,
            abilityIndex: i,
            server
          });
        }
      } else {
        moves.push({
          kind: `${side}.ability`,
          targetId: card.id,
          abilityIndex: i
        });
      }
    }
  }
}
function corpInstalledCardsLocal(state) {
  const cards2 = [];
  for (const server of [
    "hq",
    "rd",
    "archives"
  ]) {
    for (const c of state.corp.installed) {
      if (c.zone === "play-area" && c.server === server) cards2.push(c);
    }
  }
  for (const s of state.remotes) cards2.push(...s.root, ...s.ice);
  return cards2;
}
function combinations(ids, size) {
  if (size <= 0) return [
    []
  ];
  if (size > ids.length) return [];
  const result = [];
  const list = [
    ...ids
  ].sort();
  const walk = (start, chosen) => {
    if (chosen.length === size) {
      result.push([
        ...chosen
      ]);
      return;
    }
    for (let i = start; i < list.length; i++) {
      chosen.push(list[i]);
      walk(i + 1, chosen);
      chosen.pop();
    }
  };
  walk(0, []);
  return result;
}

// src/engine/apply.ts
function copyState(state) {
  return JSON.parse(JSON.stringify(state));
}
function applyMove(state, playerSide, move) {
  const legal = getLegalMoves(state, playerSide);
  const ok = legal.some((m) => sameMove(m, move));
  if (!ok) {
    return {
      kind: "illegal-move",
      reason: explainIllegal(state, playerSide, move),
      move
    };
  }
  const next = copyState(state);
  const mark = next.log.length;
  applyResolvedMove(next, playerSide, move);
  settle(next);
  const events = next.log.slice(mark);
  return {
    kind: "applied",
    state: next,
    events,
    warnings: supportWarnings(next)
  };
}
function supportWarnings(state) {
  return [
    ...state.supportWarnings
  ];
}
function sameMove(a, b) {
  if (a.kind !== b.kind) return false;
  const keys = [];
  for (const [k, v] of Object.entries(a)) {
    if (v === void 0) continue;
    keys.push(k);
  }
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length || av.some((x, i) => x !== bv[i])) return false;
      continue;
    }
    if (av !== bv) return false;
  }
  return true;
}
function explainIllegal(_state, playerSide, move) {
  switch (move.kind) {
    case "mulligan.take":
    case "mulligan.decline":
      return `It is not ${playerSide}'s mulligan decision`;
    case "discard":
      return "It is not time to discard those cards";
    case "corp.gainCredits":
    case "corp.draw":
    case "corp.install":
    case "corp.advance":
    case "corp.score":
    case "corp.rez":
      return "Not legal in the current Corp action phase state";
    case "runner.gainCredits":
    case "runner.draw":
    case "runner.install":
    case "runner.run":
      return "Not legal in the current Runner action phase state";
    default:
      return `Move '${move.kind}' is not legal right now`;
  }
}
function applyResolvedMove(state, playerSide, move) {
  switch (move.kind) {
    // Setup ---------------------------------------------------------------
    case "mulligan.take": {
      takeMulligan(state);
      if (state.prompts.length === 0) startFirstTurn(state);
      break;
    }
    case "mulligan.decline": {
      if (state.prompts.length > 0) state.prompts.shift();
      if (state.prompts.length === 0) startFirstTurn(state);
      break;
    }
    case "discard": {
      const prompt = state.prompts[0];
      const ids = move.cardInstanceIds;
      for (const id of ids) {
        const found = findCard(state, id);
        if (!found || found.side !== playerSide) continue;
        moveCardTo(state, found.card, "discard", playerSide);
        found.card.zone = "discard";
        state.log.push({
          type: "discard",
          cardId: id,
          player: playerSide
        });
      }
      if (prompt && prompt.kind === "discard" && state.prompts[0]?.id === prompt.id) {
        state.prompts.shift();
      }
      const remaining = player(state, playerSide).hand.length - maxHandSize(state, playerSide);
      if (remaining > 0) {
        state.prompts.push({
          kind: "discard",
          id: state.nextPromptId++,
          player: playerSide,
          count: remaining
        });
        return;
      }
      enterEndOfTurn(state);
      break;
    }
    // Corp actions --------------------------------------------------------
    case "corp.gainCredits": {
      spendClicks(state, "corp", 1);
      gainCredits(state, "corp", 1);
      break;
    }
    case "corp.draw": {
      spendClicks(state, "corp", 1);
      if (state.corp.deck.length === 0) {
        state.winner = "runner";
        state.winReason = "Corp drew from an empty R&D";
        state.log.push({
          type: "game-end",
          winner: "runner",
          reason: state.winReason
        });
        return;
      }
      drawCards(state, "corp", 1);
      break;
    }
    case "corp.install": {
      installCorpCard(state, move.cardId, move.server);
      break;
    }
    case "corp.playOperation": {
      playCorpOperation(state, move.cardId);
      break;
    }
    case "corp.advance": {
      const found = findCard(state, move.targetId);
      if (!found) break;
      spendClicks(state, "corp", 1);
      addAdvancementCounter(state, found.card);
      break;
    }
    case "corp.score": {
      scoreAgenda(state, move.targetId);
      break;
    }
    case "corp.rez": {
      const found = findCard(state, move.targetId);
      if (found) {
        rezCard(state, found.card);
        fireInstall(state, found.card);
      }
      break;
    }
    case "corp.ability": {
      const found = findCard(state, move.targetId);
      if (found) applyPaidAbility(state, "corp", found.card, move.abilityIndex);
      break;
    }
    // Runner actions ------------------------------------------------------
    case "runner.gainCredits": {
      spendClicks(state, "runner", 1);
      gainCredits(state, "runner", 1);
      break;
    }
    case "runner.draw": {
      spendClicks(state, "runner", 1);
      const runner = state.runner;
      const verbal = runner.installed.some((c) => c.cardId === "verbal_plasticity");
      if (runner.deck.length === 0) {
        state.winner = "corp";
        state.winReason = "Runner drew from an empty Stack";
        state.log.push({
          type: "game-end",
          winner: "corp",
          reason: state.winReason
        });
        return;
      }
      const count = verbal && !runner.basicDrawThisTurn ? 2 : 1;
      runner.basicDrawThisTurn = true;
      drawCards(state, "runner", count);
      break;
    }
    case "runner.install": {
      installRunnerCard(state, move.cardId);
      break;
    }
    case "runner.playEvent": {
      playRunnerEvent(state, move.cardId, move.server);
      break;
    }
    case "runner.run": {
      spendClicks(state, "runner", 1);
      initiateRun(state, move.server);
      if (move.server === "hq" || move.server === "rd" || move.server === "archives") {
        state.runner.ranServersThisTurn.push(move.server);
      }
      break;
    }
    case "runner.ability": {
      const found = findCard(state, move.targetId);
      if (found) applyPaidAbility(state, "runner", found.card, move.abilityIndex, move.server);
      break;
    }
    case "runner.jackOut": {
      if (state.run) endRun(state);
      break;
    }
    case "runner.breakSubroutine": {
      breakSubroutine(state, move.programId, move.subIndex);
      break;
    }
    case "runner.pumpIcebreaker": {
      pumpIcebreaker(state, move.programId);
      break;
    }
    case "runner.resolveSubroutines": {
      resolveEncounter(state);
      break;
    }
    case "runner.bioroidBreak": {
      breakSubroutine(state, move.iceId, move.subIndex);
      break;
    }
    // Access --------------------------------------------------------------
    case "runner.accessCard": {
      doAccessChoice(state, move.targetId);
      break;
    }
    case "runner.accessRandom": {
      const chosen = chooseRandomPublic(state);
      if (chosen) doAccessChoice(state, chosen);
      break;
    }
    case "runner.trashAccessed": {
      finishAccess(state, true);
      break;
    }
    case "runner.finishAccess": {
      finishAccess(state, false);
      break;
    }
    // Prompt answers -------------------------------------------------------
    case "prompt.answer": {
      answerPrompt(state, move.promptId, move.optionId);
      break;
    }
  }
}
function answerPrompt(state, promptId, optionId) {
  const prompt = state.prompts[0];
  if (!prompt || prompt.id !== promptId) return;
  switch (prompt.kind) {
    case "rez-window": {
      const option = prompt.options.find((o) => o.id === optionId);
      if (!option?.targetId) {
        state.prompts.shift();
        finishCurrentApproach(state);
        return;
      }
      const found = findCard(state, option.targetId);
      if (!found) {
        state.prompts.shift();
        finishCurrentApproach(state);
        return;
      }
      const ok = rezCard(state, found.card);
      if (!ok) return;
      fireInstall(state, found.card);
      spendCredits(state, "corp", option.creditCost ?? 0);
      state.prompts.shift();
      finishCurrentApproach(state);
      break;
    }
    case "choose-one": {
      if (optionId === "pass") {
        state.prompts.shift();
        return;
      }
      const option = prompt.options.find((o) => o.id === optionId);
      if (!option) return;
      if (option.creditCost) spendCredits(state, prompt.player, option.creditCost);
      if (option.clickCost) spendClicks(state, prompt.player, option.clickCost);
      if (option.effect?.kind === "rez-card-free" && option.targetId) {
        const found = findCard(state, option.targetId);
        if (found) {
          rezCard(state, found.card, true);
          fireInstall(state, found.card);
        }
      } else if (option.targetId && prompt.player === "corp") {
        const found = findCard(state, option.targetId);
        if (found) {
          const wasUnrezzed = found.card.rezzed !== true;
          const ok = rezCard(state, found.card);
          if (ok && wasUnrezzed) fireInstall(state, found.card);
        }
      } else {
        applyChoice(state, option.effect);
      }
      state.prompts.shift();
      break;
    }
    default:
      state.prompts.shift();
      break;
  }
  function finishCurrentApproach(state2) {
    const run = state2.run;
    if (!run) return;
    const ice = run.currentIceId ? findCard(state2, run.currentIceId)?.card ?? null : null;
    if (ice && ice.rezzed === true) {
      beginEncounter(state2);
    } else if (run.phase === "approach-ice") {
      passIce(state2);
    }
  }
}
function installCorpCard(state, cardId, server) {
  const card = state.corp.hand.find((c) => c.cardId === cardId);
  if (!card) return;
  const def = cardDef(cardId);
  spendClicks(state, "corp", 1);
  const target = server;
  const resolved = target === "new-remote" ? createRemote(state).id : target;
  if (target !== "new-remote" && !isCentral(target) && !state.remotes.some((s) => s.id === target)) return;
  if (isIce(def)) {
    spendCredits(state, "corp", iceCount(state, resolved));
    const remote = state.remotes.find((s) => s.id === resolved);
    if (remote) remote.ice.push(card);
  } else {
    const remote = state.remotes.find((s) => s.id === resolved);
    if (remote && (def.type === "agenda" || def.type === "asset")) {
      remote.root.push(card);
    }
  }
  const idx = state.corp.hand.findIndex((c) => c.id === card.id);
  if (idx >= 0) state.corp.hand.splice(idx, 1);
  card.zone = "play-area";
  card.server = resolved;
  card.rezzed = false;
  state.corp.installedThisTurn.push(card.id);
  state.log.push({
    type: "install",
    cardId: card.id,
    player: "corp",
    server: resolved
  });
}
function isCentral(server) {
  return server === "hq" || server === "rd" || server === "archives";
}
function iceCount(state, server) {
  if (isCentral(server)) {
    return state.corp.installed.filter((c) => c.zone === "play-area" && c.server === server).length;
  }
  return serverIce(state, server).length;
}
function serverIce(state, server) {
  if (isCentral(server)) return [];
  return state.remotes.find((s) => s.id === server)?.ice ?? [];
}
function installRunnerCard(state, cardId) {
  const card = state.runner.hand.find((c) => c.cardId === cardId);
  if (!card) return;
  const def = cardDef(cardId);
  spendClicks(state, "runner", 1);
  let cost = def.cost ?? 0;
  if (state.runner.successfulRunThisTurn && cardId === "carmen") cost = Math.max(0, cost - 2);
  spendCredits(state, "runner", cost);
  if (def.type === "program") memoryUsed(state);
  state.runner.hand.splice(state.runner.hand.findIndex((c) => c.id === card.id), 1);
  card.zone = "play-area";
  state.runner.installed.push(card);
  state.runner.installedThisTurn.push(card.id);
  state.log.push({
    type: "install",
    cardId: card.id,
    player: "runner"
  });
  fireInstall(state, card);
  if (memoryUsed(state) > memoryLimit(state)) {
    state.supportWarnings.push(`Memory limit exceeded installing ${def.title}`);
  }
}
function playCorpOperation(state, cardId) {
  const card = state.corp.hand.find((c) => c.cardId === cardId);
  if (!card) return;
  const def = cardDef(cardId);
  spendClicks(state, "corp", 1);
  spendCredits(state, "corp", def.cost ?? 0);
  state.corp.hand.splice(state.corp.hand.findIndex((c) => c.id === card.id), 1);
  card.zone = "discard";
  state.corp.discard.unshift(card);
  state.log.push({
    type: "play",
    cardId: card.id,
    player: "corp"
  });
  resolveCorpOperation(state, cardId, card);
  pruneEmptyRemotes(state);
}
function resolveCorpOperation(state, cardId, card) {
  switch (cardId) {
    case "hedge_fund":
      gainCredits(state, "corp", 5);
      break;
    case "government_subsidy":
      gainCredits(state, "corp", 10);
      break;
    case "seamless_launch": {
      const candidates = corpInstalledCards(state).filter((c) => !state.corp.installedThisTurn.includes(c.id));
      const targets = candidates.filter((c) => {
        const d = cardDef(c.cardId);
        return d.type === "agenda" || d.type === "asset" || d.type === "ice";
      });
      if (targets.length === 0) {
        state.supportWarnings.push("Seamless Launch found no legal target; it resolves without placing counters");
        break;
      }
      if (targets.length === 1) {
        addTwoAdvancement(state, targets[0]);
        break;
      }
      state.prompts.push({
        kind: "choose-one",
        id: state.nextPromptId++,
        player: "corp",
        title: "Seamless Launch: place 2 advancement counters on 1 installed card",
        options: targets.map((c) => ({
          id: `advance-${c.id}`,
          label: `Place 2 on ${cardDef(c.cardId).title}`,
          targetId: c.id,
          effect: {
            kind: "no-op"
          }
        }))
      });
      break;
    }
    default:
      break;
  }
  void card;
}
function playRunnerEvent(state, cardId, server) {
  const card = state.runner.hand.find((c) => c.cardId === cardId);
  if (!card) return;
  const def = cardDef(cardId);
  spendClicks(state, "runner", 1);
  spendCredits(state, "runner", def.cost ?? 0);
  state.runner.hand.splice(state.runner.hand.findIndex((c) => c.id === card.id), 1);
  card.zone = "discard";
  state.runner.discard.unshift(card);
  state.log.push({
    type: "play",
    cardId: card.id,
    player: "runner"
  });
  switch (cardId) {
    case "sure_gamble":
      gainCredits(state, "runner", 9);
      break;
    case "creative_commission": {
      gainCredits(state, "runner", 5);
      spendClicks(state, "runner", 1);
      state.log.push({
        type: "lose-clicks",
        player: "runner",
        amount: 1
      });
      break;
    }
    case "vrcation": {
      const drawn = drawCards(state, "runner", 3);
      if (state.runner.hand.length > 0 && drawn > 0) {
        if (state.runner.hand.length === 1) {
          discardSpecific(state, "runner", state.runner.hand[0].id);
        } else {
          state.prompts.push({
            kind: "discard",
            id: state.nextPromptId++,
            player: "runner",
            count: 1
          });
        }
      } else {
        loseCredits(state, "runner", 1);
      }
      break;
    }
    case "jailbreak": {
      initiateRun(state, server ?? "hq", "jailbreak");
      state.runner.ranServersThisTurn.push(server ?? "hq");
      break;
    }
    case "overclock": {
      state.runner.pendingRunFund += 5;
      break;
    }
    case "tread_lightly": {
      const target = server ?? "hq";
      if (!state.run) initiateRun(state, target, "tread_lightly");
      else state.run.rezCostIncrease = 1;
      state.runner.ranServersThisTurn.push(target);
      break;
    }
    default:
      break;
  }
}
function breakSubroutine(state, programId, subIndex) {
  const program = findCard(state, programId)?.card;
  const iceId = state.run?.currentIceId;
  if (!program || !iceId) return;
  const found = findCard(state, iceId);
  const ice = found?.card;
  if (!ice) return;
  const run = state.run;
  if (run.resolved.includes(subIndex) || run.broken.includes(subIndex)) return;
  if (ice.cardId === "bran_1_0") {
    if (state.runner.clicks < 1) return;
    spendClicks(state, "runner", 1);
    run.broken.push(subIndex);
    state.log.push({
      type: "break-subroutine",
      cardId: ice.id,
      subIndex
    });
    return;
  }
  const breakDef = behaviors.get(program.cardId)?.breakAbility;
  if (!breakDef) return;
  const cost = breakDef.creditCost;
  if (availableCredits(state, "runner") < cost) return;
  spendCredits(state, "runner", cost);
  run.broken.push(subIndex);
  state.log.push({
    type: "break-subroutine",
    cardId: ice.id,
    subIndex
  });
}
function pumpIcebreaker(state, programId) {
  const program = findCard(state, programId)?.card;
  if (!program) return;
  if (program.cardId === "unity") {
    state.supportWarnings.push("Unity's +X strength is static, not a pump");
    return;
  }
  const pump = behaviors.get(program.cardId)?.pumpAbility;
  if (!pump) return;
  if (availableCredits(state, "runner") < pump.creditCost) return;
  spendCredits(state, "runner", pump.creditCost);
  const amount = typeof pump.amount === "number" ? pump.amount : 1;
  program.strengthBoost = (program.strengthBoost ?? 0) + amount;
  state.log.push({
    type: "pump-strength",
    cardId: program.id,
    amount
  });
}
function resolveEncounter(state) {
  const run = state.run;
  const iceId = run.currentIceId;
  if (!iceId) {
    run.phase = "movement";
    return;
  }
  const ice = findCard(state, iceId)?.card;
  if (!ice) {
    run.phase = "movement";
    return;
  }
  const subs = behaviors.get(ice.cardId)?.subroutines ?? [];
  for (let i = 0; i < subs.length; i++) {
    if (run.broken.includes(i) || run.resolved.includes(i)) continue;
    resolveSubroutine(state, ice, i);
    if (state.prompts.length > 0) {
      run.resumeSubIndex = i;
      return;
    }
    if (state.winner) return;
    if (state.run === null || state.run.phase !== "encounter-ice") return;
  }
  run.currentIceId = void 0;
  run.phase = "movement";
  run.jackOutOffered = false;
}
function addTwoAdvancement(state, card) {
  card.advancement = (card.advancement ?? 0) + 2;
  state.log.push({
    type: "advance",
    cardId: card.id,
    amount: 2
  });
}
function addAdvancementCounter(state, card) {
  card.advancement = (card.advancement ?? 0) + 1;
  state.log.push({
    type: "advance",
    cardId: card.id,
    amount: 1
  });
}
function discardSpecific(state, side, instanceId) {
  const found = findCard(state, instanceId);
  if (!found) return;
  moveCardTo(state, found.card, "discard", side);
  state.log.push({
    type: "discard",
    cardId: instanceId,
    player: side
  });
}
function chooseRandomPublic(state) {
  const breach = state.breach;
  const candidates = breachCandidatesLocal(state).filter((c) => c.random && !breach.chosen.includes(c.instanceId));
  if (candidates.length === 0) return null;
  const idx = Math.floor(rngNext(state) * candidates.length);
  return candidates[idx].instanceId;
}
function breachCandidatesLocal(state) {
  const breach = state.breach;
  const server = breach.server;
  const result = [];
  const push = (c, random) => {
    if (breach.chosen.includes(c.id)) return;
    result.push({
      instanceId: c.id,
      random
    });
  };
  const root = state.corp.installed.filter((c) => c.zone === "play-area" && c.server === server);
  if (server.startsWith("remote-")) {
    const s = state.remotes.find((x) => x.id === server);
    if (s) root.push(...s.root);
  }
  for (const c of root) push(c, false);
  if (server === "hq") {
    if (breach.randomAccessesUsed < breach.randomAccessLimit) {
      for (const c of state.corp.hand) push(c, true);
    }
  } else if (server === "rd") {
    if (breach.randomAccessesUsed < breach.randomAccessLimit) {
      const top = state.corp.deck[0];
      if (top) push(top, true);
    }
  } else if (server === "archives") {
    for (const c of state.corp.discard) push(c, false);
  }
  return result;
}
function enterEndOfTurn(state) {
  enterDiscardPhase(state);
}
function startFirstTurn(state) {
  state.turn.phase = "action";
  beginCorpTurn(state);
}
function corpInstalledCards(state) {
  const cards2 = [];
  for (const server of [
    "hq",
    "rd",
    "archives"
  ]) {
    for (const c of state.corp.installed) {
      if (c.zone === "play-area" && c.server === server) cards2.push(c);
    }
  }
  for (const s of state.remotes) cards2.push(...s.root, ...s.ice);
  return cards2;
}

// src/engine/public-status.ts
var HIDDEN = "hidden";
function viewCard(card, hidden) {
  return {
    id: card.id,
    cardId: hidden ? HIDDEN : card.cardId,
    rezzed: card.rezzed,
    advancement: card.advancement,
    hostedCredits: card.hostedCredits,
    strength: hidden ? void 0 : cardDef(card.cardId).strength ?? void 0,
    iceIndex: card.iceIndex,
    zone: card.zone,
    server: card.server
  };
}
function installedCards(state, side) {
  if (side === "runner") return state.runner.installed;
  const cards2 = [];
  for (const server of [
    "hq",
    "rd",
    "archives"
  ]) {
    for (const c of state.corp.installed) {
      if (c.zone === "play-area" && c.server === server) cards2.push(c);
    }
  }
  for (const remote of state.remotes) {
    cards2.push(...remote.root, ...remote.ice);
  }
  return cards2;
}
function publicPlayer(state, side, viewer) {
  const p = player(state, side);
  const hideInstalled = side === "corp" && viewer !== "corp";
  return {
    side,
    credits: p.credits,
    clicks: p.clicks,
    tags: p.tags,
    agendaPoints: p.agendaPoints,
    handCount: p.hand.length,
    handSize: p.baseHandSize + p.maxHandSizeMod,
    deckCount: p.deck.length,
    discardCount: p.discard.length,
    identity: viewCard(p.identity, false),
    score: p.score.map((c) => viewCard(c, false)),
    installed: installedCards(state, side).map((c) => viewCard(c, hideInstalled && c.rezzed !== true))
  };
}
function serverStatus(id, root, ice) {
  const all = [
    ...root,
    ...ice
  ];
  const rezzed = all.filter((c) => c.rezzed === true);
  const unrezzed = all.filter((c) => c.rezzed !== true);
  return {
    id,
    rootCount: root.length,
    ice: rezzed.map((c) => viewCard(c, false)),
    unrezzedCount: unrezzed.length
  };
}
function publicServers(state) {
  const servers = [];
  for (const server of [
    "hq",
    "rd",
    "archives"
  ]) {
    const cards2 = state.corp.installed.filter((c) => c.zone === "play-area" && c.server === server);
    servers.push(serverStatus(server, cards2, []));
  }
  for (const remote of state.remotes) {
    servers.push(serverStatus(remote.id, remote.root, remote.ice));
  }
  return servers;
}
function publicRun(state) {
  const run = state.run;
  if (!run) return null;
  const iceId = run.currentIceId;
  let currentIce2 = null;
  if (iceId) {
    const found = findCard(state, iceId);
    if (found) currentIce2 = viewCard(found.card, found.card.rezzed !== true);
  }
  return {
    server: run.server,
    phase: run.phase,
    position: run.position,
    currentIce: currentIce2,
    brokenSubroutines: [
      ...run.broken
    ]
  };
}
function publicBreach(state) {
  const breach = state.breach;
  if (!breach) return null;
  return {
    server: breach.server,
    randomAccessLimit: breach.randomAccessLimit,
    randomAccessesUsed: breach.randomAccessesUsed,
    accessing: breach.accessing !== void 0
  };
}
function getPublicGameStatus(state) {
  return {
    turn: {
      ...state.turn
    },
    winner: state.winner,
    winReason: state.winReason,
    agendaPointTarget: state.agendaPointTarget,
    players: {
      corp: publicPlayer(state, "corp", "runner"),
      runner: publicPlayer(state, "runner", "runner")
    },
    servers: publicServers(state),
    run: publicRun(state),
    breach: publicBreach(state),
    prompts: state.prompts,
    warnings: [
      ...state.supportWarnings
    ]
  };
}
function getPublicGameStatusFor(state, viewer) {
  return {
    turn: {
      ...state.turn
    },
    winner: state.winner,
    winReason: state.winReason,
    agendaPointTarget: state.agendaPointTarget,
    players: {
      corp: publicPlayer(state, "corp", viewer),
      runner: publicPlayer(state, "runner", viewer)
    },
    servers: publicServers(state),
    run: publicRun(state),
    breach: publicBreach(state),
    prompts: state.prompts,
    warnings: [
      ...state.supportWarnings
    ]
  };
}

// src/engine/setup.ts
var INFLUENCE_LIMIT_DEFAULT = 15;
function issue(code, message, cardId) {
  return {
    code,
    message,
    cardId
  };
}
function validateDeck(deck, side, mode = "open-play") {
  const issues = [];
  const pool = mode === "starter-decks" ? new Set(starterPoolCardIds()) : null;
  const identity = tryCardDef(deck.identity);
  if (!identity) {
    issues.push(issue("unknown-identity", `Unknown identity card '${deck.identity}'`, deck.identity));
  } else {
    const expectedType = side === "corp" ? "corp_identity" : "runner_identity";
    if (identity.type !== expectedType) {
      issues.push(issue("identity-side-mismatch", `Identity '${identity.title}' is a ${identity.type}, not a ${side} identity`, deck.identity));
    }
  }
  let total = 0;
  const seen = /* @__PURE__ */ new Set();
  const identityCount = deck.cards.filter((e) => e.cardId === deck.identity).reduce((a, b) => a + b.count, 0);
  if (identityCount > 0) {
    issues.push(issue("identity-count", "The identity card must not be included in the card list", deck.identity));
  }
  let influence = 0;
  for (const entry of deck.cards) {
    if (entry.count < 0 || !Number.isInteger(entry.count)) {
      issues.push(issue("invalid-count", `Card '${entry.cardId}' has invalid count ${entry.count}`, entry.cardId));
      continue;
    }
    if (entry.count === 0) continue;
    total += entry.count;
    if (seen.has(entry.cardId)) {
      issues.push(issue("invalid-count", `Card '${entry.cardId}' appears more than once in deck entries`, entry.cardId));
    }
    seen.add(entry.cardId);
    const def = tryCardDef(entry.cardId);
    if (!def) {
      issues.push(issue("unknown-card", `Unknown card id '${entry.cardId}'`, entry.cardId));
      continue;
    }
    if (def.side !== side) {
      issues.push(issue("not-in-supported-cards", `Card '${def.title}' is a ${def.side} card, not a ${side} card`, entry.cardId));
    }
    if (mode === "starter-decks" && !pool.has(entry.cardId)) {
      issues.push(issue("not-in-supported-cards", `Card '${entry.cardId}' is not in the supported starter-deck card pool`, entry.cardId));
    }
    if (def.deckLimit !== null && entry.count > def.deckLimit) {
      issues.push(issue("over-deck-limit", `Card '${def.title}' exceeds its deck limit of ${def.deckLimit} (has ${entry.count})`, entry.cardId));
    }
    if (def.influenceCost !== null && def.influenceCost > 0 && identity) {
      influence += def.influenceCost * entry.count;
    }
  }
  if (total === 0) issues.push(issue("empty-deck", "The deck contains no cards"));
  if (mode === "open-play") {
    const minSize = identity?.minimumDeckSize ?? 30;
    if (total < minSize) {
      issues.push(issue("under-minimum-deck-size", `Deck has ${total} cards; needs at least ${minSize}`));
    }
    const influenceLimit = identity?.influenceLimit ?? INFLUENCE_LIMIT_DEFAULT;
    if (influence > influenceLimit) {
      issues.push(issue("over-influence-limit", `Deck spends ${influence} influence; limit is ${influenceLimit}`));
    }
  }
  if (deck.orderedCards) {
    const flat = [];
    for (const e of deck.cards) for (let i = 0; i < e.count; i++) flat.push(e.cardId);
    const counts = (ids) => {
      const m = /* @__PURE__ */ new Map();
      for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
      return m;
    };
    const a = counts(flat);
    const b = counts(deck.orderedCards);
    if (a.size !== b.size || [
      ...a
    ].some(([id, n]) => b.get(id) !== n)) {
      issues.push(issue("ordered-deck-mismatch", "orderedCards does not match the multiset of card entries (top-to-bottom order must contain exactly the same cards)"));
    }
  }
  return {
    valid: issues.length === 0,
    issues
  };
}
function makeInstance(side, cardId, index) {
  const def = cardDef(cardId);
  const instance = {
    id: `${side}-${index}`,
    cardId,
    owner: side,
    zone: "deck"
  };
  if (def.type === "ice" || def.type === "agenda") instance.advancement = 0;
  return instance;
}
function freshPlayer(side, identityId, index) {
  const identity = makeInstance(side, identityId, index);
  identity.zone = "identity";
  const baseHandSize = 5;
  return {
    identity,
    state: {
      side,
      identity,
      credits: 5,
      clicks: 0,
      hand: [],
      deck: [],
      discard: [],
      score: [],
      installed: [],
      baseHandSize,
      maxHandSizeMod: 0,
      memoryLimitMod: 0,
      tags: 0,
      agendaPoints: 0,
      installedThisTurn: [],
      basicDrawThisTurn: false,
      successfulRunThisTurn: false,
      ranServersThisTurn: [],
      hqBreachesThisTurn: 0,
      usedOncePerTurn: [],
      pendingRunFund: 0
    }
  };
}
function buildDeckInstances(side, deck, startIndex, state) {
  const ordered = deck.orderedCards ? [
    ...deck.orderedCards
  ] : deck.cards.flatMap((e) => Array(e.count).fill(e.cardId));
  if (!deck.orderedCards) shuffle(state, ordered);
  return ordered.map((cardId, i) => makeInstance(side, cardId, startIndex + i));
}
function startGame(config) {
  const seed = config.seed ?? 625341585;
  const state = {
    nextPromptId: 1,
    turn: {
      number: 0,
      player: "corp",
      phase: "mulligans"
    },
    corp: null,
    runner: null,
    remotes: [],
    run: null,
    breach: null,
    prompts: [],
    log: [],
    rngState: seed | 0,
    agendaPointTarget: config.agendaPointTarget ?? 7,
    winner: null,
    winReason: null,
    mode: config.mode,
    supportWarnings: []
  };
  const corpIdentity = config.corp.identity;
  const runnerIdentity = config.runner.identity;
  const corpSetup = freshPlayer("corp", corpIdentity, 0);
  const runnerSetup = freshPlayer("runner", runnerIdentity, 1e3);
  state.corp = corpSetup.state;
  state.runner = runnerSetup.state;
  const corpDeck = buildDeckInstances("corp", config.corp, 1, state);
  const runnerDeck = buildDeckInstances("runner", config.runner, 2001, state);
  state.corp.deck.push(...corpDeck);
  state.runner.deck.push(...runnerDeck);
  for (const side of [
    "corp",
    "runner"
  ]) {
    const p = player(state, side);
    p.credits = 5;
    drawInitial(state, side, 5);
  }
  state.log.push({
    type: "game-started"
  });
  if (config.allowMulligan) {
    state.prompts.push({
      kind: "mulligan",
      id: state.nextPromptId++,
      player: "corp"
    });
    state.prompts.push({
      kind: "mulligan",
      id: state.nextPromptId++,
      player: "runner"
    });
  } else {
    beginCorpTurn(state);
  }
  return state;
}
function drawInitial(state, side, count) {
  const p = player(state, side);
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    const card = p.deck.shift();
    if (!card) break;
    card.zone = "hand";
    p.hand.push(card);
    drawn++;
  }
  if (drawn > 0) state.log.push({
    type: "draw",
    player: side,
    count: drawn
  });
}

// src/ai/play.ts
var AiGameError = class extends Error {
  side;
  move;
  constructor(message, side, move) {
    super(message), this.side = side, this.move = move;
    this.name = "AiGameError";
  }
};
function actorOf(state) {
  const prompt = state.prompts[0];
  if (prompt) return prompt.player;
  return state.turn.player;
}
function playGame(config) {
  const { corp, runner, state: initial } = config;
  const maxMoves = config.maxMoves ?? 1e4;
  let state = initial;
  let moves = 0;
  while (!state.winner && moves < maxMoves) {
    const side = actorOf(state);
    const ai = side === "corp" ? corp : runner;
    const legal = engine.getLegalMoves(state, side);
    if (legal.length === 0) {
      throw new AiGameError(`no legal moves for ${side} on turn ${state.turn.number} (${state.turn.phase})`, side, null);
    }
    const move = ai.chooseMove(state, side, legal);
    const result = engine.applyMove(state, side, move);
    if (result.kind === "illegal-move") {
      throw new AiGameError(`${ai.name} (${side}) played an illegal move: ${result.reason}`, side, move);
    }
    state = result.state;
    moves++;
  }
  return {
    state,
    winner: state.winner,
    winReason: state.winReason,
    moves,
    timedOut: state.winner === null
  };
}

// src/ai/random.ts
var RandomAI = class {
  name = "random";
  chooseMove(state, _side, legal) {
    const idx = rngInt(state, legal.length);
    return legal[idx] ?? legal[0];
  }
};
var randomAI = new RandomAI();

// src/ai/uct.ts
var UctAI = class {
  name = "uct";
  iterations;
  exploration;
  playoutDepth;
  timeBudgetMs;
  constructor(options = {}) {
    this.iterations = options.iterations ?? 60;
    this.exploration = options.exploration ?? Math.SQRT2;
    this.playoutDepth = options.playoutDepth ?? 200;
    this.timeBudgetMs = options.timeBudgetMs ?? 2e3;
  }
  chooseMove(state, side, legal) {
    if (legal.length === 1) return legal[0];
    const rootState = structuredClone(state);
    const root = {
      visits: 0,
      totalReward: 0,
      moves: legal,
      children: legal.map(() => null),
      playerJustMoved: other(side)
    };
    const deadline = Date.now() + this.timeBudgetMs;
    for (let i = 0; i < this.iterations && Date.now() < deadline; i++) {
      const sim = structuredClone(rootState);
      this.iterate(sim, root, side);
    }
    let best = -1;
    let bestIndex = 0;
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i];
      const visits = child?.node.visits ?? 0;
      if (visits > best) {
        best = visits;
        bestIndex = i;
      }
    }
    return legal[bestIndex] ?? legal[0];
  }
  /** One MCTS iteration: select, expand, simulate, back-propagate. */
  iterate(sim, root, me) {
    const path = [];
    let node = root;
    while (node.children.every((c) => c !== null)) {
      let bestScore = -Infinity;
      let bestIndex = 0;
      for (let i = 0; i < node.children.length; i++) {
        const child2 = node.children[i];
        const score = ucb1(child2.node.totalReward, child2.node.visits, node.visits, this.exploration);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      const child = node.children[bestIndex];
      path.push({
        node,
        childIndex: bestIndex
      });
      const result = engine.applyMove(sim, node.playerJustMoved ?? "corp", child.move);
      if (result.kind === "illegal-move") return;
      Object.assign(sim, result.state);
      node = child.node;
      if (sim.winner) break;
    }
    let expanded = false;
    for (let i = 0; i < node.children.length; i++) {
      if (node.children[i] !== null) continue;
      const move = node.moves[i];
      const result = engine.applyMove(sim, node.playerJustMoved ?? "corp", move);
      if (result.kind === "illegal-move") continue;
      Object.assign(sim, result.state);
      const side = sim.turn.player;
      const legal = engine.getLegalMoves(sim, side);
      const child = {
        move,
        node: {
          visits: 0,
          totalReward: 0,
          moves: legal,
          children: legal.map(() => null),
          playerJustMoved: other(side)
        }
      };
      node.children[i] = child;
      path.push({
        node,
        childIndex: i
      });
      node = child.node;
      expanded = true;
      break;
    }
    void expanded;
    const reward = this.playout(sim, me);
    node.visits += 1;
    node.totalReward += node.playerJustMoved === me ? reward : -reward;
    for (let i = path.length - 1; i >= 0; i--) {
      const step = path[i];
      step.node.visits += 1;
      step.node.totalReward += step.node.playerJustMoved === me ? reward : -reward;
    }
  }
  /** Uniform-random playout; returns the terminal reward from `me`'s view. */
  playout(sim, me) {
    for (let depth = 0; depth < this.playoutDepth; depth++) {
      if (sim.winner) break;
      const side = sim.turn.player;
      const legal = engine.getLegalMoves(sim, side);
      if (legal.length === 0) break;
      const move = legal[rngInt(sim, legal.length)];
      const result = engine.applyMove(sim, side, move);
      if (result.kind === "illegal-move") break;
      Object.assign(sim, result.state);
    }
    return terminalReward(sim, me);
  }
};
function terminalReward(sim, me) {
  if (sim.winner === "draw") return 0;
  if (sim.winner === me) return 1;
  if (sim.winner !== null) return -1;
  const mine = sim[me];
  const theirs = sim[me === "corp" ? "runner" : "corp"];
  const pointDiff = (mine.agendaPoints - theirs.agendaPoints) / sim.agendaPointTarget;
  const creditDiff = (mine.credits - theirs.credits) / 20;
  const raw = pointDiff * 0.8 + creditDiff * 0.2;
  return Math.max(-0.99, Math.min(0.99, raw));
}
function ucb1(reward, visits, parentVisits, c) {
  if (visits === 0) return Infinity;
  const mean = reward / visits;
  return mean + c * Math.sqrt(Math.log(parentVisits + 1) / visits);
}
function other(side) {
  return side === "corp" ? "runner" : "corp";
}
var uctAI = new UctAI();

// src/mod.ts
var HIDDEN2 = "hidden";
function viewCard2(card, opts = {}) {
  const hidden = opts.hidden === true;
  return {
    id: card.id,
    cardId: hidden ? HIDDEN2 : card.cardId,
    rezzed: card.rezzed,
    advancement: card.advancement,
    hostedCredits: card.hostedCredits,
    strength: cardDef(card.cardId).strength ?? void 0,
    iceIndex: card.iceIndex,
    zone: card.zone,
    server: card.server
  };
}
function sideCards(state, side) {
  const p = player(state, side);
  return {
    handCount: p.hand.length,
    handSize: p.hand.length,
    deckCount: p.deck.length,
    discardCount: p.discard.length,
    installed: p.installed,
    identity: p.identity,
    score: p.score
  };
}
function getPlayerView(state, viewer) {
  const hideCorpInstalled = viewer !== "corp";
  const corpInstalled = [];
  for (const server of [
    "hq",
    "rd",
    "archives"
  ]) {
    for (const c of player(state, "corp").installed) {
      if (c.zone !== "play-area" || c.server !== server) continue;
      corpInstalled.push(viewCard2(c, {
        hidden: hideCorpInstalled && c.rezzed !== true
      }));
    }
  }
  for (const s of state.remotes) {
    for (const c of [
      ...s.root,
      ...s.ice
    ]) {
      corpInstalled.push(viewCard2(c, {
        hidden: hideCorpInstalled && c.rezzed !== true
      }));
    }
  }
  const corpSide = sideCards(state, "corp");
  const runnerSide = sideCards(state, "runner");
  return {
    viewer,
    turn: {
      ...state.turn
    },
    winner: state.winner,
    agendaPointTarget: state.agendaPointTarget,
    corp: {
      credits: state.corp.credits,
      clicks: state.corp.clicks,
      handSize: corpSide.handSize,
      handCount: corpSide.handCount,
      deckCount: corpSide.deckCount,
      discardCount: corpSide.discardCount,
      agendaPoints: state.corp.agendaPoints,
      tags: state.corp.tags,
      identity: viewCard2(state.corp.identity),
      score: corpSide.score.map((c) => viewCard2(c)),
      installed: corpInstalled
    },
    runner: {
      credits: state.runner.credits,
      clicks: state.runner.clicks,
      handSize: runnerSide.handCount,
      handCount: runnerSide.handCount,
      deckCount: runnerSide.deckCount,
      discardCount: runnerSide.discardCount,
      agendaPoints: state.runner.agendaPoints,
      identity: viewCard2(state.runner.identity),
      score: runnerSide.score.map((c) => viewCard2(c)),
      installed: runnerSide.installed.map((c) => viewCard2(c))
    },
    run: state.run ? {
      server: state.run.server,
      phase: state.run.phase,
      position: state.run.position,
      currentIce: state.run.currentIceId ? viewCard2(findCard(state, state.run.currentIceId)?.card ?? state.corp.identity, {
        hidden: hideCorpInstalled
      }) : void 0,
      broken: [
        ...state.run.broken
      ]
    } : null,
    breach: state.breach ? {
      server: state.breach.server,
      randomAccessLimit: state.breach.randomAccessLimit,
      remaining: Math.max(0, state.breach.randomAccessLimit - state.breach.randomAccessesUsed),
      accessing: state.breach.accessing ? viewCard2(findCard(state, state.breach.accessing)?.card ?? state.corp.identity) : void 0
    } : null,
    prompts: state.prompts,
    events: state.log
  };
}
function starterDeckCardIds() {
  const s = starterDeckConfigs();
  return {
    runner: [
      s.runner.identity,
      ...s.runner.cards.map((e) => e.cardId)
    ],
    corp: [
      s.corp.identity,
      ...s.corp.cards.map((e) => e.cardId)
    ]
  };
}
function cardSupport(cardId) {
  const status = supportStatus(cardId);
  const note = behaviors.get(cardId)?.note;
  return status === "supported" ? {
    supported: true,
    status
  } : {
    supported: false,
    status,
    note
  };
}
function starterDeckSupport() {
  const ids = starterPoolCardIds();
  const report = cardSupportReport(ids);
  return {
    ...report,
    all: ids
  };
}
var engine = {
  validateDeck(deck, side, mode) {
    return validateDeck(deck, side, mode);
  },
  startGame(config) {
    return startGame(config);
  },
  getLegalMoves(state, player2) {
    return getLegalMoves(state, player2);
  },
  applyMove(state, player2, move) {
    return applyMove(state, player2, move);
  },
  /**
   * Public game status (rule 1.10): only information both players are always
   * entitled to see, so this returns the same value for either viewer.
   */
  getPublicGameStatus(state) {
    return getPublicGameStatus(state);
  },
  /**
   * Public game status as seen by `viewer`. Identical to `getPublicGameStatus`
   * except the Corp additionally sees the ids of its own installed cards.
   */
  getPublicGameStatusFor(state, viewer) {
    return getPublicGameStatusFor(state, viewer);
  },
  getPlayerView(state, player2) {
    return getPlayerView(state, player2);
  }
};
var supportWarningsOf = (state) => [
  ...state.supportWarnings
];
export {
  AiGameError,
  RandomAI,
  UctAI,
  applyMove,
  cardDef,
  cardSupport,
  cardSupportReport,
  engine,
  getLegalMoves,
  getPlayerView,
  getPublicGameStatus,
  getPublicGameStatusFor,
  playGame,
  randomAI,
  startGame,
  starterDeckCardIds,
  starterDeckConfigs,
  starterDeckSupport,
  starterPoolCardIds,
  supportStatus,
  supportWarningsOf,
  tryCardDef,
  uctAI,
  validateDeck,
  verifyFixtureAgainstSnapshot
};
