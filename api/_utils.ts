import axios from "axios";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { GoogleGenAI, Modality } from "@google/genai";
import Stripe from "stripe";
import { normalizeBillingPlanId } from "../src/config/billing.js";
import {
  COACH_INSIGHT_SCHEMA_VERSION,
  createFallbackCoachInsight,
  validateCoachInsight,
  type CoachInsight,
} from "../src/services/coachInsightService.js";

export const APP_URL = process.env.APP_URL || "https://jogga.santosautomation.com";
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
export const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
export const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
export const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
export const STRAVA_API_URL = "https://www.strava.com/api/v3";
export const STRAVA_SCOPES = ["read", "activity:read_all"] as const;
const APP_ORIGIN = new URL(APP_URL).origin;
const ADDITIONAL_ALLOWED_ORIGINS = (process.env.ADDITIONAL_ALLOWED_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const FREE_ACCESS_EMAILS = new Set(parseDelimitedEnv(process.env.FREE_ACCESS_EMAILS).map(email => email.toLowerCase()));
const FREE_ACCESS_UIDS = new Set(parseDelimitedEnv(process.env.FREE_ACCESS_UIDS));
const MAX_JSON_BODY_BYTES = 64 * 1024;

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
const COACH_JSON_OUTPUT_INSTRUCTION = [
  "Return only valid JSON matching the requested schema.",
  "Do not include markdown, backticks, explanations, or extra keys.",
  "Do not include text before or after the JSON object.",
].join(" ");

let stripeClient: Stripe | null = null;
let geminiClient: GoogleGenAI | null = null;
const aiRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const ipRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
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
  data: CoachInsight;
  schemaVersion: string;
  cached?: boolean;
  fallback?: boolean;
}

interface CoachCacheContext {
  questionType: string;
  readinessScore: string;
  todayWorkoutId: string;
  recentWorkoutSummary: string;
}

interface RateLimitOptions {
  feature: string;
  maxRequests: number;
  windowMs: number;
  message?: string;
}

interface SameOriginOptions {
  requireOrigin?: boolean;
}

interface SignedOAuthStatePayload {
  uid: string;
  nonce: string;
  iat: number;
  exp: number;
}

export { axios };

async function getAdminDb() {
  const { getFirebaseAdminDb } = await import("./firebase-admin.js");
  return getFirebaseAdminDb();
}

