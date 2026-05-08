import Stripe from "stripe";
import { getFirebaseAdminDb } from "../firebase-admin.js";
import { getStripeId, isAccessSubscriptionStatus } from "../_utils.js";

type StripeSubscription = Stripe.Subscription & {
  current_period_end?: number;
};

interface FulfillmentResult {
  handled: boolean;
  userId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  unlocked: boolean | null;
  reason?: string;
}

function getSubscriptionPriceId(subscription: Stripe.Subscription | null) {
  return subscription?.items.data[0]?.price?.id || null;
}

function getPlanId(subscription: Stripe.Subscription | null, fallbackPlanId?: string | null) {
  return subscription?.metadata?.planId || fallbackPlanId || null;
}

function getEffectiveSubscriptionStatus(subscription: Stripe.Subscription) {
  return subscription.cancel_at_period_end ? "canceling" : subscription.status;
}

function getSubscriptionUserId(subscription: Stripe.Subscription | null, fallbackUserId?: string | null) {
  return subscription?.metadata?.userId || fallbackUserId || null;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const rawInvoice = invoice as any;
  return (
    getStripeId(rawInvoice.subscription) ||
    getStripeId(rawInvoice.parent?.subscription_details?.subscription) ||
    getStripeId(rawInvoice.lines?.data?.[0]?.parent?.subscription_item_details?.subscription) ||
    null
  );
}

async function retrieveSubscription(stripe: Stripe, subscription: string | Stripe.Subscription | null | undefined) {
  const subscriptionId = getStripeId(subscription as Stripe.Subscription | string | null | undefined);
  if (!subscriptionId) return null;

  if (typeof subscription !== "string" && subscription?.object === "subscription") {
    return subscription as StripeSubscription;
  }

  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  }) as Promise<StripeSubscription>;
}

async function writeUserSubscriptionState(params: {
  eventType: string;
  userId: string;
  customerId: string | null;
  subscriptionId: string | null;
  priceId: string | null;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  unlocked: boolean;
}) {
  const db = getFirebaseAdminDb();
  const userRef = db.collection("users").doc(params.userId);
  const userSnap = await userRef.get();
  const currentData = userSnap.exists ? userSnap.data() : null;
  const hasAdminAccess = currentData?.accessSource === "admin";
  const now = new Date().toISOString();
  const nextUnlocked = hasAdminAccess && !params.unlocked ? true : params.unlocked;
  const nextAccessSource = hasAdminAccess ? "admin" : "stripe";

  await userRef.set({
    isUnlocked: nextUnlocked,
    accessSource: nextAccessSource,
    stripeCustomerId: params.customerId,
    stripeSubscriptionId: params.subscriptionId,
    stripePriceId: params.priceId,
    subscriptionStatus: params.subscriptionStatus,
    subscriptionPlan: params.subscriptionPlan,
    subscriptionVerifiedAt: now,
    updatedAt: now,
  }, { merge: true });

  console.info("Stripe fulfillment applied", {
    eventType: params.eventType,
    userId: params.userId,
    subscriptionId: params.subscriptionId,
    subscriptionStatus: params.subscriptionStatus,
    unlocked: nextUnlocked,
  });

  return nextUnlocked;
}

export async function fulfillSubscription(
  subscription: Stripe.Subscription,
  eventType: string,
  options: {
    userId?: string | null;
    statusOverride?: string | null;
    forceUnlocked?: boolean;
  } = {}
): Promise<FulfillmentResult> {
  const userId = getSubscriptionUserId(subscription, options.userId);
  const subscriptionId = subscription.id;
  const subscriptionStatus = options.statusOverride ?? getEffectiveSubscriptionStatus(subscription) ?? null;
  const unlocked = options.forceUnlocked ?? isAccessSubscriptionStatus(subscriptionStatus);

  if (!userId) {
    console.info("Stripe fulfillment ignored: missing userId", {
      eventType,
      subscriptionId,
      subscriptionStatus,
    });
    return {
      handled: false,
      userId: null,
      subscriptionId,
      subscriptionStatus,
      unlocked,
      reason: "missing_user_id",
    };
  }

  const finalUnlocked = await writeUserSubscriptionState({
    eventType,
    userId,
    customerId: getStripeId(subscription.customer as Stripe.Customer | string | null),
    subscriptionId,
    priceId: getSubscriptionPriceId(subscription),
    subscriptionStatus,
    subscriptionPlan: getPlanId(subscription),
    unlocked,
  });

  return {
    handled: true,
    userId,
    subscriptionId,
    subscriptionStatus,
    unlocked: finalUnlocked,
  };
}

