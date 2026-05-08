import { createCoachOpinionResponse, readJsonBody, sendError, sendJson } from "./_utils.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const body = await readJsonBody(req);
    const response = await createCoachOpinionResponse(req, body);

    return sendJson(res, 200, response);
  } catch (error) {
    return sendError(res, error);
  }
}
