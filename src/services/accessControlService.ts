import type { User } from 'firebase/auth';

export type ServerAccessSource = 'free_access' | 'stripe_subscription' | 'trial' | 'none';

export interface AccessStatusResponse {
  unlocked: boolean;
  accessSource: ServerAccessSource | 'whitelist' | 'stripe' | 'admin' | string | null;
  subscriptionStatus: string | null;
  customerId: string | null;
  subscriptionId?: string | null;
  priceId?: string | null;
  planId?: string | null;
  subscriptionPlan?: string | null;
  subscriptionVerifiedAt?: string | null;
  serverFulfilled?: boolean;
  persisted?: boolean;
  reason: string;
}

export interface UserAccess {
  isAuthenticated: boolean;
  isChecking: boolean;
  uid: string | null;
  email: string | null;
  idTokenPresent: boolean;
  isFreeAccess: boolean;
  hasActiveSubscription: boolean;
  isTrialing: boolean;
  unlocked: boolean;
  accessSource: ServerAccessSource;
  subscriptionStatus: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  priceId: string | null;
  planId: string | null;
  reason: string;
  freeAccess: AccessStatusResponse | null;
  subscription: AccessStatusResponse | null;
  errors: string[];
  checkedAt: string | null;
}

export class AccessApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'AccessApiError';
    this.status = status;
    this.data = data;
  }
}

export function createLoggedOutUserAccess(): UserAccess {
  return {
    isAuthenticated: false,
    isChecking: false,
    uid: null,
    email: null,
    idTokenPresent: false,
    isFreeAccess: false,
    hasActiveSubscription: false,
    isTrialing: false,
    unlocked: false,
    accessSource: 'none',
    subscriptionStatus: null,
    customerId: null,
    subscriptionId: null,
    priceId: null,
    planId: null,
    reason: 'logged_out',
    freeAccess: null,
    subscription: null,
    errors: [],
    checkedAt: null,
  };
}

export function createCheckingUserAccess(currentUser: User): UserAccess {
  return {
    ...createLoggedOutUserAccess(),
    isAuthenticated: true,
    isChecking: true,
    uid: currentUser.uid,
    email: currentUser.email,
    reason: 'checking_access',
  };
}

export async function getFirebaseIdToken(currentUser: User) {
  const idToken = await currentUser.getIdToken();

  if (!idToken) {
    throw new AccessApiError('Firebase ID token is missing.', 401, null);
  }

  return idToken;
}

async function readAccessResponse(response: Response): Promise<AccessStatusResponse> {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Access check failed.';
    throw new AccessApiError(message, response.status, data);
  }

  return {
    unlocked: Boolean(data.unlocked),
    accessSource: typeof data.accessSource === 'string' ? data.accessSource : 'none',
    subscriptionStatus: typeof data.subscriptionStatus === 'string' ? data.subscriptionStatus : null,
    customerId: typeof data.customerId === 'string' ? data.customerId : null,
    subscriptionId: typeof data.subscriptionId === 'string' ? data.subscriptionId : null,
    priceId: typeof data.priceId === 'string' ? data.priceId : null,
    planId: typeof data.planId === 'string' ? data.planId : null,
    subscriptionPlan: typeof data.subscriptionPlan === 'string' ? data.subscriptionPlan : null,
    subscriptionVerifiedAt: typeof data.subscriptionVerifiedAt === 'string' ? data.subscriptionVerifiedAt : null,
    serverFulfilled: typeof data.serverFulfilled === 'boolean' ? data.serverFulfilled : undefined,
    persisted: typeof data.persisted === 'boolean' ? data.persisted : undefined,
    reason: typeof data.reason === 'string' ? data.reason : (data.unlocked ? 'unlocked' : 'no_access'),
  };
}

export async function fetchFreeAccessStatus(currentUser: User): Promise<AccessStatusResponse> {
  const idToken = await getFirebaseIdToken(currentUser);
  const response = await fetch('/api/free-access/status', {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  return readAccessResponse(response);
}

export async function fetchSubscriptionStatus(currentUser: User): Promise<AccessStatusResponse> {
  const idToken = await getFirebaseIdToken(currentUser);
  const response = await fetch(`/api/subscription-status?userId=${encodeURIComponent(currentUser.uid)}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  return readAccessResponse(response);
}

function normalizeAccessSource(source: unknown): ServerAccessSource {
  if (source === 'free_access' || source === 'whitelist') return 'free_access';
  if (source === 'trial') return 'trial';
  if (source === 'stripe_subscription' || source === 'stripe') return 'stripe_subscription';
  return 'none';
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function resolveUserAccess(params: {
  user: User | null;
  idTokenPresent?: boolean;
  freeAccess?: AccessStatusResponse | null;
  subscription?: AccessStatusResponse | null;
  errors?: unknown[];
}): UserAccess {
  if (!params.user) return createLoggedOutUserAccess();

  const freeAccess = params.freeAccess || null;
  const subscription = params.subscription || null;
  const freeUnlocked = Boolean(freeAccess?.unlocked);
  const subscriptionUnlocked = Boolean(subscription?.unlocked);
  const subscriptionStatus = subscription?.subscriptionStatus || freeAccess?.subscriptionStatus || null;
  const accessSource = freeUnlocked
    ? 'free_access'
    : subscriptionUnlocked
      ? normalizeAccessSource(subscription?.accessSource || (subscriptionStatus === 'trialing' ? 'trial' : 'stripe_subscription'))
      : 'none';
  const errors = (params.errors || []).map(getErrorMessage);

  return {
    isAuthenticated: true,
    isChecking: false,
    uid: params.user.uid,
    email: params.user.email,
    idTokenPresent: Boolean(params.idTokenPresent),
    isFreeAccess: freeUnlocked,
    hasActiveSubscription: subscriptionUnlocked && subscriptionStatus === 'active',
    isTrialing: subscriptionUnlocked && subscriptionStatus === 'trialing',
    unlocked: freeUnlocked || subscriptionUnlocked,
    accessSource,
    subscriptionStatus,
    customerId: subscription?.customerId || freeAccess?.customerId || null,
    subscriptionId: subscription?.subscriptionId || null,
    priceId: subscription?.priceId || null,
    planId: subscription?.planId || freeAccess?.subscriptionPlan || null,
    reason: freeUnlocked
      ? freeAccess?.reason || 'free_access'
      : subscriptionUnlocked
        ? subscription?.reason || 'stripe_subscription'
        : errors[0] || subscription?.reason || freeAccess?.reason || 'no_server_access',
    freeAccess,
    subscription,
    errors,
    checkedAt: new Date().toISOString(),
  };
}

export function shouldShowPaywall(access: UserAccess) {
  return access.isAuthenticated && !access.isChecking && !access.unlocked;
}
