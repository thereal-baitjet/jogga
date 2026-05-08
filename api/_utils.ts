import axios from "axios";
import { createHash } from "crypto";
import { GoogleGenAI, Modality } from "@google/genai";
import Stripe from "stripe";
import { getFirebaseAdminDb } from "./firebase-admin.js";
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
const AI_CACHE_DURATION_MS = 12 * 60 * 60 * 1000;
const FREE_COACH_LIFETIME_LIMIT = 3;
const PAID_COACH_DAILY_LIMIT = 10;
const COACH_RESPONSE_MAX_WORDS = 180;
const COACH_OUTPUT_INSTRUCTION = `\n\nHard limit: respond in ${COACH_RESPONSE_MAX_WORDS} words or fewer.`;

let stripeClient: Stripe | null = null;
let geminiClient: GoogleGenAI | null = null;
const aiRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const coachUsageFallbackBuckets = new Map<string, {
  freeLifetimeCount: number;
  paidDailyCount: number;
  paidDailyKey: string;
}>();
const coachResponseCache = new Map<string, {
  expiresAt: number;
  response: CoachTextResponse;
}>();

type AiAccessTier = "free" | "paid";

interface CoachTextResponse {
  text: string;
  provider: string;
  cached?: boolean;
  fallback?: boolean;
}

interface CoachCacheContext {
  questionType: string;
  readinessScore: string;
  todayWorkoutId: string;
  recentWorkoutSummary: string;
}

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
      max_output_tokens: 320,
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
  const limitedPrompt = appendCoachOutputInstruction(prompt);

  if (GEMINI_API_KEY) {
    try {
      const response = await getGeminiClient().models.generateContent({
        model: model || "gemini-1.5-flash",
        contents: limitedPrompt,
        config: {
          maxOutputTokens: 320,
        },
      });

      return { text: limitCoachWords(response.text || ""), provider: "gemini" };
    } catch (error) {
      console.error("Gemini text generation failed, falling back to OpenAI:", error);
      if (!hasOpenAIProvider()) throw createHttpError(502, "AI provider request failed.");
    }
  }

  if (hasOpenAIProvider()) {
    return { text: limitCoachWords(await generateOpenAIText(limitedPrompt)), provider: "openai" };
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
  sendJson(res, status, {
    error: message,
    ...(typeof error?.code === "string" ? { code: error.code } : {}),
    ...(typeof error?.upgradeRequired === "boolean" ? { upgradeRequired: error.upgradeRequired } : {}),
  });
}

function getAuthorizationToken(req: any) {
  const authorization = req.headers?.authorization || req.headers?.Authorization;
  if (typeof authorization !== "string") return null;

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

function createHttpError(
  status: number,
  message: string,
  options: { code?: string; upgradeRequired?: boolean } = {}
) {
  const error = new Error(message) as Error & {
    status: number;
    code?: string;
    upgradeRequired?: boolean;
  };
  error.status = status;
  error.code = options.code;
  error.upgradeRequired = options.upgradeRequired;
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

function appendCoachOutputInstruction(prompt: string) {
  return prompt.includes(`${COACH_RESPONSE_MAX_WORDS} words`) ? prompt : `${prompt.trim()}${COACH_OUTPUT_INSTRUCTION}`;
}

function limitCoachWords(text: string, maxWords = COACH_RESPONSE_MAX_WORDS) {
  const normalizedText = text.trim().replace(/\s+/g, " ");
  if (!normalizedText) return "";

  const words = normalizedText.split(" ");
  if (words.length <= maxWords) return normalizedText;

  const shortened = words.slice(0, maxWords).join(" ").replace(/[,:;!?-]+$/, "");
  return shortened.endsWith(".") ? shortened : `${shortened}.`;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getUtcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function normalizeCacheValue(value: unknown, fallback = "none") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? String(Math.round(value)) : fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 700) : fallback;
  }

  try {
    return JSON.stringify(value).slice(0, 700);
  } catch {
    return fallback;
  }
}

function getBodyValue(body: any, camelKey: string, snakeKey: string) {
  return body?.[camelKey] ?? body?.[snakeKey] ?? body?.cacheContext?.[camelKey] ?? body?.cacheContext?.[snakeKey];
}

