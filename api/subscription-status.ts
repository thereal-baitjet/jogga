import Stripe from "stripe";
import {
  enforceIpRateLimit,
  getStripe,
  getStripeId,
  isAccessSubscriptionStatus,
  sendError,
  sendJson,
  verifyFirebaseUserMatches,
} from "./_utils.js";

function escapeStripeSearchValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findUserSubscription(stripe: Stripe, userId: string) {
  const escapedUserId = escapeStripeSearchValue(userId);

  for (const status of ["trialing", "active"]) {
    const subscriptions = await stripe.subscriptions.search({
      query: `metadata['userId']:'${escapedUserId}' AND status:'${status}'`,
      limit: 1,
    });

    if (subscriptions.data[0]) {
      return subscriptions.data[0];
    }
  }

  return null;
}

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
    const subscription = await findUserSubscription(stripe, user.uid);
    const subscriptionStatus = subscription?.cancel_at_period_end
      ? "canceling"
      : subscription?.status || null;
    const unlocked = isAccessSubscriptionStatus(subscriptionStatus);
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
      serverFulfilled,
      customerId: getStripeId(subscription?.customer as Stripe.Customer | string | null | undefined),
      subscriptionId: subscription?.id || null,
      subscriptionStatus,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end || false,
      priceId: subscription?.items.data[0]?.price?.id || null,
      planId: subscription?.metadata?.planId || null,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
