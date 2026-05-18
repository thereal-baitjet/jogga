import { enforceIpRateLimit, enforceSameOrigin, generateCoachAudio, readJsonBody, requireAiAccess, sendError, sendJson } from "./_utils.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    enforceIpRateLimit(req, {
      feature: "ai:audio-cue",
      maxRequests: 12,
      windowMs: 60 * 1000,
      message: "Too many audio requests. Try again shortly.",
    });
    enforceSameOrigin(req);

    await requireAiAccess(req, {
      feature: "audio-cue",
      maxRequests: 60,
      windowMs: 24 * 60 * 60 * 1000,
    });

    const { text, voice = "Kore" } = await readJsonBody(req, { maxBytes: 4096 });

    if (typeof text !== "string" || text.trim().length === 0) {
      return sendJson(res, 400, { error: "Text is required" });
    }

    if (text.length > 1000) {
      return sendJson(res, 413, { error: "Text is too long" });
    }

    const response = await generateCoachAudio(text, voice);

    return sendJson(res, 200, response);
  } catch (error) {
    return sendError(res, error);
  }
}
