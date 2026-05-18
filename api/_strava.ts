import {
  APP_URL,
  STRAVA_API_URL,
  STRAVA_AUTH_URL,
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  STRAVA_SCOPES,
  STRAVA_TOKEN_URL,
  axios,
  createSignedStravaState,
  enforceIpRateLimit,
  enforceSameOrigin,
  sendError,
  sendJson,
  verifyFirebaseUser,
  verifySignedStravaState,
} from "./_utils.js";

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
  const { getFirebaseAdminDb } = await import("./firebase-admin.js");
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
    params: {
      after: Math.floor((Date.now() - 28 * 24 * 60 * 60 * 1000) / 1000),
      per_page: 100,
    },
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
    runsImported: summary.recentRunCount,
    noRecentRuns: summary.recentRunCount === 0,
    summary,
    refreshed: Object.keys(tokenUpdate).length > 0,
  };
}

function safeJsonForInlineScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function renderOAuthResult(res: any, payload: Record<string, unknown>, title: string, message: string) {
  const targetOrigin = new URL(APP_URL).origin;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.end(`
    <html>
      <body style="background: #09090b; color: #fafafa; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
        <div style="text-align: center; max-width: 360px; padding: 24px;">
          <h1 style="font-weight: 300;">${title}</h1>
          <p style="color: #a1a1aa;">${message}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage(${safeJsonForInlineScript(payload)}, ${JSON.stringify(targetOrigin)});
              setTimeout(() => window.close(), 1000);
            } else {
              window.location.href = '/';
            }
          </script>
        </div>
      </body>
    </html>
  `);
}

function normalizeScopes(rawScope: unknown) {
  if (typeof rawScope !== "string") return [];
  return rawScope.split(/[,\s]+/).map(scope => scope.trim()).filter(Boolean);
}

function hasRequiredScopes(scopes: string[]) {
  const granted = new Set(scopes);
  return STRAVA_SCOPES.every(scope => granted.has(scope));
}

