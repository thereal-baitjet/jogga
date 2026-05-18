import { FeedbackReward, FeedbackRewardLevel, FeedbackSignalStrength, RunMeasurementSource, Workout } from '../types';

interface FeedbackRewardInput {
  effort: number;
  notes: string;
  actualDistance: number;
  actualDuration: number;
  measurementSource?: RunMeasurementSource;
}

function normalizeNotes(notes: string) {
  return notes.trim().replace(/\s+/g, ' ');
}

function truncateSignal(signal: string, maxLength = 90) {
  if (signal.length <= maxLength) return signal;
  return `${signal.slice(0, maxLength - 3).trim()}...`;
}

function getWordCount(notes: string) {
  if (!notes) return 0;
  return notes.split(' ').filter(Boolean).length;
}

function safeNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function getSignalStrength(notes: string, effortDelta: number, statsChanged: boolean): FeedbackSignalStrength {
  const wordCount = getWordCount(notes);

  if (wordCount >= 10 || (wordCount >= 5 && Math.abs(effortDelta) >= 2) || (statsChanged && wordCount >= 5)) {
    return 'strong';
  }

  if (wordCount >= 4 || Math.abs(effortDelta) >= 2 || statsChanged) {
    return 'useful';
  }

  return 'weak';
}

function getRewardLevel(signalStrength: FeedbackSignalStrength): FeedbackRewardLevel {
  if (signalStrength === 'strong') return 'high';
  if (signalStrength === 'useful') return 'medium';
  return 'small';
}

function getRewardPoints(signalStrength: FeedbackSignalStrength, hasNotes: boolean, statsChanged: boolean) {
  const basePoints = signalStrength === 'strong' ? 35 : signalStrength === 'useful' ? 22 : 10;
  return basePoints + (hasNotes ? 6 : 0) + (statsChanged ? 4 : 0);
}

function buildFeedbackSummary(workout: Workout, input: FeedbackRewardInput, notes: string, effortDelta: number) {
  const sourceLabel = input.measurementSource === 'gps'
    ? 'GPS measured'
    : input.measurementSource === 'timer'
      ? 'Timer recorded'
      : 'You logged';

  if (notes) {
    return `You flagged: ${truncateSignal(notes)}`;
  }

  if (effortDelta >= 2) {
    return `${sourceLabel} this ${workout.type.toLowerCase()} as harder than planned at effort ${input.effort}/10.`;
  }

  if (effortDelta <= -2) {
    return `${sourceLabel} this ${workout.type.toLowerCase()} as smoother than planned at effort ${input.effort}/10.`;
  }

  return `${sourceLabel} effort ${input.effort}/10 with ${input.actualDistance.toFixed(1)} km completed.`;
}

function buildRewardCue(signalStrength: FeedbackSignalStrength) {
  if (signalStrength === 'strong') {
    return 'Good catch. That is strong coaching signal.';
  }

  if (signalStrength === 'useful') {
    return 'Useful signal. The plan gets sharper from this.';
  }

  return 'Logged. A quick signal still keeps the loop alive.';
}

function buildNextAction(workout: Workout, input: FeedbackRewardInput, notes: string, effortDelta: number, statsChanged: boolean) {
  if (effortDelta >= 2) {
    return 'Dial the next similar run back unless recovery looks strong.';
  }

  if (effortDelta <= -2 && input.actualDistance >= (workout.distanceTarget || 0)) {
    return 'Keep this pattern and look for a controlled progression.';
  }

  if (statsChanged) {
    return input.measurementSource === 'gps'
      ? 'Use the GPS distance and duration to recalibrate the plan.'
      : 'Use the actual distance and duration to recalibrate the plan.';
  }

  if (notes) {
    return 'Apply this note to the next plan adjustment.';
  }

  return "Keep the completion data as today's baseline.";
}

export function buildFeedbackReward(
  workout: Workout,
  input: FeedbackRewardInput,
  acknowledgedAt = new Date().toISOString()
): FeedbackReward {
  const safeInput = {
    ...input,
    effort: safeNumber(input.effort, workout.effortTarget),
    actualDistance: safeNumber(input.actualDistance, 0),
    actualDuration: safeNumber(input.actualDuration, workout.durationMinutes),
    measurementSource: input.measurementSource || 'manual',
  };
  const notes = normalizeNotes(input.notes);
  const effortDelta = safeInput.effort - workout.effortTarget;
  const targetDistance = workout.distanceTarget ?? safeInput.actualDistance;
  const statsChanged = (
    Math.abs(safeInput.actualDistance - targetDistance) >= 0.2 ||
    Math.abs(safeInput.actualDuration - workout.durationMinutes) >= 3
  );
  const signalStrength = getSignalStrength(notes, effortDelta, statsChanged);
  const rewardLevel = getRewardLevel(signalStrength);

  return {
    acknowledgedAt,
    feedbackSummary: buildFeedbackSummary(workout, safeInput, notes, effortDelta),
    rewardCue: buildRewardCue(signalStrength),
    signalStrength,
    rewardLevel,
    rewardPoints: getRewardPoints(signalStrength, Boolean(notes), statsChanged),
    nextAction: buildNextAction(workout, safeInput, notes, effortDelta, statsChanged),
  };
}
