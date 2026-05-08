import { GpsPathPoint, LiveWorkoutData, RunMeasurementMetadata, RunMeasurementSource, Workout } from '../types';
import { calculateDistance } from '../lib/utils';

const MIN_GPS_POINT_DISTANCE_KM = 0.005;
const MAX_REASONABLE_RUNNING_SPEED_KMH = 45;

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundMetric(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getAccuracyStats(path: GpsPathPoint[]) {
  const accuracies = path
    .map(point => point.accuracy)
    .filter((value): value is number => finiteNumber(value));

  if (accuracies.length === 0) return {};

  return {
    averageAccuracyMeters: roundMetric(
      accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length,
      1
    ),
    bestAccuracyMeters: roundMetric(Math.min(...accuracies), 1),
    worstAccuracyMeters: roundMetric(Math.max(...accuracies), 1),
  };
}

export function sanitizeGpsPath(path: GpsPathPoint[] = []) {
  return path.filter(point => (
    finiteNumber(point.lat) &&
    finiteNumber(point.lng) &&
    finiteNumber(point.timestamp) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  ));
}

export function calculateGpsDistance(path: GpsPathPoint[]) {
  const cleanPath = sanitizeGpsPath(path);
  let distance = 0;

  for (let index = 1; index < cleanPath.length; index++) {
    const previous = cleanPath[index - 1];
    const current = cleanPath[index];
    const segmentDistance = calculateDistance(previous.lat, previous.lng, current.lat, current.lng);
    const elapsedSeconds = Math.max(0, (current.timestamp - previous.timestamp) / 1000);
    const segmentSpeed = elapsedSeconds > 0 ? (segmentDistance * 3600) / elapsedSeconds : 0;

    if (segmentDistance < MIN_GPS_POINT_DISTANCE_KM) continue;
    if (segmentSpeed > MAX_REASONABLE_RUNNING_SPEED_KMH) continue;

    distance += segmentDistance;
  }

  return roundMetric(distance, 3);
}

export function formatPace(durationMinutes: number, distanceKm: number) {
  if (!Number.isFinite(durationMinutes) || !Number.isFinite(distanceKm) || durationMinutes <= 0 || distanceKm <= 0) {
    return '0:00 min/km';
  }

  const paceSeconds = Math.round((durationMinutes / distanceKm) * 60);
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = paceSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')} min/km`;
}

export function buildLiveWorkoutData(input: {
  distance: number;
  seconds: number;
  path: GpsPathPoint[];
}): LiveWorkoutData {
  const cleanPath = sanitizeGpsPath(input.path);
  const gpsDistance = calculateGpsDistance(cleanPath);
  const fallbackDistance = Number.isFinite(input.distance) ? Math.max(0, input.distance) : 0;
  const distance = cleanPath.length >= 2 ? gpsDistance : fallbackDistance;
  const durationSeconds = Math.max(0, Math.round(input.seconds));
  const measurementSource: RunMeasurementSource = cleanPath.length >= 2 ? 'gps' : 'timer';
  const gpsMetrics: RunMeasurementMetadata = {
    source: measurementSource,
    sampleCount: cleanPath.length,
    durationSeconds,
    measuredAt: new Date().toISOString(),
    ...getAccuracyStats(cleanPath),
  };

  return {
    distance: roundMetric(distance, 2),
    duration: roundMetric(durationSeconds / 60, 2),
    durationSeconds,
    path: cleanPath,
    measurementSource,
    gpsMetrics,
  };
}

export function getActualDistance(workout: Workout) {
  return Number.isFinite(workout.result?.actualDistance) ? workout.result!.actualDistance : 0;
}

export function getActualDuration(workout: Workout) {
  return Number.isFinite(workout.result?.actualDuration) ? workout.result!.actualDuration : 0;
}

export function getCompletedDistanceLabel(workout: Workout) {
  const actualDistance = getActualDistance(workout);
  return actualDistance > 0 ? `${actualDistance.toFixed(2)} km` : 'GPS pending';
}

export function getCompletedDurationLabel(workout: Workout) {
  const actualDuration = getActualDuration(workout);
  return actualDuration > 0 ? `${roundMetric(actualDuration, 1)}m` : '0m';
}

export function getMeasurementLabel(source?: RunMeasurementSource) {
  if (source === 'gps') return 'GPS measured';
  if (source === 'timer') return 'Timer only';
  return 'Manual entry';
}
