import Stripe from "stripe";
import { checkoutSessionAllowsAccess, getStripe, getStripeId, getSubscriptionStatus, sendError, sendJson } from "./_utils.js";
import { fulfillCheckoutSession } from "./stripe/fulfillment.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const { sessionId, userId } = req.query;

  if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
    return sendJson(res, 400, { error: "Invalid Checkout Session ID" });
  }

  try {
    const stripe = getStripe();
    const [session, lineItems] = await Promise.all([
      stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] }),
      stripe.checkout.sessions.listLineItems(sessionId, { limit: 1, expand: ["data.price"] }),
    ]);

    const sessionUserId = session.client_reference_id || session.metadata?.userId;
    if (typeof userId === "string" && sessionUserId !== userId) {
      return sendJson(res, 403, { error: "Checkout Session does not belong to this user" });
    }

    const subscriptionStatus = getSubscriptionStatus(session.subscription as Stripe.Subscription | null);
    const unlocked = checkoutSessionAllowsAccess(session, subscriptionStatus);
    let serverFulfilled = false;

    if (unlocked) {
      try {
        const fulfillment = await fulfillCheckoutSession(stripe, session, "checkout.session.verified");
        serverFulfilled = fulfillment.handled;
      } catch (fulfillmentError) {
        console.error("Checkout session server fulfillment failed:", {
          sessionId,
          userId: sessionUserId,
          message: fulfillmentError instanceof Error ? fulfillmentError.message : String(fulfillmentError),
        });
      }
    }

    return sendJson(res, 200, {
      unlocked,
      serverFulfilled,
      status: session.status,
      paymentStatus: session.payment_status,
      customerId: getStripeId(session.customer),
      subscriptionId: getStripeId(session.subscription as Stripe.Subscription | string | null),
      subscriptionStatus,
      priceId: lineItems.data[0]?.price?.id || null,
      planId: session.metadata?.planId || null,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
