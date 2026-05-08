import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Workout, ReadinessScore, WorkoutResult, Achievement, HealthMetric, MarathonReadyingEvent, LiveWorkoutData } from './types';
import { calculateReadiness } from './services/readinessService';
import {
  generatePlanForProfile,
  generateRenderablePlan,
  getPlanReadyProfile,
  canUseApp,
  hasActiveSubscription,
  hasPriorSubscription,
  hasRenderableTrainingPlan,
  mergeWorkoutPlans,
} from './services/planService';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import WorkoutDetail from './components/WorkoutDetail';
import PostRunCheckIn from './components/PostRunCheckIn';
import PlanView from './components/PlanView';
import LiveWorkout from './components/LiveWorkout';
import ProfileView from './components/ProfileView';
import Subscription from './components/Subscription';
import LandingPage from './components/LandingPage';
import AchievementsView from './components/AchievementsView';
import HealthMetricsView from './components/HealthMetricsView';
import MarathonReadyingPulse from './components/MarathonReadyingPulse';
import { AnimatePresence, motion } from 'motion/react';
import InstallPrompt from './components/InstallPrompt';
import { Zap } from 'lucide-react';
import { auth, db, googleProvider } from './firebase';
import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User
} from 'firebase/auth';
import { doc, setDoc, collection, onSnapshot, query, writeBatch, getDocs, runTransaction } from 'firebase/firestore';
import { createRecentHistory, defaultGoalDate, isDateBeforeToday, parseLocalDate, todayISO } from './lib/date';
import { buildMarathonReadyingProfile, buildWorkoutReadyingEvent } from './services/marathonReadyingService';
import { getActualDistance } from './services/runMetricsService';
import { isCordovaRuntime, reauthenticateWithCordovaGoogle, signInWithCordovaGoogle } from './services/cordovaOAuthService';
import { buildCompletedWorkoutForFirestore, sanitizeWorkoutResultForFirestore } from './services/firestoreDataService';
import { setAnalyticsUser, trackEvent, trackPageView } from './services/analyticsService';
import { CHECKOUT_INTENT_STORAGE_KEY, CheckoutIntent, normalizeBillingPlanId } from './config/billing';

type Screen = 'onboarding' | 'dashboard' | 'workout-detail' | 'live-workout' | 'post-run' | 'plan-view' | 'subscription' | 'profile' | 'achievements' | 'health' | 'auth';

const SCREEN_PATHS: Record<Screen, string> = {
  auth: '/auth',
  onboarding: '/onboarding',
  dashboard: '/dashboard',
  'workout-detail': '/workout',
  'live-workout': '/workout/live',
  'post-run': '/workout/post-run',
  'plan-view': '/plan',
  subscription: '/subscription',
  profile: '/profile',
  achievements: '/achievements',
  health: '/health',
};

const SCREEN_TITLES: Record<Screen, string> = {
  auth: 'Jogga - Sign In',
  onboarding: 'Jogga - Onboarding',
  dashboard: 'Jogga - Dashboard',
  'workout-detail': 'Jogga - Workout Detail',
  'live-workout': 'Jogga - Live Workout',
  'post-run': 'Jogga - Post Run',
  'plan-view': 'Jogga - Training Plan',
  subscription: 'Jogga - Subscription',
  profile: 'Jogga - Profile',
  achievements: 'Jogga - Achievements',
  health: 'Jogga - Health Metrics',
};

const STRIPE_BILLING_PORTAL_URL = import.meta.env.VITE_STRIPE_BILLING_PORTAL_URL || 'https://billing.stripe.com/p/login/4gM7sL6tEfHD0P7cdw1wY00';

function isCheckoutIntent(value: unknown): value is CheckoutIntent {
  if (typeof value !== 'object' || value === null) return false;

  const intent = value as Partial<CheckoutIntent>;
  return (
    normalizeBillingPlanId(intent.planId) !== null &&
    typeof intent.trial === 'boolean' &&
    typeof intent.source === 'string' &&
    intent.source.length > 0
  );
}

function readStoredCheckoutIntent() {
  if (typeof window === 'undefined') return null;

  try {
    const storedIntent = window.sessionStorage.getItem(CHECKOUT_INTENT_STORAGE_KEY);
    if (!storedIntent) return null;

    const parsedIntent = JSON.parse(storedIntent);
    return isCheckoutIntent(parsedIntent) ? parsedIntent : null;
  } catch {
    return null;
  }
}

const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
];

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  LIST_GROUP = 'list_group',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

interface SubscriptionAccessResponse {
  unlocked?: boolean;
  serverFulfilled?: boolean;
  customerId?: string | null;
  subscriptionId?: string | null;
  subscriptionStatus?: string | null;
  priceId?: string | null;
  planId?: string | null;
}

function buildFirestoreErrorInfo(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
}

function logFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

function getFirestoreUserMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.toLowerCase().includes('permission')) {
    return 'Database permissions are blocking this account. Firestore rules need to be deployed for this project.';
  }

  if (message.toLowerCase().includes('offline') || message.toLowerCase().includes('network')) {
    return 'Database connection is offline. Check the network and retry.';
  }

  return 'Database sync failed. Your latest action could not be saved.';
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = logFirestoreError(error, operationType, path);
  throw new Error(JSON.stringify(errInfo));
}

function getFirebaseAuthCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return '';
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

function shouldUseRedirectAuth(error: unknown) {
  return [
    'auth/popup-blocked',
    'auth/cancelled-popup-request',
    'auth/operation-not-supported-in-this-environment',
  ].includes(getFirebaseAuthCode(error));
}

function isCompleteUserProfile(profile: Partial<UserProfile> | null | undefined): profile is UserProfile {
  return Boolean(
    profile &&
    typeof profile.name === 'string' && profile.name.trim().length > 0 &&
    typeof profile.experienceLevel === 'string' &&
    typeof profile.goalType === 'string' &&
    typeof profile.goalDate === 'string' && profile.goalDate.trim().length > 0 &&
    Array.isArray(profile.preferredDays) &&
    typeof profile.weeklyMileagePreference === 'number'
  );
}

function hasPremiumAccess(profile: Partial<UserProfile> | null | undefined) {
  return hasActiveSubscription(profile);
}

function getPrimaryAuthProvider(currentUser: User) {
  return currentUser.providerData[0]?.providerId || 'firebase';
}

