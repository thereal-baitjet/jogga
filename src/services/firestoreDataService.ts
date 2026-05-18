import { Workout, WorkoutResult } from '../types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function removeUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter(item => item !== undefined)
      .map(item => removeUndefinedFields(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, childValue] of Object.entries(value)) {
    if (childValue === undefined) continue;

    cleaned[key] = removeUndefinedFields(childValue);
  }

  return cleaned as T;
}

export function sanitizeWorkoutResultForFirestore(result: WorkoutResult): WorkoutResult {
  const { path: _discardedRoutePath, ...summaryOnlyResult } = result;

  return removeUndefinedFields({
    ...summaryOnlyResult,
    gpsMetrics: summaryOnlyResult.gpsMetrics ? removeUndefinedFields(summaryOnlyResult.gpsMetrics) : undefined,
  });
}

export function buildCompletedWorkoutForFirestore(workout: Workout, uid: string, result: WorkoutResult) {
  return removeUndefinedFields({
    ...workout,
    uid,
    status: 'completed' as const,
    result: sanitizeWorkoutResultForFirestore(result),
  });
}
