import { getStripe, readRawBody } from "../_utils.js";

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

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers["stripe-signature"];

    if (!webhookSecret || typeof signature !== "string") {
      res.statusCode = 503;
      return res.end("Stripe webhook signing is not configured");
    }

    const stripe = getStripe();
    const rawBody = await readRawBody(req);
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    switch (event.type) {
      case "checkout.session.completed":
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "invoice.paid":
      case "invoice.payment_failed":
        console.info(`Stripe event received: ${event.type}`);
        break;
      default:
        console.info(`Unhandled Stripe event: ${event.type}`);
    }

    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ received: true }));
  } catch (error: any) {
    console.error("Stripe webhook error:", error.message);
    res.statusCode = 400;
    return res.end(`Webhook Error: ${error.message}`);
  }
}