async function ensureUserDocument(currentUser: User) {
  if (!currentUser.email) {
    throw new Error('Firebase user is missing an email address.');
  }

  const now = new Date().toISOString();
  const userRef = doc(db, 'users', currentUser.uid);
  const userRecord = {
    id: currentUser.uid,
    uid: currentUser.uid,
    email: currentUser.email,
    displayName: currentUser.displayName || null,
    photoURL: currentUser.photoURL || null,
    authProvider: getPrimaryAuthProvider(currentUser),
    lastLoginAt: now,
    updatedAt: now,
  };

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);

    if (userSnap.exists()) {
      transaction.set(userRef, userRecord, { merge: true });
      return;
    }

    transaction.set(userRef, {
      ...userRecord,
      createdAt: now,
    });
  });
}

function getGoogleAuthErrorMessage(error: unknown) {
  const code = getFirebaseAuthCode(error);

  if (code === 'auth/unauthorized-domain') {
    return 'Google sign-in is not authorized for this domain yet. Add this domain in Firebase Authentication authorized domains.';
  }

  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in was closed before it finished.';
  }

  if (code === 'auth/account-exists-with-different-credential') {
    return 'An account already exists with this email using another sign-in method.';
  }

  if (code === 'auth/user-mismatch') {
    return 'Choose the same Google account you use for Jogga.';
  }

  if (!code && error instanceof Error && error.message) {
    return error.message;
  }

  return 'Google sign-in failed. Check your connection and try again.';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(() => todayISO());
  const [screen, setScreen] = useState<Screen>('auth');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userRecord, setUserRecord] = useState<Partial<UserProfile> | null>(null);
  const [hasProfileLoaded, setHasProfileLoaded] = useState(false);
  const [hasWorkoutsLoaded, setHasWorkoutsLoaded] = useState(false);
  const [plan, setPlan] = useState<Workout[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [subscriptionRefreshNonce, setSubscriptionRefreshNonce] = useState(0);
  const [pendingCheckoutIntent, setPendingCheckoutIntent] = useState<CheckoutIntent | null>(() => readStoredCheckoutIntent());
  const [readyingEvent, setReadyingEvent] = useState<MarathonReadyingEvent | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isRestoringSubscriptionAccess, setIsRestoringSubscriptionAccess] = useState(false);
  const screenRef = useRef(screen);
  const processedStripeSessionRef = useRef<string | null>(null);
  const checkedSubscriptionRecoveryRef = useRef<string | null>(null);
  const completedOnboardingUidRef = useRef<string | null>(null);
  const planRecoveryKeyRef = useRef<string | null>(null);
  const accessRecord = React.useMemo(() => (
    profile || userRecord ? { ...userRecord, ...profile } : null
  ), [profile, userRecord]);
  const renderedPlan = React.useMemo(() => (
    profile && hasPremiumAccess(accessRecord)
      ? generateRenderablePlan(profile, plan, currentDate)
      : plan
  ), [accessRecord, currentDate, plan, profile]);

  const savePendingCheckoutIntent = React.useCallback((intent: CheckoutIntent) => {
    setPendingCheckoutIntent(intent);

    try {
      window.sessionStorage.setItem(CHECKOUT_INTENT_STORAGE_KEY, JSON.stringify(intent));
    } catch (error) {
      console.error('Failed to store checkout intent', error);
    }
  }, []);

  const clearPendingCheckoutIntent = React.useCallback(() => {
    setPendingCheckoutIntent(null);

    try {
      window.sessionStorage.removeItem(CHECKOUT_INTENT_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear checkout intent', error);
    }
  }, []);

  const applySubscriptionAccess = async (data: SubscriptionAccessResponse) => {
    if (!user || !data.unlocked) return false;

    const now = new Date().toISOString();
    const subscriptionUpdate = {
      isUnlocked: true,
      stripeCustomerId: data.customerId ?? userRecord?.stripeCustomerId ?? profile?.stripeCustomerId ?? null,
      stripeSubscriptionId: data.subscriptionId ?? userRecord?.stripeSubscriptionId ?? profile?.stripeSubscriptionId ?? null,
      stripePriceId: data.priceId ?? userRecord?.stripePriceId ?? profile?.stripePriceId ?? null,
      subscriptionStatus: data.subscriptionStatus ?? userRecord?.subscriptionStatus ?? profile?.subscriptionStatus ?? null,
      subscriptionPlan: data.planId ?? userRecord?.subscriptionPlan ?? profile?.subscriptionPlan ?? null,
      subscriptionVerifiedAt: now,
      updatedAt: now,
    };

    const mergedRecord = { ...userRecord, ...profile, ...subscriptionUpdate };
    setIsUnlocked(true);
    setUserRecord(mergedRecord);

    if (isCompleteUserProfile(mergedRecord)) {
      setProfile(mergedRecord);
      return true;
    }

    return false;
  };

  const restoreSubscriptionAccess = async () => {
    if (!user) return false;

    setIsRestoringSubscriptionAccess(true);
    try {
      const response = await fetch(`/api/subscription-status?userId=${encodeURIComponent(user.uid)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to verify subscription status.');
      }

      if (!data.unlocked) {
        trackEvent('subscription_restore', { result: 'inactive' });
        return false;
      }

      const hasCompleteProfile = await applySubscriptionAccess(data);
      trackEvent('subscription_restore', {
        result: 'active',
        subscription_status: data.subscriptionStatus,
        plan_id: data.planId,
      });
      setScreen(hasCompleteProfile ? 'dashboard' : 'onboarding');
      return true;
    } catch (error) {
      console.error('Stripe subscription restore failed', error);
      return false;
    } finally {
      setIsRestoringSubscriptionAccess(false);
    }
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    trackEvent('pwa_install_prompt_response', { outcome });
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  useEffect(() => {
    screenRef.current = screen;
    trackPageView(SCREEN_PATHS[screen], SCREEN_TITLES[screen], { screen });
  }, [screen]);

  useEffect(() => {
    setAnalyticsUser(user?.uid);
  }, [user?.uid]);

  useEffect(() => {
    if (isUnlocked && pendingCheckoutIntent) {
      clearPendingCheckoutIntent();
    }
  }, [clearPendingCheckoutIntent, isUnlocked, pendingCheckoutIntent]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDate((previousDate) => {
        const nextDate = todayISO();
        return previousDate === nextDate ? previousDate : nextDate;
      });
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);
  const [liveWorkoutData, setLiveWorkoutData] = useState<LiveWorkoutData | null>(null);
  const [fitbitTokens, setFitbitTokens] = useState<any>(null); // Keeping name for now or renaming to healthTokens
  const [healthTokens, setHealthTokens] = useState<any>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([
    { id: '1', title: 'First Run', description: 'Complete your first workout.', iconName: 'medal', category: 'milestone' },
    { id: '2', title: 'Early Bird', description: 'Complete a workout before 7 AM.', iconName: 'zap', category: 'milestone' },
    { id: '3', title: '5k Finisher', description: 'Run a total of 5km in one session.', iconName: 'target', category: 'distance' },
    { id: '4', title: 'Consistency King', description: 'Maintain a 7-day streak.', iconName: 'award', category: 'consistency' },
    { id: '5', title: 'Speed Demon', description: 'Hit a pace faster than 5:00 min/km.', iconName: 'zap', category: 'speed' },
  ]);

  useEffect(() => {
    const completedWorkouts = plan.filter(w => w.status === 'completed');
    
    const updatedAchievements = achievements.map(a => {
      let unlockedAt: string | undefined = a.unlockedAt;
      let progress = a.progress || 0;

      switch (a.id) {
        case '1':
          if (completedWorkouts.length > 0 && !unlockedAt) {
            unlockedAt = completedWorkouts[0].result?.completedAt;
          }
          break;
        case '2':
          if (!unlockedAt) {
            const earlyRun = completedWorkouts.find(w => {
              if (!w.result?.completedAt) return false;
              return new Date(w.result.completedAt).getHours() < 7;
            });
            if (earlyRun) unlockedAt = earlyRun.result?.completedAt;
          }
          break;
        case '3':
          if (!unlockedAt) {
            const fiveK = completedWorkouts.find(w => getActualDistance(w) >= 5);
            if (fiveK) {
              unlockedAt = fiveK.result?.completedAt;
              progress = 100;
            } else {
              const maxDist = Math.max(...completedWorkouts.map(getActualDistance), 0);
              progress = Math.min(100, Math.round((maxDist / 5) * 100));
            }
          }
          break;
        case '4':
          if (!unlockedAt) {
            // Simple streak calculation: check if there are 7 consecutive days with completed workouts
            const dates = completedWorkouts.map(w => w.date).sort();
            let streak = 1;
            let maxStreak = 1;
            for (let i = 1; i < dates.length; i++) {
              const diff = (parseLocalDate(dates[i]).getTime() - parseLocalDate(dates[i - 1]).getTime()) / (1000 * 60 * 60 * 24);
              if (diff === 1) {
                streak++;
              } else {
                streak = 1;
              }
              maxStreak = Math.max(maxStreak, streak);
            }
            progress = Math.min(100, Math.round((maxStreak / 7) * 100));
            if (maxStreak >= 7) unlockedAt = new Date().toISOString();
          }
          break;
        case '5':
          if (!unlockedAt) {
            const fastRun = completedWorkouts.find(w => {
              const pace = w.result?.avgPace; // e.g., "5:30 min/km"
              if (!pace) return false;
              const [mins, secs] = pace.split(':').map(Number);
              return (mins * 60 + secs) < (5 * 60);
            });
            if (fastRun) unlockedAt = fastRun.result?.completedAt;
          }
          break;
      }
      return { ...a, unlockedAt, progress };
    });

    setAchievements(updatedAchievements);
  }, [plan]);

  const [healthMetrics, setHealthMetrics] = useState<HealthMetric[]>(() => [
    { 
      id: 'hr', type: 'hr', label: 'Resting HR', value: 58, unit: 'bpm', trend: 'down', updatedAt: new Date().toISOString(),
      history: createRecentHistory([62, 61, 60, 59, 58])
    },
    { 
      id: 'sleep', type: 'sleep', label: 'Sleep Score', value: 82, unit: '/100', trend: 'up', updatedAt: new Date().toISOString(),
      history: createRecentHistory([75, 78, 80, 81, 82])
    },
    { 
      id: 'vo2max', type: 'vo2max', label: 'VO2 Max', value: 48, unit: 'ml/kg/min', trend: 'stable', updatedAt: new Date().toISOString(),
      history: createRecentHistory([47.5, 47.6, 47.8, 47.9, 48])
    },
    { 
      id: 'weight', type: 'weight', label: 'Weight', value: 74.5, unit: 'kg', trend: 'down', updatedAt: new Date().toISOString(),
      history: createRecentHistory([76, 75.8, 75.5, 75, 74.5])
    },
  ]);
  const [readiness, setReadiness] = useState<ReadinessScore>({
    score: 84,
    consistency: 91,
    fatigue: 45,
    progress: 0,
    streak: 0,
    trend: 4,
    updatedAt: new Date().toISOString()
  });
  const marathonReadying = React.useMemo(() => buildMarathonReadyingProfile(renderedPlan, achievements), [achievements, renderedPlan]);
  const clearReadyingEvent = React.useCallback(() => setReadyingEvent(null), []);

  // Calculate Readiness based on recent workouts
  useEffect(() => {
    if (plan.length === 0) return;
    setReadiness(calculateReadiness(plan));
  }, [plan]);

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (currentUser) {
        setAuthError(null);
        setDatabaseError(null);
        void ensureUserDocument(currentUser).catch((error) => {
          console.error('Failed to initialize Firestore user document', error);
          setDatabaseError(getFirestoreUserMessage(error));
        });
      }
      if (!currentUser) {
        setProfile(null);
        setUserRecord(null);
        setHasProfileLoaded(false);
        setDatabaseError(null);
        setScreen('auth');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;

    getRedirectResult(auth)
      .then((result) => {
        if (result?.user && isMounted) {
          setAuthError(null);
        }
      })
      .catch((error) => {
        console.error('Redirect login failed', error);
        if (isMounted) {
          setAuthError(getGoogleAuthErrorMessage(error));
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // OAuth Message Listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        if (event.data.provider === 'google') {
          setHealthTokens(event.data.tokens);
          if (profile && user) {
            const updatedProfile = { 
              ...profile, 
              isHealthConnected: true, 
              healthProvider: 'google' as const 
            };
            setProfile(updatedProfile);
            setDoc(doc(db, 'users', user.uid), updatedProfile, { merge: true });
          }
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [profile, user]);

  const requestGoogleHealthAccess = async () => {
    const currentUser = auth.currentUser || user;

    if (!currentUser) {
      throw new Error('Sign in before connecting Google Health.');
    }

    if (isCordovaRuntime()) {
      try {
        const result = await reauthenticateWithCordovaGoogle(currentUser, GOOGLE_HEALTH_SCOPES);
        const accessToken = result.accessToken;

        if (!accessToken) {
          throw new Error('Google did not return a health access token. Try connecting again and approve the requested health permissions.');
        }

        setHealthTokens({ access_token: accessToken });
        trackEvent('health_connected', {
          provider: 'google',
          runtime: 'cordova',
        });

        const now = new Date().toISOString();
        if (profile) {
          const updatedProfile = {
            ...profile,
            isHealthConnected: true,
            healthProvider: 'google' as const,
            updatedAt: now,
          };

          setProfile(updatedProfile);
          await setDoc(doc(db, 'users', currentUser.uid), {
            isHealthConnected: true,
            healthProvider: 'google',
            updatedAt: now,
          }, { merge: true });
        }

        return accessToken;
      } catch (error) {
        console.error('Cordova Google Health authorization failed', error);
        if (error instanceof Error) {
          throw new Error(error.message);
        }
        throw new Error('Google Health authorization failed. Check your connection and try again.');
      }
    }

    const provider = new GoogleAuthProvider();
    GOOGLE_HEALTH_SCOPES.forEach((scope) => provider.addScope(scope));
    provider.setCustomParameters({
      prompt: 'consent select_account',
    });

    try {
      const result = await reauthenticateWithPopup(currentUser, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;

      if (!accessToken) {
        throw new Error('Google did not return a health access token. Try connecting again and approve the requested health permissions.');
      }

      setHealthTokens({ access_token: accessToken });
      trackEvent('health_connected', {
        provider: 'google',
        runtime: 'web',
      });

      const now = new Date().toISOString();

      if (profile) {
        const updatedProfile = {
          ...profile,
          isHealthConnected: true,
          healthProvider: 'google' as const,
          updatedAt: now,
        };

        setProfile(updatedProfile);
        await setDoc(doc(db, 'users', currentUser.uid), {
          isHealthConnected: true,
          healthProvider: 'google',
          updatedAt: now,
        }, { merge: true });
      }

      return accessToken;
    } catch (error) {
      console.error('Google Health authorization failed', error);

      const code = getFirebaseAuthCode(error);
      if (code === 'auth/popup-blocked') {
        throw new Error('Allow pop-ups to connect Google Health.');
      }

      if (!code && error instanceof Error) {
        throw new Error(error.message);
      }

      throw new Error(getGoogleAuthErrorMessage(error));
    }
  };

  const syncGoogleHealthWithToken = async (accessToken: string) => {
    const response = await fetch('/api/health/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Google Health sync failed.');
      }

      // Update local health metrics based on Google Fit data
      const updatedMetrics = healthMetrics.map(metric => {
        if (metric.type === 'hr') {
          // Google Fit aggregate data structure
          const points = data.heartRate?.bucket?.[0]?.dataset?.[0]?.point;
          const latestHR = points?.[0]?.value?.[0]?.fpVal || points?.[0]?.value?.[0]?.intVal;
          if (latestHR) {
            return {
              ...metric,
              value: Math.round(latestHR),
              updatedAt: new Date().toISOString(),
              history: [...metric.history.slice(1), { date: todayISO(), value: Math.round(latestHR) }]
            };
          }
        }
        if (metric.type === 'sleep') {
          const points = data.sleep?.bucket?.[0]?.dataset?.[0]?.point;
          // Sleep segment data is complex, usually we sum up segments
          const totalSleepMillis = points?.reduce((sum: number, p: any) => sum + (p.endTimeNanos - p.startTimeNanos) / 1000000, 0) || 0;
          const latestSleepMinutes = totalSleepMillis / 60000;
          
          if (latestSleepMinutes > 0) {
            const score = Math.min(100, Math.round((latestSleepMinutes / 480) * 100));
            return {
              ...metric,
              value: score,
              updatedAt: new Date().toISOString(),
              history: [...metric.history.slice(1), { date: todayISO(), value: score }]
            };
          }
        }
        if (metric.type === 'weight') {
          const points = data.weight?.bucket?.[0]?.dataset?.[0]?.point;
          const latestWeight = points?.[0]?.value?.[0]?.fpVal;
          if (latestWeight) {
            return {
              ...metric,
              value: Math.round(latestWeight * 10) / 10,
              updatedAt: new Date().toISOString(),
              history: [...metric.history.slice(1), { date: todayISO(), value: Math.round(latestWeight * 10) / 10 }]
            };
          }
        }
        return metric;
      });

      setHealthMetrics(updatedMetrics);
      trackEvent('health_sync', {
        provider: 'google',
        metric_count: updatedMetrics.length,
      });
  };

  const handleConnectGoogleHealth = async () => {
    const accessToken = await requestGoogleHealthAccess();
    await syncGoogleHealthWithToken(accessToken);
  };

  const handleSyncHealth = async () => {
    const accessToken = healthTokens?.access_token || await requestGoogleHealthAccess();
    await syncGoogleHealthWithToken(accessToken);
  };

  // Firestore Data Sync
  useEffect(() => {
    if (!user) return;

    setHasProfileLoaded(false);
    setHasWorkoutsLoaded(false);

    // Sync Profile
    const profileRef = doc(db, 'users', user.uid);
    const unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
      setHasProfileLoaded(true);
      setDatabaseError(null);

      if (docSnap.exists()) {
        const data = docSnap.data() as Partial<UserProfile>;
        const unlocked = hasPremiumAccess(data);
        const normalizedRecord = { ...data, isUnlocked: unlocked };
        const completedProfile = isCompleteUserProfile(data);

        setUserRecord(normalizedRecord);
        setIsUnlocked(unlocked);
        if (data.readinessScore) {
          setReadiness(data.readinessScore as ReadinessScore);
        }

        if (completedProfile) {
          setProfile({ ...data, isUnlocked: unlocked });
          if (unlocked) {
            if (screenRef.current === 'auth' || screenRef.current === 'onboarding' || screenRef.current === 'subscription') {
              setScreen('dashboard');
            }
          }
          return;
        }

        setProfile(null);
        if (completedOnboardingUidRef.current === user.uid) {
          if (screenRef.current !== 'subscription') {
            setScreen('subscription');
          }
          return;
        }

        if (screenRef.current === 'auth' || screenRef.current === 'dashboard' || screenRef.current === 'profile') {
          setScreen('onboarding');
        }
      } else {
        setProfile(null);
        setUserRecord(null);
        setIsUnlocked(false);
        if (completedOnboardingUidRef.current === user.uid) {
          if (screenRef.current !== 'subscription') {
            setScreen('subscription');
          }
          return;
        }
        // New user, go to onboarding
        if (screenRef.current === 'auth') {
          setScreen('onboarding');
        }
      }
    }, (error) => {
      setHasProfileLoaded(true);
      logFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      setDatabaseError(getFirestoreUserMessage(error));
    });

    // Sync Plan
    const workoutsRef = collection(db, 'users', user.uid, 'workouts');
    const q = query(workoutsRef);
    const unsubscribeWorkouts = onSnapshot(q, (querySnap) => {
      setHasWorkoutsLoaded(true);
      const workouts: Workout[] = [];
      const missedBatch = writeBatch(db);
      let missedUpdates = 0;

      querySnap.forEach((docSnap) => {
        const workout = docSnap.data() as Workout;
        if (workout.status === 'planned' && isDateBeforeToday(workout.date)) {
          workout.status = 'missed';
          missedBatch.set(docSnap.ref, { status: 'missed' }, { merge: true });
          missedUpdates++;
        }

        workouts.push(workout);
      });

      if (missedUpdates > 0) {
        missedBatch.commit().catch((error) => {
          console.error('Failed to mark missed workouts', error);
        });
      }

      // Sort by date
      workouts.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
      setPlan(workouts);
      setDatabaseError(null);

      // Update readiness based on new data
      const newReadiness = calculateReadiness(workouts);
      setReadiness(newReadiness);
    }, (error) => {
      setHasWorkoutsLoaded(true);
      logFirestoreError(error, OperationType.LIST, `users/${user.uid}/workouts`);
      setDatabaseError(getFirestoreUserMessage(error));
    });

    return () => {
      unsubscribeProfile();
      unsubscribeWorkouts();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setHasProfileLoaded(false);
      setHasWorkoutsLoaded(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !profile || !hasProfileLoaded || !hasWorkoutsLoaded || isGeneratingPlan) return;
    if (!hasPremiumAccess(accessRecord)) return;
    if (hasRenderableTrainingPlan(plan, currentDate)) return;

    const generatedPlan = generatePlanForProfile(profile);
    if (generatedPlan.length === 0) return;

    const mergedPlan = mergeWorkoutPlans(plan, generatedPlan);
    if (mergedPlan.length > plan.length) {
      setPlan(mergedPlan);
    }

    const existingWorkoutIds = new Set(plan.map(workout => workout.id));
    const workoutsToPersist = generatedPlan.filter(workout => !existingWorkoutIds.has(workout.id));
    if (workoutsToPersist.length === 0) return;

    const recoveryKey = [
      user.uid,
      currentDate,
      profile.goalType,
      profile.goalDate,
      profile.experienceLevel,
      profile.preferredDays.join(','),
      profile.weeklyMileagePreference,
    ].join('|');

    if (planRecoveryKeyRef.current === recoveryKey) return;
    planRecoveryKeyRef.current = recoveryKey;

    const batch = writeBatch(db);
    workoutsToPersist.forEach(workout => {
      batch.set(doc(db, 'users', user.uid, 'workouts', workout.id), { ...workout, uid: user.uid });
    });

    batch.commit().then(() => {
      setDatabaseError(null);
    }).catch((error) => {
      console.error('Failed to persist recovered plan', error);
      setDatabaseError(getFirestoreUserMessage(error));
    });
  }, [accessRecord, currentDate, hasProfileLoaded, hasWorkoutsLoaded, isGeneratingPlan, plan, profile, user]);

  useEffect(() => {
    if (!user || !profile || !hasProfileLoaded || !hasWorkoutsLoaded || isGeneratingPlan) return;

    if (canUseApp(accessRecord, plan, currentDate)) {
      if (screenRef.current === 'auth' || screenRef.current === 'onboarding' || screenRef.current === 'subscription') {
        setScreen('dashboard');
      }
      return;
    }

    if (screenRef.current !== 'subscription') {
      setScreen('subscription');
    }
  }, [accessRecord, currentDate, hasProfileLoaded, hasWorkoutsLoaded, isGeneratingPlan, plan, profile, user]);

  useEffect(() => {
    if (!user || plan.length === 0) return;

    const todayBoundary = parseLocalDate(currentDate);
    const missedWorkouts = plan.filter(workout => (
      workout.status === 'planned' && isDateBeforeToday(workout.date, todayBoundary)
    ));

    if (missedWorkouts.length === 0) return;

    const batch = writeBatch(db);
    missedWorkouts.forEach((workout) => {
      batch.set(doc(db, 'users', user.uid, 'workouts', workout.id), { status: 'missed' }, { merge: true });
    });

    setPlan(prevPlan => prevPlan.map(workout => (
      missedWorkouts.some(missed => missed.id === workout.id)
        ? { ...workout, status: 'missed' }
        : workout
    )));

    batch.commit().catch((error) => {
      console.error('Failed to roll workouts into missed status', error);
    });
  }, [currentDate, plan, user]);

  // Handle Stripe Success
  useEffect(() => {
    if (!user || !hasProfileLoaded) return;
    
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (!sessionId) return;
    if (processedStripeSessionRef.current === sessionId) return;
    processedStripeSessionRef.current = sessionId;

    let cancelled = false;

    const clearSessionFromUrl = () => {
      params.delete('session_id');
      const nextQuery = params.toString();
      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`
      );
    };

    const verifyCheckout = async () => {
      try {
        const response = await fetch(`/api/checkout-session?sessionId=${encodeURIComponent(sessionId)}&userId=${encodeURIComponent(user.uid)}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Unable to verify checkout.');
        }

        if (!data.unlocked) {
          throw new Error('Checkout was not completed.');
        }

        const hasCompleteProfile = await applySubscriptionAccess(data);
        clearPendingCheckoutIntent();
        trackEvent('checkout_verified', {
          result: 'unlocked',
          subscription_status: data.subscriptionStatus,
          plan_id: data.planId,
        });

        if (!cancelled) {
          setScreen(hasCompleteProfile ? 'dashboard' : 'onboarding');
        }
      } catch (error) {
        console.error('Stripe checkout verification failed', error);
        trackEvent('checkout_verified', { result: 'error' });
        if (!cancelled) {
          const restored = await restoreSubscriptionAccess();
          if (!restored && !cancelled) {
            setScreen('subscription');
          }
        }
      } finally {
        clearSessionFromUrl();
      }
    };

    verifyCheckout();

    return () => {
      cancelled = true;
    };
  }, [clearPendingCheckoutIntent, user, profile, userRecord, hasProfileLoaded]);

  useEffect(() => {
    if (!user || !hasProfileLoaded || !hasPriorSubscription(userRecord)) return;

    const params = new URLSearchParams(window.location.search);
    if (params.has('session_id')) return;
    if (checkedSubscriptionRecoveryRef.current === user.uid) return;

    checkedSubscriptionRecoveryRef.current = user.uid;
    let cancelled = false;

    const recoverExistingSubscription = async () => {
      try {
        const response = await fetch(`/api/subscription-status?userId=${encodeURIComponent(user.uid)}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Unable to verify subscription status.');
        }

        if (cancelled) return;

        if (!data.unlocked) {
          const now = new Date().toISOString();
          const subscriptionUpdate = {
            isUnlocked: false,
            subscriptionStatus: data.subscriptionStatus ?? 'inactive',
            subscriptionVerifiedAt: now,
            updatedAt: now,
          };

          const updatedRecord = { ...userRecord, ...profile, ...subscriptionUpdate };
          setIsUnlocked(false);
          setUserRecord(updatedRecord);
          if (profile) {
            setProfile({ ...profile, ...subscriptionUpdate });
          }

          setScreen('subscription');
          return;
        }

        const hasCompleteProfile = await applySubscriptionAccess(data);

        if (cancelled) return;

        if (hasCompleteProfile) {
          setScreen('dashboard');
        } else if (screenRef.current === 'auth' || screenRef.current === 'subscription') {
          setScreen('onboarding');
        }
      } catch (error) {
        console.error('Stripe subscription recovery failed', error);
      }
    };

    recoverExistingSubscription();

    return () => {
      cancelled = true;
    };
  }, [currentDate, hasProfileLoaded, plan, profile, subscriptionRefreshNonce, user, userRecord]);

  const openHostedBillingPortal = () => {
    window.location.href = STRIPE_BILLING_PORTAL_URL;
  };

  const handleManageSubscription = async () => {
    if (!user || !profile?.stripeCustomerId) {
      openHostedBillingPortal();
      return;
    }

    try {
      const response = await fetch('/api/create-billing-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: profile.stripeCustomerId,
          subscriptionId: profile.stripeSubscriptionId,
          userId: user.uid,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to open billing settings.');
      }

      if (typeof data.url !== 'string') {
        throw new Error('Stripe did not return a billing portal URL.');
      }

      window.location.href = data.url;
    } catch (error) {
      console.error('Falling back to hosted Stripe billing portal login:', error);
      openHostedBillingPortal();
    }
  };

  useEffect(() => {
    if (!profile) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') !== 'updated') return;

    params.delete('billing');
    const nextQuery = params.toString();
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`
    );
    checkedSubscriptionRecoveryRef.current = null;
    setSubscriptionRefreshNonce((value) => value + 1);
    setScreen('profile');
  }, [profile]);

  const handleLogin = async () => {
    setAuthError(null);

    try {
      if (isCordovaRuntime()) {
        await signInWithCordovaGoogle(auth);
        trackEvent('login', { method: 'google', runtime: 'cordova' });
        return;
      }

      await signInWithPopup(auth, googleProvider);
      trackEvent('login', { method: 'google', runtime: 'web' });
    } catch (error) {
      console.error('Login failed', error);
      if (shouldUseRedirectAuth(error)) {
        try {
          await signInWithRedirect(auth, googleProvider);
          trackEvent('login_redirect_started', { method: 'google' });
          return;
        } catch (redirectError) {
          console.error('Redirect login failed', redirectError);
          setAuthError(getGoogleAuthErrorMessage(redirectError));
          return;
        }
      }

      setAuthError(getGoogleAuthErrorMessage(error));
    }
  };

  const handleLandingStart = (intent: CheckoutIntent) => {
    savePendingCheckoutIntent(intent);
    void handleLogin();
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      trackEvent('logout');
      completedOnboardingUidRef.current = null;
      checkedSubscriptionRecoveryRef.current = null;
      processedStripeSessionRef.current = null;
      setProfile(null);
      setPlan([]);
      setHasWorkoutsLoaded(false);
      setScreen('auth');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const handleOnboardingComplete = async (newProfile: UserProfile) => {
    if (!user) return;

    if (hasPriorSubscription(accessRecord) && !hasPremiumAccess(accessRecord)) {
      setScreen('subscription');
      return;
    }
    
    setIsGeneratingPlan(true);
    completedOnboardingUidRef.current = user.uid;
    
    const now = new Date().toISOString();
    const newPlan = generatePlanForProfile(newProfile);
    const profileWithUid = {
      ...newProfile,
      id: user.uid, // Ensure ID is set
      uid: user.uid,
      email: user.email || '',
      displayName: newProfile.name,
      photoURL: user.photoURL || null,
      authProvider: getPrimaryAuthProvider(user),
      createdAt: userRecord?.createdAt || now,
      updatedAt: now,
      profileCompleted: true,
      readinessScore: readiness
    };
    
    try {
      // Keep the transition visible without delaying the paywall during demos.
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Save profile without wiping payment fields that may have been written after Stripe Checkout.
      await setDoc(doc(db, 'users', user.uid), profileWithUid, { merge: true });
      
      // Clear old planned workouts first
      const workoutsRef = collection(db, 'users', user.uid, 'workouts');
      const snapshot = await getDocs(workoutsRef);
      const batch = writeBatch(db);
      const preservedWorkouts: Workout[] = [];
      const preservedWorkoutIds = new Set<string>();
      
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.status !== 'completed') {
          batch.delete(docSnap.ref);
        } else {
          const workout = { ...data, id: data.id || docSnap.id } as Workout;
          preservedWorkouts.push(workout);
          preservedWorkoutIds.add(workout.id);
        }
      });
      
      // Save new plan
      newPlan.forEach(workout => {
        if (preservedWorkoutIds.has(workout.id)) return;
        const workoutRef = doc(db, 'users', user.uid, 'workouts', workout.id);
        batch.set(workoutRef, { ...workout, uid: user.uid });
      });
      await batch.commit();

      const accessAfterSave = isUnlocked || hasPremiumAccess(userRecord);
      trackEvent('plan_generated', {
        source: 'onboarding',
        goal_type: newProfile.goalType,
        workout_count: newPlan.length,
        unlocked_after_save: accessAfterSave,
      });
      
      const savedProfile = {
        ...userRecord,
        ...profileWithUid,
        isUnlocked: accessAfterSave,
      };

      setProfile(savedProfile);
      setUserRecord(savedProfile);
      setIsUnlocked(accessAfterSave);
      setPlan(mergeWorkoutPlans(preservedWorkouts, newPlan));
      setDatabaseError(null);
      setIsGeneratingPlan(false);
      setScreen(accessAfterSave ? 'dashboard' : 'subscription');
    } catch (error) {
      console.error('Failed to save data', error);
      completedOnboardingUidRef.current = null;
      setIsGeneratingPlan(false);
      setDatabaseError(getFirestoreUserMessage(error));
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const handleSelectWorkout = (workout: Workout) => {
    setSelectedWorkout(workout);
    setScreen('workout-detail');
  };

  const handleStartWorkout = () => {
    if (selectedWorkout) {
      trackEvent('workout_started', {
        workout_type: selectedWorkout.type,
        workout_status: selectedWorkout.status,
      });
    }
    setScreen('live-workout');
  };

  const handleLiveWorkoutComplete = (data: LiveWorkoutData) => {
    trackEvent('live_workout_finished', {
      distance_km: Math.round(data.distance * 100) / 100,
      duration_seconds: data.durationSeconds,
      gps_points: data.path.length,
    });
    setLiveWorkoutData(data);
    setScreen('post-run');
  };

  const handlePostRunComplete = async (result: WorkoutResult) => {
    if (!selectedWorkout || !user) return;

    // Phase 3: Batch Sync (Firebase Backend)
    // Perform a single batch write to Firestore
    try {
      const sanitizedResult = sanitizeWorkoutResultForFirestore(result);
      const completedWorkout = buildCompletedWorkoutForFirestore(selectedWorkout, user.uid, sanitizedResult);
      const batch = writeBatch(db);
      const planForUpdate = plan.some(workout => workout.id === selectedWorkout.id)
        ? plan
        : mergeWorkoutPlans(plan, [selectedWorkout]);
      const updatedPlan = planForUpdate.map(workout => (
        workout.id === selectedWorkout.id
          ? {
              ...completedWorkout,
              id: workout.id,
              date: workout.date,
              type: workout.type,
              durationMinutes: workout.durationMinutes,
              distanceTarget: workout.distanceTarget,
              paceTarget: workout.paceTarget,
              effortTarget: workout.effortTarget,
              instructions: workout.instructions,
            }
          : workout
      ));
      
      // 1. Update workout document with summary and telemetry
      const workoutRef = doc(db, 'users', user.uid, 'workouts', selectedWorkout.id);
      batch.set(workoutRef, completedWorkout);

      const newReadiness = calculateReadiness(updatedPlan);

      await batch.commit();
      trackEvent('workout_completed', {
        workout_type: selectedWorkout.type,
        distance_km: getActualDistance(completedWorkout),
        readiness_score: newReadiness.score,
      });

      setDoc(doc(db, 'users', user.uid), {
        readinessScore: newReadiness,
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch((error) => {
        console.error('Workout saved, but readiness profile sync failed', error);
      });

      setPlan(updatedPlan);
      setReadiness(newReadiness);
      setReadyingEvent(buildWorkoutReadyingEvent(completedWorkout));
      setDatabaseError(null);
      setScreen('dashboard');
      setSelectedWorkout(null);
    } catch (error) {
      console.error('Failed to update workout batch', error);
      setDatabaseError(getFirestoreUserMessage(error));
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/workouts/${selectedWorkout.id}`);
    }
  };

  const handleProfileUpdate = async (updatedProfile: UserProfile) => {
    if (!user) return;
    try {
      const profileToSave = {
        ...updatedProfile,
        goalDate: isDateBeforeToday(updatedProfile.goalDate) ? defaultGoalDate() : updatedProfile.goalDate,
        readinessScore: readiness,
        displayName: updatedProfile.name,
        profileCompleted: true,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'users', user.uid), profileToSave, { merge: true });
      trackEvent('profile_updated', {
        goal_type: profileToSave.goalType,
        experience_level: profileToSave.experienceLevel,
      });
      setProfile(profileToSave);
      setDatabaseError(null);
    } catch (error) {
      console.error('Failed to update profile', error);
      setDatabaseError(getFirestoreUserMessage(error));
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleRegeneratePlan = async () => {
    if (!user || !profile) return;

    if (!hasPremiumAccess(accessRecord)) {
      setScreen('subscription');
      return;
    }
    
    setIsGeneratingPlan(true);
    const profileForPlan = {
      ...profile,
      goalDate: isDateBeforeToday(profile.goalDate) ? defaultGoalDate() : profile.goalDate,
    };
    const newPlan = generatePlanForProfile(profileForPlan);
    
    try {
      const workoutsRef = collection(db, 'users', user.uid, 'workouts');
      const snapshot = await getDocs(workoutsRef);
      const batch = writeBatch(db);
      const preservedWorkouts: Workout[] = [];
      const preservedWorkoutIds = new Set<string>();
      
      // Delete existing planned workouts to prevent duplicates and "weird" overlaps
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.status !== 'completed') {
          batch.delete(docSnap.ref);
        } else {
          const workout = { ...data, id: data.id || docSnap.id } as Workout;
          preservedWorkouts.push(workout);
          preservedWorkoutIds.add(workout.id);
        }
      });
      
      newPlan.forEach(workout => {
        if (preservedWorkoutIds.has(workout.id)) return;
        const workoutRef = doc(db, 'users', user.uid, 'workouts', workout.id);
        batch.set(workoutRef, { ...workout, uid: user.uid });
      });

      if (profileForPlan.goalDate !== profile.goalDate) {
        batch.set(doc(db, 'users', user.uid), { goalDate: profileForPlan.goalDate, updatedAt: new Date().toISOString() }, { merge: true });
      }
      
      await batch.commit();
      trackEvent('plan_generated', {
        source: 'profile_regenerate',
        goal_type: profileForPlan.goalType,
        workout_count: newPlan.length,
      });
      setProfile(profileForPlan);
      setPlan(mergeWorkoutPlans(preservedWorkouts, newPlan));
      setDatabaseError(null);
      setIsGeneratingPlan(false);
      alert('Training plan has been updated based on your new goals!');
    } catch (error) {
      console.error('Failed to regenerate plan', error);
      setIsGeneratingPlan(false);
      setDatabaseError(getFirestoreUserMessage(error));
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/workouts`);
    }
  };

  return (
    <div className="bg-zinc-950 min-h-screen font-sans selection:bg-zinc-100 selection:text-zinc-900 relative overflow-hidden">
      {showInstallPrompt && deferredPrompt && (
        <InstallPrompt 
          onInstall={handleInstall} 
          onDismiss={() => setShowInstallPrompt(false)} 
        />
      )}
      {databaseError && (
        <div className="fixed left-4 right-4 top-4 z-[120] mx-auto max-w-md rounded-2xl border border-red-500/20 bg-red-950/95 px-4 py-3 text-sm text-red-100 shadow-2xl backdrop-blur">
          {databaseError}
        </div>
      )}
      <MarathonReadyingPulse event={readyingEvent} onComplete={clearReadyingEvent} />
      <AnimatePresence mode="wait">
        {!isAuthReady ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-[100dvh] flex items-center justify-center"
          >
            <div className="w-8 h-8 border-2 border-zinc-100 border-t-transparent rounded-full animate-spin" />
          </motion.div>
        ) : screen === 'auth' ? (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <LandingPage onStart={handleLandingStart} authError={authError} />
          </motion.div>
        ) : screen === 'onboarding' ? (
          <motion.div
            key="onboarding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Onboarding onComplete={handleOnboardingComplete} />
          </motion.div>
        ) : screen === 'dashboard' && profile ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Dashboard 
              profile={profile} 
              plan={renderedPlan} 
              readiness={readiness}
              onSelectWorkout={handleSelectWorkout}
              onViewPlan={() => setScreen('plan-view')}
              onViewProfile={() => setScreen('profile')}
              onViewAchievements={() => setScreen('achievements')}
              onViewHealth={() => setScreen('health')}
              onInstall={deferredPrompt ? handleInstall : undefined}
              achievements={achievements}
            />
          </motion.div>
        ) : screen === 'workout-detail' && selectedWorkout ? (
          <motion.div
            key="workout-detail"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
          >
            <WorkoutDetail 
              workout={selectedWorkout} 
              onBack={() => setScreen('dashboard')}
              onStart={handleStartWorkout}
            />
          </motion.div>
        ) : screen === 'live-workout' && selectedWorkout ? (
          <motion.div
            key="live-workout"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <LiveWorkout 
              workout={selectedWorkout} 
              onComplete={handleLiveWorkoutComplete}
              onCancel={() => setScreen('workout-detail')}
            />
          </motion.div>
        ) : screen === 'post-run' && selectedWorkout ? (
          <motion.div
            key="post-run"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
          >
            <PostRunCheckIn 
              workout={selectedWorkout} 
              liveData={liveWorkoutData}
              onComplete={handlePostRunComplete} 
            />
          </motion.div>
        ) : screen === 'plan-view' && profile ? (
          <motion.div
            key="plan-view"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
          >
            <PlanView 
              workouts={renderedPlan} 
              goalDate={getPlanReadyProfile(profile).goalDate}
              onBack={() => setScreen('dashboard')}
              onSelectWorkout={handleSelectWorkout}
              onSetNewGoal={() => {
                if (!hasPremiumAccess(accessRecord)) {
                  setScreen('subscription');
                  return;
                }
                completedOnboardingUidRef.current = null;
                setScreen('onboarding');
              }}
            />
          </motion.div>
        ) : screen === 'subscription' ? (
          <motion.div
            key="subscription"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
          >
            <Subscription 
              onBack={() => setScreen(profile && isUnlocked ? 'dashboard' : 'onboarding')} 
              isUnlocked={isUnlocked} 
              userId={user?.uid}
              userEmail={user?.email || profile?.email}
              hasBillingCustomer={Boolean(profile?.stripeCustomerId)}
              onManageSubscription={handleManageSubscription}
              onRestoreAccess={restoreSubscriptionAccess}
              isRestoringAccess={isRestoringSubscriptionAccess}
              checkoutIntent={pendingCheckoutIntent}
              onCheckoutIntentHandled={clearPendingCheckoutIntent}
            />
          </motion.div>
        ) : screen === 'profile' && profile ? (
          <motion.div
            key="profile"
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
          >
            <ProfileView 
              profile={profile} 
              onBack={() => setScreen('dashboard')} 
              onSave={handleProfileUpdate}
              onRegeneratePlan={handleRegeneratePlan}
              onLogout={handleLogout}
              onInstall={deferredPrompt ? handleInstall : undefined}
              onManageSubscription={handleManageSubscription}
              marathonReadying={marathonReadying}
            />
          </motion.div>
        ) : screen === 'achievements' ? (
          <motion.div
            key="achievements"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
          >
            <AchievementsView 
              achievements={achievements} 
              marathonReadying={marathonReadying}
              onBack={() => setScreen('dashboard')} 
            />
          </motion.div>
        ) : screen === 'health' && profile ? (
          <motion.div
            key="health"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
          >
            <HealthMetricsView 
              metrics={healthMetrics} 
              profile={profile}
              onBack={() => setScreen('dashboard')} 
              onConnectGoogleHealth={handleConnectGoogleHealth}
              onSync={handleSyncHealth}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Plan Generation Overlay */}
      <AnimatePresence>
        {isGeneratingPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-zinc-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              <motion.div
                animate={{ 
                  scale: [1, 1.05, 1],
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="w-32 h-32 mx-auto mb-4"
              >
                <img 
                  src="/app-icon-logo.png" 
                  alt="Jogga Logo" 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </motion.div>
              <div className="space-y-2">
                <h2 className="text-2xl font-light tracking-tight">Creating your plan...</h2>
                <p className="text-zinc-500 text-sm">Analyzing your goals and schedule</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
