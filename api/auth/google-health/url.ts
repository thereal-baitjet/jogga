import { APP_URL, enforceIpRateLimit, enforceSameOrigin, GOOGLE_AUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, sendError, sendJson } from "../../_utils.js";

export default function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    enforceIpRateLimit(req, {
      feature: "google-health-auth:url",
      maxRequests: 20,
      windowMs: 60 * 1000,
      message: "Too many health connection attempts. Try again shortly.",
    });
    enforceSameOrigin(req);
  } catch (error) {
    return sendError(res, error);
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return sendJson(res, 500, { error: "Google Health OAuth is not configured" });
  }

  const redirectUri = `${APP_URL}/auth/google-health/callback`;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/fitness.activity.read",
      "https://www.googleapis.com/auth/fitness.body.read",
      "https://www.googleapis.com/auth/fitness.heart_rate.read",
      "https://www.googleapis.com/auth/fitness.sleep.read",
      "openid",
      "email",
      "profile",
    ].join(" "),
    redirect_uri: redirectUri,
    access_type: "offline",
    prompt: "consent",
  });

  return sendJson(res, 200, { url: `${GOOGLE_AUTH_URL}?${params.toString()}` });
}
