import { Workout, ReadinessScore } from '../types';
import { subDays, isAfter, isBefore } from 'date-fns';
import { parseLocalDate, todayDate, toISODate } from '../lib/date';

function getMeasuredTrainingLoad(workout: Workout) {
  const effort = workout.result?.perceivedEffort || workout.effortTarget || 5;
  const duration = workout.result?.actualDuration || 0;
  const distance = workout.result?.actualDistance || 0;
  const durationLoad = duration > 0 ? duration / 30 : 1;
  const distanceLoad = distance > 0 ? Math.max(0.5, distance / 5) : 1;

  return effort * durationLoad * distanceLoad;
}

/**
 * Calculates the readiness score based on workout history.
 * 
 * Logic:
 * 1. Consistency: % of planned workouts completed in the last 14 days.
 * 2. Fatigue: Calculated using an ATL/CTL model (Acute vs Chronic Training Load).
 *    - ATL: Avg measured effort/load in last 7 days.
 *    - CTL: Avg measured effort/load in last 28 days.
 *    - Fatigue = ATL / CTL (ideal is around 0.8 - 1.3).
 * 3. Streak: Number of consecutive days with a completed workout.
 */
export const calculateReadiness = (plan: Workout[]): ReadinessScore => {
  const now = new Date();
  const today = todayDate(now);
  const completed = plan.filter(w => w.status === 'completed');

  if (completed.length === 0) {
    return {
      score: 0,
      consistency: 0,
      fatigue: 0,
      progress: 0,
      streak: 0,
      trend: 0,
      updatedAt: now.toISOString()
    };
  }

  // 1. Consistency (Last 14 days)
  const fourteenDaysAgo = subDays(today, 14);
  const plannedLast14 = plan.filter(w => {
    const d = parseLocalDate(w.date);
    return isAfter(d, fourteenDaysAgo) && isBefore(d, today);
  });
  const completedLast14 = plannedLast14.filter(w => w.status === 'completed');
  const recentCompletions = completed.filter(w => {
    const d = parseLocalDate(w.date);
    return isAfter(d, fourteenDaysAgo) && !isAfter(d, today);
  });
  const consistency = plannedLast14.length > 0 
    ? Math.round((completedLast14.length / plannedLast14.length) * 100)
    : recentCompletions.length > 0
      ? Math.min(100, 60 + (recentCompletions.length * 10))
      : 0;

  // 2. Fatigue (ATL/CTL Model)
  const sevenDaysAgo = subDays(today, 7);
  const twentyEightDaysAgo = subDays(today, 28);

  const acuteWorkouts = completed.filter(w => isAfter(parseLocalDate(w.date), sevenDaysAgo));
  const chronicWorkouts = completed.filter(w => isAfter(parseLocalDate(w.date), twentyEightDaysAgo));

  const atl = acuteWorkouts.reduce((sum, w) => sum + getMeasuredTrainingLoad(w), 0) / 7;
  const ctl = chronicWorkouts.reduce((sum, w) => sum + getMeasuredTrainingLoad(w), 0) / 28;

  // Fatigue score (0-100)
  // If ATL is much higher than CTL, fatigue is high.
  // Ratio of 1.5+ is high fatigue.
  const ratio = ctl > 0 ? atl / ctl : 0;
  const fatigue = chronicWorkouts.length >= 3
    ? Math.min(100, Math.round((ratio / 1.5) * 100))
    : acuteWorkouts.length > 0
      ? 45
      : 0;

  // 3. Streak
  let streak = 0;
  
  let checkDate = today;
  // If no workout today, check if there was one yesterday to continue streak
  const hadWorkoutToday = completed.some(w => parseLocalDate(w.date).getTime() === today.getTime());
  if (!hadWorkoutToday) {
    checkDate = subDays(today, 1);
  }

  for (let i = 0; i < 30; i++) {
    const dateStr = toISODate(checkDate);
    const hasWorkout = completed.some(w => w.date === dateStr);
    if (hasWorkout) {
      streak++;
      checkDate = subDays(checkDate, 1);
    } else {
      break;
    }
  }

  // 4. Overall Readiness Score
  // Combine consistency (positive) and fatigue (negative impact if too high or too low)
  // Ideal fatigue is around 40-60.
  const fatigueImpact = Math.abs(50 - fatigue); // Deviation from ideal
  const score = Math.min(100, Math.max(0, Math.round(consistency * 0.8 + (50 - fatigueImpact) * 0.4)));

  // 5. Trend
  const previousSevenDaysAgo = subDays(sevenDaysAgo, 7);
  const previousWeekCompleted = completed.filter(w => {
    const date = parseLocalDate(w.date);
    return isAfter(date, previousSevenDaysAgo) && isBefore(date, sevenDaysAgo);
  });
  const trend = completed.length > 1
    ? Math.max(-20, Math.min(20, (acuteWorkouts.length - previousWeekCompleted.length) * 4))
    : 0;

  return {
    score: Number.isFinite(score) ? score : 0,
    consistency,
    fatigue: Number.isFinite(fatigue) ? fatigue : 0,
    progress: Math.round(consistency * 0.7),
    streak,
    trend,
    updatedAt: now.toISOString()
  };
};
