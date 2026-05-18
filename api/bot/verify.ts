import { enforceIpRateLimit, enforceSameOrigin, getClientIp, readJsonBody, sendError, sendJson } from "../_utils.js";

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || process.env.CF_TURNSTILE_SECRET_KEY;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const ACTION_PATTERN = /^[a-z0-9_-]{1,32}$/i;

function getBodyString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    enforceIpRateLimit(req, {
      feature: "bot:turnstile",
      maxRequests: 20,
      windowMs: 60 * 1000,
      message: "Too many verification attempts. Try again shortly.",
    });
    enforceSameOrigin(req);

    if (!TURNSTILE_SECRET_KEY) {
      return sendJson(res, 503, {
        error: "Bot verification is not configured. Set TURNSTILE_SECRET_KEY in production.",
        code: "BOT_PROTECTION_NOT_CONFIGURED",
      });
    }

    const body = await readJsonBody(req, { maxBytes: 4096 });
    const token = getBodyString(body?.token);
    const action = getBodyString(body?.action);

    if (!token || token.length > 2048 || !ACTION_PATTERN.test(action)) {
      return sendJson(res, 400, {
        error: "Bot verification token is required.",
        code: "BOT_TOKEN_REQUIRED",
      });
    }

    const params = new URLSearchParams({
      secret: TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: getClientIp(req),
    });

    const verificationResponse = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const verification = await verificationResponse.json();
    const verified = verification?.success === true;
    const returnedAction = getBodyString(verification?.action);
    const actionMatches = !returnedAction || returnedAction === action;

    if (!verificationResponse.ok || !verified || !actionMatches) {
      console.warn("Bot verification failed", {
        action,
        actionMatches,
        errorCodes: Array.isArray(verification?.["error-codes"]) ? verification["error-codes"] : [],
      });

      return sendJson(res, 403, {
        error: "Bot verification failed. Refresh and try again.",
        code: "BOT_VERIFICATION_FAILED",
      });
    }

    return sendJson(res, 200, {
      ok: true,
      configured: true,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
