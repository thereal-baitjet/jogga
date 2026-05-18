import {
  enforceIpRateLimit,
  enforceSameOrigin,
  getPriceId,
  getRequestOrigin,
  getStripe,
  normalizeEmail,
  readJsonBody,
  sendError,
  sendJson,
  verifyFirebaseUserMatches,
} from "./_utils.js";
import { FREE_TRIAL_DAYS, isTrialCheckout, normalizeBillingPlanId } from "../src/config/billing.js";

function logCheckoutFailure(req: any, error: any) {
  const message = error instanceof Error ? error.message : String(error);
  const status = typeof error?.status === "number"
    ? error.status
    : message.includes("configured") ? 503 : 500;
  const log = status >= 500 ? console.error : console.warn;

  log("Checkout session creation failed", {
    status,
    code: typeof error?.code === "string" ? error.code : undefined,
    message,
    origin: req.headers?.origin || null,
    referer: req.headers?.referer || null,
    hasAuthorizationHeader: typeof (req.headers?.authorization || req.headers?.Authorization) === "string",
  });
}

export default async function handler(req: any, res: any) {
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
    logCheckoutFailure(req, error);
    return sendError(res, error);
  }
}