export async function handleStravaAuthUrl(req: any, res: any) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    enforceIpRateLimit(req, {
      feature: "strava-auth:url",
      maxRequests: 20,
      windowMs: 60 * 1000,
      message: "Too many Strava connection attempts. Try again shortly.",
    });
    enforceSameOrigin(req);

    const user = await verifyFirebaseUser(req);

    if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
      return sendJson(res, 503, {
        error: "Strava connection unavailable",
        code: "STRAVA_OAUTH_NOT_CONFIGURED",
      });
    }

    const redirectUri = `${APP_URL}/auth/strava/callback`;
    const params = new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      approval_prompt: "auto",
      scope: STRAVA_SCOPES.join(","),
      state: createSignedStravaState(user.uid),
    });

    // Strava/Runna competitive context May 2026: Jogga requests read-only
    // Strava Free scopes to import runs privately, never to post or compete.
    return sendJson(res, 200, {
      url: `${STRAVA_AUTH_URL}?${params.toString()}`,
      scopes: [...STRAVA_SCOPES],
      requiresPremium: false,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function handleStravaAuthCallback(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
  const state = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state;
  const callbackScope = Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;
  const error = Array.isArray(req.query.error) ? req.query.error[0] : req.query.error;
  let stateUid: string | null = null;

  if (error) {
    try {
      stateUid = verifySignedStravaState(state).uid;
    } catch {
      stateUid = null;
    }

    return renderOAuthResult(
      res,
      {
        type: "OAUTH_AUTH_ERROR",
        provider: "strava",
        error,
        ...(stateUid ? { uid: stateUid } : {}),
      },
      "Strava Not Connected",
      "Jogga did not receive permission to import your runs."
    );
  }

  if (!code) {
    res.statusCode = 400;
    return res.end("No code provided");
  }

  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    res.statusCode = 500;
    return res.end("Strava OAuth is not configured");
  }

  try {
    const statePayload = verifySignedStravaState(state);
    stateUid = statePayload.uid;
    const response = await axios.post(
      STRAVA_TOKEN_URL,
      new URLSearchParams({
        code,
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        grant_type: "authorization_code",
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const tokenPayload = response.data || {};
    const scopes = normalizeScopes(tokenPayload.scope || callbackScope);
    const athlete = tokenPayload.athlete || {};
    const athleteId = typeof athlete.id === "number" ? athlete.id : Number(athlete.id);
    const connectedAt = new Date().toISOString();

    if (!Number.isFinite(athleteId)) {
      throw new Error("Strava athlete id missing");
    }

    if (!hasRequiredScopes(scopes)) {
      return renderOAuthResult(
        res,
        {
          type: "OAUTH_AUTH_ERROR",
          provider: "strava",
          error: "missing_scope",
          uid: statePayload.uid,
          scopes,
          requiredScopes: [...STRAVA_SCOPES],
        },
        "Strava Needs Run Access",
        "Reconnect and allow read + activity read permissions so Jogga can import private runs."
      );
    }

    const db = await getAdminDb();
    const userRef = db.collection("users").doc(statePayload.uid);
    await userRef.collection("integrations").doc("strava").set({
      provider: "strava",
      athleteId,
      athleteName: [athlete.firstname, athlete.lastname].filter(Boolean).join(" ") || athlete.username || null,
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token,
      expiresAt: tokenPayload.expires_at,
      expiresIn: tokenPayload.expires_in,
      tokenType: tokenPayload.token_type,
      scopes,
      requiresPremium: false,
      connectedAt,
      updatedAt: connectedAt,
    }, { merge: true });

    const syncResult = await syncStravaActivitiesForUser(statePayload.uid, tokenPayload.access_token);
    const connection = {
      isStravaConnected: true,
      stravaAthleteId: athleteId,
      stravaAthleteName: [athlete.firstname, athlete.lastname].filter(Boolean).join(" ") || athlete.username || null,
      stravaConnectedAt: connectedAt,
      stravaLastSyncAt: syncResult.summary.syncedAt,
      stravaRecentRunCount: syncResult.summary.recentRunCount,
      stravaRecentDistanceKm: syncResult.summary.recentDistanceKm,
      stravaRecentElevationMeters: syncResult.summary.recentElevationMeters,
      stravaRecentDurationHours: syncResult.summary.recentDurationHours,
      stravaRecentLoad: syncResult.summary.recentLoad,
      privacyDefault: "private",
    };

    await userRef.set({
      ...connection,
      updatedAt: connectedAt,
    }, { merge: true });

    // Strava/Runna competitive context May 2026: this completes read-only
    // Strava Free import and keeps all planning/insights inside private Jogga.
    return renderOAuthResult(
      res,
      {
        type: "OAUTH_AUTH_SUCCESS",
        provider: "strava",
        uid: statePayload.uid,
        connection,
        sync: syncResult,
      },
      "Strava Free Connected",
      "Your runs were imported privately. Jogga will not post to your feed."
    );
  } catch (error: any) {
    console.error("Strava OAuth Error:", error.response?.data || error.message);
    return renderOAuthResult(
      res,
      {
        type: "OAUTH_AUTH_ERROR",
        provider: "strava",
        error: error.message || "Strava authentication failed",
        ...(stateUid ? { uid: stateUid } : {}),
      },
      "Strava Connection Failed",
      "Close this window and try again from Jogga."
    );
  }
}

export async function handleStravaSync(req: any, res: any) {
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
        return sendJson(res, 401, {
          error: "Reconnect Strava",
          code: "STRAVA_RECONNECT_REQUIRED",
          detail: "Strava authorization expired. Reconnect Strava Free.",
        });
      }
      return sendJson(res, status, { error: error.response?.data?.message || error.message || "Strava sync failed" });
    }

    return sendError(res, error);
  }
}