function buildCoachCacheContext(body: any, prompt: string): CoachCacheContext {
  return {
    questionType: normalizeCacheValue(getBodyValue(body, "questionType", "question_type"), "coach-opinion"),
    readinessScore: normalizeCacheValue(getBodyValue(body, "readinessScore", "readiness_score")),
    todayWorkoutId: normalizeCacheValue(getBodyValue(body, "todayWorkoutId", "today_workout_id")),
    recentWorkoutSummary: normalizeCacheValue(
      getBodyValue(body, "recentWorkoutSummary", "recent_workout_summary"),
      `prompt:${hashValue(prompt)}`
    ),
  };
}

function buildCoachCacheKey(userId: string, model: string, context: CoachCacheContext) {
  return hashValue(JSON.stringify({
    userId,
    model,
    question_type: context.questionType,
    readiness_score: context.readinessScore,
    today_workout_id: context.todayWorkoutId,
    recent_workout_summary: context.recentWorkoutSummary,
  }));
}

async function findOptionalActiveUserSubscription(userId: string) {
  try {
    return await findActiveUserSubscription(getStripe(), userId);
  } catch (error: any) {
    console.error("Unable to verify Stripe subscription for AI access:", error.message);
    return null;
  }
}

async function getCoachAiAccess(req: any) {
  const user = await verifyFirebaseUser(req);
  const subscription = await findOptionalActiveUserSubscription(user.uid);
  const tier: AiAccessTier = subscription ? "paid" : "free";

  return { user, subscription, tier };
}

function enforceFallbackCoachUsageLimit(userId: string, tier: AiAccessTier) {
  const dayKey = getUtcDayKey();
  const current = coachUsageFallbackBuckets.get(userId) || {
    freeLifetimeCount: 0,
    paidDailyCount: 0,
    paidDailyKey: dayKey,
  };

  if (tier === "paid") {
    const paidDailyCount = current.paidDailyKey === dayKey ? current.paidDailyCount : 0;
    if (paidDailyCount >= PAID_COACH_DAILY_LIMIT) {
      throw createHttpError(429, "Daily AI coach limit reached. Try again tomorrow.", {
        code: "AI_DAILY_LIMIT_REACHED",
      });
    }

    coachUsageFallbackBuckets.set(userId, {
      ...current,
      paidDailyKey: dayKey,
      paidDailyCount: paidDailyCount + 1,
    });
    return;
  }

  if (current.freeLifetimeCount >= FREE_COACH_LIFETIME_LIMIT) {
    throw createHttpError(402, "Free AI message limit reached. Upgrade to Jogga to keep using AI coach.", {
      code: "AI_FREE_LIMIT_REACHED",
      upgradeRequired: true,
    });
  }

  coachUsageFallbackBuckets.set(userId, {
    ...current,
    freeLifetimeCount: current.freeLifetimeCount + 1,
  });
}

async function enforceCoachUsageLimit(userId: string, tier: AiAccessTier) {
  try {
    const db = getFirebaseAdminDb();
    const usageRef = db.collection("users").doc(userId).collection("aiUsage").doc("coach-opinion");
    const dayKey = getUtcDayKey();

    await db.runTransaction(async transaction => {
      const usageSnap = await transaction.get(usageRef);
      const usage = usageSnap.exists ? usageSnap.data() || {} : {};
      const freeLifetimeCount = typeof usage.freeLifetimeCount === "number" ? usage.freeLifetimeCount : 0;
      const paidDailyCount = usage.paidDailyKey === dayKey && typeof usage.paidDailyCount === "number"
        ? usage.paidDailyCount
        : 0;
      const now = new Date().toISOString();

      if (tier === "paid") {
        if (paidDailyCount >= PAID_COACH_DAILY_LIMIT) {
          throw createHttpError(429, "Daily AI coach limit reached. Try again tomorrow.", {
            code: "AI_DAILY_LIMIT_REACHED",
          });
        }

        transaction.set(usageRef, {
          paidDailyKey: dayKey,
          paidDailyCount: paidDailyCount + 1,
          lastAccessTier: tier,
          lastRequestAt: now,
          updatedAt: now,
        }, { merge: true });
        return;
      }

      if (freeLifetimeCount >= FREE_COACH_LIFETIME_LIMIT) {
        throw createHttpError(402, "Free AI message limit reached. Upgrade to Jogga to keep using AI coach.", {
          code: "AI_FREE_LIMIT_REACHED",
          upgradeRequired: true,
        });
      }

      transaction.set(usageRef, {
        freeLifetimeCount: freeLifetimeCount + 1,
        lastAccessTier: tier,
        lastRequestAt: now,
        updatedAt: now,
      }, { merge: true });
    });
  } catch (error: any) {
    if (typeof error?.status === "number") throw error;

    console.error("Persistent AI usage limit unavailable; using in-memory fallback:", error.message);
    enforceFallbackCoachUsageLimit(userId, tier);
  }
}

