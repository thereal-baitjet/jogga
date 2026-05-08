import { generateCoachText, readJsonBody, requireAiAccess, sendError, sendJson } from "./_utils.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    await requireAiAccess(req, {
      feature: "coach-opinion",
      maxRequests: 40,
      windowMs: 24 * 60 * 60 * 1000,
    });

    const { prompt, model = "gemini-1.5-flash" } = await readJsonBody(req);

    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return sendJson(res, 400, { error: "Prompt is required" });
    }

    if (prompt.length > 6000) {
      return sendJson(res, 413, { error: "Prompt is too long" });
    }

    const response = await generateCoachText(prompt, model);

    return sendJson(res, 200, response);
  } catch (error) {
    return sendError(res, error);
  }
}
