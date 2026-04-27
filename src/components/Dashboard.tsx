import React from 'react';
import { motion } from 'motion/react';
import { Play, Calendar, Trophy, Zap, ChevronRight, Activity, TrendingUp, User } from 'lucide-react';
import { UserProfile, Workout, ReadinessScore } from '../types';
import { cn } from '../lib/utils';

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
  onInstall
}: DashboardProps) {
  const today = new Date().toISOString().split('T')[0];
  const todayWorkout = plan.find(w => w.date === today);
  const nextWorkouts = plan.filter(w => w.date > today).slice(0, 3);
  const completedWorkouts = plan.filter(w => w.status === 'completed').length;
  const hasEnoughData = completedWorkouts > 0;

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 p-6 space-y-8 max-w-md mx-auto w-full pb-24">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Good morning</p>
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
                {!hasEnoughData ? "NOT ENOUGH DATA" : "Readiness Score"}
              </span>
            </div>
            <div className="text-xs text-zinc-500">Updated today</div>
          </div>
          
          <div className="flex items-end gap-4">
            <div className="text-7xl font-light tracking-tighter">{readiness.score}%</div>
            <div className="mb-2 text-sm text-zinc-400 flex items-center gap-1">
              <TrendingUp size={14} className="text-green-500" />
              <span>+4% from yesterday</span>
            </div>
          </div>

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
                <span>{hasEnoughData ? `${readiness.streak}d` : '0s'}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Decorative background element */}
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full" />
      </motion.div>

      {/* Today's Workout */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-lg font-medium">Today's Workout</h2>
          <button onClick={onViewPlan} className="text-xs text-zinc-500 flex items-center gap-1 hover:text-zinc-300 transition-colors">
            View Plan <ChevronRight size={14} />
          </button>
        </div>

        {todayWorkout ? (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectWorkout(todayWorkout)}
            className="w-full bg-zinc-100 text-zinc-900 rounded-3xl p-6 text-left space-y-4 shadow-xl shadow-zinc-950/50"
          >
            <div className="flex items-center justify-between">
              <div className="bg-zinc-900/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                {todayWorkout.type}
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold">
                <Calendar size={14} />
                <span>Today</span>
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-3xl font-light tracking-tight">{todayWorkout.durationMinutes} min {todayWorkout.type}</h3>
              <p className="text-sm opacity-70 line-clamp-2">{todayWorkout.instructions}</p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-4">
                {todayWorkout.distanceTarget && (
                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase tracking-widest opacity-50">Distance</div>
                    <div className="text-sm font-bold">{todayWorkout.distanceTarget} km</div>
                  </div>
                )}
                {todayWorkout.paceTarget && (
                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase tracking-widest opacity-50">Pace</div>
                    <div className="text-sm font-bold">{todayWorkout.paceTarget}</div>
                  </div>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-100">
                <Play size={20} fill="currentColor" />
              </div>
            </div>
          </motion.button>
        ) : (
          <div className="bg-zinc-900/50 rounded-3xl p-8 text-center border border-dashed border-zinc-800">
            <p className="text-zinc-500">Rest Day</p>
            <p className="text-sm text-zinc-600">Enjoy your recovery!</p>
          </div>
        )}
      </section>

      {/* Upcoming */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium px-2">Upcoming</h2>
        <div className="space-y-3">
          {nextWorkouts.map((workout, i) => (
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
                  {new Date(workout.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </div>
                <div className="font-medium">{workout.type}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">{workout.durationMinutes}m</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Effort {workout.effortTarget}/10</div>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Navigation Bar (Mock) */}
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-800 p-4 flex justify-around items-center z-50">
        <button className="p-2 text-zinc-100"><Zap size={24} /></button>
        <button onClick={onViewPlan} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"><Calendar size={24} /></button>
        <button onClick={onViewAchievements} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"><Trophy size={24} /></button>
        <button onClick={onViewHealth} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"><Activity size={24} /></button>
      </div>
    </div>
  );
}
