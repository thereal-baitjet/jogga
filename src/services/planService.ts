import { generatePlan } from '../constants';
import { isDateBeforeToday, parseLocalDate, defaultGoalDate, todayISO } from '../lib/date';
import { UserProfile, Workout } from '../types';

export function getPlanReadyProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    goalDate: isDateBeforeToday(profile.goalDate) ? defaultGoalDate() : profile.goalDate,
  };
}

export function generatePlanForProfile(profile: UserProfile) {
  return generatePlan(getPlanReadyProfile(profile));
}

export function hasRenderableTrainingPlan(workouts: Workout[], currentDate = todayISO()) {
  return workouts.some(workout => (
    workout.status === 'planned' &&
    workout.date >= currentDate
  ));
}

export function hasActiveSubscription(profile: Partial<UserProfile> | null | undefined) {
  return profile?.subscriptionStatus === 'active' || profile?.subscriptionStatus === 'trialing';
}

export function hasPriorSubscription(profile: Partial<UserProfile> | null | undefined) {
  return Boolean(
    profile?.stripeCustomerId ||
    profile?.stripeSubscriptionId ||
    profile?.subscriptionVerifiedAt ||
    profile?.subscriptionStatus
  );
}

export function canUseApp(
  profile: Partial<UserProfile> | null | undefined,
  _workouts: Workout[] = [],
  _currentDate = todayISO()
) {
  return hasActiveSubscription(profile);
}

export function mergeWorkoutPlans(existingWorkouts: Workout[], generatedWorkouts: Workout[]) {
  const existingIds = new Set(existingWorkouts.map(workout => workout.id));
  const merged = [
    ...existingWorkouts,
    ...generatedWorkouts.filter(workout => !existingIds.has(workout.id)),
  ];

  return merged.sort((a, b) => (
    parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime()
  ));
}

export function generateRenderablePlan(profile: UserProfile, existingWorkouts: Workout[], currentDate = todayISO()) {
  if (hasRenderableTrainingPlan(existingWorkouts, currentDate)) {
    return existingWorkouts;
  }

  return mergeWorkoutPlans(existingWorkouts, generatePlanForProfile(profile));
}
