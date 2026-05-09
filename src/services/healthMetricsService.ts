import { HealthMetric, Workout } from '../types';
import { todayISO } from '../lib/date';

export interface DailyHealthSummary {
  date: string;
  steps: number;
  distanceKm: number;
  activeCalories: number;
  avgHeartRate: number | null;
  sleepMinutes: number;
  sleepScore: number | null;
  weightKg: number | null;
  source: 'google_fit';
  syncedAt: string;
  persisted?: boolean;
}

export interface RecoveryRecommendation {
  label: 'Push' | 'Maintain' | 'Recover';
  explanation: string;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundMetric(value: number, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function safeNumber(value: unknown, fallback = 0) {
  return finiteNumber(value) ? value : fallback;
}

function normalizeHistoryDate(date?: string) {
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
}

function appendHistory(metric: HealthMetric | undefined, date: string, value: number) {
  const previous = metric?.history || [];
  const nextPoint = { date, value };
  const deduped = previous.filter(point => point.date !== date);
  return [...deduped.slice(-6), nextPoint];
}

function getRecentWorkoutLoad(workouts: Workout[] = []) {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  return workouts
    .filter(workout => workout.status === 'completed')
    .filter(workout => {
      const completedAt = workout.result?.completedAt || workout.date;
      const timestamp = new Date(completedAt).getTime();
      return Number.isFinite(timestamp) && now - timestamp <= sevenDaysMs;
    })
    .reduce((sum, workout) => {
      const duration = workout.result?.actualDuration || workout.durationMinutes || 0;
      const effort = workout.result?.perceivedEffort || workout.effortTarget || 5;
      return sum + Math.max(0, duration) * Math.max(1, effort);
    }, 0);
}

export function normalizeHealthSyncResponse(data: any): DailyHealthSummary {
  const rawSummary = data?.summary || data;

  return {
    date: normalizeHistoryDate(rawSummary?.date),
    steps: Math.max(0, Math.round(safeNumber(rawSummary?.steps))),
    distanceKm: Math.max(0, roundMetric(safeNumber(rawSummary?.distanceKm), 2)),
    activeCalories: Math.max(0, Math.round(safeNumber(rawSummary?.activeCalories))),
    avgHeartRate: finiteNumber(rawSummary?.avgHeartRate) ? Math.round(rawSummary.avgHeartRate) : null,
    sleepMinutes: Math.max(0, Math.round(safeNumber(rawSummary?.sleepMinutes))),
    sleepScore: finiteNumber(rawSummary?.sleepScore) ? Math.round(rawSummary.sleepScore) : null,
    weightKg: finiteNumber(rawSummary?.weightKg) ? roundMetric(rawSummary.weightKg, 1) : null,
    source: 'google_fit',
    syncedAt: typeof rawSummary?.syncedAt === 'string' ? rawSummary.syncedAt : new Date().toISOString(),
    persisted: typeof data?.persisted === 'boolean' ? data.persisted : rawSummary?.persisted,
  };
}

export function calculateHealthMetricTrend(history: { value: number }[] = []) {
  if (history.length < 2) return 'stable' as const;

  const previous = history[history.length - 2]?.value;
  const current = history[history.length - 1]?.value;
  if (!finiteNumber(previous) || !finiteNumber(current)) return 'stable' as const;

  const delta = current - previous;
  const threshold = Math.max(1, Math.abs(previous) * 0.03);
  if (Math.abs(delta) <= threshold) return 'stable' as const;
  return delta > 0 ? 'up' as const : 'down' as const;
}

export function calculateRecoveryScore(summary: DailyHealthSummary, workouts: Workout[] = []) {
  const sleepScore = summary.sleepScore ?? (
    summary.sleepMinutes > 0 ? Math.min(100, Math.round((summary.sleepMinutes / 480) * 100)) : 72
  );
  const heartRateScore = summary.avgHeartRate
    ? Math.max(35, Math.min(100, Math.round(100 - Math.max(0, summary.avgHeartRate - 48) * 1.4)))
    : 72;
  const workoutLoad = getRecentWorkoutLoad(workouts);
  const loadPenalty = Math.min(24, Math.round(workoutLoad / 120));
  const score = Math.round((sleepScore * 0.5) + (heartRateScore * 0.35) + ((100 - loadPenalty) * 0.15));

  return Math.max(0, Math.min(100, score));
}

export function getRecoveryRecommendation(recoveryScore: number): RecoveryRecommendation {
  if (recoveryScore >= 78) {
    return {
      label: 'Push',
      explanation: 'Signals look steady for the planned session. Keep the effort controlled and stay inside the workout target.',
    };
  }

  if (recoveryScore >= 55) {
    return {
      label: 'Maintain',
      explanation: 'Recovery looks workable but not exceptional. Follow the plan without adding extra distance or intensity.',
    };
  }

  return {
    label: 'Recover',
    explanation: 'Recovery signals are lighter today. Keep the run easy, shorten it if needed, and prioritize consistency.',
  };
}

function buildMetric(
  existingMetrics: HealthMetric[],
  input: Omit<HealthMetric, 'trend' | 'history'>
): HealthMetric {
  const previousMetric = existingMetrics.find(metric => metric.id === input.id);
  const history = appendHistory(previousMetric, input.updatedAt.slice(0, 10), input.value);

  return {
    ...input,
    history,
    trend: calculateHealthMetricTrend(history),
  };
}

export function buildHealthMetricCards(
  summary: DailyHealthSummary,
  existingMetrics: HealthMetric[] = [],
  workouts: Workout[] = []
) {
  const recoveryScore = calculateRecoveryScore(summary, workouts);
  const updatedAt = summary.syncedAt;

  return [
    buildMetric(existingMetrics, {
      id: 'recovery_score',
      type: 'recovery_score',
      label: 'Recovery Score',
      value: recoveryScore,
      unit: '/100',
      updatedAt,
      source: 'computed',
    }),
    buildMetric(existingMetrics, {
      id: 'steps',
      type: 'steps',
      label: 'Steps',
      value: summary.steps,
      unit: 'steps',
      updatedAt,
      source: summary.source,
    }),
    buildMetric(existingMetrics, {
      id: 'distance',
      type: 'distance',
      label: 'Distance',
      value: summary.distanceKm,
      unit: 'km',
      updatedAt,
      source: summary.source,
    }),
    buildMetric(existingMetrics, {
      id: 'active_calories',
      type: 'active_calories',
      label: 'Active Calories',
      value: summary.activeCalories,
      unit: 'kcal',
      updatedAt,
      source: summary.source,
    }),
    buildMetric(existingMetrics, {
      id: 'sleep_duration',
      type: 'sleep_duration',
      label: 'Sleep Duration',
      value: roundMetric(summary.sleepMinutes / 60, 1),
      unit: 'hr',
      updatedAt,
      source: summary.source,
    }),
    buildMetric(existingMetrics, {
      id: 'sleep_score',
      type: 'sleep_score',
      label: 'Sleep Score',
      value: summary.sleepScore ?? Math.min(100, Math.round((summary.sleepMinutes / 480) * 100)),
      unit: '/100',
      updatedAt,
      source: 'computed',
    }),
    buildMetric(existingMetrics, {
      id: 'hr',
      type: 'hr',
      label: 'Avg Heart Rate',
      value: summary.avgHeartRate ?? 0,
      unit: 'bpm',
      updatedAt,
      source: summary.avgHeartRate ? summary.source : 'computed',
    }),
    buildMetric(existingMetrics, {
      id: 'weight',
      type: 'weight',
      label: 'Weight',
      value: summary.weightKg ?? 0,
      unit: 'kg',
      updatedAt,
      source: summary.weightKg ? summary.source : 'computed',
    }),
  ];
}
