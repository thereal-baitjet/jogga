import Stripe from "stripe";
import { getStripe, readRawBody } from "../_utils.js";
import { fulfillStripeWebhookEvent } from "./fulfillment.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];

  if (!webhookSecret || typeof signature !== "string") {
    res.statusCode = 503;
    return res.end("Stripe webhook signing is not configured");
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error: any) {
    console.error("Stripe webhook signature error:", error.message);
    res.statusCode = 400;
    return res.end(`Webhook Error: ${error.message}`);
  }

  try {
    await fulfillStripeWebhookEvent(getStripe(), event);
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ received: true }));
  } catch (error: any) {
    console.error("Stripe webhook fulfillment error:", {
      eventType: event.type,
      message: error.message,
    });
    res.statusCode = error.message?.includes("configured") ? 503 : 500;
    return res.end("Stripe webhook fulfillment failed");
  }
}
