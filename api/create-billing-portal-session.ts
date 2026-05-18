import {
  enforceIpRateLimit,
  enforceSameOrigin,
  findUserSubscriptionForAccess,
  getRequestOrigin,
  getStripe,
  getStripeId,
  readJsonBody,
  sendError,
  sendJson,
  verifyFirebaseUserMatches,
} from "./_utils.js";

function isValidStripeId(value: unknown, prefix: string) {
  return typeof value === "string" && value.startsWith(prefix) && value.trim().length > prefix.length;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    enforceIpRateLimit(req, {
      feature: "billing-portal:create",
      maxRequests: 10,
      windowMs: 60 * 1000,
      message: "Too many billing portal attempts. Try again in a minute.",
    });
    enforceSameOrigin(req);

    const { customerId, subscriptionId, userId } = await readJsonBody(req, { maxBytes: 4096 });
    const user = await verifyFirebaseUserMatches(req, userId);

    if (!isValidStripeId(customerId, "cus_")) {
      return sendJson(res, 400, { error: "Valid Stripe customer ID is required" });
    }

    if (subscriptionId != null && subscriptionId !== "" && !isValidStripeId(subscriptionId, "sub_")) {
      return sendJson(res, 400, { error: "Invalid Stripe subscription ID" });
    }

    const stripe = getStripe();
    const accessLookup = await findUserSubscriptionForAccess(stripe, user);
    const matchedSubscription = accessLookup.subscription;
    let hasUserSubscriptionForCustomer = false;

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const subscriptionCustomerId = getStripeId(subscription.customer);

      if (subscriptionCustomerId !== customerId) {
        return sendJson(res, 403, { error: "Subscription does not belong to this customer" });
      }

      if (subscription.metadata?.userId !== user.uid && matchedSubscription?.id !== subscription.id) {
        return sendJson(res, 403, { error: "Subscription does not belong to this user" });
      }

      hasUserSubscriptionForCustomer = true;
    } else {
      hasUserSubscriptionForCustomer = getStripeId(matchedSubscription?.customer as any) === customerId;
    }

    if (!hasUserSubscriptionForCustomer) {
      return sendJson(res, 403, { error: "Customer does not belong to this user" });
    }

    const origin = getRequestOrigin(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: origin + "/dashboard?billing=updated",
    });

    return sendJson(res, 200, { url: session.url });
  } catch (error) {
    return sendError(res, error);
  }
}
