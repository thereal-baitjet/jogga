import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, Target, Calendar, User, Activity, Zap, Check, MapPin, Clock, Dumbbell } from 'lucide-react';
import { ExperienceLevel, GoalType, UserProfile } from '../types';
import { cn } from '../lib/utils';

interface OnboardingProps {
  onComplete: (profile: UserProfile) => void;
}

const STEPS = [
  { id: 'welcome', title: 'Welcome to Jogga', icon: Zap },
  { id: 'name', title: 'What is your name?', icon: User },
  { id: 'experience', title: 'Your experience level?', icon: Activity },
  { id: 'goal', title: 'What is your goal?', icon: Target },
  { id: 'date', title: 'When is your target date?', icon: Calendar },
  { id: 'days', title: 'When can you train?', icon: Clock },
  { id: 'mileage', title: 'Current weekly mileage?', icon: MapPin },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    name: '',
    experienceLevel: 'beginner',
    goalType: '5k',
    goalDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    preferredDays: [1, 2, 3, 5, 6],
    weeklyMileagePreference: 15,
  });

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    onComplete(formData as UserProfile);
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  const toggleDay = (dayIndex: number) => {
    const current = formData.preferredDays || [];
    if (current.includes(dayIndex)) {
      setFormData({ ...formData, preferredDays: current.filter(d => d !== dayIndex) });
    } else {
      setFormData({ ...formData, preferredDays: [...current, dayIndex].sort() });
    }
  };

  const renderStep = () => {
    switch (STEPS[step].id) {
      case 'welcome':
        return (
          <div className="space-y-8 text-center py-12">
            <div className="w-32 h-32 mx-auto mb-8">
              <img 
                src="/mainLogo.png" 
                alt="Jogga Logo" 
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="space-y-4">
              <h2 className="text-4xl font-light tracking-tight">Meet your new personal coach.</h2>
              <p className="text-zinc-500 leading-relaxed">
                I'll build you a plan that adapts to your life, not the other way around. Let's get to know your running style.
              </p>
            </div>
          </div>
        );
      case 'name':
        return (
          <div className="space-y-6">
            <input
              type="text"
              placeholder="Enter your name"
              className="w-full bg-transparent border-b-2 border-zinc-800 p-4 text-4xl font-light focus:border-zinc-100 outline-none transition-colors placeholder:text-zinc-800"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              autoFocus
            />
            <p className="text-sm text-zinc-500">I'll use this to personalize your daily coaching cues.</p>
          </div>
        );
      case 'experience':
        return (
          <div className="grid grid-cols-1 gap-4">
            {(['beginner', 'intermediate', 'advanced'] as ExperienceLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setFormData({ ...formData, experienceLevel: level })}
                className={cn(
                  "p-6 rounded-3xl border-2 text-left transition-all relative group",
                  formData.experienceLevel === level 
                    ? "border-zinc-100 bg-zinc-100 text-zinc-900" 
                    : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
                )}
              >
                <div className="text-xl font-medium capitalize mb-1">{level}</div>
                <div className={cn(
                  "text-sm leading-relaxed",
                  formData.experienceLevel === level ? "text-zinc-600" : "text-zinc-500"
                )}>
                  {level === 'beginner' && "I'll focus on building your base safely and avoiding injury."}
                  {level === 'intermediate' && "We'll mix in speed work and structured endurance blocks."}
                  {level === 'advanced' && "I'll push your limits with high-intensity sessions and peak volume."}
                </div>
                {formData.experienceLevel === level && (
                  <div className="absolute right-6 top-1/2 -translate-y-1/2">
                    <Check size={20} />
                  </div>
                )}
              </button>
            ))}
          </div>
        );
      case 'goal':
        return (
          <div className="grid grid-cols-2 gap-4">
            {(['5k', '10k', 'half-marathon', 'marathon', 'fitness'] as GoalType[]).map((goal) => (
              <button
                key={goal}
                onClick={() => setFormData({ ...formData, goalType: goal })}
                className={cn(
                  "p-6 rounded-3xl border-2 text-left transition-all aspect-square flex flex-col justify-between",
                  formData.goalType === goal 
                    ? "border-zinc-100 bg-zinc-100 text-zinc-900" 
                    : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
                )}
              >
                <div className="w-10 h-10 rounded-2xl bg-zinc-800/10 flex items-center justify-center">
                  {goal === '5k' && <Zap size={20} />}
                  {goal === '10k' && <Activity size={20} />}
                  {goal === 'half-marathon' && <MapPin size={20} />}
                  {goal === 'marathon' && <Target size={20} />}
                  {goal === 'fitness' && <Dumbbell size={20} />}
                </div>
                <div className="text-lg font-medium capitalize leading-tight">{goal.replace('-', ' ')}</div>
              </button>
            ))}
          </div>
        );
      case 'date':
        return (
          <div className="space-y-8">
            <div className="relative">
              <input
                type="date"
                className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-3xl p-6 text-2xl font-light focus:border-zinc-100 outline-none transition-colors appearance-none"
                value={formData.goalDate}
                onChange={(e) => setFormData({ ...formData, goalDate: e.target.value })}
              />
              <Calendar className="absolute right-6 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={24} />
            </div>
            <div className="bg-zinc-900/50 p-6 rounded-3xl border border-zinc-800">
              <p className="text-sm text-zinc-400 leading-relaxed">
                We'll build your plan backwards from this date to ensure you're at peak performance when it matters most.
              </p>
            </div>
          </div>
        );
      case 'days':
        return (
          <div className="space-y-8">
            <p className="text-zinc-500">Select the days you're available to train each week.</p>
            <div className="grid grid-cols-4 gap-3">
              {DAYS.map((day, i) => (
                <button
                  key={day}
                  onClick={() => toggleDay(i)}
                  className={cn(
                    "h-16 rounded-2xl border-2 flex items-center justify-center font-medium transition-all",
                    formData.preferredDays?.includes(i)
                      ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                      : "border-zinc-800 text-zinc-500 hover:border-zinc-600"
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
            <div className="text-center">
              <p className="text-xs text-zinc-600 uppercase tracking-widest font-bold">
                {formData.preferredDays?.length} days selected
              </p>
            </div>
          </div>
        );
      case 'mileage':
        return (
          <div className="space-y-12 py-8">
            <div className="text-center space-y-2">
              <div className="text-7xl font-light tracking-tighter">{formData.weeklyMileagePreference}</div>
              <div className="text-sm text-zinc-500 uppercase tracking-widest font-bold">km per week</div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-100"
              value={formData.weeklyMileagePreference}
              onChange={(e) => setFormData({ ...formData, weeklyMileagePreference: parseInt(e.target.value) })}
            />
            <div className="flex justify-between text-xs text-zinc-600 font-bold uppercase tracking-widest">
              <span>Low Volume</span>
              <span>High Volume</span>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const Icon = STEPS[step].icon;

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto w-full">
      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-zinc-900 flex">
        {STEPS.map((_, i) => (
          <div 
            key={i}
            className={cn(
              "flex-1 transition-all duration-500",
              i <= step ? "bg-zinc-100" : "bg-transparent"
            )}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col p-8 pt-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 flex flex-col"
          >
            <div className="space-y-2 mb-12">
              <div className="flex items-center gap-2 text-zinc-500">
                <Icon size={16} />
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold">Step {step + 1} of {STEPS.length}</span>
              </div>
              <h1 className="text-4xl font-light tracking-tight leading-tight">{STEPS[step].title}</h1>
            </div>

            <div className="flex-1">
              {renderStep()}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="pt-8 flex items-center gap-4">
          {step > 0 && (
            <button
              onClick={back}
              className="w-16 h-16 rounded-3xl border-2 border-zinc-800 flex items-center justify-center hover:border-zinc-600 transition-colors shrink-0"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          <button
            onClick={next}
            disabled={STEPS[step].id === 'name' && !formData.name}
            className="flex-1 bg-zinc-100 text-zinc-900 h-16 rounded-3xl font-bold flex items-center justify-center gap-2 disabled:opacity-30 transition-all hover:bg-white active:scale-[0.98]"
          >
            <span>{step === STEPS.length - 1 ? 'Generate Plan' : 'Continue'}</span>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
