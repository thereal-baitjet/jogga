import { Workout, ReadinessScore } from '../types';
import { startOfDay, subDays, isAfter, isBefore } from 'date-fns';

/**
 * Calculates the readiness score based on workout history.
 * 
 * Logic:
 * 1. Consistency: % of planned workouts completed in the last 14 days.
 * 2. Fatigue: Calculated using an ATL/CTL model (Acute vs Chronic Training Load).
 *    - ATL: Avg effort in last 7 days.
 *    - CTL: Avg effort in last 28 days.
 *    - Fatigue = ATL / CTL (ideal is around 0.8 - 1.3).
 * 3. Streak: Number of consecutive days with a completed workout.
 */
export const calculateReadiness = (plan: Workout[]): ReadinessScore => {
  const now = new Date();
  const today = startOfDay(now);
  const completed = plan.filter(w => w.status === 'completed');

  // 1. Consistency (Last 14 days)
  const fourteenDaysAgo = subDays(today, 14);
  const plannedLast14 = plan.filter(w => {
    const d = new Date(w.date);
    return isAfter(d, fourteenDaysAgo) && isBefore(d, today);
  });
  const completedLast14 = plannedLast14.filter(w => w.status === 'completed');
  const consistency = plannedLast14.length > 0 
    ? Math.round((completedLast14.length / plannedLast14.length) * 100)
    : 91; // Default as requested

  // 2. Fatigue (ATL/CTL Model)
  const sevenDaysAgo = subDays(today, 7);
  const twentyEightDaysAgo = subDays(today, 28);

  const acuteWorkouts = completed.filter(w => isAfter(new Date(w.date), sevenDaysAgo));
  const chronicWorkouts = completed.filter(w => isAfter(new Date(w.date), twentyEightDaysAgo));

  const atl = acuteWorkouts.reduce((sum, w) => sum + (w.result?.perceivedEffort || w.effortTarget || 5), 0) / 7;
  const ctl = chronicWorkouts.reduce((sum, w) => sum + (w.result?.perceivedEffort || w.effortTarget || 5), 0) / 28;

  // Fatigue score (0-100)
  // If ATL is much higher than CTL, fatigue is high.
  // Ratio of 1.5+ is high fatigue.
  const ratio = ctl > 0 ? atl / ctl : 1;
  const fatigue = Math.min(100, Math.round((ratio / 1.5) * 100));

  // 3. Streak
  let streak = 0;
  const sortedCompleted = [...completed].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  let checkDate = today;
  // If no workout today, check if there was one yesterday to continue streak
  const hadWorkoutToday = completed.some(w => startOfDay(new Date(w.date)).getTime() === today.getTime());
  if (!hadWorkoutToday) {
    checkDate = subDays(today, 1);
  }

  for (let i = 0; i < 30; i++) {
    const dateStr = checkDate.toISOString().split('T')[0];
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
  const trend = 4; // Default as requested

  return {
    score: score || 84, // Default to 84 as requested
    consistency,
    fatigue: fatigue || 45, // Default to 45 as requested
    progress: Math.round(consistency * 0.7), // Mock progress for now
    streak,
    trend,
    updatedAt: now.toISOString()
  };
};
