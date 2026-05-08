import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function parseServiceAccountJson(rawValue: string) {
  const trimmedValue = rawValue.trim();
  const jsonValue = trimmedValue.startsWith("{")
    ? trimmedValue
    : Buffer.from(trimmedValue, "base64").toString("utf8");
  const parsed = JSON.parse(jsonValue) as Record<string, string | undefined>;

  return {
    projectId: parsed.projectId || parsed.project_id,
    clientEmail: parsed.clientEmail || parsed.client_email,
    privateKey: (parsed.privateKey || parsed.private_key)?.replace(/\\n/g, "\n"),
  } as ServiceAccount;
}

function getServiceAccountFromEnv(): ServiceAccount {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey,
    };
  }

  throw new Error(
    "Firebase Admin SDK is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
  );
}

export function getFirebaseAdminDb() {
  if (getApps().length === 0) {
    const serviceAccount = getServiceAccountFromEnv();
    initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.projectId,
    });
  }

  return getFirestore();
}
