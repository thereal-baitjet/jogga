// Strava/Runna competitive context May 2026:
// Jogga avoids generic public training-plan competition by defaulting to
// private, niche-first coaching and read-only Strava Free imports.
export const JOGGA_STRATEGY = {
  competitiveContext: {
    threat: "Strava acquired Runna. Bundle is $149.99/yr for AI coaching + social",
    ourPosition: "Private coaching for runners Strava ignores. No social feed.",
    priceAnchor: {
      monthly: 6,
      annual: 49,
      comparison: "67% cheaper than Strava+Runna",
    },
  },
  niches: {
    postpartum_return: {
      enabled: true,
      headline: "Your body ran a marathon. Now let’s run 5k.",
      subhead: "AI plans built with pelvic floor PTs. No bounce-back pressure.",
      planRules: {
        minPostpartumWeeks: 6,
        requirePtClearance: true,
        maxWeeklyMileageStartKm: 10,
        strengthFocus: "pelvic_floor_core",
        socialFeaturesDisabled: ["leaderboards", "kudos", "segments"],
      },
    },
    masters_50_plus: {
      enabled: true,
      headline: "Train smarter, not younger.",
      subhead: "Strength + recovery baked into every plan.",
      planRules: {
        defaultStrengthDays: 2,
        recoveryDaysMin: 2,
        longRunCapPctVo2: 0.75,
        defaultCrossTrain: "cycling",
        socialFeaturesDisabled: ["segments", "koms"],
      },
    },
    ultra_100k: {
      enabled: true,
      headline: "Strava plans end at 26.2. You don’t.",
      subhead: "Vert, nutrition, night-run logic. For races Strava doesn’t understand.",
      planRules: {
        vertTracking: true,
        nightRunLogic: true,
        nutritionReminders: true,
        maxLongRunHours: 8,
        socialFeaturesDisabled: [],
      },
    },
    anti_social_runner: {
      enabled: true,
      headline: "Training plans that don’t post to your feed.",
      subhead: "No segments. No kudos. No comparison. Just your run.",
      planRules: {
        privacyDefault: "private_only",
        stravaPush: false,
        socialFeaturesDisabled: ["all"],
      },
    },
  },
  stravaIntegration: {
    scopes: ["read", "activity:read_all"],
    requiresPremium: false,
    onboardingCopy: "Connect Strava Free to import runs. We’ll never post or share.",
    dataUsage: ["adapt_plans", "detect_missed_runs", "calculate_load"],
    dataNever: ["post_to_feed", "leaderboards", "public_segments"],
  },
  antiStravaDefaults: {
    newUserPrivacy: "private",
    defaultShareSettings: { activities: "only_me" },
    socialUiHiddenByDefault: true,
  },
} as const;

export type JoggaNiche = keyof typeof JOGGA_STRATEGY.niches;

export function getEnabledNicheEntries() {
  return Object.entries(JOGGA_STRATEGY.niches).filter(([, config]) => config.enabled) as Array<[
    JoggaNiche,
    (typeof JOGGA_STRATEGY.niches)[JoggaNiche],
  ]>;
}

export function getNicheConfig<N extends JoggaNiche>(niche: N): (typeof JOGGA_STRATEGY.niches)[N];
export function getNicheConfig(niche: JoggaNiche | string | null | undefined): (typeof JOGGA_STRATEGY.niches)[JoggaNiche];
export function getNicheConfig(niche: JoggaNiche | string | null | undefined) {
  return JOGGA_STRATEGY.niches[(niche || "anti_social_runner") as JoggaNiche] || JOGGA_STRATEGY.niches.anti_social_runner;
}
