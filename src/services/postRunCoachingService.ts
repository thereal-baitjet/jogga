import { LiveWorkoutData, Workout } from '../types';
import { formatPace, getMeasurementLabel } from './runMetricsService';

function parsePaceSeconds(pace?: string) {
  if (!pace) return null;

  const match = pace.match(/(\d+):(\d{1,2})/);
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

function formatSigned(value: number, unit: string) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}${unit}`;
}

function getPaceDeltaLabel(actualPace: string, targetPace?: string) {
  const actualSeconds = parsePaceSeconds(actualPace);
  const targetSeconds = parsePaceSeconds(targetPace);
  if (!actualSeconds || !targetSeconds) return 'No exact pace target to compare.';

  const delta = actualSeconds - targetSeconds;
  if (Math.abs(delta) < 8) return 'Pace was essentially on target.';

  const absDelta = Math.abs(delta);
  const label = `${Math.floor(absDelta / 60)}:${(absDelta % 60).toString().padStart(2, '0')}/km`;
  return delta < 0 ? `${label} faster than target pace.` : `${label} slower than target pace.`;
}

function getDistanceDeltaLabel(workout: Workout, liveData: LiveWorkoutData) {
  if (!workout.distanceTarget) return 'No exact distance target to compare.';

  const delta = liveData.distance - workout.distanceTarget;
  if (Math.abs(delta) < 0.15) return 'Distance was right on the planned target.';

  return `${formatSigned(delta, ' km')} versus planned distance.`;
}

function getDurationDeltaLabel(workout: Workout, liveData: LiveWorkoutData) {
  const delta = liveData.duration - workout.durationMinutes;
  if (Math.abs(delta) < 1) return 'Duration matched the planned session.';

  return `${formatSigned(delta, ' min')} versus planned duration.`;
}

function getWorkoutIntent(workout: Workout) {
  if (workout.type === 'Easy run' || workout.type === 'Recovery run') {
    return 'The purpose is aerobic control: relaxed mechanics, repeatable breathing, and leaving enough freshness for the next quality day.';
  }

  if (workout.type === 'Long run') {
    return 'The purpose is durable aerobic volume: stay controlled early, protect form late, and avoid turning endurance work into a race.';
  }

  if (workout.type === 'Tempo run' || workout.type === 'Race-pace run') {
    return 'The purpose is controlled pressure: steady rhythm, manageable discomfort, and pacing discipline rather than a late sprint.';
  }

  if (workout.type === 'Interval session' || workout.type === 'Hill workout') {
    return 'The purpose is neuromuscular quality: strong reps, clean form, and enough restraint that the final repeat still looks athletic.';
  }

  return 'The purpose is consistency and tissue readiness: bank the work without forcing intensity.';
}

function getTrainingRead(workout: Workout, liveData: LiveWorkoutData) {
  const completionRatio = workout.distanceTarget ? liveData.distance / workout.distanceTarget : liveData.duration / workout.durationMinutes;
  const durationRatio = liveData.duration / workout.durationMinutes;

  if (completionRatio >= 1.08 && durationRatio >= 1.08) {
    return 'You added meaningful load today, so the next session should open conservatively until your legs confirm they absorbed it.';
  }

  if (completionRatio <= 0.85 || durationRatio <= 0.85) {
    return 'This was a reduced load day, which is fine if it was intentional; the next run should rebuild rhythm before chasing speed.';
  }

  if (workout.effortTarget >= 7) {
    return 'Because this was a quality session, judge success by repeatability and recovery, not just the average pace.';
  }

  return 'This sits in the right zone for aerobic development if it felt controlled and repeatable.';
}

export function buildPostRunCoachPrompt(workout: Workout, liveData: LiveWorkoutData) {
  const avgPace = formatPace(liveData.duration, liveData.distance);
  const measurementLabel = getMeasurementLabel(liveData.measurementSource);
  const paceDelta = getPaceDeltaLabel(avgPace, workout.paceTarget);
  const distanceDelta = getDistanceDeltaLabel(workout, liveData);
  const durationDelta = getDurationDeltaLabel(workout, liveData);
  const workoutIntent = getWorkoutIntent(workout);
  const trainingRead = getTrainingRead(workout, liveData);

  return `You are Coach Mara, an experienced real-world running coach: direct, calm, specific, and practical. You are not a hype bot.

Write a post-run coaching insight for a runner after this workout. Use actual measured data first. Do not invent heart rate, elevation, cadence, weather, soreness, or splits. If data is missing, say what you can and cannot infer.

Session intent:
${workoutIntent}

Planned workout:
- Type: ${workout.type}
- Target distance: ${workout.distanceTarget ? `${workout.distanceTarget} km` : 'not specified'}
- Target duration: ${workout.durationMinutes} min
- Target pace: ${workout.paceTarget || 'effort based'}
- Target effort: ${workout.effortTarget}/10

Actual measured result (${measurementLabel}):
- Distance: ${liveData.distance.toFixed(2)} km
- Duration: ${liveData.duration} min
- Average pace: ${avgPace}
- GPS samples: ${liveData.gpsMetrics.sampleCount}
- Average GPS accuracy: ${liveData.gpsMetrics.averageAccuracyMeters ? `${liveData.gpsMetrics.averageAccuracyMeters}m` : 'unknown'}

Coach calculations:
- ${distanceDelta}
- ${durationDelta}
- ${paceDelta}
- ${trainingRead}

Output style:
- 3 short sentences.
- First sentence: coach's read of the session using actual numbers.
- Second sentence: training interpretation tied to the workout purpose.
- Third sentence: one concrete recovery or next-run adjustment.
- Use a real trainer voice: specific, grounded, no generic "great job", no emojis, no medical advice.`;
}

export function buildPostRunCoachFallback(workout: Workout, liveData: LiveWorkoutData) {
  const avgPace = formatPace(liveData.duration, liveData.distance);
  const distanceDelta = getDistanceDeltaLabel(workout, liveData);
  const paceDelta = getPaceDeltaLabel(avgPace, workout.paceTarget);
  const trainingRead = getTrainingRead(workout, liveData);

  return `${getMeasurementLabel(liveData.measurementSource)} ${liveData.distance.toFixed(2)} km in ${liveData.duration} min at ${avgPace}; ${distanceDelta.toLowerCase()} ${paceDelta} ${trainingRead}`;
}
