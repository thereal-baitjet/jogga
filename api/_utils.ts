import axios from "axios";
import { GoogleGenAI, Modality } from "@google/genai";
import Stripe from "stripe";
import { normalizeBillingPlanId } from "../src/config/billing.js";

export const APP_URL = process.env.APP_URL || "https://jogga.santosautomation.com";
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "AIzaSyBMLzrUGmsUrXAzoh-VkdpYJNCwXj6FJHQ";
const STRIPE_PRICE_IDS = {
  monthly: process.env.STRIPE_MONTHLY_PRICE_ID,
  yearly: process.env.STRIPE_YEARLY_PRICE_ID,
};

let stripeClient: Stripe | null = null;
let geminiClient: GoogleGenAI | null = null;
const aiRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export { axios };

export function getStripe() {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  stripeClient ??= new Stripe(STRIPE_SECRET_KEY);
  return stripeClient;
}

export function getGeminiClient() {
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

export async function generateCoachText(prompt: string, model?: string) {
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

export async function generateCoachAudio(text: string, voice: unknown) {
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

export function getRequestOrigin(req: any) {
  const origin = req.headers?.origin;
  const configuredOrigin = APP_URL.replace(/\/$/, "");

  if (typeof origin === "string" && /^https?:\/\//.test(origin)) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return origin;
    }
    return configuredOrigin;
  }

  return configuredOrigin;
}

export function getPriceId(planId: unknown) {
  const billingPlanId = normalizeBillingPlanId(planId);
  return billingPlanId ? STRIPE_PRICE_IDS[billingPlanId] || null : null;
}

export function getStripeId(
  value: string | Stripe.Customer | Stripe.Subscription | Stripe.DeletedCustomer | null | undefined
) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function getSubscriptionStatus(subscription: string | Stripe.Subscription | null) {
  return subscription && typeof subscription !== "string" ? subscription.status : null;
}

export function isAccessSubscriptionStatus(status: string | null) {
  return status === "active" || status === "trialing";
}

function escapeStripeSearchValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
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

export function checkoutSessionAllowsAccess(
  session: Stripe.Checkout.Session,
  subscriptionStatus: string | null
) {
  if (session.status !== "complete") return false;

  return (
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required" ||
    isAccessSubscriptionStatus(subscriptionStatus)
  );
}

export function sendJson(res: any, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export function sendError(res: any, error: any) {
  const message = error instanceof Error ? error.message : String(error);
  const status = typeof error?.status === "number"
    ? error.status
    : message.includes("configured") ? 503 : 500;
  sendJson(res, status, { error: message });
}

function getAuthorizationToken(req: any) {
  const authorization = req.headers?.authorization || req.headers?.Authorization;
  if (typeof authorization !== "string") return null;

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

function createHttpError(status: number, message: string) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

export async function verifyFirebaseUser(req: any) {
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

  return {
    uid: user.localId as string,
    email: typeof user.email === "string" ? user.email as string : null,
  };
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

export async function requireAiAccess(
  req: any,
  options: { feature: string; maxRequests: number; windowMs: number }
) {
  const user = await verifyFirebaseUser(req);
  const subscription = await findActiveUserSubscription(getStripe(), user.uid);

  if (!subscription) {
    throw createHttpError(403, "An active subscription is required for AI features.");
  }

  enforceRateLimit(user.uid, options.feature, options.maxRequests, options.windowMs);
  return { user, subscription };
}

export async function readRawBody(req: any): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function readJsonBody(req: any) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const rawBody = await readRawBody(req);
  if (rawBody.length === 0) return {};
  return JSON.parse(rawBody.toString("utf8"));
}
