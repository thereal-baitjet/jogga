import { getFirebaseAdminDb } from "../firebase-admin.js";
import { axios, readJsonBody, sendError, sendJson, verifyFirebaseUser } from "../_utils.js";

const GOOGLE_FIT_DATA_TYPES = {
  steps: "com.google.step_count.delta",
  distance: "com.google.distance.delta",
  calories: "com.google.calories.expended",
  heartRate: "com.google.heart_rate.summary",
  sleep: "com.google.sleep.segment",
  weight: "com.google.weight.summary",
};

function getNumberValue(value: any) {
  const rawValue = value?.fpVal ?? value?.intVal;
  return typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : 0;
}

function getPoints(data: any) {
  const buckets = Array.isArray(data?.bucket) ? data.bucket : [];
  return buckets.flatMap((bucket: any) => (
    Array.isArray(bucket?.dataset)
      ? bucket.dataset.flatMap((dataset: any) => Array.isArray(dataset?.point) ? dataset.point : [])
      : []
  ));
}

function sumPointValues(data: any) {
  return getPoints(data).reduce((sum: number, point: any) => {
    const values = Array.isArray(point?.value) ? point.value : [];
    return sum + values.reduce((valueSum: number, value: any) => valueSum + getNumberValue(value), 0);
  }, 0);
}

function averageFirstPointValues(data: any) {
  const values = getPoints(data)
    .map((point: any) => Array.isArray(point?.value) ? getNumberValue(point.value[0]) : 0)
    .filter((value: number) => value > 0);

  if (values.length === 0) return null;
  return Math.round(values.reduce((sum: number, value: number) => sum + value, 0) / values.length);
}

function latestFirstPointValue(data: any) {
  const points = getPoints(data)
    .filter((point: any) => Array.isArray(point?.value) && getNumberValue(point.value[0]) > 0)
    .sort((left: any, right: any) => Number(right?.endTimeNanos || 0) - Number(left?.endTimeNanos || 0));

  if (points.length === 0) return null;
  return Math.round(getNumberValue(points[0].value[0]) * 10) / 10;
}

function getSleepDurationMinutes(data: any) {
  return getPoints(data).reduce((sum: number, point: any) => {
    if (!point?.startTimeNanos || !point?.endTimeNanos) return sum;

    try {
      const durationMs = Number((BigInt(String(point.endTimeNanos)) - BigInt(String(point.startTimeNanos))) / 1000000n);
      return sum + Math.max(0, durationMs / 60000);
    } catch {
      const start = Number(point.startTimeNanos);
      const end = Number(point.endTimeNanos);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return sum;
      return sum + Math.max(0, (end - start) / 1000000 / 60000);
    }
  }, 0);
}

function calculateSleepScore(sleepMinutes: number) {
  if (!Number.isFinite(sleepMinutes) || sleepMinutes <= 0) return null;

  const eightHourScore = Math.min(100, Math.round((sleepMinutes / 480) * 100));
  const oversleepPenalty = sleepMinutes > 570 ? Math.min(15, Math.round((sleepMinutes - 570) / 12)) : 0;
  return Math.max(0, eightHourScore - oversleepPenalty);
}

function getTodayWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  return {
    date: start.toISOString().slice(0, 10),
    startTimeMillis: start.getTime(),
    endTimeMillis: now.getTime(),
  };
}

async function persistDailySummary(userId: string, date: string, summary: Record<string, unknown>) {
  try {
    const db = getFirebaseAdminDb();
    await db.collection("users").doc(userId).collection("healthDaily").doc(date).set(summary, { merge: true });
    return true;
  } catch (error: any) {
    console.error("Health summary persistence skipped:", error.message);
    return false;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const user = await verifyFirebaseUser(req);
    const { accessToken } = await readJsonBody(req);

    if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
      return sendJson(res, 400, { error: "No access token provided" });
    }

    const { date, startTimeMillis, endTimeMillis } = getTodayWindow();

    const fetchAggregate = async (dataTypeName: string) => {
      const response = await axios.post(
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

      return response.data;
    };

    const [stepsData, distanceData, caloriesData, heartRateData, sleepData, weightData] = await Promise.all([
      fetchAggregate(GOOGLE_FIT_DATA_TYPES.steps),
      fetchAggregate(GOOGLE_FIT_DATA_TYPES.distance),
      fetchAggregate(GOOGLE_FIT_DATA_TYPES.calories),
      fetchAggregate(GOOGLE_FIT_DATA_TYPES.heartRate),
      fetchAggregate(GOOGLE_FIT_DATA_TYPES.sleep),
      fetchAggregate(GOOGLE_FIT_DATA_TYPES.weight),
    ]);

    const sleepMinutes = Math.round(getSleepDurationMinutes(sleepData));
    const summary = {
      date,
      steps: Math.round(sumPointValues(stepsData)),
      distanceKm: Math.round((sumPointValues(distanceData) / 1000) * 100) / 100,
      activeCalories: Math.round(sumPointValues(caloriesData)),
      avgHeartRate: averageFirstPointValues(heartRateData),
      sleepMinutes,
      sleepScore: calculateSleepScore(sleepMinutes),
      weightKg: latestFirstPointValue(weightData),
      source: "google_fit",
      syncedAt: new Date().toISOString(),
    };

    const persisted = await persistDailySummary(user.uid, date, summary);

    return sendJson(res, 200, {
      summary,
      persisted,
    });
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const googleError = error.response?.data?.error;
      const message = googleError?.message || error.message || "Google Health sync failed";

      if (status === 401) {
        return sendJson(res, 401, { error: "Google Health authorization expired. Connect Health Metrics again." });
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
