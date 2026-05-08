import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Activity, Check, ChevronRight, PlayCircle, ShieldCheck, Sparkles, Target, Zap } from 'lucide-react';
import { signInWithRedirect } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { BILLING_PLANS, CHECKOUT_INTENT_STORAGE_KEY, CheckoutIntent, FREE_TRIAL_LABEL, PlanId } from '../config/billing';
import { trackEvent } from '../services/analyticsService';

interface LandingPageProps {
  onStart: (intent: CheckoutIntent) => void;
  authError?: string | null;
}

const outcomes = [
  'A plan that updates around today, missed runs, and your goal date',
  'GPS-based run feedback, pace, distance, and post-run coaching',
  'Readiness and streak signals that tell you when to push or back off',
];

const proofStats = [
  { value: '3 days', label: 'Free trial' },
  { value: '$5.99', label: 'Monthly' },
  { value: '$34.99', label: 'Annual' },
];

const pricingOptions = [
  {
    id: 'trial',
    title: 'Free Trial',
    price: FREE_TRIAL_LABEL,
    detail: 'Start today',
    planId: 'trial' as PlanId,
    trial: true,
  },
  {
    id: 'monthly',
    title: 'Monthly',
    price: BILLING_PLANS[0].price,
    detail: BILLING_PLANS[0].period,
    planId: 'monthly' as PlanId,
    trial: false,
  },
  {
    id: 'yearly',
    title: 'Annual',
    price: BILLING_PLANS[1].price,
    detail: BILLING_PLANS[1].period,
    planId: 'yearly' as PlanId,
    trial: false,
    popular: true,
  },
];

const proofVideos = [
  {
    id: 'media-01',
    title: 'Ava',
    src: '/media-01.mp4',
    poster: '/media-01-poster.jpg',
  },
  {
    id: 'media-02',
    title: 'Mia',
    src: '/media-02.mp4',
    poster: '/media-02-poster.jpg',
  },
];

