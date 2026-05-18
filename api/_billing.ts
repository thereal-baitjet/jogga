import Stripe from "stripe";
import {
  checkoutSessionAllowsAccess,
  enforceIpRateLimit,
  enforceSameOrigin,
  getPriceId,
  getRequestOrigin,
  getStripe,
  getStripeId,
  getSubscriptionStatus,
  isAccessSubscriptionStatus,
  normalizeEmail,
  readJsonBody,
  sendError,
  sendJson,
  verifyFirebaseUserMatches,
} from "./_utils.js";
import { FREE_TRIAL_DAYS, isTrialCheckout, normalizeBillingPlanId } from "../src/config/billing.js";

function isValidStripeId(value: unknown, prefix: string) {
  return typeof value === "string" && value.startsWith(prefix) && value.trim().length > prefix.length;
}

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

function redirect(res: any, statusCode: number, location: string) {
  res.statusCode = statusCode;
  res.setHeader("Location", location);
  res.end();
}

function sendHtmlError(res: any, message: string, statusCode = 400) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const safeMessage = message.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] || character));
  res.end(`<!doctype html><html><head><title>Jogga Checkout Error</title></head><body style="font-family: system-ui; background: #09090b; color: #fafafa; padding: 32px;"><h1>Checkout could not start</h1><p>${safeMessage}</p><p><a style="color:#fafafa" href="/subscription">Return to Jogga</a></p></body></html>`);
}

export async function handleCreateCheckoutSession(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    enforceIpRateLimit(req, {
      feature: "checkout-session:create",
      maxRequests: 12,
      windowMs: 60 * 1000,
      message: "Too many checkout attempts. Try again in a minute.",
    });
    enforceSameOrigin(req);

    const { planId, userId, email, trial } = await readJsonBody(req, { maxBytes: 4096 });
    const user = await verifyFirebaseUserMatches(req, userId);
    const billingPlanId = normalizeBillingPlanId(planId);
    const useTrial = isTrialCheckout(planId, trial);
    const priceId = getPriceId(planId);

    if (!billingPlanId || !priceId) {
      return sendJson(res, 400, { error: "Unknown or unconfigured plan" });
    }

    const stripe = getStripe();
    const origin = getRequestOrigin(req);
    const customerEmail = user.email || normalizeEmail(email) || undefined;
    const subscriptionData: Record<string, any> = {
      metadata: {
        userId: user.uid,
        planId: billingPlanId,
        checkoutPlanId: useTrial ? "trial" : billingPlanId,
      },
    };

    if (useTrial) {
      subscriptionData.trial_period_days = FREE_TRIAL_DAYS;
      subscriptionData.trial_settings = {
        end_behavior: {
          missing_payment_method: "cancel",
        },
      };
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscription`,
      client_reference_id: user.uid,
      customer_email: customerEmail,
      allow_promotion_codes: true,
      payment_method_collection: "always",
      metadata: {
        userId: user.uid,
        planId: billingPlanId,
        checkoutPlanId: useTrial ? "trial" : billingPlanId,
        trial: useTrial ? "true" : "false",
      },
      subscription_data: subscriptionData,
    });

    return sendJson(res, 200, { url: session.url });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function handleCreateBillingPortalSession(req: any, res: any) {
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
    let hasUserSubscriptionForCustomer = false;

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const subscriptionCustomerId = getStripeId(subscription.customer);

      if (subscriptionCustomerId !== customerId) {
        return sendJson(res, 403, { error: "Subscription does not belong to this customer" });
      }

      if (subscription.metadata?.userId !== user.uid) {
        return sendJson(res, 403, { error: "Subscription does not belong to this user" });
      }

      hasUserSubscriptionForCustomer = true;
    } else {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 10,
        status: "all",
      });

      hasUserSubscriptionForCustomer = subscriptions.data.some(subscription => subscription.metadata?.userId === user.uid);
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

export async function handleCheckoutSession(req: any, res: any) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    enforceIpRateLimit(req, {
      feature: "checkout-session:read",
      maxRequests: 60,
      windowMs: 60 * 1000,
      message: "Too many checkout verification attempts. Try again shortly.",
    });
  } catch (error) {
    return sendError(res, error);
  }

  const { sessionId, userId } = req.query;

  if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
    return sendJson(res, 400, { error: "Invalid Checkout Session ID" });
  }

  try {
    const user = await verifyFirebaseUserMatches(req, userId);
    const stripe = getStripe();
    const [session, lineItems] = await Promise.all([
      stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] }),
      stripe.checkout.sessions.listLineItems(sessionId, { limit: 1, expand: ["data.price"] }),
    ]);

    const sessionUserId = session.client_reference_id || session.metadata?.userId;
    if (sessionUserId !== user.uid) {
      return sendJson(res, 403, { error: "Checkout Session does not belong to this user" });
    }

    const subscriptionStatus = getSubscriptionStatus(session.subscription as Stripe.Subscription | null);
    const unlocked = checkoutSessionAllowsAccess(session, subscriptionStatus);
    let serverFulfilled = false;

    if (unlocked) {
      try {
        const { fulfillCheckoutSession } = await import("./stripe/fulfillment.js");
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

export async function handleSubscriptionStatus(req: any, res: any) {
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

export async function handleCheckoutRedirect(req: any, res: any) {
  if (req.method !== "GET") {
    return sendHtmlError(res, "Method not allowed.", 405);
  }

  try {
    enforceIpRateLimit(req, {
      feature: "checkout-session:redirect",
      maxRequests: 12,
      windowMs: 60 * 1000,
      message: "Too many checkout attempts. Try again in a minute.",
    });
    enforceSameOrigin(req);

    const { planId, userId, email, trial } = req.query;
    const user = await verifyFirebaseUserMatches(req, userId);
    const billingPlanId = normalizeBillingPlanId(planId);
    const useTrial = isTrialCheckout(planId, trial);
    const priceId = getPriceId(planId);

    if (!billingPlanId || !priceId) {
      return sendHtmlError(res, "Unknown or unconfigured plan. Check STRIPE_MONTHLY_PRICE_ID and STRIPE_YEARLY_PRICE_ID in Vercel.", 400);
    }

    const stripe = getStripe();
    const origin = getRequestOrigin(req);
    const customerEmail = user.email || normalizeEmail(email) || undefined;
    const subscriptionData: Record<string, any> = {
      metadata: {
        userId: user.uid,
        planId: billingPlanId,
        checkoutPlanId: useTrial ? "trial" : billingPlanId,
      },
    };

    if (useTrial) {
      subscriptionData.trial_period_days = FREE_TRIAL_DAYS;
      subscriptionData.trial_settings = {
        end_behavior: {
          missing_payment_method: "cancel",
        },
      };
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscription?checkout=cancelled`,
      client_reference_id: user.uid,
      customer_email: customerEmail,
      allow_promotion_codes: true,
      payment_method_collection: "always",
      metadata: {
        userId: user.uid,
        planId: billingPlanId,
        checkoutPlanId: useTrial ? "trial" : billingPlanId,
        trial: useTrial ? "true" : "false",
      },
      subscription_data: subscriptionData,
    });

    if (!session.url) {
      return sendHtmlError(res, "Stripe did not return a Checkout URL.", 502);
    }

    return redirect(res, 303, session.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown checkout error.";
    console.error("Checkout redirect failed:", message);
    return sendHtmlError(res, message, message.includes("configured") ? 503 : 500);
  }
}
