import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Trophy, Medal, Zap, Target, Award, Star, Sparkles } from 'lucide-react';
import { Achievement, MarathonReadyingProfile } from '../types';
import { cn } from '../lib/utils';

interface AchievementsViewProps {
  achievements: Achievement[];
  marathonReadying?: MarathonReadyingProfile;
  onBack: () => void;
}

const iconMap: Record<string, React.ReactNode> = {
  medal: <Medal size={24} />,
  zap: <Zap size={24} />,
  target: <Target size={24} />,
  award: <Award size={24} />,
  star: <Star size={24} />,
};

export default function AchievementsView({ achievements, marathonReadying, onBack }: AchievementsViewProps) {
  const unlocked = achievements.filter(a => a.unlockedAt);
  const locked = achievements.filter(a => !a.unlockedAt);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto w-full">
      {/* Header */}
      <header className="p-6 flex items-center gap-4 border-b border-zinc-900">
        <button 
          onClick={onBack}
          aria-label="Back to dashboard"
          className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 hover:bg-zinc-800 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-light tracking-tight">Achievements</h1>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
            {unlocked.length} of {achievements.length} Unlocked
          </p>
        </div>
        <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20 text-yellow-500">
          {marathonReadying ? <span className="text-xs font-bold">{marathonReadying.level}</span> : <Trophy size={20} />}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-24">
        {marathonReadying && (
          <section className="rounded-3xl border border-yellow-400/20 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-400">
                <Sparkles size={16} className="text-yellow-400" />
                <span className="text-xs font-semibold uppercase tracking-normal">Training Momentum</span>
              </div>
              <span className="rounded-full bg-yellow-400/10 px-3 py-1 text-xs font-bold text-yellow-200">
                {marathonReadying.achievementPoints} achievement pts
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-lg font-light">{marathonReadying.level}</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Level</div>
              </div>
              <div>
                <div className="text-lg font-light">{marathonReadying.totalPoints}</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Total</div>
              </div>
              <div>
                <div className="text-lg font-light">{marathonReadying.currentStreak}d</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Streak</div>
              </div>
            </div>
          </section>
        )}

        {/* Unlocked Section */}
        {unlocked.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-2">Unlocked</h2>
            <div className="grid grid-cols-1 gap-3">
              {unlocked.map((achievement) => (
                <motion.div
                  key={achievement.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-500 shrink-0">
                    {iconMap[achievement.iconName] || <Medal size={24} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-medium">{achievement.title}</h3>
                      <span className="shrink-0 text-xs font-bold text-yellow-200">+50</span>
                    </div>
                    <p className="text-xs text-zinc-500">{achievement.description}</p>
                    <div className="mt-1 text-[8px] uppercase tracking-widest text-zinc-600 font-bold">
                      Unlocked {new Date(achievement.unlockedAt!).toLocaleDateString()}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Locked Section */}
        {locked.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-2">In Progress</h2>
            <div className="grid grid-cols-1 gap-3">
              {locked.map((achievement) => (
                <div
                  key={achievement.id}
                  className="bg-zinc-900/30 rounded-2xl p-4 border border-zinc-800/50 flex items-center gap-4 grayscale opacity-60"
                >
                  <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-600 shrink-0">
                    {iconMap[achievement.iconName] || <Medal size={24} />}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div>
                      <h3 className="text-sm font-medium text-zinc-400">{achievement.title}</h3>
                      <p className="text-xs text-zinc-600">{achievement.description}</p>
                    </div>
                    {achievement.progress !== undefined && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[8px] uppercase tracking-widest font-bold">
                          <span className="text-zinc-600">Progress</span>
                          <span className="text-zinc-500">{achievement.progress}%</span>
                        </div>
                        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-zinc-600 rounded-full transition-all duration-500"
                            style={{ width: `${achievement.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
