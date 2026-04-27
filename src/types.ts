export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type GoalType = '5k' | '10k' | 'half-marathon' | 'marathon' | 'fitness';
export type WorkoutType = 
  | 'Easy run' 
  | 'Long run' 
  | 'Tempo run' 
  | 'Interval session' 
  | 'Recovery run' 
  | 'Race-pace run' 
  | 'Hill workout' 
  | 'Strength session' 
  | 'Mobility/recovery session';

export interface UserProfile {
  id: string;
  uid?: string;
  email?: string;
  name: string;
  experienceLevel: ExperienceLevel;
  goalType: GoalType;
  goalDate: string;
  preferredDays: number[]; // 0-6 (Sun-Sat)
  weeklyMileagePreference: number;
  isUnlocked?: boolean;
  readinessScore?: ReadinessScore;
  isHealthConnected?: boolean;
  healthProvider?: 'fitbit' | 'apple' | 'google';
}

export interface Workout {
  id: string;
  date: string;
  type: WorkoutType;
  durationMinutes: number;
  distanceTarget?: number; // in km
  paceTarget?: string; // e.g., "5:30 min/km"
  effortTarget: number; // 1-10
  instructions: string;
  status: 'planned' | 'completed' | 'missed';
  result?: WorkoutResult;
}

export interface WorkoutResult {
  completedAt: string;
  actualDistance: number;
  actualDuration: number;
  avgPace: string;
  perceivedEffort: number;
  notes: string;
  path?: { lat: number; lng: number; timestamp: number }[];
}

export interface ReadinessScore {
  score: number;
  consistency: number;
  fatigue: number;
  progress: number;
  streak: number;
  trend: number;
  updatedAt: string;
}

export interface TrainingPlan {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  workouts: Workout[];
  currentPhase: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  iconName: string;
  unlockedAt?: string;
  progress?: number; // 0-100
  category: 'milestone' | 'distance' | 'consistency' | 'speed';
}

export interface HealthMetric {
  id: string;
  type: 'hr' | 'sleep' | 'vo2max' | 'weight';
  label: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  updatedAt: string;
  history: { date: string; value: number }[];
}
