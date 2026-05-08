import express from "express";
import path from "path";
import Stripe from "stripe";
import dotenv from "dotenv";
import axios from "axios";
import { GoogleGenAI, Modality } from "@google/genai";
import { fulfillCheckoutSession, fulfillStripeWebhookEvent, fulfillSubscription } from "./api/stripe/fulfillment.js";
import { FREE_TRIAL_DAYS, isTrialCheckout, normalizeBillingPlanId } from "./src/config/billing.js";

dotenv.config();

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "AIzaSyBMLzrUGmsUrXAzoh-VkdpYJNCwXj6FJHQ";
const STRIPE_PRICE_IDS = {
  monthly: process.env.STRIPE_MONTHLY_PRICE_ID,
  yearly: process.env.STRIPE_YEARLY_PRICE_ID,
};

// Google Health (Google Fit) Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

let stripeClient: Stripe | null = null;
let geminiClient: GoogleGenAI | null = null;
const aiRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function getStripe() {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  stripeClient ??= new Stripe(STRIPE_SECRET_KEY);
  return stripeClient;
}

function getGeminiClient() {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  geminiClient ??= new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return geminiClient;
}

function getOpenAIKey() {
  const apiKey = getConfiguredOpenAIKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return apiKey;
}

function getConfiguredOpenAIKey() {
  const apiKey = OPENAI_API_KEY?.trim();
  return apiKey?.startsWith("sk-") ? apiKey : null;
}

function hasOpenAIProvider() {
  return Boolean(getConfiguredOpenAIKey());
}

function getOpenAIVoice(voice: unknown) {
  const voiceMap: Record<string, string> = {
    Puck: "verse",
    Charon: "onyx",
    Kore: "alloy",
    Fenrir: "echo",
    Zephyr: "shimmer",
  };

  return typeof voice === "string" ? voiceMap[voice] || "alloy" : "alloy";
}

function extractOpenAIText(data: any) {
  if (typeof data.output_text === "string") return data.output_text;

  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string") return part.text;
    }
  }

  return "";
}

async function generateOpenAIText(prompt: string, model = OPENAI_TEXT_MODEL) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: 600,
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    console.error("OpenAI text generation failed:", data.error?.message || data);
    throw createHttpError(502, "AI provider request failed.");
  }

  return extractOpenAIText(data);
}

async function generateOpenAIAudio(text: string, voice: unknown) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice: getOpenAIVoice(voice),
      input: text,
      response_format: "pcm",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI audio generation failed:", errorText);
    throw createHttpError(502, "AI provider request failed.");
  }

  return Buffer.from(await response.arrayBuffer()).toString("base64");
}

async function generateCoachText(prompt: string, model?: string) {
  if (GEMINI_API_KEY) {
    try {
      const response = await getGeminiClient().models.generateContent({
        model: model || "gemini-1.5-flash",
        contents: prompt,
      });

      return { text: response.text || "", provider: "gemini" };
    } catch (error) {
      console.error("Gemini text generation failed, falling back to OpenAI:", error);
      if (!hasOpenAIProvider()) throw createHttpError(502, "AI provider request failed.");
    }
  }

  if (hasOpenAIProvider()) {
    return { text: await generateOpenAIText(prompt), provider: "openai" };
  }

  throw createHttpError(503, "No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY.");
}

async function generateCoachAudio(text: string, voice: unknown) {
  if (GEMINI_API_KEY) {
    try {
      const response = await getGeminiClient().models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: typeof voice === "string" ? voice : "Kore" },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!part?.data) {
        throw new Error("No audio returned");
      }

      return {
        audio: part.data,
        mimeType: part.mimeType || "audio/pcm;rate=24000",
        provider: "gemini",
      };
    } catch (error) {
      console.error("Gemini audio generation failed, falling back to OpenAI:", error);
      if (!hasOpenAIProvider()) throw createHttpError(502, "AI provider request failed.");
    }
  }

  if (hasOpenAIProvider()) {
    return {
      audio: await generateOpenAIAudio(text, voice),
      mimeType: "audio/pcm;rate=24000",
      provider: "openai",
    };
  }

  throw createHttpError(503, "No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY.");
}

function getRequestOrigin(req: express.Request) {
  const origin = req.headers.origin;
  const configuredOrigin = APP_URL.replace(/\/$/, "");

  if (typeof origin === "string" && /^https?:\/\//.test(origin)) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return origin;
    }
    return configuredOrigin;
  }

  return configuredOrigin;
}

