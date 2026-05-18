import React from 'react';
import { motion } from 'motion/react';
import { Play, Calendar, Trophy, Zap, ChevronRight, Activity, TrendingUp, User, Sparkles } from 'lucide-react';
import { Achievement, UserProfile, Workout, ReadinessScore } from '../types';
import { cn } from '../lib/utils';
import { formatDateLabel, getTimeOfDayGreeting, todayISO } from '../lib/date';
import { buildMarathonReadyingProfile } from '../services/marathonReadyingService';
import { getCompletedDistanceLabel, getCompletedDurationLabel, getMeasurementLabel } from '../services/runMetricsService';

interface DashboardProps {
  profile: UserProfile;
  plan: Workout[];
  readiness: ReadinessScore;
  onSelectWorkout: (workout: Workout) => void;
  onViewPlan: () => void;
  onViewProfile: () => void;
  onViewAchievements: () => void;
  onViewHealth: () => void;
  onInstall?: () => void;
  achievements?: Achievement[];
}

export default function Dashboard({ 
  profile, 
  plan, 
  readiness, 
  onSelectWorkout, 
  onViewPlan, 
  onViewProfile,
  onViewAchievements,
  onViewHealth,
  onInstall,
  achievements = []
}: DashboardProps) {
  const today = todayISO();
  const todayWorkout = plan.find(w => w.date === today && w.status !== 'missed');
  const futureWorkouts = plan.filter(w => w.date > today && w.status === 'planned');
  const featuredWorkout = todayWorkout || futureWorkouts[0] || null;
  const nextWorkouts = futureWorkouts.filter(w => w.id !== featuredWorkout?.id).slice(0, 3);
  const completedWorkouts = plan.filter(w => w.status === 'completed').length;
  const hasEnoughData = completedWorkouts > 0;
  const readinessTrendLabel = readiness.trend > 0
    ? `+${readiness.trend}% from recent load`
    : readiness.trend < 0
      ? `${readiness.trend}% from recent load`
      : 'Stable after your last run';
  const greeting = getTimeOfDayGreeting();
  const workoutLabel = featuredWorkout?.date === today ? 'Today' : featuredWorkout ? formatDateLabel(featuredWorkout.date, 'EEE, MMM d') : null;
  const marathonReadying = buildMarathonReadyingProfile(plan, achievements);
  const featuredDistanceLabel = featuredWorkout?.status === 'completed'
    ? getCompletedDistanceLabel(featuredWorkout)
    : featuredWorkout?.distanceTarget
      ? `${featuredWorkout.distanceTarget} km`
      : null;
  const featuredDurationLabel = featuredWorkout?.status === 'completed'
    ? getCompletedDurationLabel(featuredWorkout)
    : featuredWorkout
      ? `${featuredWorkout.durationMinutes} min`
      : null;
  const featuredPaceLabel = featuredWorkout?.status === 'completed'
    ? featuredWorkout.result?.avgPace
    : featuredWorkout?.paceTarget;

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 p-6 space-y-8 max-w-md mx-auto w-full pb-24">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{greeting}</p>
          <h1 className="text-2xl font-light">{profile.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          {onInstall && (
            <button 
              onClick={onInstall}
              className="bg-zinc-100 text-zinc-900 px-4 py-2 rounded-full text-xs font-bold shadow-lg hover:bg-white transition-all active:scale-95 flex items-center gap-2"
            >
              <Zap size={14} fill="currentColor" />
              Install App
            </button>
          )}
          <button 
            onClick={onViewProfile}
            aria-label="Open profile"
            className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 hover:bg-zinc-700 transition-colors"
          >
            <User size={20} className="text-zinc-400" />
          </button>
        </div>
      </header>

      {/* Readiness Score Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 relative overflow-hidden group"
      >
        <div className="relative z-10 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-400">
              <Zap size={16} className="text-yellow-500" />
              <span className="text-xs font-semibold uppercase tracking-widest">
                {!hasEnoughData ? "Baseline Pending" : "Readiness Score"}
              </span>
            </div>
            <div className="text-xs text-zinc-500">{hasEnoughData ? 'Updated today' : 'After first run'}</div>
          </div>
          
          <div className="flex items-end gap-4">
            <div className="text-7xl font-light tracking-tighter">{hasEnoughData ? `${readiness.score}%` : '--'}</div>
            <div className="mb-2 text-sm text-zinc-400 flex items-center gap-1">
              {hasEnoughData ? (
                <>
                  <TrendingUp size={14} className={readiness.trend >= 0 ? 'text-green-500' : 'text-yellow-400'} />
                  <span>{readinessTrendLabel}</span>
                </>
              ) : (
                <span>Complete a run to unlock your first score.</span>
              )}
            </div>
          </div>

          {!hasEnoughData && (
            <p className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 text-sm leading-6 text-zinc-400">
              Jogga waits for real run data before scoring readiness, fatigue, and trend. No fake confidence before your baseline.
            </p>
          )}

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-zinc-800/50">
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Consistency</div>
              <div className="text-sm font-medium">{readiness.consistency}%</div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Fatigue</div>
              <div className="text-sm font-medium">{readiness.fatigue > 0 ? `${readiness.fatigue}%` : '--'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Streak</div>
              <div className="text-sm font-medium flex items-center gap-1">
                <Zap size={12} className="text-yellow-500 fill-current" />
                <span>{hasEnoughData ? `${readiness.streak}d` : '0d'}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Decorative background element */}
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-900/70 rounded-3xl p-5 border border-yellow-400/20 space-y-5 overflow-hidden relative"
      >
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-zinc-400">
            <Sparkles size={16} className="text-yellow-400" />
            <span className="text-xs font-semibold uppercase tracking-normal">Training Momentum</span>
          </div>
          <span className="rounded-full bg-yellow-400/10 px-3 py-1 text-xs font-bold text-yellow-200">
            Level {marathonReadying.level}
          </span>
        </div>

        <div className="relative space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-4xl font-light tracking-tight tabular-nums">{marathonReadying.totalPoints}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Total Points</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-light text-yellow-100 tabular-nums">+{marathonReadying.todayPoints}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Today</div>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-yellow-400 transition-all duration-500"
              style={{ width: `${marathonReadying.progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            <span>{marathonReadying.currentLevelPoints}/{marathonReadying.nextLevelPoints}</span>
            <span>{marathonReadying.progressPercent}%</span>
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-3 border-t border-zinc-800/70 pt-4">
          <div>
            <div className="text-sm font-medium">{marathonReadying.currentStreak}d</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Streak</div>
          </div>
          <div>
            <div className="text-sm font-medium">{marathonReadying.usagePoints}</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Usage</div>
          </div>
          <div>
            <div className="text-sm font-medium">{marathonReadying.readinessPoints}</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Momentum</div>
          </div>
        </div>

        {marathonReadying.lastEvent && (
          <div className="relative rounded-2xl bg-zinc-950/60 p-4">
            <p className="text-sm leading-relaxed text-zinc-100 break-words">{marathonReadying.lastEvent.message}</p>
            <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-yellow-200">
              +{marathonReadying.lastEvent.points} last reward
            </div>
          </div>
        )}
      </motion.div>

      {/* Today's Workout */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-lg font-medium">{todayWorkout ? "Today's Workout" : 'Next Workout'}</h2>
          <button onClick={onViewPlan} className="text-xs text-zinc-500 flex items-center gap-1 hover:text-zinc-300 transition-colors">
            View Plan <ChevronRight size={14} />
          </button>
        </div>

        {featuredWorkout ? (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectWorkout(featuredWorkout)}
            className="w-full bg-zinc-100 text-zinc-900 rounded-3xl p-6 text-left space-y-4 shadow-xl shadow-zinc-950/50"
          >
            <div className="flex items-center justify-between">
              <div className="bg-zinc-900/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                  {featuredWorkout.type}
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold">
                <Calendar size={14} />
                <span>{workoutLabel}</span>
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-3xl font-light tracking-tight">
                {featuredWorkout.status === 'completed' ? 'Completed today' : `${featuredWorkout.durationMinutes} min ${featuredWorkout.type}`}
              </h3>
              <p className="text-sm opacity-70 line-clamp-2">{featuredWorkout.instructions}</p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex flex-wrap gap-4">
                {featuredDistanceLabel && (
                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase tracking-widest opacity-50">
                      {featuredWorkout.status === 'completed' ? 'Actual' : 'Distance'}
                    </div>
                    <div className="text-sm font-bold">{featuredDistanceLabel}</div>
                  </div>
                )}
                {featuredDurationLabel && featuredWorkout.status === 'completed' && (
                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase tracking-widest opacity-50">Duration</div>
                    <div className="text-sm font-bold">{featuredDurationLabel}</div>
                  </div>
                )}
                {featuredPaceLabel && (
                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase tracking-widest opacity-50">Pace</div>
                    <div className="text-sm font-bold">{featuredPaceLabel}</div>
                  </div>
                )}
                {featuredWorkout.status === 'completed' && (
                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase tracking-widest opacity-50">Source</div>
                    <div className="text-sm font-bold">{getMeasurementLabel(featuredWorkout.result?.measurementSource)}</div>
                  </div>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-100">
                {featuredWorkout.status === 'completed' ? <Trophy size={20} /> : <Play size={20} fill="currentColor" />}
              </div>
            </div>
          </motion.button>
        ) : (
          <div className="bg-zinc-900/50 rounded-3xl p-8 text-center border border-dashed border-zinc-800">
            <p className="text-zinc-500">No Current Plan</p>
            <p className="text-sm text-zinc-600">Start a new plan to continue training.</p>
          </div>
        )}
      </section>

      {/* Upcoming */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium px-2">Upcoming</h2>
        <div className="space-y-3">
          {nextWorkouts.length > 0 ? nextWorkouts.map((workout, i) => (
            <motion.button
              key={workout.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => onSelectWorkout(workout)}
              className="w-full bg-zinc-900/50 hover:bg-zinc-900 rounded-2xl p-4 flex items-center gap-4 border border-zinc-800/50 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                <Activity size={20} className="text-zinc-400" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-xs text-zinc-500 font-medium">
                  {formatDateLabel(workout.date, 'EEEE, MMM d')}
                </div>
                <div className="font-medium">{workout.type}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">{workout.durationMinutes}m</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Effort {workout.effortTarget}/10</div>
              </div>
            </motion.button>
          )) : (
            <button
              onClick={onViewPlan}
              className="w-full rounded-2xl border border-zinc-800/50 bg-zinc-900/30 p-4 text-left text-sm text-zinc-500 transition-colors hover:bg-zinc-900"
            >
              View the full training plan
            </button>
          )}
        </div>
      </section>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md items-center justify-around border-t border-zinc-800 bg-zinc-950/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl"
      >
        <button aria-current="page" className="flex min-w-14 flex-col items-center gap-1 p-2 text-zinc-100">
          <Zap size={22} />
          <span className="text-[9px] font-bold uppercase tracking-widest">Today</span>
        </button>
        <button onClick={onViewPlan} className="flex min-w-14 flex-col items-center gap-1 p-2 text-zinc-500 transition-colors hover:text-zinc-300">
          <Calendar size={22} />
          <span className="text-[9px] font-bold uppercase tracking-widest">Plan</span>
        </button>
        <button onClick={onViewAchievements} className="flex min-w-14 flex-col items-center gap-1 p-2 text-zinc-500 transition-colors hover:text-zinc-300">
          <Trophy size={22} />
          <span className="text-[9px] font-bold uppercase tracking-widest">Wins</span>
        </button>
        <button onClick={onViewHealth} className="flex min-w-14 flex-col items-center gap-1 p-2 text-zinc-500 transition-colors hover:text-zinc-300">
          <Activity size={22} />
          <span className="text-[9px] font-bold uppercase tracking-widest">Health</span>
        </button>
      </nav>
    </div>
  );
}
