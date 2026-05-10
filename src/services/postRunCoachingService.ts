import { LiveWorkoutData, Workout } from '../types';
import {
  createFallbackCoachInsight,
} from './coachInsightService';
import type {
  CoachInsight,
  NextWorkoutAdjustmentType,
  RecommendedAction,
  RiskLevel,
} from './coachInsightService';
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

function getCompletionRatio(workout: Workout, liveData: LiveWorkoutData) {
  if (workout.distanceTarget) return liveData.distance / workout.distanceTarget;
  return liveData.duration / workout.durationMinutes;
}

function getPostRunAction(workout: Workout, liveData: LiveWorkoutData): RecommendedAction {
  const completionRatio = getCompletionRatio(workout, liveData);
  const durationRatio = liveData.duration / workout.durationMinutes;

  if (completionRatio >= 1.15 || durationRatio >= 1.15) return 'reduce_intensity';
  if (completionRatio <= 0.82 || durationRatio <= 0.82) return 'repeat_workout';
  if (workout.effortTarget >= 8 && completionRatio >= 1.05) return 'reduce_intensity';
  if (workout.effortTarget <= 4 && completionRatio >= 0.95 && completionRatio <= 1.08) return 'continue_plan';

  return 'continue_plan';
}

function getPostRunRiskLevel(workout: Workout, liveData: LiveWorkoutData): RiskLevel {
  const completionRatio = getCompletionRatio(workout, liveData);
  const accuracy = liveData.gpsMetrics.averageAccuracyMeters || 0;
  const poorGpsSignal = liveData.measurementSource === 'gps' && accuracy > 35;

  if ((completionRatio >= 1.2 && workout.effortTarget >= 7) || poorGpsSignal) return 'medium';
  if (completionRatio <= 0.75 && workout.effortTarget >= 7) return 'medium';

  return 'low';
}

function getNextWorkoutAdjustment(action: RecommendedAction): NextWorkoutAdjustmentType {
  if (action === 'reduce_intensity') return 'easier';
  if (action === 'repeat_workout') return 'repeat_previous';
  if (action === 'rest') return 'rest_day';
  if (action === 'increase_carefully') return 'slightly_harder';
  return 'none';
}

function getAdjustmentReason(action: RecommendedAction) {
  if (action === 'reduce_intensity') {
    return 'The next session should start easier because today added more load than the plan asked for.';
  }

  if (action === 'repeat_workout') {
    return 'Repeat the rhythm before increasing load because today came in clearly below the planned session.';
  }

  return 'The measured result does not require a forced plan change; stay controlled and let consistency compound.';
}

const COACH_PROMPT_SCHEMA = {
  type: 'object',
  required: [
    'summary',
    'readinessMessage',
    'recommendedAction',
    'coachingPoints',
    'riskLevel',
    'confidence',
    'nextWorkoutAdjustment',
  ],
  properties: {
    summary: { type: 'string', maxLength: 240 },
    readinessMessage: { type: 'string', maxLength: 180 },
    recommendedAction: {
      type: 'string',
      enum: ['continue_plan', 'reduce_intensity', 'rest', 'repeat_workout', 'increase_carefully'],
    },
    coachingPoints: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: { type: 'string', maxLength: 140 },
    },
    riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    nextWorkoutAdjustment: {
      type: 'object',
      required: ['adjustmentType', 'reason'],
      properties: {
        adjustmentType: {
          type: 'string',
          enum: ['none', 'shorter', 'easier', 'rest_day', 'repeat_previous', 'slightly_harder'],
        },
        reason: { type: 'string', maxLength: 180 },
      },
    },
  },
};

export function buildPostRunCoachPrompt(workout: Workout, liveData: LiveWorkoutData) {
  const avgPace = formatPace(liveData.duration, liveData.distance);
  const measurementLabel = getMeasurementLabel(liveData.measurementSource);
  const paceDelta = getPaceDeltaLabel(avgPace, workout.paceTarget);
  const distanceDelta = getDistanceDeltaLabel(workout, liveData);
  const durationDelta = getDurationDeltaLabel(workout, liveData);
  const workoutIntent = getWorkoutIntent(workout);
  const trainingRead = getTrainingRead(workout, liveData);
  const action = getPostRunAction(workout, liveData);
  const riskLevel = getPostRunRiskLevel(workout, liveData);
  const essentialInput = {
    coachPersona: 'Coach Mara',
    userGoal: 'current Jogga training plan',
    experienceLevel: 'not_provided',
    plannedWorkout: {
      type: workout.type,
      targetDistanceKm: workout.distanceTarget || null,
      targetDurationMinutes: workout.durationMinutes,
      targetPace: workout.paceTarget || null,
      targetEffort: workout.effortTarget,
      intent: workoutIntent,
    },
    actualMeasuredRun: {
      source: measurementLabel,
      distanceKm: Number(liveData.distance.toFixed(2)),
      durationMinutes: liveData.duration,
      pace: avgPace,
      gpsSampleCount: liveData.gpsMetrics.sampleCount,
      averageGpsAccuracyMeters: liveData.gpsMetrics.averageAccuracyMeters || null,
    },
    readinessScore: null,
    recentWorkoutSummary: 'not_included',
    missedWorkoutFlag: workout.status === 'missed',
    fatigueIndicators: {
      expectedAction: action,
      riskLevel,
      distanceDelta,
      durationDelta,
      paceDelta,
      trainingRead,
    },
    coachCalculations: {
      distanceDelta,
      durationDelta,
      paceDelta,
      trainingRead,
    },
  };

  return `You are Coach Mara, an experienced real-world running coach: direct, calm, specific, and practical. You are not a hype bot.
Return only valid JSON. No markdown. No backticks. No explanation. No extra text before or after JSON. No extra keys.
Do not invent heart rate, elevation, cadence, weather, soreness, splits, or medical claims.
Use actual measured data first and keep every field concise.
Schema: ${JSON.stringify(COACH_PROMPT_SCHEMA)}
Essential input: ${JSON.stringify(essentialInput)}
Coach calculations are in essentialInput.coachCalculations.`;
}

export function buildPostRunCoachFallbackData(workout: Workout, liveData: LiveWorkoutData): CoachInsight {
  const avgPace = formatPace(liveData.duration, liveData.distance);
  const distanceDelta = getDistanceDeltaLabel(workout, liveData);
  const paceDelta = getPaceDeltaLabel(avgPace, workout.paceTarget);
  const trainingRead = getTrainingRead(workout, liveData);
  const action = getPostRunAction(workout, liveData);
  const riskLevel = getPostRunRiskLevel(workout, liveData);
  const adjustmentType = getNextWorkoutAdjustment(action);
  const adjustmentReason = getAdjustmentReason(action);
  const measurementLabel = getMeasurementLabel(liveData.measurementSource);

  return createFallbackCoachInsight(
    `${measurementLabel} ${liveData.distance.toFixed(2)} km in ${liveData.duration} min at ${avgPace}; ${distanceDelta.toLowerCase()} ${paceDelta}`,
    {
      readinessMessage: trainingRead,
      recommendedAction: action,
      coachingPoints: [
        distanceDelta,
        paceDelta,
        trainingRead,
      ],
      riskLevel,
      confidence: liveData.measurementSource === 'gps' ? 0.78 : 0.62,
      nextWorkoutAdjustment: {
        adjustmentType,
        reason: adjustmentReason,
      },
    },
  );
}

export function buildPostRunCoachFallback(workout: Workout, liveData: LiveWorkoutData) {
  return buildPostRunCoachFallbackData(workout, liveData).summary;
}