function getStripeId(
  value: string | Stripe.Customer | Stripe.Subscription | Stripe.DeletedCustomer | null | undefined
) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function getPriceId(planId: unknown) {
  const billingPlanId = normalizeBillingPlanId(planId);
  return billingPlanId ? STRIPE_PRICE_IDS[billingPlanId] || null : null;
}

function getSubscriptionStatus(subscription: string | Stripe.Subscription | null) {
  return subscription && typeof subscription !== "string" ? subscription.status : null;
}

function isAccessSubscriptionStatus(status: string | null) {
  return status === "active" || status === "trialing";
}

function checkoutSessionAllowsAccess(session: Stripe.Checkout.Session, subscriptionStatus: string | null) {
  if (session.status !== "complete") return false;

  return (
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required" ||
    isAccessSubscriptionStatus(subscriptionStatus)
  );
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

async function findActiveUserSubscription(stripe: Stripe, userId: string) {
  const escapedUserId = escapeStripeSearchValue(userId);

  for (const status of ["trialing", "active"]) {
    const subscriptions = await stripe.subscriptions.search({
      query: `metadata['userId']:'${escapedUserId}' AND status:'${status}'`,
      limit: 1,
    });

    const subscription = subscriptions.data.find(item => !item.cancel_at_period_end);
    if (subscription) return subscription;
  }

  return null;
}

function createHttpError(status: number, message: string) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function getAuthorizationToken(req: express.Request) {
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string") return null;

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

async function verifyFirebaseUser(req: express.Request) {
  const idToken = getAuthorizationToken(req);
  if (!idToken) {
    throw createHttpError(401, "Sign in before using AI features.");
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const data = await response.json();

  if (!response.ok || !Array.isArray(data.users) || data.users.length === 0) {
    throw createHttpError(401, "Invalid or expired sign-in session.");
  }

  const user = data.users[0];
  if (typeof user.localId !== "string" || user.localId.length === 0) {
    throw createHttpError(401, "Invalid sign-in session.");
  }

  return { uid: user.localId as string };
}

function enforceRateLimit(userId: string, feature: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const key = `${feature}:${userId}`;
  const current = aiRateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    aiRateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= maxRequests) {
    throw createHttpError(429, "AI usage limit reached. Try again later.");
  }

  current.count += 1;
}

async function requireAiAccess(req: express.Request, options: { feature: string; maxRequests: number; windowMs: number }) {
  const user = await verifyFirebaseUser(req);
  const subscription = await findActiveUserSubscription(getStripe(), user.uid);

  if (!subscription) {
    throw createHttpError(403, "An active subscription is required for AI features.");
  }

  enforceRateLimit(user.uid, options.feature, options.maxRequests, options.windowMs);
  return { user, subscription };
}

function sendApiError(res: express.Response, error: any) {
  const message = error instanceof Error ? error.message : String(error);
  const status = typeof error?.status === "number"
    ? error.status
    : message.includes("configured") ? 503 : 500;
  res.status(status).json({ error: message });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!STRIPE_WEBHOOK_SECRET || typeof signature !== "string") {
      return res.status(503).send("Stripe webhook signing is not configured");
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (error: any) {
      console.error("Stripe webhook signature error:", error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    try {
      await fulfillStripeWebhookEvent(getStripe(), event);
      return res.json({ received: true });
    } catch (error: any) {
      console.error("Stripe webhook fulfillment error:", {
        eventType: event.type,
        message: error.message,
      });
      return res.status(error.message?.includes("configured") ? 503 : 500).send("Stripe webhook fulfillment failed");
    }
  });

  app.use(express.json());

  app.post("/api/coach-opinion", async (req, res) => {
    const { prompt, model = "gemini-1.5-flash" } = req.body;

    try {
      await requireAiAccess(req, {
        feature: "coach-opinion",
        maxRequests: 40,
        windowMs: 24 * 60 * 60 * 1000,
      });

      if (typeof prompt !== "string" || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      if (prompt.length > 6000) {
        return res.status(413).json({ error: "Prompt is too long" });
      }

      const response = await generateCoachText(prompt, model);

      res.json(response);
    } catch (error: any) {
      console.error("Coach opinion error:", error.message);
      sendApiError(res, error);
    }
  });

  app.post("/api/audio-cue", async (req, res) => {
    const { text, voice = "Kore" } = req.body;

    try {
      await requireAiAccess(req, {
        feature: "audio-cue",
        maxRequests: 60,
        windowMs: 24 * 60 * 60 * 1000,
      });

      if (typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({ error: "Text is required" });
      }

      if (text.length > 1000) {
        return res.status(413).json({ error: "Text is too long" });
      }

      const response = await generateCoachAudio(text, voice);

      res.json(response);
    } catch (error: any) {
      console.error("Audio cue error:", error.message);
      sendApiError(res, error);
    }
  });

  // Google Health OAuth Routes
  app.get("/api/auth/google-health/url", (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: "Google Health OAuth is not configured" });
    }

    const redirectUri = `${APP_URL}/auth/google-health/callback`;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/fitness.activity.read",
        "https://www.googleapis.com/auth/fitness.body.read",
        "https://www.googleapis.com/auth/fitness.heart_rate.read",
        "https://www.googleapis.com/auth/fitness.sleep.read",
        "openid",
        "email",
        "profile"
      ].join(" "),
      redirect_uri: redirectUri,
      access_type: "offline",
      prompt: "consent",
    });

    res.json({ url: `${GOOGLE_AUTH_URL}?${params.toString()}` });
  });

  app.get(["/auth/google-health/callback", "/auth/google-health/callback/"], async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("No code provided");
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).send("Google Health OAuth is not configured");
    }

    try {
      const redirectUri = `${APP_URL}/auth/google-health/callback`;

      const response = await axios.post(
        GOOGLE_TOKEN_URL,
        new URLSearchParams({
          code: code as string,
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const tokens = response.data;
      const targetOrigin = new URL(APP_URL).origin;
      
      res.send(`
        <html>
          <body style="background: #09090b; color: #fafafa; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="text-align: center;">
              <h1 style="font-weight: 300;">Google Health Connected</h1>
              <p style="color: #71717a;">Closing this window...</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'OAUTH_AUTH_SUCCESS', 
                    provider: 'google',
                    tokens: ${JSON.stringify(tokens)} 
                  }, ${JSON.stringify(targetOrigin)});
                  setTimeout(() => window.close(), 1000);
                } else {
                  window.location.href = '/';
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Google OAuth Error:", error.response?.data || error.message);
      res.status(500).send(`Authentication failed: ${error.message}`);
    }
  });

  // Google Health Sync Route
  app.post("/api/health/sync", async (req, res) => {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: "No access token provided" });
    }

    try {
      const startTimeMillis = new Date().setHours(0, 0, 0, 0);
      const endTimeMillis = new Date().getTime();

      // Helper to fetch aggregate data
      const fetchAggregate = async (dataTypeName: string) => {
        return axios.post(
          "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
          {
            aggregateBy: [{ dataTypeName }],
            bucketByTime: { durationMillis: 86400000 }, // 1 day
            startTimeMillis,
            endTimeMillis,
          },
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
      };

      const [hrData, sleepData, weightData] = await Promise.all([
        fetchAggregate("com.google.heart_rate.summary"),
        fetchAggregate("com.google.sleep.segment"),
        fetchAggregate("com.google.weight.summary"),
      ]);

      res.json({
        heartRate: hrData.data,
        sleep: sleepData.data,
        weight: weightData.data,
      });
    } catch (error: any) {
      console.error("Google Health Sync Error:", error.response?.data || error.message);
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 500;
        const googleError = error.response?.data?.error;
        const message = googleError?.message || error.message || "Google Health sync failed";

        if (status === 401) {
          return res.status(401).json({ error: "Google Health authorization expired. Connect Google Health again." });
        }

        if (status === 403) {
          return res.status(403).json({
            error: `${message}. Enable the Fitness API in Google Cloud and make sure this Google account is allowed on the OAuth consent screen.`,
          });
        }

        return res.status(status).json({ error: message });
      }

      res.status(500).json({ error: error.message });
    }
  });

  // API routes
  app.post("/api/create-checkout-session", async (req, res) => {
    const { planId, userId, email, trial } = req.body;
    const billingPlanId = normalizeBillingPlanId(planId);
    const useTrial = isTrialCheckout(planId, trial);
    const priceId = getPriceId(planId);

    if (!billingPlanId || !priceId) {
      return res.status(400).json({ error: "Unknown or unconfigured plan" });
    }

    if (typeof userId !== "string" || userId.trim().length === 0) {
      return res.status(400).json({ error: "User ID is required" });
    }

    try {
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

      res.json({ url: session.url });
    } catch (error: any) {
      res.status(error.message.includes("configured") ? 503 : 500).json({ error: error.message });
    }
  });

  app.post("/api/create-billing-portal-session", async (req, res) => {
    const { customerId, subscriptionId, userId } = req.body;
    const isValidStripeId = (value: unknown, prefix: string) => (
      typeof value === "string" && value.startsWith(prefix) && value.trim().length > prefix.length
    );

    if (!isValidStripeId(customerId, "cus_")) {
      return res.status(400).json({ error: "Valid Stripe customer ID is required" });
    }

    if (subscriptionId != null && subscriptionId !== "" && !isValidStripeId(subscriptionId, "sub_")) {
      return res.status(400).json({ error: "Invalid Stripe subscription ID" });
    }

    if (typeof userId !== "string" || userId.trim().length === 0) {
      return res.status(400).json({ error: "User ID is required" });
    }

    try {
      const stripe = getStripe();

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const subscriptionCustomerId = getStripeId(subscription.customer);

        if (subscriptionCustomerId !== customerId) {
          return res.status(403).json({ error: "Subscription does not belong to this customer" });
        }

        if (subscription.metadata?.userId && subscription.metadata.userId !== userId) {
          return res.status(403).json({ error: "Subscription does not belong to this user" });
        }
      }

      const origin = getRequestOrigin(req);
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: origin + "/dashboard?billing=updated",
      });

      res.json({ url: session.url });
    } catch (error: any) {
      res.status(error.message.includes("configured") ? 503 : 500).json({ error: error.message });
    }
  });

  async function sendCheckoutSessionStatus(
    res: express.Response,
    sessionId: string | undefined,
    userId: string | null
  ) {
    if (!sessionId?.startsWith("cs_")) {
      return res.status(400).json({ error: "Invalid Checkout Session ID" });
    }

    try {
      const stripe = getStripe();
      const [session, lineItems] = await Promise.all([
        stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] }),
        stripe.checkout.sessions.listLineItems(sessionId, { limit: 1, expand: ["data.price"] }),
      ]);

      const sessionUserId = session.client_reference_id || session.metadata?.userId;
      if (userId && sessionUserId !== userId) {
        return res.status(403).json({ error: "Checkout Session does not belong to this user" });
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

      res.json({
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
    } catch (error: any) {
      res.status(error.message.includes("configured") ? 503 : 500).json({ error: error.message });
    }
  }

  app.get("/api/checkout-session", async (req, res) => {
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const userId = typeof req.query.userId === "string" ? req.query.userId : null;

    await sendCheckoutSessionStatus(res, sessionId, userId);
  });

  app.get("/api/checkout-session/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    const userId = typeof req.query.userId === "string" ? req.query.userId : null;

    await sendCheckoutSessionStatus(res, sessionId, userId);
  });

  app.get("/api/subscription-status", async (req, res) => {
    const userId = typeof req.query.userId === "string" ? req.query.userId : null;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    try {
      const stripe = getStripe();
      const subscription = await findUserSubscription(stripe, userId);
      const subscriptionStatus = subscription?.cancel_at_period_end
        ? "canceling"
        : subscription?.status || null;
      const unlocked = isAccessSubscriptionStatus(subscriptionStatus);
      let serverFulfilled = false;

      if (subscription) {
        try {
          const fulfillment = await fulfillSubscription(subscription, "subscription.status.verified", {
            statusOverride: subscriptionStatus,
            forceUnlocked: unlocked,
          });
          serverFulfilled = fulfillment.handled;
        } catch (fulfillmentError) {
          console.error("Subscription status server fulfillment failed:", {
            userId,
            subscriptionId: subscription.id,
            message: fulfillmentError instanceof Error ? fulfillmentError.message : String(fulfillmentError),
          });
        }
      }

      res.json({
        unlocked,
        serverFulfilled,
        customerId: getStripeId(subscription?.customer as Stripe.Customer | string | null | undefined),
        subscriptionId: subscription?.id || null,
        subscriptionStatus,
        cancelAtPeriodEnd: subscription?.cancel_at_period_end || false,
        priceId: subscription?.items.data[0]?.price?.id || null,
        planId: subscription?.metadata?.planId || null,
      });
    } catch (error: any) {
      res.status(error.message.includes("configured") ? 503 : 500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
