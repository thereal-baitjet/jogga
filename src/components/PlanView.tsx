import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Calendar, CheckCircle2, Circle, Clock, MapPin, XCircle, Sparkles } from 'lucide-react';
import { Workout, WorkoutType } from '../types';
import { cn } from '../lib/utils';
import { startOfWeek, addDays, format, isSameDay } from 'date-fns';
import { formatDateLabel, parseLocalDate, todayDate } from '../lib/date';
import { getWorkoutReadyingEarned, getWorkoutReadyingPreview } from '../services/marathonReadyingService';
import { getCompletedDistanceLabel, getCompletedDurationLabel } from '../services/runMetricsService';

interface PlanViewProps {
  workouts: Workout[];
  goalDate: string;
  onBack: () => void;
  onSelectWorkout: (workout: Workout) => void;
  onSetNewGoal: () => void;
}

const TYPE_COLORS: Record<WorkoutType, string> = {
  'Easy run': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Long run': 'bg-green-500/10 text-green-400 border-green-500/20',
  'Tempo run': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'Interval session': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Recovery run': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'Race-pace run': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Hill workout': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  'Strength session': 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  'Mobility/recovery session': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
};

export default function PlanView({ workouts, goalDate, onBack, onSelectWorkout, onSetNewGoal }: PlanViewProps) {
  const today = todayDate();
  // Group by actual calendar weeks
  const weeks: { weekNumber: number; days: (Workout | null)[] }[] = [];
  
  if (workouts.length > 0) {
    const firstDate = parseLocalDate(workouts[0].date);
    const profileGoalDate = parseLocalDate(goalDate);
    const finalWorkoutDate = parseLocalDate(workouts[workouts.length - 1].date);
    const lastDate = profileGoalDate > finalWorkoutDate ? profileGoalDate : finalWorkoutDate;
    
    let currentDate = startOfWeek(firstDate, { weekStartsOn: 1 });
    let weekIndex = 1;
    
    while (currentDate <= lastDate) {
      const days: (Workout | null)[] = [];
      for (let i = 0; i < 7; i++) {
        const dayDate = addDays(currentDate, i);
        const dayStr = format(dayDate, 'yyyy-MM-dd');
        const workout = workouts.find(w => w.date === dayStr);
        days.push(workout || null);
      }
      weeks.push({ weekNumber: weekIndex, days });
      currentDate = addDays(currentDate, 7);
      weekIndex++;
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto w-full">
      {/* Header */}
      <header className="p-6 flex items-center gap-4 border-b border-zinc-900 sticky top-0 bg-zinc-950/80 backdrop-blur-xl z-10">
        <button onClick={onBack} className="p-2 hover:bg-zinc-900 rounded-full transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-medium">Training Plan</h1>
          <div className="text-xs text-zinc-500">Goal: {formatDateLabel(goalDate, 'MMM d, yyyy')}</div>
          <button onClick={onSetNewGoal} className="text-xs text-zinc-400 hover:text-zinc-100 underline mt-1">Set New Goal</button>
        </div>
      </header>

      {/* Content */}
      <div className="p-6 space-y-10 pb-24">
        {weeks.length === 0 ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6 text-center space-y-4">
            <Calendar size={28} className="mx-auto text-zinc-500" />
            <div className="space-y-2">
              <h2 className="text-lg font-medium">Training plan is generating</h2>
              <p className="text-sm text-zinc-500">Set a goal again if workouts do not appear in a moment.</p>
            </div>
            <button
              onClick={onSetNewGoal}
              className="w-full rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-900 transition-colors hover:bg-white"
            >
              Set New Goal
            </button>
          </div>
        ) : weeks.map((week) => (
          <section key={week.weekNumber} className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Week {week.weekNumber}</h2>
              <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                {week.days.filter(d => d?.status === 'completed').length} Completed
              </span>
            </div>

            <div className="space-y-3">
              {week.days.map((workout, dayIndex) => {
                const firstWorkoutInWeek = week.days.find(d => d !== null);
                const weekStartDate = firstWorkoutInWeek 
                  ? startOfWeek(parseLocalDate(firstWorkoutInWeek.date), { weekStartsOn: 1 })
                  : addDays(startOfWeek(parseLocalDate(workouts[0].date), { weekStartsOn: 1 }), (week.weekNumber - 1) * 7);
                
                const dayDate = addDays(weekStartDate, dayIndex);
                const isGoalDay = isSameDay(dayDate, parseLocalDate(goalDate));
                const goalWorkout = workouts.find(w => w.date === goalDate);
                const isGoalDayCompleted = goalWorkout?.status === 'completed';

                if (isGoalDay) {
                  return (
                    <div key={`goal-${week.weekNumber}-${dayIndex}`} className={cn(
                      "w-full rounded-2xl p-4 flex items-center gap-4 border",
                      isGoalDayCompleted ? "border-green-500/30 bg-green-500/10" : "border-zinc-700 bg-zinc-900"
                    )}>
                      <CheckCircle2 size={24} className={isGoalDayCompleted ? "text-green-500" : "text-zinc-500"} />
                      <div className="flex-1 text-left">
                        <div className={cn("text-[10px] font-bold uppercase tracking-widest", isGoalDayCompleted ? "text-green-500" : "text-zinc-400")}>
                          {format(dayDate, 'EEE, MMM d')}
                        </div>
                        <div className={cn("text-sm font-medium", isGoalDayCompleted ? "text-green-100" : "text-zinc-100")}>
                          {isGoalDayCompleted ? "Training Complete!" : "Goal Day"}
                        </div>
                      </div>
                    </div>
                  );
                }

                if (!workout) {
                  // Render a rest day placeholder
                  return (
                    <div key={`rest-${week.weekNumber}-${dayIndex}`} className="w-full rounded-2xl p-4 flex items-center gap-4 border border-zinc-900/30 bg-zinc-900/10 opacity-40">
                      <div className="shrink-0 w-6 h-6 rounded-full border border-zinc-800" />
                      <div className="flex-1 text-left">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                          {format(dayDate, 'EEE, MMM d')}
                        </div>
                        <div className="text-sm text-zinc-600">Rest Day</div>
                      </div>
                    </div>
                  );
                }

                const isFuture = parseLocalDate(workout.date) > today;
                const readyingPoints = workout.status === 'completed'
                  ? getWorkoutReadyingEarned(workout)
                  : getWorkoutReadyingPreview(workout);
                const durationLabel = workout.status === 'completed'
                  ? getCompletedDurationLabel(workout)
                  : `${workout.durationMinutes}m`;
                const distanceLabel = workout.status === 'completed'
                  ? getCompletedDistanceLabel(workout)
                  : workout.distanceTarget
                    ? `${workout.distanceTarget}km`
                    : null;

                return (
                  <motion.button
                    key={workout.id}
                    whileTap={!isFuture ? { scale: 0.98 } : {}}
                    onClick={() => !isFuture && onSelectWorkout(workout)}
                    className={cn(
                      "w-full rounded-2xl p-4 flex items-center gap-4 border transition-all",
                      isFuture ? "bg-zinc-900/10 border-zinc-900/30 opacity-50 cursor-default" :
                      workout.status === 'completed' 
                        ? "bg-zinc-900/30 border-zinc-900 opacity-60" 
                        : workout.status === 'missed'
                          ? "bg-red-500/5 border-red-500/20"
                      : "bg-zinc-900/50 border-zinc-800/50 hover:border-zinc-700"
                    )}
                  >
                    <div className="shrink-0">
                      {workout.status === 'completed' ? (
                        <CheckCircle2 size={24} className="text-green-500" />
                      ) : workout.status === 'missed' ? (
                        <XCircle size={24} className="text-red-400" />
                      ) : isFuture ? (
                        <div className="w-6 h-6 rounded-full border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-700">PRE</div>
                      ) : (
                        <Circle size={24} className="text-zinc-700" />
                      )}
                    </div>

                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          {formatDateLabel(workout.date)}
                        </span>
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-widest", TYPE_COLORS[workout.type])}>
                          {workout.type}
                        </span>
                      </div>
                      <div className="font-medium">
                        {workout.status === 'completed' ? `${durationLabel} completed` : `${durationLabel} ${workout.type}`}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 text-zinc-500">
                      <div className={cn(
                        "flex items-center gap-1 text-xs font-bold",
                        workout.status === 'completed' ? "text-yellow-300" : "text-zinc-600"
                      )}>
                        <Sparkles size={12} />
                        <span>+{readyingPoints}</span>
                      </div>
                      {distanceLabel && (
                        <div className="flex items-center gap-1 text-xs">
                          <MapPin size={12} />
                          <span>{distanceLabel}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs">
                        <Clock size={12} />
                        <span>{durationLabel}</span>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
