export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type GoalType = '5k' | '10k' | 'half-marathon' | 'marathon' | 'fitness';
export type JoggaNiche = 'postpartum_return' | 'masters_50_plus' | 'ultra_100k' | 'injury_comeback' | 'anti_social_runner';
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
  displayName?: string | null;
  photoURL?: string | null;
  authProvider?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
  lastLoginAt?: string | null;
  profileCompleted?: boolean;
  niche?: JoggaNiche;
  privacyDefault?: 'private' | 'private_only' | string;
  socialFeaturesDisabled?: string[];
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
  isStravaConnected?: boolean;
  stravaAthleteId?: number | null;
  stravaAthleteName?: string | null;
  stravaConnectedAt?: string | null;
  stravaLastSyncAt?: string | null;
  stravaRecentRunCount?: number | null;
  stravaRecentDistanceKm?: number | null;
  stravaRecentElevationMeters?: number | null;
  stravaRecentDurationHours?: number | null;
  stravaRecentLoad?: number | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  subscriptionStatus?: string | null;
  subscriptionPlan?: 'monthly' | 'yearly' | string | null;
  subscriptionVerifiedAt?: string | null;
  accessSource?: 'stripe' | 'admin' | 'whitelist' | string | null;
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

export interface GpsPathPoint {
  lat: number;
  lng: number;
  timestamp: number;
  speed?: number;
  accuracy?: number;
}

export type RunMeasurementSource = 'gps' | 'timer' | 'manual';

export interface RunMeasurementMetadata {
  source: RunMeasurementSource;
  sampleCount: number;
  durationSeconds: number;
  measuredAt: string;
  averageAccuracyMeters?: number;
  bestAccuracyMeters?: number;
  worstAccuracyMeters?: number;
}

export interface LiveWorkoutData {
  distance: number;
  duration: number;
  durationSeconds: number;
  path: GpsPathPoint[];
  measurementSource: RunMeasurementSource;
  gpsMetrics: RunMeasurementMetadata;
}

export type FeedbackSignalStrength = 'weak' | 'useful' | 'strong';
export type FeedbackRewardLevel = 'small' | 'medium' | 'high';

export interface FeedbackReward {
  acknowledgedAt: string;
  feedbackSummary: string;
  rewardCue: string;
  signalStrength: FeedbackSignalStrength;
  rewardLevel: FeedbackRewardLevel;
  rewardPoints: number;
  nextAction: string;
}

export type MarathonReadyingEventTone = 'completion' | 'feedback' | 'achievement' | 'streak' | 'usage' | 'readiness';

export interface MarathonReadyingEvent {
  id: string;
  title: string;
  message: string;
  points: number;
  createdAt: string;
  tone: MarathonReadyingEventTone;
}

export interface MarathonReadyingProfile {
  totalPoints: number;
  level: number;
  currentLevelPoints: number;
  nextLevelPoints: number;
  progressPercent: number;
  currentStreak: number;
  completedWorkouts: number;
  usagePoints: number;
  readinessPoints: number;
  feedbackPoints: number;
  achievementPoints: number;
  todayPoints: number;
  lastEvent: MarathonReadyingEvent | null;
}

export interface WorkoutResult {
  completedAt: string;
  actualDistance: number;
  actualDuration: number;
  avgPace: string;
  perceivedEffort: number;
  notes: string;
  feedbackReward?: FeedbackReward;
  path?: GpsPathPoint[];
  measurementSource?: RunMeasurementSource;
  gpsMetrics?: RunMeasurementMetadata;
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

export type HealthMetricType =
  | 'steps'
  | 'distance'
  | 'run_count'
  | 'duration'
  | 'elevation_gain'
  | 'training_load'
  | 'last_sync'
  | 'data_source'
  | 'active_calories'
  | 'hr'
  | 'resting_hr'
  | 'sleep_duration'
  | 'sleep_score'
  | 'vo2max'
  | 'weight'
  | 'recovery_score';

export interface HealthMetric {
  id: string;
  type: HealthMetricType;
  label: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  updatedAt: string;
  history: { date: string; value: number }[];
  source?: 'strava' | 'google_fit' | 'manual' | 'computed';
}

export interface StravaHealthSummary {
  isConnected: boolean;
  athleteName: string | null;
  recentRunCount: number;
  recentDistanceKm: number;
  recentDurationHours: number;
  recentElevationMeters: number;
  recentLoad: number;
  lastSyncAt: string | null;
  lastSyncLabel: string;
  hasRecentRuns: boolean;
}

export interface StravaHealthMetricCard {
  id: string;
  title: string;
  value: string;
  unit?: string;
  detail: string;
  updatedAt: string;
  source: 'strava';
}
