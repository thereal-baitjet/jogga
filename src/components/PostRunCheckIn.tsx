import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Star, MessageSquare, ChevronRight, Activity, Zap, Sparkles, Trophy, Info } from 'lucide-react';
import { LiveWorkoutData, Workout, WorkoutResult } from '../types';
import { cn } from '../lib/utils';
import { AIServiceError, getCachedAIResponse } from '../services/geminiService';
import { buildFeedbackReward } from '../services/feedbackRewardService';
import { getWorkoutReadyingPreview } from '../services/marathonReadyingService';
import { formatPace, getMeasurementLabel } from '../services/runMetricsService';
import type { CoachInsight, RecommendedAction, RiskLevel } from '../services/coachInsightService';
import { buildPostRunCoachFallbackData, buildPostRunCoachPrompt } from '../services/postRunCoachingService';

interface PostRunCheckInProps {
  workout: Workout;
  liveData: LiveWorkoutData | null;
  onComplete: (result: WorkoutResult) => void;
}

const actionLabels: Record<RecommendedAction, string> = {
  continue_plan: 'Continue Plan',
  reduce_intensity: 'Reduce Intensity',
  rest: 'Rest',
  repeat_workout: 'Repeat Workout',
  increase_carefully: 'Increase Carefully',
};

const riskLabels: Record<RiskLevel, string> = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
};

const riskClasses: Record<RiskLevel, string> = {
  low: 'bg-green-400/10 text-green-200 border-green-400/20',
  medium: 'bg-yellow-400/10 text-yellow-200 border-yellow-400/20',
  high: 'bg-red-400/10 text-red-200 border-red-400/20',
};

