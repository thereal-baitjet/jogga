import {
  STRAVA_API_URL,
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  STRAVA_TOKEN_URL,
  axios,
  enforceIpRateLimit,
  enforceSameOrigin,
  sendError,
  sendJson,
  verifyFirebaseUser,
} from "../_utils.js";

interface StravaIntegrationRecord {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}

interface StravaActivity {
  id: number;
  name?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  type?: string;
  sport_type?: string;
  start_date?: string;
  start_date_local?: string;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
}

async function getAdminDb() {
  const { getFirebaseAdminDb } = await import("../firebase-admin.js");
  return getFirebaseAdminDb();
}

function isTokenExpired(expiresAt: unknown) {
  return typeof expiresAt !== "number" || expiresAt <= Math.floor(Date.now() / 1000) + 90;
}

function sanitizeActivity(activity: StravaActivity) {
  return {
    id: activity.id,
    name: typeof activity.name === "string" ? activity.name.slice(0, 160) : "Strava activity",
    sportType: activity.sport_type || activity.type || "Run",
    distanceMeters: Math.round(Number(activity.distance || 0)),
    movingTimeSeconds: Math.round(Number(activity.moving_time || 0)),
    elapsedTimeSeconds: Math.round(Number(activity.elapsed_time || 0)),
    elevationGainMeters: Math.round(Number(activity.total_elevation_gain || 0)),
    averageSpeedMetersPerSecond: typeof activity.average_speed === "number" ? activity.average_speed : null,
    maxSpeedMetersPerSecond: typeof activity.max_speed === "number" ? activity.max_speed : null,
    averageHeartrate: typeof activity.average_heartrate === "number" ? activity.average_heartrate : null,
    maxHeartrate: typeof activity.max_heartrate === "number" ? activity.max_heartrate : null,
    startDate: activity.start_date || null,
    startDateLocal: activity.start_date_local || null,
    source: "strava",
    updatedAt: new Date().toISOString(),
  };
}

function isRunActivity(activity: ReturnType<typeof sanitizeActivity>) {
  return /run|trailrun|virtualrun/i.test(activity.sportType);
}

function summarizeActivities(activities: Array<ReturnType<typeof sanitizeActivity>>) {
  const now = Date.now();
  const recentWindowMs = 28 * 24 * 60 * 60 * 1000;
  const recentRuns = activities.filter(activity => {
    if (!isRunActivity(activity)) return false;
    if (!activity.startDate) return true;

    const startedAt = Date.parse(activity.startDate);
    return Number.isFinite(startedAt) ? now - startedAt <= recentWindowMs : true;
  });

  const distanceKm = recentRuns.reduce((sum, activity) => sum + activity.distanceMeters / 1000, 0);
  const elevationMeters = recentRuns.reduce((sum, activity) => sum + activity.elevationGainMeters, 0);
  const durationHours = recentRuns.reduce((sum, activity) => (
    sum + Math.max(activity.movingTimeSeconds, activity.elapsedTimeSeconds) / 3600
  ), 0);

  return {
    recentRunCount: recentRuns.length,
    recentDistanceKm: Math.round(distanceKm * 10) / 10,
    recentElevationMeters: Math.round(elevationMeters),
    recentDurationHours: Math.round(durationHours * 10) / 10,
    recentLoad: Math.round((distanceKm + elevationMeters / 250 + durationHours * 3) * 10) / 10,
    windowDays: 28,
    syncedAt: new Date().toISOString(),
  };
}

async function refreshAccessToken(record: StravaIntegrationRecord) {
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    throw new Error("Strava OAuth is not configured");
  }

  if (!record.refreshToken) {
    throw new Error("Strava refresh token is missing. Reconnect Strava Free.");
  }

  const response = await axios.post(
    STRAVA_TOKEN_URL,
    new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: record.refreshToken,
    }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data;
}

export async function syncStravaActivitiesForUser(userId: string, accessToken?: string) {
  const db = await getAdminDb();
  const integrationRef = db.collection("users").doc(userId).collection("integrations").doc("strava");
  const integrationSnap = await integrationRef.get();
  const integration = (integrationSnap.exists ? integrationSnap.data() : {}) as StravaIntegrationRecord;

  let token = accessToken || integration.accessToken;
  let tokenUpdate: Record<string, unknown> = {};

  if (!token || (!accessToken && isTokenExpired(integration.expiresAt))) {
    const refreshed = await refreshAccessToken(integration);
    token = refreshed.access_token;
    tokenUpdate = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || integration.refreshToken,
      expiresAt: refreshed.expires_at,
      expiresIn: refreshed.expires_in,
      tokenType: refreshed.token_type,
      scopes: typeof refreshed.scope === "string" ? refreshed.scope.split(/[,\s]+/).filter(Boolean) : integration.scopes,
      updatedAt: new Date().toISOString(),
    };
    await integrationRef.set(tokenUpdate, { merge: true });
  }

  if (!token) {
    throw new Error("Strava access token is missing. Reconnect Strava Free.");
  }

  const response = await axios.get(`${STRAVA_API_URL}/athlete/activities`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { per_page: 30 },
  });

  const activities = Array.isArray(response.data)
    ? response.data.map((activity: StravaActivity) => sanitizeActivity(activity))
    : [];
  const summary = summarizeActivities(activities);
  const batch = db.batch();

  activities.forEach(activity => {
    if (!activity.id) return;
    const activityRef = db.collection("users").doc(userId).collection("stravaActivities").doc(String(activity.id));
    batch.set(activityRef, activity, { merge: true });
  });

  batch.set(db.collection("users").doc(userId), {
    isStravaConnected: true,
    stravaLastSyncAt: summary.syncedAt,
    stravaRecentRunCount: summary.recentRunCount,
    stravaRecentDistanceKm: summary.recentDistanceKm,
    stravaRecentElevationMeters: summary.recentElevationMeters,
    stravaRecentDurationHours: summary.recentDurationHours,
    stravaRecentLoad: summary.recentLoad,
    privacyDefault: "private",
    updatedAt: summary.syncedAt,
  }, { merge: true });

  await batch.commit();

  return {
    activitiesImported: activities.length,
    summary,
    refreshed: Object.keys(tokenUpdate).length > 0,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    enforceIpRateLimit(req, {
      feature: "strava:sync",
      maxRequests: 8,
      windowMs: 60 * 1000,
      message: "Too many Strava sync attempts. Try again shortly.",
    });
    enforceSameOrigin(req);

    const user = await verifyFirebaseUser(req);
    const result = await syncStravaActivitiesForUser(user.uid);

    return sendJson(res, 200, result);
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      if (status === 401) {
        return sendJson(res, 401, { error: "Strava authorization expired. Reconnect Strava Free." });
      }
      return sendJson(res, status, { error: error.response?.data?.message || error.message || "Strava sync failed" });
    }

    return sendError(res, error);
  }
}
