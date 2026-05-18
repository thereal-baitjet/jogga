import Stripe from "stripe";
import {
  enforceIpRateLimit,
  findUserSubscriptionForAccess,
  getAccessSourceForSubscriptionStatus,
  getStripe,
  getStripeId,
  isAccessSubscriptionStatus,
  sendError,
  sendJson,
  verifyFirebaseUserMatches,
} from "./_utils.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    enforceIpRateLimit(req, {
      feature: "subscription-status:read",
      maxRequests: 60,
      windowMs: 60 * 1000,
      message: "Too many subscription checks. Try again shortly.",
    });
  } catch (error) {
    return sendError(res, error);
  }

  const { userId } = req.query;

  if (typeof userId !== "string" || userId.trim().length === 0) {
    return sendJson(res, 400, { error: "User ID is required" });
  }

  try {
    const user = await verifyFirebaseUserMatches(req, userId);
    const stripe = getStripe();
    const { subscription } = await findUserSubscriptionForAccess(stripe, user);
    const subscriptionStatus = subscription?.cancel_at_period_end
      ? "canceling"
      : subscription?.status || null;
    const unlocked = isAccessSubscriptionStatus(subscriptionStatus);
    const accessSource = unlocked ? getAccessSourceForSubscriptionStatus(subscriptionStatus) : "none";
    let serverFulfilled = false;

    if (subscription) {
      try {
        const { fulfillSubscription } = await import("./stripe/fulfillment.js");
        const fulfillment = await fulfillSubscription(subscription, "subscription.status.verified", {
          statusOverride: subscriptionStatus,
          forceUnlocked: unlocked,
        });
        serverFulfilled = fulfillment.handled;
      } catch (fulfillmentError) {
        console.error("Subscription status server fulfillment failed:", {
          userId: user.uid,
          subscriptionId: subscription.id,
          message: fulfillmentError instanceof Error ? fulfillmentError.message : String(fulfillmentError),
        });
      }
    }

    return sendJson(res, 200, {
      unlocked,
      accessSource,
      serverFulfilled,
      customerId: getStripeId(subscription?.customer as Stripe.Customer | string | null | undefined),
      subscriptionId: subscription?.id || null,
      subscriptionStatus,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end || false,
      priceId: subscription?.items.data[0]?.price?.id || null,
      planId: subscription?.metadata?.planId || null,
      reason: unlocked ? accessSource : subscription ? `subscription_${subscriptionStatus || "inactive"}` : "no_active_subscription",
    });
  } catch (error) {
    return sendError(res, error);
  }
}