function parseDelimitedEnv(value: string | undefined) {
  return (value || "")
    .split(/[,\s;]+/)
    .map(item => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

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

type CoachResponseFormat = "text" | "json";

async function generateOpenAIText(prompt: string, model = OPENAI_TEXT_MODEL, maxOutputTokens = 320) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: maxOutputTokens,
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

export async function generateCoachText(
  prompt: string,
  model?: string,
  options: { responseFormat?: CoachResponseFormat } = {},
) {
  const responseFormat = options.responseFormat || "text";
  const limitedPrompt = appendCoachOutputInstruction(prompt, responseFormat);
  const maxOutputTokens = responseFormat === "json" ? 450 : 320;

  if (GEMINI_API_KEY) {
    try {
      const response = await getGeminiClient().models.generateContent({
        model: model || "gemini-1.5-flash",
        contents: limitedPrompt,
        config: {
          maxOutputTokens,
          ...(responseFormat === "json" ? { responseMimeType: "application/json" } : {}),
        },
      });

      const text = (response.text || "").trim();
      return {
        text: responseFormat === "json" ? text : limitCoachWords(text),
        provider: "gemini",
      };
    } catch (error) {
      console.error("Gemini text generation failed, falling back to OpenAI:", error);
      if (!hasOpenAIProvider()) throw createHttpError(502, "AI provider request failed.");
    }
  }

  if (hasOpenAIProvider()) {
    const text = (await generateOpenAIText(limitedPrompt, OPENAI_TEXT_MODEL, maxOutputTokens)).trim();
    return {
      text: responseFormat === "json" ? text : limitCoachWords(text),
      provider: "openai",
    };
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

function getRequestHeader(req: any, name: string) {
  const value = req.headers?.[name.toLowerCase()] || req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : null;
}

function normalizeOrigin(value: string | null) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin: string) {
  if (origin === APP_ORIGIN) return true;
  if (ADDITIONAL_ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

export function enforceSameOrigin(req: any, options: SameOriginOptions = {}) {
  const origin = normalizeOrigin(getRequestHeader(req, "origin"));
  const referer = normalizeOrigin(getRequestHeader(req, "referer"));
  const candidate = origin || referer;

  if (!candidate) {
    if (options.requireOrigin) {
      throw createHttpError(403, "Request origin is required.", { code: "ORIGIN_REQUIRED" });
    }
    return;
  }

  if (!isAllowedOrigin(candidate)) {
    throw createHttpError(403, "Request origin is not allowed.", { code: "ORIGIN_NOT_ALLOWED" });
  }
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
  res.setHeader("Cache-Control", "no-store");
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
    ...(error?.upgradeRequired ? { cta: "Start a trial or choose a plan to keep using AI coaching." } : {}),
    ...(typeof error?.retryAfterSeconds === "number" ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
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
  options: { code?: string; upgradeRequired?: boolean; retryAfterSeconds?: number } = {}
) {
  const error = new Error(message) as Error & {
    status: number;
    code?: string;
    upgradeRequired?: boolean;
    retryAfterSeconds?: number;
  };
  error.status = status;
  error.code = options.code;
  error.upgradeRequired = options.upgradeRequired;
  error.retryAfterSeconds = options.retryAfterSeconds;
  return error;
}

function getHeaderString(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : null;
}

export function getClientIp(req: any) {
  const forwardedFor = getHeaderString(req.headers?.["x-forwarded-for"] || req.headers?.["X-Forwarded-For"]);
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  return (
    getHeaderString(req.headers?.["cf-connecting-ip"] || req.headers?.["CF-Connecting-IP"]) ||
    getHeaderString(req.headers?.["x-real-ip"] || req.headers?.["X-Real-IP"]) ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function cleanupExpiredRateLimits(now: number) {
  if (ipRateLimitBuckets.size < 5000) return;

  for (const [key, bucket] of ipRateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) ipRateLimitBuckets.delete(key);
  }
}

export function enforceIpRateLimit(req: any, options: RateLimitOptions) {
  const now = Date.now();
  cleanupExpiredRateLimits(now);

  const ip = getClientIp(req);
  const key = `${options.feature}:${ip}`;
  const current = ipRateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    ipRateLimitBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  if (current.count >= options.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    console.warn("IP rate limit exceeded", {
      feature: options.feature,
      ipHash: hashValue(ip).slice(0, 12),
      retryAfterSeconds,
    });
    throw createHttpError(429, options.message || "Too many requests. Try again shortly.", {
      code: "RATE_LIMITED",
      retryAfterSeconds,
    });
  }

  current.count += 1;
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

export function isFreeAccessUser(user: { uid?: string | null; email?: string | null }) {
  const uid = typeof user.uid === "string" ? user.uid.trim() : "";
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";

  if (FREE_ACCESS_UIDS.has("*") || FREE_ACCESS_EMAILS.has("*")) return true;
  if (uid && FREE_ACCESS_UIDS.has(uid)) return true;
  if (email && FREE_ACCESS_EMAILS.has(email)) return true;
  return false;
}

export function getFreeAccessReason(user: { uid?: string | null; email?: string | null }) {
  const uid = typeof user.uid === "string" ? user.uid.trim() : "";
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";

  if (FREE_ACCESS_UIDS.has("*") || FREE_ACCESS_EMAILS.has("*")) return "wildcard";
  if (uid && FREE_ACCESS_UIDS.has(uid)) return "uid";
  if (email && FREE_ACCESS_EMAILS.has(email)) return "email";
  return null;
}

export async function verifyFirebaseUserMatches(req: any, requestedUserId: unknown) {
  const user = await verifyFirebaseUser(req);

  if (typeof requestedUserId !== "string" || requestedUserId.trim().length === 0) {
    throw createHttpError(400, "User ID is required");
  }

  if (requestedUserId !== user.uid) {
    throw createHttpError(403, "Authenticated user does not match requested user.", {
      code: "USER_MISMATCH",
    });
  }

  return user;
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
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
  if (isFreeAccessUser(user)) {
    enforceRateLimit(user.uid, options.feature, options.maxRequests, options.windowMs);
    return { user, subscription: null, accessSource: "whitelist" as const };
  }

  const subscription = await findActiveUserSubscription(getStripe(), user.uid);

  if (!subscription) {
    throw createHttpError(403, "An active subscription is required for AI features.");
  }

  enforceRateLimit(user.uid, options.feature, options.maxRequests, options.windowMs);
  return { user, subscription, accessSource: "stripe" as const };
}

function appendCoachOutputInstruction(prompt: string, responseFormat: CoachResponseFormat = "text") {
  const trimmedPrompt = prompt.trim();
  if (responseFormat === "json") {
    return trimmedPrompt.includes("Return only valid JSON")
      ? trimmedPrompt
      : `${trimmedPrompt}\n\n${COACH_JSON_OUTPUT_INSTRUCTION}`;
  }

  return trimmedPrompt.includes(`${COACH_RESPONSE_MAX_WORDS} words`)
    ? trimmedPrompt
    : `${trimmedPrompt}${COACH_OUTPUT_INSTRUCTION}`;
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

function getStravaOAuthStateSecret() {
  return process.env.STRAVA_OAUTH_STATE_SECRET || STRAVA_CLIENT_SECRET;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signOAuthStatePayload(encodedPayload: string) {
  const secret = getStravaOAuthStateSecret();
  if (!secret) {
    throw createHttpError(503, "Strava OAuth is not configured.");
  }

  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createSignedStravaState(uid: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SignedOAuthStatePayload = {
    uid,
    nonce: createHash("sha256").update(`${uid}:${now}:${Math.random()}`).digest("hex").slice(0, 24),
    iat: now,
    exp: now + 10 * 60,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signOAuthStatePayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifySignedStravaState(state: unknown) {
  if (typeof state !== "string" || !state.includes(".")) {
    throw createHttpError(400, "Invalid Strava OAuth state.");
  }

  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw createHttpError(400, "Invalid Strava OAuth state.");
  }

  const expectedSignature = signOAuthStatePayload(encodedPayload);
  const provided = Buffer.from(signature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw createHttpError(400, "Invalid Strava OAuth state.");
  }

  let payload: SignedOAuthStatePayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw createHttpError(400, "Invalid Strava OAuth state.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.uid || typeof payload.uid !== "string" || payload.exp < now) {
    throw createHttpError(400, "Expired Strava OAuth state.");
  }

  return payload;
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
    schema_version: COACH_INSIGHT_SCHEMA_VERSION,
    userId,
    model,
    question_type: context.questionType,
    readiness_score: context.readinessScore,
    today_workout_id: context.todayWorkoutId,
    recent_workout_summary_hash: hashValue(context.recentWorkoutSummary),
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
  const isWhitelisted = isFreeAccessUser(user);
  const subscription = isWhitelisted ? null : await findOptionalActiveUserSubscription(user.uid);
  const tier: AiAccessTier = subscription || isWhitelisted ? "paid" : "free";

  return { user, subscription, tier, accessSource: isWhitelisted ? "whitelist" : subscription ? "stripe" : "free" };
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
    const db = await getAdminDb();
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
  if (
    memoryEntry &&
    memoryEntry.expiresAt > now &&
    memoryEntry.response.schemaVersion === COACH_INSIGHT_SCHEMA_VERSION &&
    validateCoachInsight(memoryEntry.response.data)
  ) {
    return { ...memoryEntry.response, cached: true };
  }

  try {
    const db = await getAdminDb();
    const cacheSnap = await db.collection("aiResponseCache").doc(cacheKey).get();
    const cacheData = cacheSnap.exists ? cacheSnap.data() : null;
    const expiresAt = typeof cacheData?.expiresAt === "number" ? cacheData.expiresAt : 0;
    const provider = typeof cacheData?.provider === "string" ? cacheData.provider : "cache";
    const data = validateCoachInsight(cacheData?.data);
    const schemaVersion = typeof cacheData?.schemaVersion === "string" ? cacheData.schemaVersion : "";

    if (expiresAt > now && data && schemaVersion === COACH_INSIGHT_SCHEMA_VERSION) {
      const response = {
        text: data.summary,
        provider,
        data,
        schemaVersion: COACH_INSIGHT_SCHEMA_VERSION,
        cached: true,
      };
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
  const data = validateCoachInsight(response.data);
  if (!data) return;

  const cacheableResponse = {
    text: data.summary,
    provider: response.provider,
    data,
    schemaVersion: COACH_INSIGHT_SCHEMA_VERSION,
  };

  coachResponseCache.set(cacheKey, { expiresAt, response: cacheableResponse });

  try {
    const db = await getAdminDb();
    await db.collection("aiResponseCache").doc(cacheKey).set({
      ...cacheableResponse,
      expiresAt,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error: any) {
    console.error("Persistent AI cache write unavailable:", error.message);
  }
}

function parseStrictCoachJson(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function buildCoachTextResponse(data: CoachInsight, provider: string, options: { fallback?: boolean } = {}): CoachTextResponse {
  return {
    text: data.summary,
    provider,
    data,
    schemaVersion: COACH_INSIGHT_SCHEMA_VERSION,
    ...(options.fallback ? { fallback: true } : {}),
  };
}

function getFallbackData(body: any) {
  return validateCoachInsight(body?.fallbackData ?? body?.fallback_data);
}

function buildDeterministicCoachResponse(body: any, context: CoachCacheContext): CoachTextResponse {
  const fallbackData = getFallbackData(body);
  if (fallbackData) {
    return buildCoachTextResponse(fallbackData, "deterministic", { fallback: true });
  }

  const fallbackText = body?.fallbackText ?? body?.fallback_text;
  if (typeof fallbackText === "string" && fallbackText.trim().length > 0) {
    return buildCoachTextResponse(
      createFallbackCoachInsight(limitCoachWords(fallbackText), {
        confidence: 0.58,
      }),
      "deterministic",
      { fallback: true }
    );
  }

  const readiness = context.readinessScore !== "none" ? Number(context.readinessScore) : null;
  const readinessAdvice = Number.isFinite(readiness)
    ? readiness! >= 75
      ? "Readiness is high; keep the planned work controlled and avoid adding extra volume just because you feel good."
      : readiness! <= 45
        ? "Readiness is low; shorten the session or keep it very easy until the next check-in."
        : "Readiness is moderate; stay with the plan and keep the effort repeatable."
    : "Use the measured run data first, keep the next session controlled, and protect recovery before adding intensity.";
  const recommendedAction = Number.isFinite(readiness) && readiness! <= 45 ? "reduce_intensity" : "continue_plan";

  return buildCoachTextResponse(
    createFallbackCoachInsight(
      `${readinessAdvice} Judge the day by distance, duration, pace, and how well the session matched its purpose.`,
      {
        readinessMessage: readinessAdvice,
        recommendedAction,
        coachingPoints: [
          "Compare the completed distance, duration, and pace to the planned purpose.",
          "Do not force missed fitness into one run; let the next session rebuild rhythm.",
        ],
        riskLevel: recommendedAction === "reduce_intensity" ? "medium" : "low",
        confidence: 0.6,
        nextWorkoutAdjustment: {
          adjustmentType: recommendedAction === "reduce_intensity" ? "easier" : "none",
          reason: recommendedAction === "reduce_intensity"
            ? "Lower readiness means the next session should protect recovery before chasing pace."
            : "No strong signal requires a plan change from the available data.",
        },
      }
    ),
    "deterministic",
    { fallback: true }
  );
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
      schemaVersion: cachedResponse.schemaVersion,
    });
    return cachedResponse;
  }

  try {
    const providerResponse = await generateCoachText(prompt, modelName, { responseFormat: "json" });
    const parsed = parseStrictCoachJson(providerResponse.text);
    const data = validateCoachInsight(parsed);

    if (!data) {
      console.warn("Invalid AI coach JSON; using deterministic fallback", {
        userId: access.user.uid,
        eventType: "coach-opinion",
        provider: providerResponse.provider,
        questionType: context.questionType,
        responseChars: providerResponse.text.length,
      });

      return buildDeterministicCoachResponse(body, context);
    }

    const response = buildCoachTextResponse(data, providerResponse.provider);
    await cacheCoachResponse(cacheKey, response);

    console.info("AI coach response generated", {
      userId: access.user.uid,
      eventType: "coach-opinion",
      tier: access.tier,
      subscriptionId: access.subscription?.id || null,
      provider: response.provider,
      questionType: context.questionType,
      schemaVersion: response.schemaVersion,
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

export async function readJsonBody(req: any, options: { maxBytes?: number } = {}) {
  const maxBytes = options.maxBytes || MAX_JSON_BODY_BYTES;

  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const rawBody = await readRawBody(req);
  if (rawBody.length === 0) return {};
  if (rawBody.length > maxBytes) {
    throw createHttpError(413, "Request body is too large.");
  }

  try {
    return JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw createHttpError(400, "Invalid JSON body.");
  }
}