export default function LandingPage({ onStart, authError }: LandingPageProps) {
  const [loadingSource, setLoadingSource] = useState<string | null>(null);
  const [localAuthError, setLocalAuthError] = useState<string | null>(null);

  const persistCheckoutIntent = (intent: CheckoutIntent) => {
    const serializedIntent = JSON.stringify(intent);

    try {
      window.sessionStorage.setItem(CHECKOUT_INTENT_STORAGE_KEY, serializedIntent);
    } catch (error) {
      console.error('Failed to store checkout intent in sessionStorage', error);
    }

    try {
      window.localStorage.setItem(CHECKOUT_INTENT_STORAGE_KEY, serializedIntent);
    } catch (error) {
      console.error('Failed to store checkout intent in localStorage', error);
    }
  };

  const handleStart = async (source: string, planId: PlanId = 'trial', trial = true) => {
    if (loadingSource) return;

    const intent = { planId, trial, source };
    trackEvent('landing_cta_clicked', intent);
    persistCheckoutIntent(intent);

    const currentUser = auth.currentUser;
    if (currentUser) {
      onStart(intent);
      return;
    }

    setLocalAuthError(null);
    setLoadingSource(source);

    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      console.error('Redirect login failed', error);
      setLoadingSource(null);
      setLocalAuthError(error instanceof Error ? error.message : 'Google sign-in could not start. Try again.');
    }
  };

  const getButtonText = (source: string, fallback: string) => (
    loadingSource === source ? 'Opening Google...' : fallback
  );

  const handleVideoPlay = (videoId: string) => {
    trackEvent('landing_social_proof_played', { video_id: videoId });
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <img src="/app-icon-logo.png" alt="Jogga" className="h-10 w-10 object-contain" />
            <span className="text-lg font-semibold tracking-tight">Jogga</span>
          </div>
          <button
            onClick={() => handleStart('nav', 'trial', true)}
            disabled={Boolean(loadingSource)}
            className="flex items-center gap-2 rounded-full bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-white active:scale-95"
          >
            {getButtonText('nav', 'Start Trial')}
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <main>
        <section className="mx-auto grid min-h-[calc(100dvh-73px)] max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1fr_0.82fr] lg:py-14">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-7"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-xs font-bold uppercase tracking-widest text-yellow-100">
              <Sparkles size={14} />
              AI running coach
            </div>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-light leading-[1.02] tracking-tight text-zinc-50 md:text-7xl">
                Jogga
              </h1>
              <p className="max-w-2xl text-xl leading-8 text-zinc-300 md:text-2xl">
                Turn your next race goal into a daily training plan that adapts to your schedule, your GPS runs, and your recovery.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => handleStart('hero_primary', 'trial', true)}
                disabled={Boolean(loadingSource)}
                className="flex items-center justify-center gap-2 rounded-full bg-zinc-100 px-6 py-4 text-sm font-bold text-zinc-950 shadow-xl shadow-black/30 transition hover:bg-white active:scale-95 disabled:cursor-wait disabled:opacity-70 sm:whitespace-nowrap"
              >
                {getButtonText('hero_primary', `Start ${FREE_TRIAL_LABEL}`)}
                <ChevronRight size={18} />
              </button>
              <a
                href="#proof"
                onClick={() => trackEvent('landing_video_anchor_clicked')}
                className="flex items-center justify-center gap-2 rounded-full border border-zinc-700 px-6 py-4 text-sm font-bold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-900"
              >
                <PlayCircle size={18} />
                Watch Proof
              </a>
            </div>

            <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
              {pricingOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleStart(`pricing_${option.id}`, option.planId, option.trial)}
                  disabled={Boolean(loadingSource)}
                  className={`rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                    option.popular
                      ? 'border-yellow-300/40 bg-yellow-300/10 hover:bg-yellow-300/15'
                      : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-600 hover:bg-zinc-900'
                  } disabled:cursor-wait disabled:opacity-70`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">{option.title}</span>
                    {option.popular && (
                      <span className="rounded-full bg-yellow-300 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-950">
                        Best
                      </span>
                    )}
                  </div>
                  <div className="text-lg font-semibold text-zinc-50">{option.price}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    {getButtonText(`pricing_${option.id}`, option.detail)}
                  </div>
                </button>
              ))}
            </div>

            {(localAuthError || authError) && (
              <p role="alert" className="max-w-lg rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {localAuthError || authError}
              </p>
            )}

            <div className="grid max-w-xl grid-cols-3 gap-3 border-t border-zinc-800 pt-5">
              {proofStats.map((stat) => (
                <div key={stat.label}>
                  <div className="text-lg font-semibold text-zinc-50">{stat.value}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{stat.label}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            id="proof"
            className="mx-auto grid w-full max-w-[640px] grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-[520px]"
          >
            {proofVideos.map((video) => (
              <div key={video.id} className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40">
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                    <Activity size={14} className="text-yellow-400" />
                    {video.title}
                  </div>
                  <div className="rounded-full bg-green-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-green-300">
                    Live
                  </div>
                </div>
                <video
                  className="aspect-[9/16] w-full bg-black object-cover"
                  src={video.src}
                  poster={video.poster}
                  controls
                  playsInline
                  preload="metadata"
                  onPlay={() => handleVideoPlay(video.id)}
                />
              </div>
            ))}
          </motion.div>
        </section>

        <section className="border-y border-zinc-800 bg-zinc-900/35">
          <div className="mx-auto grid max-w-6xl gap-4 px-5 py-8 md:grid-cols-3">
            {outcomes.map((outcome, index) => {
              const icons = [Target, Activity, Zap];
              const Icon = icons[index] || Check;
              return (
                <div key={outcome} className="flex gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-950">
                    <Icon size={20} />
                  </div>
                  <p className="text-sm leading-6 text-zinc-300">{outcome}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-[0.9fr_1fr] md:py-16">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-yellow-100">
              <ShieldCheck size={16} className="text-yellow-400" />
              Built for follow-through
            </div>
            <h2 className="max-w-xl text-3xl font-light leading-tight text-zinc-50 md:text-5xl">
              The app keeps selling after signup because the plan is the product.
            </h2>
          </div>

          <div className="grid gap-3">
            {[
              'Onboarding captures the runner goal, schedule, experience, and weekly mileage.',
              'Stripe unlocks the plan after trial or subscription checkout.',
              'The dashboard renders today correctly and recovers future workouts when the plan needs refreshing.',
              'Completed runs feed GPS distance, pace, duration, and coaching context back into the next recommendation.',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 border-b border-zinc-800 py-4">
                <Check size={18} className="mt-1 shrink-0 text-green-300" />
                <p className="text-sm leading-6 text-zinc-300">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-5 pb-12">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 rounded-[2rem] border border-yellow-400/25 bg-yellow-400/10 p-6 md:flex-row md:items-center md:p-8">
            <div>
              <h2 className="text-2xl font-light text-zinc-50">Start with the 3-day trial.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                Get the plan, run with GPS, and see the coaching loop before committing.
              </p>
            </div>
            <button
              onClick={() => handleStart('bottom_cta', 'trial', true)}
              disabled={Boolean(loadingSource)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-zinc-100 px-6 py-4 text-sm font-bold text-zinc-950 transition hover:bg-white active:scale-95 disabled:cursor-wait disabled:opacity-70 md:w-auto"
            >
              {getButtonText('bottom_cta', 'Continue with Google')}
              <ChevronRight size={18} />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