async function getCachedCoachResponse(cacheKey: string) {
  const now = Date.now();
  const memoryEntry = coachResponseCache.get(cacheKey);
  if (memoryEntry && memoryEntry.expiresAt > now) {
    return { ...memoryEntry.response, cached: true };
  }

  try {
    const cacheSnap = await getFirebaseAdminDb().collection("aiResponseCache").doc(cacheKey).get();
    const cacheData = cacheSnap.exists ? cacheSnap.data() : null;
    const expiresAt = typeof cacheData?.expiresAt === "number" ? cacheData.expiresAt : 0;
    const text = typeof cacheData?.text === "string" ? cacheData.text : "";
    const provider = typeof cacheData?.provider === "string" ? cacheData.provider : "cache";

    if (expiresAt > now && text) {
      const response = { text, provider, cached: true };
      coachResponseCache.set(cacheKey, { expiresAt, response });
      return response;
    }
  } catch (error: any) {
    console.error("Persistent AI cache read unavailable:", error.message);
  }

  if (memoryEntry) coachResponseCache.delete(cacheKey);
  return null;
}

async function cacheCoachResponse(cacheKey: string, response: CoachTextResponse) {
  const expiresAt = Date.now() + AI_CACHE_DURATION_MS;
  const cacheableResponse = {
    text: limitCoachWords(response.text),
    provider: response.provider,
  };

  coachResponseCache.set(cacheKey, { expiresAt, response: cacheableResponse });

  try {
    await getFirebaseAdminDb().collection("aiResponseCache").doc(cacheKey).set({
      ...cacheableResponse,
      expiresAt,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error: any) {
    console.error("Persistent AI cache write unavailable:", error.message);
  }
}

function buildDeterministicCoachResponse(body: any, context: CoachCacheContext): CoachTextResponse {
  const fallbackText = body?.fallbackText ?? body?.fallback_text;
  if (typeof fallbackText === "string" && fallbackText.trim().length > 0) {
    return {
      text: limitCoachWords(fallbackText),
      provider: "deterministic",
      fallback: true,
    };
  }

  const readiness = context.readinessScore !== "none" ? Number(context.readinessScore) : null;
  const readinessAdvice = Number.isFinite(readiness)
    ? readiness! >= 75
      ? "Your readiness is high, so keep the planned work controlled and do not add extra volume just because you feel good."
      : readiness! <= 45
        ? "Your readiness is low, so shorten the session or keep it very easy until the next check-in."
        : "Your readiness is moderate, so stay with the plan and keep the effort repeatable."
    : "Use the measured run data first, keep the next session controlled, and protect recovery before adding intensity.";

  return {
    text: limitCoachWords(`${readinessAdvice} If this was a post-run check-in, judge the day by distance, duration, pace, and how well the session matched its purpose. The next best move is steady consistency, not forcing missed fitness into one run.`),
    provider: "deterministic",
    fallback: true,
  };
}

export async function createCoachOpinionResponse(req: any, body: any) {
  const { prompt, model = "gemini-1.5-flash" } = body;

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw createHttpError(400, "Prompt is required");
  }

  if (prompt.length > 6000) {
    throw createHttpError(413, "Prompt is too long");
  }

  const access = await getCoachAiAccess(req);
  const context = buildCoachCacheContext(body, prompt);
  const modelName = typeof model === "string" ? model : "gemini-1.5-flash";
  const cacheKey = buildCoachCacheKey(access.user.uid, modelName, context);

  await enforceCoachUsageLimit(access.user.uid, access.tier);

  const cachedResponse = await getCachedCoachResponse(cacheKey);
  if (cachedResponse) {
    console.info("AI coach response served from cache", {
      userId: access.user.uid,
      eventType: "coach-opinion",
      tier: access.tier,
      subscriptionId: access.subscription?.id || null,
      questionType: context.questionType,
    });
    return cachedResponse;
  }

  try {
    const response = await generateCoachText(prompt, modelName);
    await cacheCoachResponse(cacheKey, response);

    console.info("AI coach response generated", {
      userId: access.user.uid,
      eventType: "coach-opinion",
      tier: access.tier,
      subscriptionId: access.subscription?.id || null,
      provider: response.provider,
      questionType: context.questionType,
    });

    return { ...response, cached: false };
  } catch (error: any) {
    console.error("AI coach provider failed; using deterministic fallback:", error.message);

    return buildDeterministicCoachResponse(body, context);
  }
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
