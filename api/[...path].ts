import {
  handleCheckoutRedirect,
  handleCheckoutSession,
  handleCreateBillingPortalSession,
  handleCreateCheckoutSession,
  handleSubscriptionStatus,
} from "./_billing.js";
import {
  handleStravaAuthCallback,
  handleStravaAuthUrl,
  handleStravaSync,
} from "./_strava.js";
import { sendJson } from "./_utils.js";

function getRoutePath(req: any) {
  const path = req.query?.path;
  if (Array.isArray(path)) return path.join("/");
  if (typeof path === "string") return path;

  const rawUrl = typeof req.url === "string" ? req.url : "";
  return rawUrl
    .replace(/^\/api\/?/, "")
    .split("?")[0]
    .replace(/^\/+|\/+$/g, "");
}

export default async function handler(req: any, res: any) {
  const routePath = getRoutePath(req);

  // Strava/Runna competitive context May 2026: Vercel Hobby caps the app at
  // 12 functions, so Strava Free import and billing routes share this
  // dispatcher while staying private/read-only by default.
  switch (`${req.method} ${routePath}`) {
    case "GET auth/strava/url":
      return handleStravaAuthUrl(req, res);
    case "GET auth/strava/callback":
      return handleStravaAuthCallback(req, res);
    case "POST strava/sync":
      return handleStravaSync(req, res);
    case "POST create-checkout-session":
      return handleCreateCheckoutSession(req, res);
    case "POST create-billing-portal-session":
      return handleCreateBillingPortalSession(req, res);
    case "GET checkout-session":
      return handleCheckoutSession(req, res);
    case "GET subscription-status":
      return handleSubscriptionStatus(req, res);
    case "GET checkout-redirect":
      return handleCheckoutRedirect(req, res);
    default:
      return sendJson(res, 404, { error: "API route not found" });
  }
}
