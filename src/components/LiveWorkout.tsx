import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Play, Pause, Square, Activity, Zap, Clock, MapPin, Sparkles } from 'lucide-react';
import { GpsPathPoint, LiveWorkoutData, Workout } from '../types';
import { cn, calculateDistance } from '../lib/utils';
import { playAudioCue } from '../services/audioService';
import { getWorkoutReadyingPreview } from '../services/marathonReadyingService';
import { buildLiveWorkoutData } from '../services/runMetricsService';

interface LiveWorkoutProps {
  workout: Workout;
  onComplete: (data: LiveWorkoutData) => void;
  onCancel: () => void;
}

export default function LiveWorkout({ workout, onComplete, onCancel }: LiveWorkoutProps) {
  const [isActive, setIsActive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [distance, setDistance] = useState(0);
  const [pace, setPace] = useState('0:00');
  const [speed, setSpeed] = useState(0); // km/h
  const [isFinished, setIsFinished] = useState(false);
  const [path, setPath] = useState<GpsPathPoint[]>([]);
  const [gpsStatus, setGpsStatus] = useState<'searching' | 'active' | 'error'>('searching');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const lastUpdateRef = useRef<number>(0);
  const readyingPreview = getWorkoutReadyingPreview(workout);

  // Phase 2: Local Buffer (Data Safety) - Load from storage on mount
  useEffect(() => {
    const savedWorkout = localStorage.getItem(`jogga_workout_buffer_${workout.id}`);
    if (savedWorkout) {
      try {
        const { seconds: s, distance: d, path: p } = JSON.parse(savedWorkout);
        setSeconds(s);
        setDistance(d);
        setPath(p);
        setIsActive(false); // Start paused if recovering
      } catch (e) {
        console.error("Failed to recover workout from buffer", e);
      }
    }
  }, [workout.id]);

  // Phase 2: Local Buffer (Data Safety) - Persist to storage
  useEffect(() => {
    if (seconds > 0 || path.length > 0) {
      localStorage.setItem(`jogga_workout_buffer_${workout.id}`, JSON.stringify({
        seconds,
        distance,
        path,
        lastUpdated: Date.now()
      }));
    }
  }, [seconds, distance, path, workout.id]);

  // Wake Lock management
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          console.log('Wake Lock released');
        });
      } catch (err) {
        console.error(`Wake Lock error: ${(err as Error).message}`);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  // Handle Visibility Change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        await requestWakeLock();
      } else {
        releaseWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (isActive) {
      requestWakeLock();
      // Start GPS tracking
      if ("geolocation" in navigator) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude, accuracy: acc, speed: gpsSpeed } = position.coords;
            const now = Date.now();
            
            // Phase 1: On-Device Engine (Data Capture)
            // Poll every 3 to 5 seconds (throttle updates)
            if (now - lastUpdateRef.current < 3000) return;
            lastUpdateRef.current = now;

            setAccuracy(acc);
            
            // Filter out inaccurate points (e.g., > 30m)
            if (acc > 30) return;

            setGpsStatus('active');
            
            // Update speed from GPS (m/s to km/h)
            let currentSpeed = 0;
            if (gpsSpeed !== null && gpsSpeed >= 0) {
              currentSpeed = gpsSpeed * 3.6;
              setSpeed(currentSpeed);
            }
            
            setPath(prev => {
              const lastPoint = prev[prev.length - 1];
              if (lastPoint) {
                const d = calculateDistance(lastPoint.lat, lastPoint.lng, latitude, longitude);
                // Phase 1: Distance filter of 5 meters
                if (d < 0.005) return prev;
                setDistance(dTotal => dTotal + d);
                
                // If GPS speed is null, calculate it
                if (gpsSpeed === null) {
                  const timeDiff = (now - lastPoint.timestamp) / 1000; // seconds
                  if (timeDiff > 0) {
                    currentSpeed = (d * 3600) / timeDiff; // km/h
                    setSpeed(currentSpeed);
                  }
                }
              }
              return [...prev, { lat: latitude, lng: longitude, speed: currentSpeed, accuracy: acc, timestamp: now }];
            });
          },
          (error) => {
            console.error("GPS Error:", error);
            setGpsStatus('error');
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
      } else {
        setGpsStatus('error');
      }

      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      releaseWakeLock();
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setSpeed(0); // Reset speed when paused
    }
    return () => {
      releaseWakeLock();
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [isActive]);

  useEffect(() => {
    if (distance > 0 && seconds > 0) {
      const totalMinutes = seconds / 60;
      const paceVal = totalMinutes / distance;
      const mins = Math.floor(paceVal);
      const secs = Math.round((paceVal - mins) * 60);
      setPace(`${mins}:${secs.toString().padStart(2, '0')}`);
    }
  }, [seconds, distance]);

  // Audio Cues
  useEffect(() => {
    if (isActive && seconds === 1) {
      playAudioCue(`Starting your ${workout.type}. Let's go! Target pace is ${workout.paceTarget || 'easy effort'}.`);
    }
    
    // Halfway cue
    const targetSeconds = (workout.durationMinutes || 30) * 60;
    if (isActive && seconds === Math.floor(targetSeconds / 2)) {
      playAudioCue("You're halfway there! Keep pushing, you're doing great.");
    }

    if (isActive && seconds === targetSeconds) {
      setIsActive(false);
      setIsFinished(true);
      playAudioCue("Workout complete! Excellent work today. Time for your cool down.");
    }
  }, [isActive, seconds, workout]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFinish = () => {
    // Phase 2: Clear local buffer on completion
    localStorage.removeItem(`jogga_workout_buffer_${workout.id}`);
    onComplete(buildLiveWorkoutData({
      distance,
      seconds,
      path,
    }));
  };

  const controlLabel = isActive ? 'Pause' : seconds > 0 ? 'Resume' : 'Start';

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto w-full p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-12">
        <button onClick={onCancel} aria-label="Back to workout details" className="p-2 hover:bg-zinc-900 rounded-full transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
          <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
            {workout.type}
          </div>
          <div className={cn(
            "text-[10px] uppercase tracking-[0.18em] font-bold flex items-center gap-1 mt-1",
            gpsStatus === 'active' ? "text-green-500" : gpsStatus === 'searching' ? "text-yellow-500" : "text-red-500"
          )}>
            <div className={cn("w-1 h-1 rounded-full animate-pulse", gpsStatus === 'active' ? "bg-green-500" : gpsStatus === 'searching' ? "bg-yellow-500" : "bg-red-500")} />
            GPS {gpsStatus} {accuracy && gpsStatus === 'active' && `(${Math.round(accuracy)}m)`}
          </div>
        </div>
        <div className="w-10" /> 
      </div>

      {gpsStatus === 'error' && (
        <div role="status" className="-mt-6 mb-8 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm leading-6 text-yellow-100">
          GPS is unavailable. Jogga will save this as a timer-based run, so distance may stay at 0 unless you enter it after finishing.
        </div>
      )}

      {gpsStatus === 'searching' && isActive && (
        <div role="status" className="-mt-6 mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm leading-6 text-zinc-300">
          Searching for a clear GPS lock. Keep the phone visible for the most accurate distance.
        </div>
      )}

      {/* Main Stats */}
      <div className="flex-1 flex flex-col justify-center items-center space-y-12">
        <div className="text-center space-y-2">
          <div className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Time</div>
          <div className="text-8xl font-light tracking-tighter tabular-nums">
            {formatTime(seconds)}
          </div>
        </div>

        <div className="grid grid-cols-3 w-full gap-4">
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2 text-zinc-500">
              <MapPin size={12} />
              <span className="text-[10px] font-semibold uppercase tracking-widest">Distance</span>
            </div>
            <div className="text-2xl font-light tabular-nums">{distance.toFixed(2)}<span className="text-[10px] ml-1 opacity-50">km</span></div>
          </div>
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2 text-zinc-500">
              <Clock size={12} />
              <span className="text-[10px] font-semibold uppercase tracking-widest">Pace</span>
            </div>
            <div className="text-2xl font-light tabular-nums">{pace}<span className="text-[10px] ml-1 opacity-50">min/km</span></div>
          </div>
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2 text-zinc-500">
              <Activity size={12} />
              <span className="text-[10px] font-semibold uppercase tracking-widest">Speed</span>
            </div>
            <div className="text-2xl font-light tabular-nums">{speed.toFixed(1)}<span className="text-[10px] ml-1 opacity-50">km/h</span></div>
          </div>
        </div>

        {/* Target Info */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 w-full grid grid-cols-[1fr_auto_auto] items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
              <Zap size={18} className="text-yellow-500" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Target</div>
              <div className="text-sm font-medium">{workout.paceTarget || 'Easy Effort'}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Effort</div>
            <div className="text-sm font-medium">{workout.effortTarget}/10</div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-widest text-zinc-500">
              <Sparkles size={10} className="text-yellow-400" />
              <span>Momentum</span>
            </div>
            <div className="text-sm font-medium text-yellow-100">+{readyingPreview}</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="py-12 flex items-center justify-center gap-8">
        {!isFinished ? (
          <>
            <button 
              onClick={() => setIsActive(!isActive)}
              aria-label={`${controlLabel} workout`}
              className={cn(
                "w-20 h-20 rounded-full flex flex-col items-center justify-center gap-1 transition-all active:scale-90 shadow-2xl",
                isActive ? "bg-zinc-800 text-zinc-100" : "bg-zinc-100 text-zinc-900"
              )}
            >
              {isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
              <span className="text-[9px] font-bold uppercase tracking-widest">{controlLabel}</span>
            </button>
            {seconds > 0 && (
              <button 
                onClick={handleFinish}
                aria-label="Finish workout"
                className="w-16 h-16 rounded-full bg-red-500/20 text-red-500 flex flex-col items-center justify-center gap-1 border border-red-500/30 active:scale-90 transition-all"
              >
                <Square size={24} fill="currentColor" />
                <span className="text-[8px] font-bold uppercase tracking-widest">Finish</span>
              </button>
            )}
          </>
        ) : (
          <button 
            onClick={handleFinish}
            aria-label="Finish workout"
            className="bg-zinc-100 text-zinc-900 px-12 py-5 rounded-full font-bold text-lg shadow-2xl active:scale-95 transition-all"
          >
            Finish Workout
          </button>
        )}
      </div>
      {!isActive && seconds > 0 && !isFinished && (
        <p className="-mt-8 mb-8 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          Paused. Resume this run instead of starting over.
        </p>
      )}
    </div>
  );
}
