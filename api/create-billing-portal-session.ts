import { getRequestOrigin, getStripe, getStripeId, readJsonBody, sendError, sendJson } from "./_utils.js";

function isValidStripeId(value: unknown, prefix: string) {
  return typeof value === "string" && value.startsWith(prefix) && value.trim().length > prefix.length;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const { customerId, subscriptionId, userId } = await readJsonBody(req);

    if (!isValidStripeId(customerId, "cus_")) {
      return sendJson(res, 400, { error: "Valid Stripe customer ID is required" });
    }

    if (subscriptionId != null && subscriptionId !== "" && !isValidStripeId(subscriptionId, "sub_")) {
      return sendJson(res, 400, { error: "Invalid Stripe subscription ID" });
    }

    if (typeof userId !== "string" || userId.trim().length === 0) {
      return sendJson(res, 400, { error: "User ID is required" });
    }

    const stripe = getStripe();

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const subscriptionCustomerId = getStripeId(subscription.customer);

      if (subscriptionCustomerId !== customerId) {
        return sendJson(res, 403, { error: "Subscription does not belong to this customer" });
      }

      if (subscription.metadata?.userId && subscription.metadata.userId !== userId) {
        return sendJson(res, 403, { error: "Subscription does not belong to this user" });
      }
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
