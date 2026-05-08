import { Achievement, MarathonReadyingEvent, MarathonReadyingProfile, Workout, WorkoutType } from '../types';
import { todayISO } from '../lib/date';
import { getActualDistance, getActualDuration } from './runMetricsService';

const WORKOUT_TYPE_BONUS: Record<WorkoutType, number> = {
  'Easy run': 5,
  'Long run': 12,
  'Tempo run': 12,
  'Interval session': 14,
  'Recovery run': 4,
  'Race-pace run': 14,
  'Hill workout': 13,
  'Strength session': 8,
  'Mobility/recovery session': 4,
};

const READINESS_WORKOUT_TYPES: WorkoutType[] = [
  'Long run',
  'Tempo run',
  'Interval session',
  'Race-pace run',
  'Hill workout',
  'Strength session',
];

function getCompletedAt(workout: Workout) {
  return workout.result?.completedAt || '';
}

function getCompletedWorkouts(workouts: Workout[]) {
  return workouts
    .filter(workout => workout.status === 'completed' && workout.result?.completedAt)
    .sort((a, b) => new Date(getCompletedAt(a)).getTime() - new Date(getCompletedAt(b)).getTime());
}

function getCompletionDate(workout: Workout) {
  return getCompletedAt(workout).slice(0, 10) || workout.date;
}

function getCurrentStreak(workouts: Workout[]) {
  const dates = [...new Set(getCompletedWorkouts(workouts).map(getCompletionDate))].sort();
  if (dates.length === 0) return 0;

  let streak = 1;
  for (let index = dates.length - 1; index > 0; index--) {
    const current = new Date(`${dates[index]}T00:00:00`);
    const previous = new Date(`${dates[index - 1]}T00:00:00`);
    const diffDays = Math.round((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays !== 1) break;
    streak++;
  }

  return streak;
}

function getLevelProgress(totalPoints: number) {
  let level = 1;
  let remainingPoints = totalPoints;
  let nextLevelPoints = 160;

  while (remainingPoints >= nextLevelPoints) {
    remainingPoints -= nextLevelPoints;
    level++;
    nextLevelPoints = 160 + ((level - 1) * 40);
  }

  return {
    level,
    currentLevelPoints: remainingPoints,
    nextLevelPoints,
    progressPercent: nextLevelPoints > 0 ? Math.round((remainingPoints / nextLevelPoints) * 100) : 0,
  };
}

function getMarathonReadinessPoints(completedWorkouts: Workout[], currentStreak: number) {
  const totalDistance = completedWorkouts.reduce((sum, workout) => sum + getActualDistance(workout), 0);
  const longestRun = completedWorkouts.reduce((maxDistance, workout) => Math.max(maxDistance, getActualDistance(workout)), 0);
  const longRuns = completedWorkouts.filter(workout => workout.type === 'Long run').length;
  const readinessSessions = completedWorkouts.filter(workout => READINESS_WORKOUT_TYPES.includes(workout.type)).length;

  const volumePoints = Math.min(260, Math.round(totalDistance * 3));
  const longestRunPoints = Math.min(140, Math.round(longestRun * 6));
  const longRunPoints = longRuns * 18;
  const readinessSessionPoints = readinessSessions * 14;
  const streakReadinessPoints = Math.min(100, currentStreak * 10);

  return volumePoints + longestRunPoints + longRunPoints + readinessSessionPoints + streakReadinessPoints;
}

export function getWorkoutReadyingPreview(workout: Workout) {
  const durationPoints = Math.min(28, Math.max(4, Math.round(workout.durationMinutes / 5)));
  const distancePoints = workout.distanceTarget ? Math.min(20, Math.round(workout.distanceTarget * 2)) : 0;
  const effortPoints = workout.effortTarget >= 8 ? 8 : workout.effortTarget >= 5 ? 5 : 3;

  return 12 + durationPoints + distancePoints + effortPoints + WORKOUT_TYPE_BONUS[workout.type];
}

function getWorkoutReadyingCompletionPoints(workout: Workout) {
  const measuredDuration = getActualDuration(workout);
  const measuredDistance = getActualDistance(workout);
  const measuredEffort = workout.result?.perceivedEffort || workout.effortTarget;
  const durationPoints = measuredDuration > 0
    ? Math.min(28, Math.max(4, Math.round(measuredDuration / 5)))
    : 4;
  const distancePoints = measuredDistance > 0 ? Math.min(20, Math.round(measuredDistance * 2)) : 0;
  const effortPoints = measuredEffort >= 8 ? 8 : measuredEffort >= 5 ? 5 : 3;

  return 12 + durationPoints + distancePoints + effortPoints + WORKOUT_TYPE_BONUS[workout.type];
}

export function getWorkoutReadyingEarned(workout: Workout) {
  if (workout.status !== 'completed') return 0;

  const feedbackPoints = workout.result?.feedbackReward?.rewardPoints || (workout.result?.notes ? 8 : 0);
  return getWorkoutReadyingCompletionPoints(workout) + feedbackPoints;
}

export function buildWorkoutReadyingEvent(workout: Workout): MarathonReadyingEvent {
  const completionPoints = workout.status === 'completed'
    ? getWorkoutReadyingCompletionPoints(workout)
    : getWorkoutReadyingPreview(workout);
  const feedbackReward = workout.result?.feedbackReward;
  const feedbackPoints = feedbackReward?.rewardPoints || (workout.result?.notes ? 8 : 0);
  const points = completionPoints + feedbackPoints;

  return {
    id: `${workout.id}-${workout.result?.completedAt || Date.now()}`,
    title: feedbackReward ? 'Readying banked' : 'Run readiness banked',
    message: feedbackReward?.rewardCue || `${workout.type} completed. Marathon readiness moved forward.`,
    points,
    createdAt: workout.result?.completedAt || new Date().toISOString(),
    tone: feedbackReward ? 'feedback' : 'completion',
  };
}

export function buildMarathonReadyingProfile(workouts: Workout[], achievements: Achievement[] = []): MarathonReadyingProfile {
  const completedWorkouts = getCompletedWorkouts(workouts);
  const completionPoints = completedWorkouts.reduce((sum, workout) => sum + getWorkoutReadyingCompletionPoints(workout), 0);
  const feedbackPoints = completedWorkouts.reduce((sum, workout) => (
    sum + (workout.result?.feedbackReward?.rewardPoints || (workout.result?.notes ? 8 : 0))
  ), 0);
  const achievementPoints = achievements.filter(achievement => achievement.unlockedAt).length * 50;
  const currentStreak = getCurrentStreak(workouts);
  const usagePoints = completionPoints + feedbackPoints + (completedWorkouts.length * 6);
  const readinessPoints = getMarathonReadinessPoints(completedWorkouts, currentStreak);
  const totalPoints = usagePoints + readinessPoints + achievementPoints;
  const levelProgress = getLevelProgress(totalPoints);
  const today = todayISO();
  const todayPoints = completedWorkouts.reduce((sum, workout) => (
    getCompletionDate(workout) === today ? sum + getWorkoutReadyingEarned(workout) : sum
  ), 0);
  const latestWorkout = completedWorkouts[completedWorkouts.length - 1];

  return {
    totalPoints,
    ...levelProgress,
    currentStreak,
    completedWorkouts: completedWorkouts.length,
    usagePoints,
    readinessPoints,
    feedbackPoints,
    achievementPoints,
    todayPoints,
    lastEvent: latestWorkout ? buildWorkoutReadyingEvent(latestWorkout) : null,
  };
}
