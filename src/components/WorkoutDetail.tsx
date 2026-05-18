import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Play, Info, AlertCircle, Clock, MapPin, Gauge, CheckCircle2, Sparkles, Zap, Activity as ActivityIcon } from 'lucide-react';
import { Workout, WorkoutType } from '../types';
import { cn } from '../lib/utils';
import { todayISO } from '../lib/date';
import { getWorkoutReadyingEarned, getWorkoutReadyingPreview } from '../services/marathonReadyingService';
import { getCompletedDistanceLabel, getCompletedDurationLabel, getMeasurementLabel } from '../services/runMetricsService';

interface WorkoutDetailProps {
  workout: Workout;
  onBack: () => void;
  onStart: () => void;
}

const TYPE_COLORS: Record<WorkoutType, string> = {
  'Easy run': 'text-blue-400',
  'Long run': 'text-green-400',
  'Tempo run': 'text-orange-400',
  'Interval session': 'text-red-400',
  'Recovery run': 'text-cyan-400',
  'Race-pace run': 'text-purple-400',
  'Hill workout': 'text-yellow-400',
  'Strength session': 'text-zinc-400',
  'Mobility/recovery session': 'text-emerald-400'
};

export default function WorkoutDetail({ workout, onBack, onStart }: WorkoutDetailProps) {
  const isCompleted = workout.status === 'completed';
  const isCompletedToday = isCompleted && workout.date === todayISO();
  const readyingPreview = getWorkoutReadyingPreview(workout);
  const readyingEarned = getWorkoutReadyingEarned(workout);
  const feedbackReward = workout.result?.feedbackReward;
  const displayDuration = isCompleted ? getCompletedDurationLabel(workout) : `${workout.durationMinutes}m`;
  const displayDistance = isCompleted ? getCompletedDistanceLabel(workout) : workout.distanceTarget ? `${workout.distanceTarget}km` : null;
  const hasCompletedDistance = isCompleted ? true : Boolean(workout.distanceTarget);
  const measurementLabel = isCompleted ? getMeasurementLabel(workout.result?.measurementSource) : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto w-full relative">
      {/* Hero Section */}
      <div className="relative h-72 shrink-0 overflow-hidden bg-zinc-900">
        <div
          className="absolute inset-0 opacity-80"
          style={{
            backgroundImage: 'linear-gradient(135deg, rgba(250,204,21,0.18) 0%, rgba(39,39,42,0.92) 44%, rgba(9,9,11,1) 100%)',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-40 border-t border-yellow-400/20 bg-[linear-gradient(90deg,transparent_0,transparent_22px,rgba(250,204,21,0.18)_23px,transparent_24px)] bg-[length:44px_100%] opacity-70" />
        <div className="absolute right-6 top-12 rounded-2xl border border-zinc-700 bg-zinc-950/70 px-4 py-3 backdrop-blur">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Target Effort</div>
          <div className="mt-1 text-2xl font-light text-zinc-50">{workout.effortTarget}/10</div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/45 to-transparent" />
        
        <button 
          onClick={onBack}
          aria-label="Back to dashboard"
          className="absolute top-6 left-6 w-10 h-10 rounded-full bg-zinc-900/80 backdrop-blur-md flex items-center justify-center border border-zinc-800"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="absolute bottom-6 left-6 right-6 space-y-2">
          <div className={cn("text-xs font-bold uppercase tracking-widest", TYPE_COLORS[workout.type])}>
            {workout.type}
          </div>
          <h1 className="text-4xl font-light tracking-tight">{workout.durationMinutes} min {workout.type}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 bg-zinc-950 p-6 space-y-8 pb-32">
        {/* Targets Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 flex items-center gap-3">
            <Clock size={18} className="text-zinc-500" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                {isCompleted ? 'Actual Duration' : 'Duration'}
              </div>
              <div className="text-lg font-medium">{displayDuration}</div>
            </div>
          </div>
          <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 flex items-center gap-3">
            <Gauge size={18} className="text-zinc-500" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                {isCompleted ? 'Perceived Effort' : 'Target Effort'}
              </div>
              <div className="text-lg font-medium">
                {isCompleted ? workout.result?.perceivedEffort : workout.effortTarget}/10
              </div>
            </div>
          </div>
          {hasCompletedDistance && displayDistance && (
            <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 flex items-center gap-3">
              <MapPin size={18} className="text-zinc-500" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  {isCompleted ? 'Actual Distance' : 'Distance'}
                </div>
                <div className="text-lg font-medium">{displayDistance}</div>
              </div>
            </div>
          )}
          {(workout.paceTarget || (isCompleted && workout.result?.avgPace)) && (
            <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 flex items-center gap-3">
              <ActivityIcon size={18} className="text-zinc-500" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  {isCompleted ? 'Average Pace' : 'Target Pace'}
                </div>
                <div className="text-lg font-medium">
                  {isCompleted ? workout.result?.avgPace : workout.paceTarget}
                </div>
              </div>
            </div>
          )}
          {isCompleted && (
            <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 flex items-center gap-3">
              <CheckCircle2 size={18} className="text-zinc-500" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Source</div>
                <div className="text-lg font-medium">{measurementLabel}</div>
              </div>
            </div>
          )}
        </div>

        {/* Training Momentum */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-400">
            <Sparkles size={16} className="text-yellow-400" />
            <h2 className="text-sm font-semibold uppercase tracking-normal">Training Momentum</h2>
          </div>
          <div className="rounded-2xl border border-yellow-400/20 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-zinc-950">
                  <Zap size={18} fill="currentColor" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    {isCompleted ? 'Banked' : 'Available'}
                  </div>
                  <div className="truncate text-sm font-medium text-zinc-100">
                    {isCompleted ? (feedbackReward?.rewardCue || 'Workout reward captured') : 'Finish this workout'}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-2xl font-light text-yellow-100 tabular-nums">
                +{isCompleted ? readyingEarned : readyingPreview}
              </div>
            </div>

            {isCompleted && feedbackReward && (
              <div className="rounded-xl bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-400">
                {feedbackReward.feedbackSummary}
              </div>
            )}

            {isCompletedToday && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-400">
                This run is already saved for today. During a live workout, use pause and resume instead of starting another copy.
              </div>
            )}
          </div>
        </section>

        {/* Coach's Notes */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-400">
            <Info size={16} />
            <h2 className="text-sm font-semibold uppercase tracking-widest">Coach's Notes</h2>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 leading-relaxed text-zinc-300 italic">
            "{workout.instructions}"
          </div>
        </section>

        {/* Why this workout? */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-400">
            <AlertCircle size={16} />
            <h2 className="text-sm font-semibold uppercase tracking-widest">Why this workout?</h2>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            This session is designed to improve your aerobic capacity and build the necessary endurance for your goal. 
            By maintaining a consistent pace, you're training your body to be more efficient at using oxygen.
          </p>
        </section>
      </div>

      {/* Action Button */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent max-w-md mx-auto w-full">
        <button 
          onClick={onStart}
          disabled={isCompleted}
          className={cn(
            "w-full py-5 rounded-full font-bold flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-95",
            isCompleted 
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
              : "bg-zinc-100 text-zinc-900 hover:bg-white"
          )}
        >
          {isCompleted ? (
            <>
              <CheckCircle2 size={24} />
              {isCompletedToday ? 'Run Saved Today' : 'Workout Completed'}
            </>
          ) : (
            <>
              <Play size={24} fill="currentColor" />
              Start Workout
            </>
          )}
        </button>
      </div>
    </div>
  );
}
