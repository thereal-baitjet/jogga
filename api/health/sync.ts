import { axios, readJsonBody, sendError, sendJson } from "../_utils.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const { accessToken } = await readJsonBody(req);

    if (!accessToken) {
      return sendJson(res, 400, { error: "No access token provided" });
    }

    const startTimeMillis = new Date().setHours(0, 0, 0, 0);
    const endTimeMillis = new Date().getTime();

    const fetchAggregate = async (dataTypeName: string) => {
      return axios.post(
        "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
        {
          aggregateBy: [{ dataTypeName }],
          bucketByTime: { durationMillis: 86400000 },
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

    return sendJson(res, 200, {
      heartRate: hrData.data,
      sleep: sleepData.data,
      weight: weightData.data,
    });
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const googleError = error.response?.data?.error;
      const message = googleError?.message || error.message || "Google Health sync failed";

      if (status === 401) {
        return sendJson(res, 401, { error: "Google Health authorization expired. Connect Google Health again." });
      }

      if (status === 403) {
        return sendJson(res, 403, {
          error: `${message}. Enable the Fitness API in Google Cloud and make sure this Google account is allowed on the OAuth consent screen.`,
        });
      }

      return sendJson(res, status, { error: message });
    }

    return sendError(res, error);
  }
}
