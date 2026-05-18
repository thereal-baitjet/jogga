import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, Target, Calendar, User, Activity, Zap, Check, MapPin, Clock, Dumbbell, Lock, ShieldCheck } from 'lucide-react';
import { ExperienceLevel, GoalType, JoggaNiche, UserProfile } from '../types';
import { JOGGA_STRATEGY, getEnabledNicheEntries, getNicheConfig } from '../config/joggaStrategy';
import { cn } from '../lib/utils';
import { defaultGoalDate, isDateAfterToday } from '../lib/date';

interface OnboardingProps {
  onComplete: (profile: UserProfile) => void;
  onConnectStrava?: () => Promise<void>;
  isStravaConnected?: boolean;
}

const STEPS = [
  { id: 'welcome', title: 'Welcome to Jogga', icon: Zap },
  { id: 'niche', title: 'What brings you here?', icon: ShieldCheck },
  { id: 'name', title: 'What is your name?', icon: User },
  { id: 'experience', title: 'Your experience level?', icon: Activity },
  { id: 'goal', title: 'What is your goal?', icon: Target },
  { id: 'date', title: 'When is your target date?', icon: Calendar },
  { id: 'days', title: 'When can you train?', icon: Clock },
  { id: 'mileage', title: 'Current weekly mileage?', icon: MapPin },
  { id: 'strava', title: 'Connect Strava Free?', icon: Lock },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MIN_WEEKLY_KM = 5;
const MAX_WEEKLY_KM = 100;
const ENABLED_NICHES = getEnabledNicheEntries();

export default function Onboarding({ onComplete, onConnectStrava, isStravaConnected = false }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [botTrap, setBotTrap] = useState('');
  const [botTrapError, setBotTrapError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [stravaError, setStravaError] = useState<string | null>(null);
  const [isConnectingStrava, setIsConnectingStrava] = useState(false);
  const minGoalDate = defaultGoalDate(1);
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    niche: 'anti_social_runner',
    privacyDefault: JOGGA_STRATEGY.antiStravaDefaults.newUserPrivacy,
    socialFeaturesDisabled: [...JOGGA_STRATEGY.niches.anti_social_runner.planRules.socialFeaturesDisabled],
    name: '',
    experienceLevel: 'beginner',
    goalType: '5k',
    goalDate: defaultGoalDate(),
    preferredDays: [1, 2, 3, 5, 6],
    weeklyMileagePreference: 15,
  });

  const getStepError = (stepIndex = step) => {
    const stepId = STEPS[stepIndex].id;

    if (stepId === 'name' && !formData.name?.trim()) {
      return 'Enter your name so the coaching can feel personal.';
    }

    if (stepId === 'niche' && !formData.niche) {
      return 'Choose the coaching lane that fits you best.';
    }

    if (stepId === 'date' && (!formData.goalDate || !isDateAfterToday(formData.goalDate))) {
      return 'Choose a target date after today.';
    }

    if (stepId === 'days' && (!formData.preferredDays || formData.preferredDays.length === 0)) {
      return 'Choose at least one day you can train.';
    }

    if (stepId === 'mileage' && (typeof formData.weeklyMileagePreference !== 'number' || formData.weeklyMileagePreference < MIN_WEEKLY_KM)) {
      return `Set at least ${MIN_WEEKLY_KM} km so the plan starts with a real baseline.`;
    }

    return null;
  };

  const chooseNiche = (niche: JoggaNiche) => {
    const nicheConfig = getNicheConfig(niche);
    const socialFeaturesDisabled = 'socialFeaturesDisabled' in nicheConfig.planRules
      ? [...nicheConfig.planRules.socialFeaturesDisabled]
      : [];

    setFormData({
      ...formData,
      niche,
      privacyDefault: JOGGA_STRATEGY.antiStravaDefaults.newUserPrivacy,
      socialFeaturesDisabled,
    });
  };

  const connectStrava = async () => {
    if (!onConnectStrava) {
      setStravaError('Strava connection is not available in this build.');
      return;
    }

    setStravaError(null);
    setIsConnectingStrava(true);
    try {
      await onConnectStrava();
    } catch (error) {
      setStravaError(error instanceof Error ? error.message : 'Could not open Strava connection.');
    } finally {
      setIsConnectingStrava(false);
    }
  };

  const next = () => {
    const stepError = getStepError();
    if (stepError) {
      setValidationError(stepError);
      return;
    }

    setValidationError(null);
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    if (botTrap.trim().length > 0) {
      setBotTrapError('Unable to generate the plan. Refresh and try again.');
      return;
    }

    if (Date.now() - startedAt < 1500) {
      setBotTrapError('Please wait a moment before generating the plan.');
      return;
    }

    for (let i = 0; i < STEPS.length; i++) {
      const stepError = getStepError(i);
      if (stepError) {
        setValidationError(stepError);
        setStep(i);
        return;
      }
    }

    setBotTrapError(null);
    onComplete({
      ...formData,
      niche: formData.niche || 'anti_social_runner',
      privacyDefault: JOGGA_STRATEGY.antiStravaDefaults.newUserPrivacy,
      socialFeaturesDisabled: formData.socialFeaturesDisabled || ['all'],
      name: formData.name?.trim() || '',
      goalDate: formData.goalDate || defaultGoalDate(),
      preferredDays: formData.preferredDays || [],
      weeklyMileagePreference: Math.max(MIN_WEEKLY_KM, formData.weeklyMileagePreference || MIN_WEEKLY_KM),
    } as UserProfile);
  };

  const back = () => {
    setValidationError(null);
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
                src="/app-icon-logo.png" 
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
      case 'niche':
        return (
          <div className="space-y-5">
            <p className="text-sm text-zinc-500 leading-relaxed">
              Private coaching for runners Strava ignores. Choose the lane that fits your body, season, and goals.
            </p>
            <div className="grid grid-cols-1 gap-3">
              {ENABLED_NICHES.map(([niche, config]) => (
                <button
                  key={niche}
                  onClick={() => chooseNiche(niche)}
                  aria-pressed={formData.niche === niche}
                  className={cn(
                    "p-5 rounded-3xl border-2 text-left transition-all relative",
                    formData.niche === niche
                      ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                      : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
                  )}
                >
                  <div className="pr-8">
                    <div className="text-lg font-medium leading-tight">{config.headline}</div>
                    <div className={cn(
                      "text-sm leading-relaxed mt-2",
                      formData.niche === niche ? "text-zinc-600" : "text-zinc-500"
                    )}>
                      {config.subhead}
                    </div>
                  </div>
                  {formData.niche === niche && (
                    <div className="absolute right-5 top-1/2 -translate-y-1/2">
                      <Check size={20} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      case 'name':
        return (
          <div className="space-y-6">
            <input
              type="text"
              aria-label="Your name"
              autoComplete="given-name"
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
                aria-label="Target date"
                className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-3xl p-6 text-2xl font-light focus:border-zinc-100 outline-none transition-colors appearance-none"
                min={minGoalDate}
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
                  aria-pressed={formData.preferredDays?.includes(i)}
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
              aria-label="Current weekly mileage in kilometers"
              min={MIN_WEEKLY_KM}
              max={MAX_WEEKLY_KM}
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
      case 'strava':
        return (
          <div className="space-y-8 py-6">
            <div className="space-y-3">
              <p className="text-zinc-500 leading-relaxed">
                {JOGGA_STRATEGY.stravaIntegration.onboardingCopy}
              </p>
              <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-5">
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <Lock size={18} />
                  <span>No posts, no segments, no kudos, no leaderboard defaults.</span>
                </div>
              </div>
            </div>

            <button
              onClick={connectStrava}
              disabled={isConnectingStrava || isStravaConnected}
              className={cn(
                "w-full h-16 rounded-3xl font-bold transition-all",
                isStravaConnected
                  ? "border-2 border-green-400/30 bg-green-400/10 text-green-100"
                  : "bg-[#fc4c02] text-white hover:bg-[#ff5a1a] active:scale-[0.98]"
              )}
              type="button"
            >
              {isStravaConnected ? 'Strava Free Connected' : isConnectingStrava ? 'Opening Strava...' : 'Connect Strava Free'}
            </button>
            <p className="text-center text-xs text-zinc-600">
              Optional. Your plan still works without Strava.
            </p>
            {stravaError && (
              <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                {stravaError}
              </p>
            )}
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
        <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="jogga-company">Company</label>
          <input
            id="jogga-company"
            name="company"
            type="text"
            value={botTrap}
            onChange={(event) => setBotTrap(event.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

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

        {botTrapError && (
          <p role="alert" className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            {botTrapError}
          </p>
        )}
        {validationError && (
          <p role="alert" className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 px-4 py-3 text-xs text-yellow-100">
            {validationError}
          </p>
        )}

        <div className="pt-8 flex items-center gap-4">
          {step > 0 && (
            <button
              onClick={back}
              aria-label="Go back"
              className="w-16 h-16 rounded-3xl border-2 border-zinc-800 flex items-center justify-center hover:border-zinc-600 transition-colors shrink-0"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          <button
            onClick={next}
            disabled={Boolean(getStepError())}
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