export async function fulfillCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  eventType = "checkout.session.completed"
): Promise<FulfillmentResult> {
  if (session.status !== "complete") {
    console.info("Stripe fulfillment ignored: incomplete checkout session", {
      eventType,
      userId: session.client_reference_id || session.metadata?.userId || null,
      subscriptionId: getStripeId(session.subscription as Stripe.Subscription | string | null),
      subscriptionStatus: null,
    });
    return {
      handled: false,
      userId: session.client_reference_id || session.metadata?.userId || null,
      subscriptionId: getStripeId(session.subscription as Stripe.Subscription | string | null),
      subscriptionStatus: null,
      unlocked: false,
      reason: "checkout_incomplete",
    };
  }

  const subscription = await retrieveSubscription(stripe, session.subscription as Stripe.Subscription | string | null);
  const userId = session.client_reference_id || session.metadata?.userId || getSubscriptionUserId(subscription);

  if (!subscription) {
    console.info("Stripe fulfillment ignored: checkout missing subscription", {
      eventType,
      userId,
      subscriptionId: null,
      subscriptionStatus: null,
    });
    return {
      handled: false,
      userId,
      subscriptionId: null,
      subscriptionStatus: null,
      unlocked: false,
      reason: "missing_subscription",
    };
  }

  return fulfillSubscription(subscription, eventType, {
    userId,
    statusOverride: subscription.status,
  });
}

async function fulfillInvoiceEvent(
  stripe: Stripe,
  invoice: Stripe.Invoice,
  eventType: "invoice.paid" | "invoice.payment_failed"
) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  const subscription = await retrieveSubscription(stripe, subscriptionId);

  if (!subscription) {
    console.info("Stripe fulfillment ignored: invoice missing subscription", {
      eventType,
      userId: null,
      subscriptionId,
      subscriptionStatus: null,
    });
    return {
      handled: false,
      userId: null,
      subscriptionId,
      subscriptionStatus: null,
      unlocked: false,
      reason: "missing_subscription",
    };
  }

  if (eventType === "invoice.payment_failed") {
    const effectiveStatus = getEffectiveSubscriptionStatus(subscription);
    const statusOverride = isAccessSubscriptionStatus(effectiveStatus)
      ? effectiveStatus
      : "past_due";

    return fulfillSubscription(subscription, eventType, {
      statusOverride,
      forceUnlocked: isAccessSubscriptionStatus(statusOverride),
    });
  }

  return fulfillSubscription(subscription, eventType);
}

export async function fulfillStripeWebhookEvent(stripe: Stripe, event: Stripe.Event): Promise<FulfillmentResult> {
  switch (event.type) {
    case "checkout.session.completed":
      return fulfillCheckoutSession(stripe, event.data.object as Stripe.Checkout.Session, event.type);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return fulfillSubscription(event.data.object as Stripe.Subscription, event.type);
    case "invoice.paid":
    case "invoice.payment_failed":
      return fulfillInvoiceEvent(stripe, event.data.object as Stripe.Invoice, event.type);
    default:
      console.info("Stripe fulfillment safely ignored", {
        eventType: event.type,
        userId: null,
        subscriptionId: null,
        subscriptionStatus: null,
      });
      return {
        handled: false,
        userId: null,
        subscriptionId: null,
        subscriptionStatus: null,
        unlocked: null,
        reason: "unhandled_event",
      };
  }
}
