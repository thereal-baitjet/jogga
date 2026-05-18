import { addDays, isAfter } from 'date-fns';
import { ExperienceLevel, GoalType, UserProfile, Workout, WorkoutType } from './types';
import { daysBetweenDates, parseLocalDate, todayDate, toISODate } from './lib/date';
import { getNicheConfig } from './config/joggaStrategy';

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

const DEFAULT_TRAINING_DAYS = [1, 2, 3, 5, 6];
const GOAL_TYPES: GoalType[] = ['5k', '10k', 'half-marathon', 'marathon', 'fitness'];
const EXPERIENCE_LEVELS: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];

function normalizePreferredDays(days: unknown) {
  const normalized = Array.isArray(days)
    ? [...new Set(days.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))]
    : [];

  return normalized.length > 0 ? normalized.sort((a, b) => a - b) : DEFAULT_TRAINING_DAYS;
}

function normalizeWeeklyMileage(value: unknown) {
  const mileage = typeof value === 'number' && Number.isFinite(value) ? value : 15;
  return Math.min(160, Math.max(5, mileage));
}

function normalizeGoalType(value: unknown): GoalType {
  return GOAL_TYPES.includes(value as GoalType) ? value as GoalType : '5k';
}

function normalizeExperienceLevel(value: unknown): ExperienceLevel {
  return EXPERIENCE_LEVELS.includes(value as ExperienceLevel) ? value as ExperienceLevel : 'beginner';
}

function getPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function getStravaAdjustedMileage(profile: UserProfile) {
  const selectedMileage = normalizeWeeklyMileage(profile.weeklyMileagePreference);
  const recentDistanceKm = getPositiveNumber(profile.stravaRecentDistanceKm);
  if (!recentDistanceKm) return selectedMileage;

  // Strava/Runna competitive context May 2026: use Strava Free as private
  // context for Jogga planning, never as a social or premium dependency.
  const stravaWeeklyKm = recentDistanceKm / 4;
  return normalizeWeeklyMileage(Math.max(selectedMileage * 0.75, stravaWeeklyKm));
}

function getNicheVolumeMultiplier(profile: UserProfile) {
  switch (profile.niche) {
    case 'postpartum_return':
      return 0.65;
    case 'masters_50_plus':
      return 0.9;
    case 'ultra_100k':
      return 1.15;
    default:
      return 1;
  }
}

function getLoadDamping(profile: UserProfile) {
  const recentLoad = getPositiveNumber(profile.stravaRecentLoad);
  if (!recentLoad) return 1;
  if (recentLoad >= 90) return 0.82;
  if (recentLoad >= 65) return 0.9;
  return 1;
}

function getNicheInstruction(profile: UserProfile, type: WorkoutType) {
  switch (profile.niche) {
    case 'postpartum_return':
      return type === 'Strength session' || type === 'Mobility/recovery session'
        ? 'Prioritize pelvic floor, breathing, and core control; stop for heaviness, leaking, pain, or pressure.'
        : 'Keep this conversational and symptom-aware; no bounce-back pressure.';
    case 'masters_50_plus':
      return type === 'Strength session'
        ? 'Emphasize single-leg strength, calves, hips, and controlled tempo.'
        : 'Keep the effort repeatable and protect recovery before chasing pace.';
    case 'ultra_100k':
      return type === 'Long run' || type === 'Hill workout'
        ? 'Include vert, fueling practice, and terrain-specific pacing.'
        : 'Build durability without turning every run into a race.';
    case 'anti_social_runner':
      return 'Private by default: this workout is for your consistency, not a feed.';
    default:
      return '';
  }
}

export function generatePlan(profile: UserProfile): Workout[] {
  const workouts: Workout[] = [];
  const startDate = todayDate();
  const profileGoalDate = parseLocalDate(profile.goalDate);
  const goalDate = isAfter(profileGoalDate, startDate) ? profileGoalDate : addDays(startDate, 28);
  
  // Calculate number of weeks until goal
  const daysToGoal = daysBetweenDates(startDate, goalDate);
  const weeks = Math.max(4, Math.ceil((daysToGoal + 1) / 7));
  
  const preferredDays = normalizePreferredDays(profile.preferredDays);
  const baseMileage = getStravaAdjustedMileage(profile);
  const goalType = normalizeGoalType(profile.goalType);
  const experienceLevel = normalizeExperienceLevel(profile.experienceLevel);
  const nicheVolumeMult = getNicheVolumeMultiplier(profile);
  const loadDamping = getLoadDamping(profile);

  // Distance multipliers based on goal
  const goalMultipliers: Record<string, number> = {
    '5k': 0.8,
    '10k': 1.2,
    'half-marathon': 2.0,
    'marathon': 3.5,
    'fitness': 1.0
  };
  const goalMult = goalMultipliers[goalType] || 1.0;

  // Experience multiplier
  const expMult = experienceLevel === 'beginner' ? 0.8 : experienceLevel === 'advanced' ? 1.3 : 1.0;
  
  // Total volume multiplier
  const mult = (baseMileage / 20) * goalMult * expMult;

  // Base paces (min/km)
  const basePaces = {
    beginner: { easy: '6:30', tempo: '5:45', interval: '5:00', long: '6:45' },
    intermediate: { easy: '5:45', tempo: '5:00', interval: '4:15', long: '6:00' },
    advanced: { easy: '5:00', tempo: '4:15', interval: '3:30', long: '5:15' }
  };
  const paces = basePaces[experienceLevel] || basePaces.intermediate;

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
    const finalMult = volumeMult * taperMult * mult * nicheVolumeMult * loadDamping;

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

        if (profile.niche === 'postpartum_return') {
          if (type === 'Interval session' || type === 'Tempo run') {
            type = 'Easy run';
            pace = paces.easy;
            effort = 3;
          }
          if (workoutIndex === 0 && w % 2 === 0) {
            type = 'Mobility/recovery session';
            distance = 0;
            duration = 25;
            pace = '';
            effort = 2;
          }
          distance = distance > 0 ? Math.min(distance, getNicheConfig('postpartum_return').planRules.maxWeeklyMileageStartKm) : 0;
        }

        if (profile.niche === 'masters_50_plus' && workoutIndex === 1 && totalWorkouts >= 3 && w % 2 === 0) {
          type = 'Strength session';
          distance = 0;
          duration = 35;
          pace = '';
          effort = 5;
        }

        if (profile.niche === 'ultra_100k') {
          if (type === 'Interval session') {
            type = 'Hill workout';
            pace = paces.easy;
            effort = 7;
          }
          if (type === 'Long run') {
            duration = Math.min(duration * 1.25, 8 * 60);
          }
        }
      }

      if (type) {
        const dateStr = toISODate(date);
        const instructions = [
          WORKOUT_DESCRIPTIONS[type] || '',
          getNicheInstruction(profile, type),
        ].filter(Boolean).join(' ');

        workouts.push({
          id: `plan-${dateStr}`,
          date: dateStr,
          type,
          durationMinutes: Math.max(20, Math.round(duration)),
          distanceTarget: distance > 0 ? Number(distance.toFixed(1)) : undefined,
          paceTarget: pace || undefined,
          effortTarget: effort,
          instructions,
          status: 'planned'
        });
      }
    }
  }

  return workouts;
}
