import { GpsPathPoint, Workout, WorkoutResult } from '../types';

const MAX_STORED_ROUTE_POINTS = 800;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function cleanNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cleanPathPoint(point: GpsPathPoint) {
  const cleaned: GpsPathPoint = {
    lat: point.lat,
    lng: point.lng,
    timestamp: point.timestamp,
  };

  if (typeof point.speed === 'number' && Number.isFinite(point.speed)) {
    cleaned.speed = point.speed;
  }

  if (typeof point.accuracy === 'number' && Number.isFinite(point.accuracy)) {
    cleaned.accuracy = point.accuracy;
  }

  return cleaned;
}

function samplePath(path: GpsPathPoint[]) {
  if (path.length <= MAX_STORED_ROUTE_POINTS) return path;

  const step = Math.ceil(path.length / MAX_STORED_ROUTE_POINTS);
  return path.filter((_, index) => index === 0 || index === path.length - 1 || index % step === 0);
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
  const path = Array.isArray(result.path)
    ? samplePath(result.path)
        .filter(point => (
          cleanNumber(point.lat) !== null &&
          cleanNumber(point.lng) !== null &&
          cleanNumber(point.timestamp) !== null
        ))
        .map(cleanPathPoint)
    : undefined;

  return removeUndefinedFields({
    ...result,
    path,
    gpsMetrics: result.gpsMetrics ? removeUndefinedFields(result.gpsMetrics) : undefined,
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
