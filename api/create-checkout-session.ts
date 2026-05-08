import { getPriceId, getRequestOrigin, getStripe, readJsonBody, sendError, sendJson } from "./_utils.js";
import { FREE_TRIAL_DAYS, isTrialCheckout, normalizeBillingPlanId } from "../src/config/billing.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const { planId, userId, email, trial } = await readJsonBody(req);
    const billingPlanId = normalizeBillingPlanId(planId);
    const useTrial = isTrialCheckout(planId, trial);
    const priceId = getPriceId(planId);

    if (!billingPlanId || !priceId) {
      return sendJson(res, 400, { error: "Unknown or unconfigured plan" });
    }

    if (typeof userId !== "string" || userId.trim().length === 0) {
      return sendJson(res, 400, { error: "User ID is required" });
    }

    const stripe = getStripe();
    const origin = getRequestOrigin(req);
    const subscriptionData: Record<string, any> = {
      metadata: {
        userId,
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
      client_reference_id: userId,
      customer_email: typeof email === "string" && email.includes("@") ? email : undefined,
      allow_promotion_codes: true,
      payment_method_collection: "always",
      metadata: {
        userId,
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
