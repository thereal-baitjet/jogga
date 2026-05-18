import {
  STRAVA_AUTH_URL,
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  STRAVA_SCOPES,
  APP_URL,
  createSignedStravaState,
  enforceIpRateLimit,
  enforceSameOrigin,
  sendError,
  sendJson,
  verifyFirebaseUser,
} from "../../_utils.js";

export default async function handler(req: any, res: any) {
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

    if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
      return sendJson(res, 500, { error: "Strava OAuth is not configured" });
    }

    const user = await verifyFirebaseUser(req);
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
