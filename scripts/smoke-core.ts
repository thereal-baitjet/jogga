import { addDays } from 'date-fns';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Dashboard from '../src/components/Dashboard';
import PlanView from '../src/components/PlanView';
import { generatePlan } from '../src/constants';
import {
  canUseApp,
  generateRenderablePlan,
  hasActiveSubscription,
  hasRenderableTrainingPlan,
  mergeWorkoutPlans,
} from '../src/services/planService';
import { calculateReadiness } from '../src/services/readinessService';
import { buildFeedbackReward } from '../src/services/feedbackRewardService';
import { toISODate, todayDate } from '../src/lib/date';
import { buildLiveWorkoutData, formatPace, getActualDistance } from '../src/services/runMetricsService';
import { buildPostRunCoachFallback, buildPostRunCoachPrompt } from '../src/services/postRunCoachingService';
import { UserProfile, Workout } from '../src/types';
import { FREE_TRIAL_DAYS, FREE_TRIAL_LABEL, isTrialCheckout, normalizeBillingPlanId } from '../src/config/billing';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function baseProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    id: 'smoke-user',
    uid: 'smoke-user',
    email: 'smoke@example.com',
    name: 'Smoke Runner',
    experienceLevel: 'beginner',
    goalType: '5k',
    goalDate: toISODate(addDays(todayDate(), 90)),
    preferredDays: [1, 3, 5],
    weeklyMileagePreference: 20,
    ...overrides,
  };
}

function validatePlan(name: string, plan: Workout[], profile: UserProfile) {
  assert(plan.length > 0, `${name}: plan should include workouts`);

  const ids = new Set(plan.map(workout => workout.id));
  assert(ids.size === plan.length, `${name}: workout ids should be unique`);

  let previousDate = '';
  for (const workout of plan) {
    assert(workout.id === `plan-${workout.date}`, `${name}: workout id should match date`);
    assert(workout.date >= toISODate(todayDate()), `${name}: workout should not be before today`);
    assert(!previousDate || workout.date >= previousDate, `${name}: workouts should be sorted`);
    assert(workout.durationMinutes >= 20, `${name}: workout duration should have a sensible minimum`);
    assert(workout.effortTarget >= 1 && workout.effortTarget <= 10, `${name}: effort should be 1-10`);
    assert(workout.instructions.length > 0, `${name}: workout should include instructions`);
    assert(workout.status === 'planned', `${name}: generated workouts start planned`);
    previousDate = workout.date;
  }

  if (profile.goalDate >= toISODate(todayDate())) {
    assert(plan[plan.length - 1].date <= profile.goalDate, `${name}: plan should not run after goal date`);
  }
}

const scenarios = [
  baseProfile({ goalType: '5k', experienceLevel: 'beginner', preferredDays: [1, 3, 5], weeklyMileagePreference: 15 }),
  baseProfile({ goalType: '10k', experienceLevel: 'intermediate', preferredDays: [0, 2, 4, 6], weeklyMileagePreference: 30 }),
  baseProfile({ goalType: 'half-marathon', experienceLevel: 'advanced', preferredDays: [1, 2, 3, 5, 6], weeklyMileagePreference: 55 }),
  baseProfile({ goalType: 'marathon', experienceLevel: 'advanced', goalDate: toISODate(addDays(todayDate(), 120)), weeklyMileagePreference: 70 }),
  baseProfile({ goalType: 'fitness', preferredDays: [], weeklyMileagePreference: 0 }),
  baseProfile({ goalDate: toISODate(addDays(todayDate(), -7)), preferredDays: [1] }),
];

assert(FREE_TRIAL_DAYS === 3, 'Stripe trial should be configured for 3 days');
assert(FREE_TRIAL_LABEL === '3-Day Free Trial', 'trial label should match the configured 3-day trial');
assert(normalizeBillingPlanId('trial') === 'monthly', 'trial checkout should bill against the monthly Stripe price');
assert(normalizeBillingPlanId('monthly') === 'monthly', 'monthly checkout should use the monthly Stripe price');
assert(normalizeBillingPlanId('yearly') === 'yearly', 'yearly checkout should use the yearly Stripe price');
assert(isTrialCheckout('trial', false), 'trial plan id should force trial checkout');

const generatedPlans = scenarios.map((profile, index) => {
  const plan = generatePlan(profile);
  validatePlan(`scenario ${index + 1}`, plan, profile);
  return plan;
});

const completedPlan = generatedPlans[0].map((workout, index) => (
  index < 3
    ? {
        ...workout,
        status: 'completed' as const,
        result: {
          completedAt: new Date().toISOString(),
          actualDistance: workout.distanceTarget || 3,
          actualDuration: workout.durationMinutes,
          avgPace: workout.paceTarget || '6:00',
          perceivedEffort: workout.effortTarget,
          notes: 'Smoke test completion',
        },
      }
    : workout
));

const readiness = calculateReadiness(completedPlan);
assert(readiness.score >= 0 && readiness.score <= 100, 'readiness score should stay in range');
assert(readiness.consistency >= 0 && readiness.consistency <= 100, 'readiness consistency should stay in range');
assert(readiness.fatigue >= 0 && readiness.fatigue <= 100, 'readiness fatigue should stay in range');
assert(readiness.streak >= 0, 'readiness streak should be non-negative');

const gpsRun = buildLiveWorkoutData({
  distance: 99,
  seconds: 30 * 60,
  path: [
    { lat: 40.70000, lng: -74.00000, timestamp: 1_000, accuracy: 8 },
    { lat: 40.74500, lng: -74.00000, timestamp: 30 * 60 * 1000, accuracy: 9 },
  ],
});
assert(gpsRun.measurementSource === 'gps', 'tracked run should be marked as GPS measured');
assert(gpsRun.distance > 4.9 && gpsRun.distance < 5.1, 'GPS path distance should override stale state distance');
assert(formatPace(gpsRun.duration, gpsRun.distance).includes('min/km'), 'GPS metrics should format average pace');

