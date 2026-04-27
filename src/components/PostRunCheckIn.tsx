import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Star, MessageSquare, ChevronRight, Activity, Zap, MapPin, Sparkles, Trophy, Info } from 'lucide-react';
import { Workout, WorkoutResult } from '../types';
import { cn } from '../lib/utils';
import { getCachedAIResponse } from '../services/geminiService';

interface PostRunCheckInProps {
  workout: Workout;
  liveData: { distance: number; duration: number; path: { lat: number; lng: number; timestamp: number }[] } | null;
  onComplete: (result: WorkoutResult) => void;
}

export default function PostRunCheckIn({ workout, liveData, onComplete }: PostRunCheckInProps) {
  const [effort, setEffort] = useState(5);
  const [notes, setNotes] = useState('');
  const [actualDistance, setActualDistance] = useState(liveData?.distance || workout.distanceTarget || 0);
  const [actualDuration, setActualDuration] = useState(liveData?.duration || workout.durationMinutes);
  const [coachOpinion, setCoachOpinion] = useState<string | null>(null);
  const [isGeneratingOpinion, setIsGeneratingOpinion] = useState(false);

  useEffect(() => {
    const getCoachOpinion = async () => {
      if (!liveData) return;
      
      setIsGeneratingOpinion(true);
      try {
        const avgPace = liveData.distance > 0 ? (liveData.duration / liveData.distance).toFixed(2) : '0:00';
        
        const prompt = `You are a professional running coach. A runner just finished a workout.
        Workout Type: ${workout.type}
        Target Pace: ${workout.paceTarget || 'Easy effort'}
        Target Duration: ${workout.durationMinutes} min
        
        Actual Stats:
        Distance: ${liveData.distance.toFixed(2)} km
        Duration: ${liveData.duration} min
        Average Pace: ${avgPace} min/km
        
        Provide a short, encouraging, and insightful "Coach's Opinion" (max 3 sentences). 
        Mention if they hit their targets and give one tip for recovery or their next run.
        Keep the tone professional yet motivating.`;

        const response = await getCachedAIResponse(prompt);

        setCoachOpinion(response.text || "Great job today! Keep up the consistency.");
      } catch (err) {
        console.error("Failed to get coach opinion:", err);
        setCoachOpinion("Excellent work on completing your session. Consistency is the key to progress!");
      } finally {
        setIsGeneratingOpinion(false);
      }
    };

    getCoachOpinion();
  }, [liveData, workout]);

  const handleSubmit = () => {
    const paceVal = actualDistance > 0 ? (actualDuration / actualDistance) : 0;
    const mins = Math.floor(paceVal);
    const secs = Math.round((paceVal - mins) * 60);
    const avgPace = `${mins}:${secs.toString().padStart(2, '0')} min/km`;

    onComplete({
      completedAt: new Date().toISOString(),
      actualDistance,
      actualDuration,
      avgPace,
      perceivedEffort: effort,
      notes,
      path: liveData?.path
    });
  };

  const renderMap = () => {
    if (!liveData?.path || liveData.path.length < 2) return null;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    
    // If we have an API key, use the Static Maps API
    if (apiKey) {
      // Encode the path for the Static Maps API
      // For simplicity, we'll just take a subset of points to avoid URL length limits
      const step = Math.max(1, Math.floor(liveData.path.length / 50));
      const sampledPath = liveData.path.filter((_, i) => i % step === 0);
      const pathStr = sampledPath.map(p => `${p.lat},${p.lng}`).join('|');
      
      const start = liveData.path[0];
      const end = liveData.path[liveData.path.length - 1];
      
      const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&scale=2&maptype=roadmap&style=feature:all|element:all|saturation:-100|lightness:-20|visibility:on&style=feature:administrative|element:geometry|visibility:off&style=feature:poi|element:all|visibility:off&style=feature:road|element:all|saturation:-100|visibility:on&style=feature:transit|element:all|visibility:off&style=feature:water|element:all|color:0x000000|visibility:on&path=color:0x10b981|weight:5|${pathStr}&markers=color:blue|label:S|${start.lat},${start.lng}&markers=color:red|label:F|${end.lat},${end.lng}&key=${apiKey}`;

      return (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-400">
            <MapPin size={16} />
            <h2 className="text-xs font-semibold uppercase tracking-widest">Route Analysis</h2>
          </div>
          <div className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 aspect-[2/1] relative group">
            <img 
              src={mapUrl} 
              alt="Run Route" 
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/50 to-transparent pointer-events-none" />
          </div>
        </section>
      );
    }

    // Fallback to SVG if no API key
    const lats = liveData.path.map(p => p.lat);
    const lngs = liveData.path.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const width = 300;
    const height = 150;
    const padding = 20;

    const scaleX = (lng: number) => padding + ((lng - minLng) / (maxLng - minLng || 1)) * (width - 2 * padding);
    const scaleY = (lat: number) => height - (padding + ((lat - minLat) / (maxLat - minLat || 1)) * (height - 2 * padding));

    const points = liveData.path.map(p => `${scaleX(p.lng)},${scaleY(p.lat)}`).join(' ');

    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-zinc-400">
          <MapPin size={16} />
          <h2 className="text-xs font-semibold uppercase tracking-widest">Route Analysis (Preview)</h2>
        </div>
        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 flex justify-center overflow-hidden relative">
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          
          <svg width={width} height={height} className="overflow-visible relative z-10">
            <defs>
              <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <polyline
              points={points}
              fill="none"
              stroke="url(#routeGradient)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
            />
            <g transform={`translate(${scaleX(liveData.path[0].lng)},${scaleY(liveData.path[0].lat)})`}>
              <circle r="6" fill="#3b82f6" className="animate-pulse" />
              <circle r="3" fill="white" />
            </g>
            <g transform={`translate(${scaleX(liveData.path[liveData.path.length - 1].lng)},${scaleY(liveData.path[liveData.path.length - 1].lat)})`}>
              <circle r="6" fill="#ef4444" />
              <circle r="3" fill="white" />
            </g>
          </svg>
        </div>
        <p className="text-[8px] text-zinc-600 uppercase tracking-widest text-center">
          Add a Google Maps API Key to see real terrain data
        </p>
      </section>
    );
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
        {renderMap()}

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
            ) : (
              <div className="space-y-3">
                <p className="text-sm italic text-zinc-300 leading-relaxed">
                  "{coachOpinion}"
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
                    <Info size={12} className="text-zinc-500" />
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest">AI Coaching Insights</span>
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
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Distance</div>
                <div className="text-3xl font-light tabular-nums">
                  {liveData.distance.toFixed(2)}
                  <span className="text-xs ml-1 opacity-50">km</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Duration</div>
                <div className="text-3xl font-light tabular-nums">
                  {liveData.duration}
                  <span className="text-xs ml-1 opacity-50">min</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Avg Pace</div>
                <div className="text-3xl font-light tabular-nums">
                  {liveData.distance > 0 ? (() => {
                    const paceVal = liveData.duration / liveData.distance;
                    const mins = Math.floor(paceVal);
                    const secs = Math.round((paceVal - mins) * 60);
                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                  })() : '0:00'}
                  <span className="text-xs ml-1 opacity-50">min/km</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Work Done</div>
                <div className="text-3xl font-light tabular-nums">
                  {Math.round(liveData.distance * 65)}
                  <span className="text-xs ml-1 opacity-50">kcal</span>
                </div>
              </div>
            </div>
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
              <label className="text-[10px] font-semibold uppercase tracking-widest">Distance (km)</label>
            </div>
            <input 
              type="number" 
              value={actualDistance}
              onChange={(e) => setActualDistance(parseFloat(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-lg focus:border-zinc-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-zinc-400">
              <Star size={14} />
              <label className="text-[10px] font-semibold uppercase tracking-widest">Duration (min)</label>
            </div>
            <input 
              type="number" 
              value={actualDuration}
              onChange={(e) => setActualDuration(parseInt(e.target.value))}
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
      </div>

      <button 
        onClick={handleSubmit}
        className="w-full bg-zinc-100 text-zinc-900 py-5 rounded-full font-bold flex items-center justify-center gap-2 shadow-2xl active:scale-95 transition-all"
      >
        Save & Update Plan
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
