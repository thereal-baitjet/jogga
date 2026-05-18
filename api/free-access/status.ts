import {
  enforceIpRateLimit,
  enforceSameOrigin,
  getFreeAccessReason,
  isFreeAccessUser,
  sendError,
  sendJson,
  verifyFirebaseUser,
} from "../_utils.js";
import { getFirebaseAdminDb } from "../firebase-admin.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    enforceIpRateLimit(req, {
      feature: "free-access:status",
      maxRequests: 30,
      windowMs: 60 * 1000,
      message: "Too many access checks. Try again shortly.",
    });
    enforceSameOrigin(req);

    const user = await verifyFirebaseUser(req);
    if (!isFreeAccessUser(user)) {
      return sendJson(res, 200, {
        unlocked: false,
        accessSource: "none",
        subscriptionStatus: null,
        customerId: null,
        reason: "not_whitelisted",
      });
    }

    const now = new Date().toISOString();
    let persisted = false;

    try {
      await getFirebaseAdminDb().collection("users").doc(user.uid).set({
        isUnlocked: true,
        accessSource: "free_access",
        subscriptionStatus: "whitelisted",
        subscriptionPlan: "tester",
        subscriptionVerifiedAt: now,
        freeAccessReason: getFreeAccessReason(user),
        updatedAt: now,
      }, { merge: true });
      persisted = true;
    } catch (error) {
      console.error("Free access Firestore write failed:", {
        userId: user.uid,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return sendJson(res, 200, {
      unlocked: true,
      accessSource: "free_access",
      subscriptionStatus: "whitelisted",
      subscriptionPlan: "tester",
      subscriptionVerifiedAt: now,
      customerId: null,
      reason: getFreeAccessReason(user) || "free_access",
      persisted,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
