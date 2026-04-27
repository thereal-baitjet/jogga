import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Play, Info, AlertCircle, Clock, MapPin, Gauge, CheckCircle2 } from 'lucide-react';
import { Workout, WorkoutType } from '../types';
import { cn } from '../lib/utils';

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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto w-full relative">
      {/* Hero Section */}
      <div className="relative h-72 shrink-0 overflow-hidden">
        <img 
          src={`https://picsum.photos/seed/${workout.type}/800/600?blur=2`} 
          alt={workout.type}
          className="w-full h-full object-cover opacity-40"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
        
        <button 
          onClick={onBack}
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
              <div className="text-lg font-medium">{workout.durationMinutes}m</div>
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
          {workout.distanceTarget && (
            <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 flex items-center gap-3">
              <MapPin size={18} className="text-zinc-500" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  {isCompleted ? 'Actual Distance' : 'Distance'}
                </div>
                <div className="text-lg font-medium">{workout.distanceTarget}km</div>
              </div>
            </div>
          )}
          {(workout.paceTarget || (isCompleted && workout.result?.avgPace)) && (
            <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 flex items-center gap-3">
              <Activity size={18} className="text-zinc-500" />
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
        </div>

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

        {/* Run Map (if completed) */}
        {isCompleted && workout.result?.path && workout.result.path.length > 1 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-zinc-400">
              <MapPin size={16} />
              <h2 className="text-sm font-semibold uppercase tracking-widest">Run Map</h2>
            </div>
            <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex justify-center overflow-hidden">
              {(() => {
                const path = workout.result.path;
                const lats = path.map(p => p.lat);
                const lngs = path.map(p => p.lng);
                const minLat = Math.min(...lats);
                const maxLat = Math.max(...lats);
                const minLng = Math.min(...lngs);
                const maxLng = Math.max(...lngs);

                const width = 300;
                const height = 150;
                const padding = 20;

                const scaleX = (lng: number) => padding + ((lng - minLng) / (maxLng - minLng || 1)) * (width - 2 * padding);
                const scaleY = (lat: number) => height - (padding + ((lat - minLat) / (maxLat - minLat || 1)) * (height - 2 * padding));

                const points = path.map(p => `${scaleX(p.lng)},${scaleY(p.lat)}`).join(' ');

                return (
                  <svg width={width} height={height} className="overflow-visible">
                    <polyline
                      points={points}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx={scaleX(path[0].lng)} cy={scaleY(path[0].lat)} r="4" fill="#3b82f6" />
                    <circle cx={scaleX(path[path.length - 1].lng)} cy={scaleY(path[path.length - 1].lat)} r="4" fill="#ef4444" />
                  </svg>
                );
              })()}
            </div>
          </section>
        )}

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
              Workout Completed
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

function Activity({ size, className }: { size: number, className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
