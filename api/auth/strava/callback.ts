import {
  APP_URL,
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  STRAVA_SCOPES,
  STRAVA_TOKEN_URL,
  axios,
  verifySignedStravaState,
} from "../../_utils.js";
import { syncStravaActivitiesForUser } from "../../strava/sync.js";

async function getAdminDb() {
  const { getFirebaseAdminDb } = await import("../../firebase-admin.js");
  return getFirebaseAdminDb();
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

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  const error = Array.isArray(req.query.error) ? req.query.error[0] : req.query.error;
  if (error) {
    return renderOAuthResult(
      res,
      { type: "OAUTH_AUTH_ERROR", provider: "strava", error },
      "Strava Not Connected",
      "Jogga did not receive permission to import your runs."
    );
  }

  const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
  const state = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state;
  const callbackScope = Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;

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
      },
      "Strava Connection Failed",
      "Close this window and try again from Jogga."
    );
  }
}
