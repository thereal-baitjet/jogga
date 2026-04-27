import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Workout, ReadinessScore, WorkoutResult, Achievement, HealthMetric } from './types';
import { generatePlan } from './constants';
import { calculateReadiness } from './services/readinessService';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import WorkoutDetail from './components/WorkoutDetail';
import PostRunCheckIn from './components/PostRunCheckIn';
import PlanView from './components/PlanView';
import LiveWorkout from './components/LiveWorkout';
import ProfileView from './components/ProfileView';
import Subscription from './components/Subscription';
import AchievementsView from './components/AchievementsView';
import HealthMetricsView from './components/HealthMetricsView';
import { AnimatePresence, motion } from 'motion/react';
import InstallPrompt from './components/InstallPrompt';
import { Zap } from 'lucide-react';
import { auth, db, googleProvider } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, onSnapshot, query, writeBatch, getDocs } from 'firebase/firestore';

type Screen = 'onboarding' | 'dashboard' | 'workout-detail' | 'live-workout' | 'post-run' | 'plan-view' | 'subscription' | 'profile' | 'achievements' | 'health' | 'auth';

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

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('auth');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [plan, setPlan] = useState<Workout[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const screenRef = useRef(screen);

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
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);
  const [liveWorkoutData, setLiveWorkoutData] = useState<{ distance: number; duration: number; path: { lat: number; lng: number; timestamp: number }[] } | null>(null);
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
            const earlyRun = completedWorkouts.find(w => new Date(w.date).getHours() < 7);
            if (earlyRun) unlockedAt = earlyRun.result?.completedAt;
          }
          break;
        case '3':
          if (!unlockedAt) {
            const fiveK = completedWorkouts.find(w => (w.result?.actualDistance || 0) >= 5);
            if (fiveK) {
              unlockedAt = fiveK.result?.completedAt;
              progress = 100;
            } else {
              const maxDist = Math.max(...completedWorkouts.map(w => w.result?.actualDistance || 0), 0);
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
              const diff = (new Date(dates[i]).getTime() - new Date(dates[i-1]).getTime()) / (1000 * 60 * 60 * 24);
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

  const [healthMetrics, setHealthMetrics] = useState<HealthMetric[]>([
    { 
      id: 'hr', type: 'hr', label: 'Resting HR', value: 58, unit: 'bpm', trend: 'down', updatedAt: new Date().toISOString(),
      history: [
        { date: '2026-04-01', value: 62 },
        { date: '2026-04-02', value: 61 },
        { date: '2026-04-03', value: 60 },
        { date: '2026-04-04', value: 59 },
        { date: '2026-04-05', value: 58 },
      ]
    },
    { 
      id: 'sleep', type: 'sleep', label: 'Sleep Score', value: 82, unit: '/100', trend: 'up', updatedAt: new Date().toISOString(),
      history: [
        { date: '2026-04-01', value: 75 },
        { date: '2026-04-02', value: 78 },
        { date: '2026-04-03', value: 80 },
        { date: '2026-04-04', value: 81 },
        { date: '2026-04-05', value: 82 },
      ]
    },
    { 
      id: 'vo2max', type: 'vo2max', label: 'VO2 Max', value: 48, unit: 'ml/kg/min', trend: 'stable', updatedAt: new Date().toISOString(),
      history: [
        { date: '2026-04-01', value: 47.5 },
        { date: '2026-04-02', value: 47.6 },
        { date: '2026-04-03', value: 47.8 },
        { date: '2026-04-04', value: 47.9 },
        { date: '2026-04-05', value: 48 },
      ]
    },
    { 
      id: 'weight', type: 'weight', label: 'Weight', value: 74.5, unit: 'kg', trend: 'down', updatedAt: new Date().toISOString(),
      history: [
        { date: '2026-04-01', value: 76 },
        { date: '2026-04-02', value: 75.8 },
        { date: '2026-04-03', value: 75.5 },
        { date: '2026-04-04', value: 75 },
        { date: '2026-04-05', value: 74.5 },
      ]
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

  // Calculate Readiness based on recent workouts
  useEffect(() => {
    if (plan.length === 0) return;

    const completed = plan.filter(w => w.status === 'completed');
    if (completed.length === 0) return;

    // Logic for Fatigue: Sum of effort in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentWorkouts = completed.filter(w => new Date(w.date) >= sevenDaysAgo);
    const totalEffort = recentWorkouts.reduce((sum, w) => sum + (w.effortTarget || 5), 0);
    
    // Fatigue is a factor of recent effort (0-100)
    // Assuming max 5 workouts a week at avg effort 7 = 35. 
    // Let's say 50 is "high fatigue"
    const calculatedFatigue = Math.min(100, Math.round((totalEffort / 50) * 100));
    
    // Consistency: % of planned workouts completed in last 14 days
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const plannedInLast14 = plan.filter(w => new Date(w.date) >= fourteenDaysAgo && new Date(w.date) <= new Date());
    const completedInLast14 = plannedInLast14.filter(w => w.status === 'completed');
    const calculatedConsistency = plannedInLast14.length > 0 
      ? Math.round((completedInLast14.length / plannedInLast14.length) * 100)
      : 91;

    // Final Readiness Score: (Consistency - Fatigue/2)
    const baseScore = calculatedConsistency - (calculatedFatigue / 3);
    const finalScore = Math.max(0, Math.min(100, Math.round(baseScore)));

    setReadiness(prev => ({
      ...prev,
      score: finalScore,
      consistency: calculatedConsistency,
      fatigue: calculatedFatigue,
      updatedAt: new Date().toISOString()
    }));
  }, [plan]);

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (!currentUser) {
        setScreen('auth');
      }
    });
    return () => unsubscribe();
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

  const handleSyncHealth = async () => {
    if (!healthTokens?.access_token) return;

    try {
      const response = await fetch('/api/health/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: healthTokens.access_token }),
      });

      if (!response.ok) throw new Error('Sync failed');
      const data = await response.json();

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
              history: [...metric.history.slice(1), { date: new Date().toISOString().split('T')[0], value: Math.round(latestHR) }]
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
              history: [...metric.history.slice(1), { date: new Date().toISOString().split('T')[0], value: score }]
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
              history: [...metric.history.slice(1), { date: new Date().toISOString().split('T')[0], value: Math.round(latestWeight * 10) / 10 }]
            };
          }
        }
        return metric;
      });

      setHealthMetrics(updatedMetrics);
    } catch (error) {
      console.error('Health sync error:', error);
    }
  };

  // Firestore Data Sync
  useEffect(() => {
    if (!user) return;

    // Sync Profile
    const profileRef = doc(db, 'users', user.uid);
    const unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(data);
        setIsUnlocked(data.isUnlocked || false);
        if (data.readinessScore) {
          setReadiness(data.readinessScore as ReadinessScore);
        }
        // Move user out of auth or onboarding if profile exists
        if (screenRef.current === 'auth' || screenRef.current === 'onboarding') {
          setScreen(data.isUnlocked ? 'dashboard' : 'subscription');
        }
      } else {
        // New user, go to onboarding
        if (screenRef.current === 'auth') {
          setScreen('onboarding');
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    // Sync Plan
    const workoutsRef = collection(db, 'users', user.uid, 'workouts');
    const q = query(workoutsRef);
    const unsubscribeWorkouts = onSnapshot(q, (querySnap) => {
      const workouts: Workout[] = [];
      querySnap.forEach((doc) => {
        workouts.push(doc.data() as Workout);
      });
      // Sort by date
      workouts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setPlan(workouts);

      // Update readiness based on new data
      const newReadiness = calculateReadiness(workouts);
      setReadiness(newReadiness);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/workouts`);
    });

    return () => {
      unsubscribeProfile();
      unsubscribeWorkouts();
    };
  }, [user]);

  // Handle Stripe Success
  useEffect(() => {
    if (!user || !profile) return;
    
    const params = new URLSearchParams(window.location.search);
    if (params.get('session_id')) {
      const profileRef = doc(db, 'users', user.uid);
      setDoc(profileRef, { isUnlocked: true }, { merge: true }).catch(err => {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      });
      setIsUnlocked(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [user, profile]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setProfile(null);
      setPlan([]);
      setScreen('auth');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const handleOnboardingComplete = async (newProfile: UserProfile) => {
    if (!user) return;
    
    setIsGeneratingPlan(true);
    
    const newPlan = generatePlan(newProfile);
    const profileWithUid = { 
      ...newProfile, 
      id: user.uid, // Ensure ID is set
      uid: user.uid, 
      email: user.email || '',
      readinessScore: readiness
    };
    
    try {
      // Artificial delay to show the generation animation
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // Save profile
      await setDoc(doc(db, 'users', user.uid), profileWithUid);
      
      // Clear old planned workouts first
      const workoutsRef = collection(db, 'users', user.uid, 'workouts');
      const snapshot = await getDocs(workoutsRef);
      const batch = writeBatch(db);
      
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.status !== 'completed') {
          batch.delete(docSnap.ref);
        }
      });
      
      // Save new plan
      newPlan.forEach(workout => {
        const workoutRef = doc(db, 'users', user.uid, 'workouts', workout.id);
        batch.set(workoutRef, { ...workout, uid: user.uid });
      });
      await batch.commit();
      
      setProfile(profileWithUid);
      setPlan(newPlan);
      setIsGeneratingPlan(false);
      setScreen('subscription');
    } catch (error) {
      console.error('Failed to save data', error);
      setIsGeneratingPlan(false);
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const handleSelectWorkout = (workout: Workout) => {
    setSelectedWorkout(workout);
    setScreen('workout-detail');
  };

  const handleStartWorkout = () => {
    setScreen('live-workout');
  };

  const handleLiveWorkoutComplete = (data: { distance: number; duration: number; path: { lat: number; lng: number; timestamp: number }[] }) => {
    setLiveWorkoutData(data);
    setScreen('post-run');
  };

  const handlePostRunComplete = async (result: WorkoutResult) => {
    if (!selectedWorkout || !user) return;

    // Phase 3: Batch Sync (Firebase Backend)
    // Perform a single batch write to Firestore
    try {
      const batch = writeBatch(db);
      
      // 1. Update workout document with summary and telemetry
      const workoutRef = doc(db, 'users', user.uid, 'workouts', selectedWorkout.id);
      batch.set(workoutRef, { 
        status: 'completed', 
        result,
        distanceTarget: result.actualDistance,
        durationMinutes: result.actualDuration
      }, { merge: true });

      // 2. Update user profile with new readiness score
      const newReadiness = {
        score: Math.min(100, readiness.score + 2),
        consistency: Math.min(100, readiness.consistency + 1),
        progress: Math.min(100, readiness.progress + 1),
        fatigue: Math.min(100, readiness.fatigue + 5),
        streak: readiness.streak + 1,
        trend: 4,
        updatedAt: new Date().toISOString()
      };
      
      const userRef = doc(db, 'users', user.uid);
      batch.set(userRef, { readinessScore: newReadiness }, { merge: true });

      await batch.commit();

      setReadiness(newReadiness);
      setScreen('dashboard');
      setSelectedWorkout(null);
    } catch (error) {
      console.error('Failed to update workout batch', error);
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/workouts/${selectedWorkout.id}`);
    }
  };

  const handleProfileUpdate = async (updatedProfile: UserProfile) => {
    if (!user) return;
    try {
      const profileToSave = { ...updatedProfile, readinessScore: readiness };
      await setDoc(doc(db, 'users', user.uid), profileToSave, { merge: true });
      setProfile(profileToSave);
    } catch (error) {
      console.error('Failed to update profile', error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleRegeneratePlan = async () => {
    if (!user || !profile) return;
    
    setIsGeneratingPlan(true);
    const newPlan = generatePlan(profile);
    
    try {
      const workoutsRef = collection(db, 'users', user.uid, 'workouts');
      const snapshot = await getDocs(workoutsRef);
      const batch = writeBatch(db);
      
      // Delete existing planned workouts to prevent duplicates and "weird" overlaps
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.status !== 'completed') {
          batch.delete(docSnap.ref);
        }
      });
      
      newPlan.forEach(workout => {
        const workoutRef = doc(db, 'users', user.uid, 'workouts', workout.id);
        batch.set(workoutRef, { ...workout, uid: user.uid });
      });
      
      await batch.commit();
      setPlan(newPlan);
      setIsGeneratingPlan(false);
      alert('Training plan has been updated based on your new goals!');
    } catch (error) {
      console.error('Failed to regenerate plan', error);
      setIsGeneratingPlan(false);
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/workouts`);
    }
  };

  const handleUnlock = async () => {
    localStorage.setItem('jogga_unlocked', 'true');
    setIsUnlocked(true);
    
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), { isUnlocked: true }, { merge: true });
      } catch (error) {
        console.error('Failed to persist unlock status', error);
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
    
    setScreen(profile ? 'dashboard' : 'onboarding');
  };

  return (
    <div className="bg-zinc-950 min-h-screen font-sans selection:bg-zinc-100 selection:text-zinc-900 relative overflow-hidden">
      {showInstallPrompt && deferredPrompt && (
        <InstallPrompt 
          onInstall={handleInstall} 
          onDismiss={() => setShowInstallPrompt(false)} 
        />
      )}
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
            className="min-h-[100dvh] flex flex-col items-center justify-center p-8 text-center space-y-8"
          >
            <div className="space-y-4">
              <div className="w-24 h-24 mx-auto mb-6">
                <img 
                  src="/mainLogo.png" 
                  alt="Jogga Logo" 
                  className="w-full h-full object-contain drop-shadow-2xl"
                  referrerPolicy="no-referrer"
                />
              </div>
              <h1 className="text-4xl font-light tracking-tight text-zinc-100">Jogga</h1>
              <p className="text-zinc-500 max-w-xs mx-auto">Your adaptive AI running coach. Sign in to sync your progress across devices.</p>
            </div>
            <button
              onClick={handleLogin}
              className="w-full max-w-xs bg-zinc-100 text-zinc-900 py-4 rounded-full font-bold flex items-center justify-center gap-3 shadow-xl hover:bg-zinc-200 transition-all active:scale-95"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
              Continue with Google
            </button>
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
              plan={plan} 
              readiness={readiness}
              onSelectWorkout={handleSelectWorkout}
              onViewPlan={() => setScreen('plan-view')}
              onViewProfile={() => setScreen('profile')}
              onViewAchievements={() => setScreen('achievements')}
              onViewHealth={() => setScreen('health')}
              onInstall={deferredPrompt ? handleInstall : undefined}
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
        ) : screen === 'plan-view' ? (
          <motion.div
            key="plan-view"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
          >
            <PlanView 
              workouts={plan} 
              goalDate={profile.goalDate}
              onBack={() => setScreen('dashboard')}
              onSelectWorkout={handleSelectWorkout}
              onSetNewGoal={() => setScreen('onboarding')}
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
              onBack={() => setScreen(profile ? 'dashboard' : 'onboarding')} 
              onUnlock={handleUnlock}
              isUnlocked={isUnlocked} 
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
                  src="/mainLogo.png" 
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