function formatRunDuration(durationSeconds: number | undefined, durationMinutes: number) {
  const totalSeconds = Number.isFinite(durationSeconds)
    ? Math.max(0, Math.round(durationSeconds || 0))
    : Math.max(0, Math.round(durationMinutes * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export default function PostRunCheckIn({ workout, liveData, onComplete }: PostRunCheckInProps) {
  const [effort, setEffort] = useState(5);
  const [notes, setNotes] = useState('');
  const [actualDistance, setActualDistance] = useState(liveData?.distance ?? 0);
  const [actualDuration, setActualDuration] = useState(liveData?.duration ?? 0);
  const [coachOpinion, setCoachOpinion] = useState<CoachInsight | null>(null);
  const [coachLimitMessage, setCoachLimitMessage] = useState<string | null>(null);
  const [coachLimitCta, setCoachLimitCta] = useState<string | null>(null);
  const [isGeneratingOpinion, setIsGeneratingOpinion] = useState(false);
  const isMeasuredRun = Boolean(liveData);
  const measurementLabel = getMeasurementLabel(liveData?.measurementSource);
  const runDurationLabel = formatRunDuration(liveData?.durationSeconds, actualDuration);
  const completionReadying = useMemo(() => getWorkoutReadyingPreview(workout), [workout]);
  const feedbackReward = useMemo(() => buildFeedbackReward(workout, {
    effort,
    notes,
    actualDistance,
    actualDuration,
    measurementSource: liveData?.measurementSource || 'manual',
  }), [actualDistance, actualDuration, effort, liveData?.measurementSource, notes, workout]);

  useEffect(() => {
    if (!liveData) return;
    setActualDistance(liveData.distance);
    setActualDuration(liveData.duration);
  }, [liveData]);

  useEffect(() => {
    const getCoachOpinion = async () => {
      if (!liveData) return;
      
      const fallbackInsight = buildPostRunCoachFallbackData(workout, liveData);
      setIsGeneratingOpinion(true);
      setCoachLimitMessage(null);
      setCoachLimitCta(null);
      try {
        const prompt = buildPostRunCoachPrompt(workout, liveData);
        const recentWorkoutSummary = [
          workout.type,
          workout.distanceTarget ? workout.distanceTarget.toFixed(2) : 'no-distance-target',
          workout.durationMinutes,
          workout.paceTarget || 'effort-based',
          liveData.distance.toFixed(2),
          liveData.duration,
          formatPace(liveData.duration, liveData.distance),
          liveData.measurementSource,
          liveData.gpsMetrics.sampleCount,
          Math.round(liveData.gpsMetrics.averageAccuracyMeters || 0),
        ].join('|');

        const response = await getCachedAIResponse(prompt, 'gemini-1.5-flash', {
          fallbackText: fallbackInsight.summary,
          fallbackData: fallbackInsight,
          cacheContext: {
            questionType: 'post_run_feedback',
            todayWorkoutId: workout.id,
            recentWorkoutSummary,
          },
        });

        setCoachOpinion(response.data || fallbackInsight);
      } catch (err) {
        console.error("Failed to get coach opinion:", err);
        if (err instanceof AIServiceError && (err.code === 'AI_FREE_LIMIT_REACHED' || err.code === 'AI_DAILY_LIMIT_REACHED')) {
          setCoachOpinion(fallbackInsight);
          setCoachLimitMessage(err.message);
          setCoachLimitCta(err.cta || (err.upgradeRequired ? 'Start a trial or choose a plan to keep using AI coaching.' : null));
        } else {
          setCoachOpinion(fallbackInsight);
        }
      } finally {
        setIsGeneratingOpinion(false);
      }
    };

    getCoachOpinion();
  }, [liveData, workout]);

  const handleSubmit = () => {
    const safeDistance = Number.isFinite(actualDistance) ? Math.max(0, actualDistance) : 0;
    const safeDuration = Number.isFinite(actualDuration) ? Math.max(0, actualDuration) : 0;
    const avgPace = formatPace(safeDuration, safeDistance);
    const finalFeedbackReward = buildFeedbackReward(workout, {
      effort,
      notes,
      actualDistance: safeDistance,
      actualDuration: safeDuration,
      measurementSource: liveData?.measurementSource || 'manual',
    });

    onComplete({
      completedAt: new Date().toISOString(),
      actualDistance: safeDistance,
      actualDuration: safeDuration,
      avgPace,
      perceivedEffort: effort,
      notes,
      feedbackReward: finalFeedbackReward,
      measurementSource: liveData?.measurementSource || 'manual',
      gpsMetrics: liveData?.gpsMetrics,
    });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 flex flex-col max-w-md mx-auto w-full space-y-10 pb-24">
      <div className="space-y-2 text-center">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-green-500" />
        </div>
        <h1 className="text-3xl font-light tracking-tight">Great run!</h1>
        <p className="text-zinc-500">How did it feel today?</p>
      </div>

      <div className="space-y-8 flex-1">
        {/* Coach's Opinion */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-400">
            <Sparkles size={16} className="text-zinc-100" />
            <h2 className="text-xs font-semibold uppercase tracking-widest">Coach's Opinion</h2>
          </div>
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Trophy size={60} />
            </div>
            {isGeneratingOpinion ? (
              <div className="flex flex-col items-center py-4 gap-3">
                <div className="w-6 h-6 border-2 border-zinc-100 border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest animate-pulse">Analyzing your performance...</p>
              </div>
            ) : coachOpinion ? (
              <div className="space-y-4">
                {coachLimitMessage && (
                  <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-xs leading-relaxed text-yellow-100">
                    <p>{coachLimitMessage} The deterministic coaching read is shown below.</p>
                    {coachLimitCta && (
                      <p className="mt-2 font-semibold">{coachLimitCta}</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-200">
                    {actionLabels[coachOpinion.recommendedAction]}
                  </span>
                  <span className={cn(
                    'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest',
                    riskClasses[coachOpinion.riskLevel],
                  )}>
                    {riskLabels[coachOpinion.riskLevel]}
                  </span>
                </div>

                <p className="text-sm text-zinc-100 leading-relaxed">
                  {coachOpinion.summary}
                </p>

                <div className="rounded-2xl bg-zinc-950/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Readiness</div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                    {coachOpinion.readinessMessage}
                  </p>
                </div>

                <ul className="space-y-2">
                  {coachOpinion.coachingPoints.map((point, index) => (
                    <li key={`${point}-${index}`} className="flex gap-3 text-xs leading-relaxed text-zinc-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Next Workout</div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                    {coachOpinion.nextWorkoutAdjustment.reason}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
                    <Info size={12} className="text-zinc-500" />
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest">AI Coaching Insights</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Save a measured run to get a specific coaching read for distance, duration, pace, and next-session adjustment.
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
                    <Info size={12} className="text-zinc-500" />
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Structured Coaching</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Run Summary Card */}
        {liveData && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-zinc-400">
              <Activity size={16} />
              <h2 className="text-xs font-semibold uppercase tracking-widest">Run Summary</h2>
            </div>
            <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 grid grid-cols-2 gap-y-8 gap-x-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <Zap size={80} />
              </div>
              <div className="col-span-2 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">You ran for</div>
                <div className="mt-1 text-3xl font-light tabular-nums">{runDurationLabel}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Distance</div>
                <div className="text-3xl font-light tabular-nums">
                  {actualDistance.toFixed(2)}
                  <span className="text-xs ml-1 opacity-50">km</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Duration</div>
                <div className="text-3xl font-light tabular-nums">
                  {actualDuration.toFixed(1)}
                  <span className="text-xs ml-1 opacity-50">min</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Avg Pace</div>
                <div className="text-3xl font-light tabular-nums">
                  {formatPace(actualDuration, actualDistance).replace(' min/km', '')}
                  <span className="text-xs ml-1 opacity-50">min/km</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">{measurementLabel}</div>
                <div className="text-3xl font-light tabular-nums">
                  {liveData.gpsMetrics.sampleCount}
                  <span className="text-xs ml-1 opacity-50">pts</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] leading-relaxed text-zinc-500">
              Feedback, rewards, readiness, and saved history use these measured run metrics.
            </p>
          </section>
        )}
        
        {/* Effort Slider */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-400">
              <Zap size={16} />
              <h2 className="text-xs font-semibold uppercase tracking-widest">Perceived Effort</h2>
            </div>
            <span className="text-2xl font-light">{effort}/10</span>
          </div>
          <input 
            type="range" 
            min="1" 
            max="10" 
            value={effort}
            onChange={(e) => setEffort(parseInt(e.target.value))}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-100"
          />
          <div className="flex justify-between text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
            <span>Easy</span>
            <span>Moderate</span>
            <span>Max Effort</span>
          </div>
        </section>

        {/* Stats Inputs */}
        <section className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-zinc-400">
              <Activity size={14} />
              <label className="text-[10px] font-semibold uppercase tracking-widest">
                {isMeasuredRun ? 'Measured Distance (km)' : 'Distance (km)'}
              </label>
            </div>
            <input 
              type="number" 
              aria-label={isMeasuredRun ? 'Measured distance in kilometers' : 'Distance in kilometers'}
              min="0"
              step="0.1"
              value={actualDistance}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                setActualDistance(Number.isFinite(value) ? value : 0);
              }}
              readOnly={isMeasuredRun}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-lg focus:border-zinc-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-zinc-400">
              <Star size={14} />
              <label className="text-[10px] font-semibold uppercase tracking-widest">
                {isMeasuredRun ? 'Measured Duration (min)' : 'Duration (min)'}
              </label>
            </div>
            <input 
              type="number" 
              aria-label={isMeasuredRun ? 'Measured duration in minutes' : 'Duration in minutes'}
              min="0"
              step="0.5"
              value={actualDuration}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                setActualDuration(Number.isFinite(value) ? value : 0);
              }}
              readOnly={isMeasuredRun}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-lg focus:border-zinc-500 outline-none"
            />
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-zinc-400">
            <MessageSquare size={14} />
            <label className="text-[10px] font-semibold uppercase tracking-widest">Notes</label>
          </div>
          <textarea 
            placeholder="How were your legs? Any soreness?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 h-32 focus:border-zinc-500 outline-none resize-none"
          />
        </section>

        {/* Training Momentum */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-400">
              <Sparkles size={16} className="text-yellow-400" />
              <h2 className="text-xs font-semibold uppercase tracking-normal">Training Momentum</h2>
            </div>
            <span className="rounded-full bg-yellow-400/10 px-3 py-1 text-xs font-bold text-yellow-200">
              +{completionReadying + feedbackReward.rewardPoints}
            </span>
          </div>

          <motion.div
            key={`${feedbackReward.signalStrength}-${feedbackReward.rewardPoints}-${notes.length}-${effort}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5 space-y-4 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-100">
                Run and feedback received
              </span>
              <span className={cn(
                'shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest',
                feedbackReward.rewardLevel === 'high'
                  ? 'bg-green-400/15 text-green-200'
                  : feedbackReward.rewardLevel === 'medium'
                    ? 'bg-blue-400/15 text-blue-200'
                    : 'bg-zinc-100/10 text-zinc-300'
              )}>
                {feedbackReward.signalStrength} signal
              </span>
            </div>

            <p className="text-sm leading-relaxed text-zinc-100 break-words">
              {feedbackReward.feedbackSummary}
            </p>

            <div className="flex items-start gap-3 rounded-2xl bg-zinc-950/50 p-4">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-zinc-950">
                <Zap size={14} fill="currentColor" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-yellow-50">{feedbackReward.rewardCue}</p>
                <p className="text-xs leading-relaxed text-zinc-400">Next: {feedbackReward.nextAction}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-yellow-400/10 pt-4">
              <div>
                <div className="text-sm font-medium text-zinc-100">+{completionReadying}</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Completion</div>
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-100">+{feedbackReward.rewardPoints}</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Feedback</div>
              </div>
            </div>
          </motion.div>
        </section>
      </div>

      <button 
        onClick={handleSubmit}
        className="w-full bg-zinc-100 text-zinc-900 py-5 rounded-full font-bold flex items-center justify-center gap-2 shadow-2xl active:scale-95 transition-all"
      >
        Save Run & Refresh Readiness
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
