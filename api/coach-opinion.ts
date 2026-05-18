import { createCoachOpinionResponse, enforceIpRateLimit, enforceSameOrigin, readJsonBody, sendError, sendJson } from "./_utils.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    enforceIpRateLimit(req, {
      feature: "ai:coach-opinion",
      maxRequests: 24,
      windowMs: 60 * 1000,
      message: "Too many coach requests. Try again shortly.",
    });
    enforceSameOrigin(req);

    const body = await readJsonBody(req, { maxBytes: 16 * 1024 });
    const response = await createCoachOpinionResponse(req, body);

    return sendJson(res, 200, response);
  } catch (error) {
    return sendError(res, error);
  }
}