const gpsFeedback = buildFeedbackReward(generatedPlans[0][0], {
  effort: 5,
  notes: '',
  actualDistance: gpsRun.distance,
  actualDuration: gpsRun.duration,
  measurementSource: gpsRun.measurementSource,
});
assert(gpsFeedback.feedbackSummary.includes('GPS measured'), 'feedback should identify GPS measured stats');
const coachPrompt = buildPostRunCoachPrompt(generatedPlans[0][0], gpsRun);
assert(coachPrompt.includes('Coach Mara'), 'post-run AI prompt should use a real trainer persona');
assert(coachPrompt.includes('Coach calculations'), 'post-run AI prompt should include training calculations');
const coachFallback = buildPostRunCoachFallback(generatedPlans[0][0], gpsRun);
assert(coachFallback.includes('GPS measured'), 'fallback coach insight should use measured run source');
assert(!coachFallback.toLowerCase().includes('great job'), 'fallback coach insight should avoid generic praise');
assert(getActualDistance({ ...generatedPlans[0][0], status: 'completed', result: {
  completedAt: new Date().toISOString(),
  actualDistance: gpsRun.distance,
  actualDuration: gpsRun.duration,
  avgPace: formatPace(gpsRun.duration, gpsRun.distance),
  perceivedEffort: 5,
  notes: '',
  measurementSource: gpsRun.measurementSource,
  gpsMetrics: gpsRun.gpsMetrics,
} }) === gpsRun.distance, 'completed workout actual distance should come from measured result');

const staleWorkout: Workout = {
  ...generatedPlans[0][0],
  id: 'stale-workout',
  date: toISODate(addDays(todayDate(), -14)),
  status: 'missed',
};
const recoveredPlan = generateRenderablePlan(scenarios[0], [staleWorkout]);
assert(recoveredPlan.length > 1, 'renderable plan should recover from a stale workout list');
assert(hasRenderableTrainingPlan(recoveredPlan), 'recovered plan should include current or future planned workouts');

const completedWorkout = { ...generatedPlans[0][0], status: 'completed' as const };
const mergedPlan = mergeWorkoutPlans([completedWorkout], generatedPlans[0]);
assert(
  mergedPlan.find(workout => workout.id === completedWorkout.id)?.status === 'completed',
  'merge should preserve completed workouts when regenerating'
);

const canceledSubscriber = baseProfile({
  stripeCustomerId: 'cus_smoke',
  stripeSubscriptionId: 'sub_smoke',
  subscriptionStatus: 'canceled',
  subscriptionVerifiedAt: new Date().toISOString(),
  isUnlocked: true,
});
assert(!hasActiveSubscription(canceledSubscriber), 'canceled subscription should not count as active premium');
assert(
  !canUseApp(canceledSubscriber, generatedPlans[0]),
  'canceled subscriber should be paywalled even if a saved plan is current'
);
assert(
  !canUseApp(canceledSubscriber, [staleWorkout]),
  'paywall should return for canceled subscriber with no current plan'
);
assert(
  !canUseApp({ ...canceledSubscriber, subscriptionStatus: 'canceling' }, generatedPlans[0]),
  'canceling subscription should be paywalled immediately'
);
assert(
  !canUseApp(baseProfile({}), generatedPlans[0]),
  'unpaid user should not bypass the paywall just because onboarding generated workouts'
);

const noop = () => {};
const dashboardMarkup = renderToStaticMarkup(React.createElement(Dashboard, {
  profile: scenarios[0],
  plan: generatedPlans[0],
  readiness,
  onSelectWorkout: noop,
  onViewPlan: noop,
  onViewProfile: noop,
  onViewAchievements: noop,
  onViewHealth: noop,
}));
assert(
  dashboardMarkup.includes("Today's Workout") ||
    dashboardMarkup.includes('Today&#x27;s Workout') ||
    dashboardMarkup.includes('Next Workout'),
  'dashboard should render the plan surface'
);
assert(dashboardMarkup.includes('Upcoming'), 'dashboard should render upcoming workouts');

const tomorrowOnlyProfile = baseProfile({
  preferredDays: [(todayDate().getDay() + 1) % 7],
});
const nextWorkoutMarkup = renderToStaticMarkup(React.createElement(Dashboard, {
  profile: tomorrowOnlyProfile,
  plan: generatePlan(tomorrowOnlyProfile),
  readiness,
  onSelectWorkout: noop,
  onViewPlan: noop,
  onViewProfile: noop,
  onViewAchievements: noop,
  onViewHealth: noop,
}));
assert(nextWorkoutMarkup.includes('Next Workout'), 'dashboard should feature the next workout when today is unscheduled');
assert(!nextWorkoutMarkup.includes('Enjoy your recovery'), 'dashboard should not render an empty rest day for a current plan');

const planMarkup = renderToStaticMarkup(React.createElement(PlanView, {
  workouts: generatedPlans[0],
  goalDate: scenarios[0].goalDate,
  onBack: noop,
  onSelectWorkout: noop,
  onSetNewGoal: noop,
}));
assert(planMarkup.includes('Training Plan'), 'plan view should render the plan header');
assert(planMarkup.includes('Week 1'), 'plan view should render generated workout weeks');

console.log(JSON.stringify({
  scenarios: generatedPlans.length,
  workouts: generatedPlans.map(plan => plan.length),
  recoveredWorkouts: recoveredPlan.length,
  rendered: {
    dashboard: dashboardMarkup.length,
    plan: planMarkup.length,
  },
  readiness,
}, null, 2));
