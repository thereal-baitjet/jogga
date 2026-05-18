import { ReadinessScore, StravaHealthMetricCard, StravaHealthSummary, UserProfile } from '../types';

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeNumber(value: unknown, fallback = 0) {
  return finiteNumber(value) ? value : fallback;
}

function roundMetric(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatMetric(value: number, decimals = 1) {
  return roundMetric(value, decimals).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals === 0 ? 0 : 1,
  });
}

export function formatStravaLastSync(value: string | null | undefined) {
  if (!value) return 'Never';

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Unknown';

  const now = Date.now();
  const elapsedMs = Math.max(0, now - timestamp);
  const elapsedMinutes = Math.round(elapsedMs / 60000);

  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function getStravaHealthSummary(profile: UserProfile): StravaHealthSummary {
  const recentRunCount = Math.max(0, Math.round(safeNumber(profile.stravaRecentRunCount)));
  const recentDistanceKm = Math.max(0, roundMetric(safeNumber(profile.stravaRecentDistanceKm), 1));
  const recentDurationHours = Math.max(0, roundMetric(safeNumber(profile.stravaRecentDurationHours), 1));
  const recentElevationMeters = Math.max(0, Math.round(safeNumber(profile.stravaRecentElevationMeters)));
  const recentLoad = Math.max(0, roundMetric(safeNumber(profile.stravaRecentLoad), 1));
  const lastSyncAt = typeof profile.stravaLastSyncAt === 'string' ? profile.stravaLastSyncAt : null;

  return {
    isConnected: Boolean(profile.isStravaConnected),
    athleteName: profile.stravaAthleteName || null,
    recentRunCount,
    recentDistanceKm,
    recentDurationHours,
    recentElevationMeters,
    recentLoad,
    lastSyncAt,
    lastSyncLabel: formatStravaLastSync(lastSyncAt),
    hasRecentRuns: recentRunCount > 0,
  };
}

export function buildStravaHealthMetricCards(profile: UserProfile): StravaHealthMetricCard[] {
  const summary = getStravaHealthSummary(profile);
  const updatedAt = summary.lastSyncAt || new Date().toISOString();

  // Strava/Runna competitive context May 2026: Jogga treats Strava as the
  // read-only running dashboard and turns imported private runs into coaching
  // signals instead of competing with Strava's GPS tracker or social feed.
  return [
    {
      id: 'data_source',
      title: 'Data Source: Strava',
      value: summary.isConnected ? 'Strava' : 'Not connected',
      detail: summary.athleteName ? `Connected as ${summary.athleteName}` : 'Read-only Strava Free import',
      updatedAt,
      source: 'strava',
    },
    {
      id: 'runs_28_days',
      title: 'Runs Last 28 Days',
      value: summary.recentRunCount.toLocaleString(),
      unit: summary.recentRunCount === 1 ? 'run' : 'runs',
      detail: 'Imported from Strava activities',
      updatedAt,
      source: 'strava',
    },
    {
      id: 'distance_28_days',
      title: 'Distance Last 28 Days',
      value: formatMetric(summary.recentDistanceKm, 1),
      unit: 'km',
      detail: 'Readiness volume input',
      updatedAt,
      source: 'strava',
    },
    {
      id: 'time_running',
      title: 'Time Running',
      value: formatMetric(summary.recentDurationHours, 1),
      unit: 'hr',
      detail: 'Moving or elapsed time from Strava',
      updatedAt,
      source: 'strava',
    },
    {
      id: 'elevation_gain',
      title: 'Elevation Gain',
      value: summary.recentElevationMeters.toLocaleString(),
      unit: 'm',
      detail: 'Hill and vert load signal',
      updatedAt,
      source: 'strava',
    },
    {
      id: 'training_load',
      title: 'Training Load',
      value: formatMetric(summary.recentLoad, 1),
      detail: 'Composite load from distance, time, and elevation',
      updatedAt,
      source: 'strava',
    },
    {
      id: 'last_sync',
      title: 'Last Sync',
      value: summary.lastSyncLabel,
      detail: summary.lastSyncAt
        ? new Date(summary.lastSyncAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
        : 'Sync Strava after your next run',
      updatedAt,
      source: 'strava',
    },
  ];
}

export function buildStravaProfileUpdateFromSync(data: any): Partial<UserProfile> {
  const summary = data?.summary || {};
  const syncedAt = typeof summary.syncedAt === 'string' ? summary.syncedAt : new Date().toISOString();

  return {
    isStravaConnected: true,
    stravaLastSyncAt: syncedAt,
    stravaRecentRunCount: Math.max(0, Math.round(safeNumber(summary.recentRunCount))),
    stravaRecentDistanceKm: Math.max(0, roundMetric(safeNumber(summary.recentDistanceKm), 1)),
    stravaRecentElevationMeters: Math.max(0, Math.round(safeNumber(summary.recentElevationMeters))),
    stravaRecentDurationHours: Math.max(0, roundMetric(safeNumber(summary.recentDurationHours), 1)),
    stravaRecentLoad: Math.max(0, roundMetric(safeNumber(summary.recentLoad), 1)),
    privacyDefault: 'private',
    updatedAt: syncedAt,
  };
}

export function calculateReadinessFromStravaProfile(
  profile: UserProfile,
  fallback: ReadinessScore
): ReadinessScore {
  const summary = getStravaHealthSummary(profile);
  if (!summary.isConnected) return fallback;

  const consistency = Math.min(100, Math.round(summary.recentRunCount * 10));
  const volume = Math.min(100, Math.round(summary.recentDistanceKm * 2.5));
  const fatigue = Math.min(100, Math.round(summary.recentLoad * 1.6));
  const fatigueBalance = 100 - Math.abs(55 - fatigue);
  const score = Math.max(0, Math.min(100, Math.round(
    consistency * 0.45 +
    Math.max(0, fatigueBalance) * 0.35 +
    volume * 0.2
  )));

  return {
    ...fallback,
    score,
    consistency,
    fatigue,
    progress: volume,
    trend: Math.max(-20, Math.min(20, score - (fallback.score || 0))),
    updatedAt: summary.lastSyncAt || new Date().toISOString(),
  };
}
