import { addDays, format, startOfWeek } from 'date-fns';
import { UserProfile, Workout, WorkoutType } from './types';

export const WORKOUT_DESCRIPTIONS: Record<WorkoutType, string> = {
  'Easy run': 'Build base aerobic fitness. You should be able to hold a conversation.',
  'Long run': 'Improve endurance and mental toughness for the distance.',
  'Tempo run': 'Sustained effort at a challenging but manageable pace.',
  'Interval session': 'Short bursts of speed followed by recovery to improve VO2 max.',
  'Recovery run': 'Very light effort to help blood flow and muscle recovery.',
  'Race-pace run': 'Practice running at your target race speed.',
  'Hill workout': 'Build leg strength and running economy by running uphill.',
  'Strength session': 'Focus on core, glutes, and single-leg stability.',
  'Mobility/recovery session': 'Stretching and foam rolling to prevent injury.'
};

export function generatePlan(profile: UserProfile): Workout[] {
  const workouts: Workout[] = [];
  const startDate = startOfWeek(new Date(), { weekStartsOn: 1 }); // Start on Monday
  const goalDate = new Date(profile.goalDate);
  
  // Calculate number of weeks until goal
  const diffTime = Math.abs(goalDate.getTime() - startDate.getTime());
  const weeks = Math.max(4, Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7)));
  
  const preferredDays = profile.preferredDays.length > 0 ? profile.preferredDays : [1, 2, 3, 5, 6]; // Default if none selected
  const baseMileage = profile.weeklyMileagePreference || 15;

  // Distance multipliers based on goal
  const goalMultipliers: Record<string, number> = {
    '5k': 0.8,
    '10k': 1.2,
    'half-marathon': 2.0,
    'marathon': 3.5,
    'fitness': 1.0
  };
  const goalMult = goalMultipliers[profile.goalType] || 1.0;

  // Experience multiplier
  const expMult = profile.experienceLevel === 'beginner' ? 0.8 : profile.experienceLevel === 'advanced' ? 1.3 : 1.0;
  
  // Total volume multiplier
  const mult = (baseMileage / 20) * goalMult * expMult;

  // Base paces (min/km)
  const basePaces = {
    beginner: { easy: '6:30', tempo: '5:45', interval: '5:00', long: '6:45' },
    intermediate: { easy: '5:45', tempo: '5:00', interval: '4:15', long: '6:00' },
    advanced: { easy: '5:00', tempo: '4:15', interval: '3:30', long: '5:15' }
  };
  const paces = basePaces[profile.experienceLevel] || basePaces.intermediate;

  for (let w = 0; w < weeks; w++) {
    // Determine intensity for this week
    // 4-week cycle: Build, Build, Peak, Recovery
    const cycleWeek = w % 4;
    let volumeMult = 1.0;
    if (cycleWeek === 0) volumeMult = 0.8;
    if (cycleWeek === 1) volumeMult = 0.9;
    if (cycleWeek === 2) volumeMult = 1.1;
    if (cycleWeek === 3) volumeMult = 0.7; // Recovery week

    // Taper logic: reduce volume in the last 2 weeks before goal
    const taperMult = w >= weeks - 2 ? 0.6 : 1.0;
    const finalMult = volumeMult * taperMult * mult;

    for (let d = 0; d < 7; d++) {
      const date = addDays(startDate, w * 7 + d);
      const dayOfWeek = date.getDay(); // 0-6 (Sun-Sat)
      
      // Skip if date is after goal date
      if (date > goalDate) continue;

      let type: WorkoutType | null = null;
      let duration = 0;
      let distance = 0;
      let pace = '';
      let effort = 0;

      // Assign workout types to preferred days
      if (preferredDays.includes(dayOfWeek)) {
        // Simple logic to distribute workout types
        const workoutIndex = preferredDays.indexOf(dayOfWeek);
        const totalWorkouts = preferredDays.length;

        if (workoutIndex === totalWorkouts - 1) {
          // Last workout of the week is the Long Run
          type = 'Long run';
          distance = (10 + (w * 1.5)) * finalMult;
          duration = distance * 6.5; // Approx 6:30 pace
          pace = paces.long;
          effort = 5;
        } else if (workoutIndex === 0) {
          // First workout is Easy Run
          type = 'Easy run';
          distance = (5 + (w * 0.5)) * finalMult;
          duration = distance * 6;
          pace = paces.easy;
          effort = 4;
        } else if (workoutIndex === 1 && totalWorkouts >= 3) {
          // Second workout is Speed/Tempo
          type = w % 2 === 0 ? 'Interval session' : 'Tempo run';
          distance = (6 + (w * 0.8)) * finalMult;
          duration = distance * 5.5;
          pace = type === 'Interval session' ? paces.interval : paces.tempo;
          effort = 8;
        } else {
          // Others are Easy or Recovery
          type = 'Easy run';
          distance = (4 + (w * 0.3)) * finalMult;
          duration = distance * 6;
          pace = paces.easy;
          effort = 3;
        }
      }

      if (type) {
        const dateStr = format(date, 'yyyy-MM-dd');
        workouts.push({
          id: `plan-${dateStr}`,
          date: dateStr,
          type,
          durationMinutes: Math.max(20, Math.round(duration)),
          distanceTarget: distance > 0 ? Number(distance.toFixed(1)) : undefined,
          paceTarget: pace || undefined,
          effortTarget: effort,
          instructions: WORKOUT_DESCRIPTIONS[type] || '',
          status: 'planned'
        });
      }
    }
  }

  return workouts;
}
