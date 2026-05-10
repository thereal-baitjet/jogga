export const COACH_INSIGHT_SCHEMA_VERSION = 'coach-json-v1';

export const RECOMMENDED_ACTIONS = [
  'continue_plan',
  'reduce_intensity',
  'rest',
  'repeat_workout',
  'increase_carefully',
] as const;

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;

export const NEXT_WORKOUT_ADJUSTMENT_TYPES = [
  'none',
  'shorter',
  'easier',
  'rest_day',
  'repeat_previous',
  'slightly_harder',
] as const;

export type RecommendedAction = typeof RECOMMENDED_ACTIONS[number];
export type RiskLevel = typeof RISK_LEVELS[number];
export type NextWorkoutAdjustmentType = typeof NEXT_WORKOUT_ADJUSTMENT_TYPES[number];

export interface CoachInsight {
  summary: string;
  readinessMessage: string;
  recommendedAction: RecommendedAction;
  coachingPoints: string[];
  riskLevel: RiskLevel;
  confidence: number;
  nextWorkoutAdjustment: {
    adjustmentType: NextWorkoutAdjustmentType;
    reason: string;
  };
}

const TOP_LEVEL_KEYS = [
  'summary',
  'readinessMessage',
  'recommendedAction',
  'coachingPoints',
  'riskLevel',
  'confidence',
  'nextWorkoutAdjustment',
];

const NEXT_ADJUSTMENT_KEYS = ['adjustmentType', 'reason'];

export const DEFAULT_COACH_INSIGHT: CoachInsight = {
  summary: 'Use the measured run first, keep the next session controlled, and protect consistency over forcing extra intensity.',
  readinessMessage: 'Readiness is based on the workout match, recent load, and available recovery signals.',
  recommendedAction: 'continue_plan',
  coachingPoints: [
    'Review distance, duration, and pace against the planned purpose.',
    'Keep the next run controlled unless recovery feels clearly strong.',
  ],
  riskLevel: 'low',
  confidence: 0.62,
  nextWorkoutAdjustment: {
    adjustmentType: 'none',
    reason: 'No strong signal requires a plan change from the available data.',
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && allowed.includes(value as T[number]);
}

export function truncateCoachField(value: unknown, maxLength: number, fallback: string) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : fallback;
  if (text.length <= maxLength) return text;

  const shortened = text.slice(0, maxLength).replace(/\s+\S*$/, '').replace(/[,:;!?-]+$/, '').trim();
  return shortened || fallback.slice(0, maxLength);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every(key => keys.includes(key));
}

export function validateCoachInsight(value: unknown): CoachInsight | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, TOP_LEVEL_KEYS)) return null;

  const {
    summary,
    readinessMessage,
    recommendedAction,
    coachingPoints,
    riskLevel,
    confidence,
    nextWorkoutAdjustment,
  } = value;

  if (typeof summary !== 'string' || summary.trim().length === 0 || summary.length > 240) return null;
  if (typeof readinessMessage !== 'string' || readinessMessage.trim().length === 0 || readinessMessage.length > 180) return null;
  if (!isOneOf(recommendedAction, RECOMMENDED_ACTIONS)) return null;
  if (!Array.isArray(coachingPoints) || coachingPoints.length < 2 || coachingPoints.length > 4) return null;
  if (!coachingPoints.every(point => typeof point === 'string' && point.trim().length > 0 && point.length <= 140)) return null;
  if (!isOneOf(riskLevel, RISK_LEVELS)) return null;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (!isPlainObject(nextWorkoutAdjustment) || !hasOnlyKeys(nextWorkoutAdjustment, NEXT_ADJUSTMENT_KEYS)) return null;

  const { adjustmentType, reason } = nextWorkoutAdjustment;
  if (!isOneOf(adjustmentType, NEXT_WORKOUT_ADJUSTMENT_TYPES)) return null;
  if (typeof reason !== 'string' || reason.trim().length === 0 || reason.length > 180) return null;

  return {
    summary: summary.trim(),
    readinessMessage: readinessMessage.trim(),
    recommendedAction,
    coachingPoints: coachingPoints.map(point => point.trim()),
    riskLevel,
    confidence,
    nextWorkoutAdjustment: {
      adjustmentType,
      reason: reason.trim(),
    },
  };
}

export function createFallbackCoachInsight(
  summary: string,
  overrides: Partial<Omit<CoachInsight, 'nextWorkoutAdjustment'>> & {
    nextWorkoutAdjustment?: Partial<CoachInsight['nextWorkoutAdjustment']>;
  } = {},
): CoachInsight {
  const coachingPoints = Array.isArray(overrides.coachingPoints) && overrides.coachingPoints.length > 0
    ? overrides.coachingPoints.slice(0, 4).map(point => truncateCoachField(point, 140, DEFAULT_COACH_INSIGHT.coachingPoints[0]))
    : [...DEFAULT_COACH_INSIGHT.coachingPoints];

  while (coachingPoints.length < 2) {
    coachingPoints.push(DEFAULT_COACH_INSIGHT.coachingPoints[coachingPoints.length] || DEFAULT_COACH_INSIGHT.coachingPoints[0]);
  }

  return {
    summary: truncateCoachField(summary, 240, DEFAULT_COACH_INSIGHT.summary),
    readinessMessage: truncateCoachField(
      overrides.readinessMessage,
      180,
      DEFAULT_COACH_INSIGHT.readinessMessage,
    ),
    recommendedAction: isOneOf(overrides.recommendedAction, RECOMMENDED_ACTIONS)
      ? overrides.recommendedAction
      : DEFAULT_COACH_INSIGHT.recommendedAction,
    coachingPoints,
    riskLevel: isOneOf(overrides.riskLevel, RISK_LEVELS)
      ? overrides.riskLevel
      : DEFAULT_COACH_INSIGHT.riskLevel,
    confidence: typeof overrides.confidence === 'number' && Number.isFinite(overrides.confidence)
      ? Math.min(1, Math.max(0, overrides.confidence))
      : DEFAULT_COACH_INSIGHT.confidence,
    nextWorkoutAdjustment: {
      adjustmentType: isOneOf(overrides.nextWorkoutAdjustment?.adjustmentType, NEXT_WORKOUT_ADJUSTMENT_TYPES)
        ? overrides.nextWorkoutAdjustment.adjustmentType
        : DEFAULT_COACH_INSIGHT.nextWorkoutAdjustment.adjustmentType,
      reason: truncateCoachField(
        overrides.nextWorkoutAdjustment?.reason,
        180,
        DEFAULT_COACH_INSIGHT.nextWorkoutAdjustment.reason,
      ),
    },
  };
}

export function normalizeCoachInsight(value: unknown, fallback: CoachInsight = DEFAULT_COACH_INSIGHT): CoachInsight {
  const valid = validateCoachInsight(value);
  if (valid) return valid;

  if (typeof value === 'string' && value.trim().length > 0) {
    return createFallbackCoachInsight(value, fallback);
  }

  return fallback;
}
