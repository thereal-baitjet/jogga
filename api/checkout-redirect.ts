import {
  enforceIpRateLimit,
  enforceSameOrigin,
  getPriceId,
  getRequestOrigin,
  getStripe,
  normalizeEmail,
  verifyFirebaseUserMatches,
} from "./_utils.js";
import { FREE_TRIAL_DAYS, isTrialCheckout, normalizeBillingPlanId } from "../src/config/billing.js";

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

export default async function handler(req: any, res: any) {
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
