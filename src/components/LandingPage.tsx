import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Activity, Check, ChevronRight, PlayCircle, ShieldCheck, Sparkles, Target, Zap } from 'lucide-react';
import { signInWithRedirect } from 'firebase/auth';
import { auth, authPersistenceReady, googleProvider } from '../firebase';
import { BILLING_PLANS, CHECKOUT_INTENT_STORAGE_KEY, CheckoutIntent, FREE_TRIAL_LABEL, PlanId } from '../config/billing';
import { trackEvent } from '../services/analyticsService';
import { getBotChallengeToken, isBotProtectionConfigured, verifyBotChallenge } from '../services/botProtectionService';

interface LandingPageProps {
  onStart: (intent: CheckoutIntent) => void;
  authError?: string | null;
}

const outcomes = [
  'Miss a run? Jogga recalculates instead of making you feel behind.',
  'Low energy? The plan can shift intensity so momentum stays intact.',
  'Busy week? Keep progressing without overpaying for rigid coaching.',
];

const proofStats = [
  { value: '3 days', label: 'Free trial' },
  { value: 'Cancel', label: 'Anytime' },
  { value: '50%', label: 'Founder offer' },
];

const trustPoints = [
  'Adaptive AI Training',
  'Built For Real People',
  'Google Fit Integration',
  'Beginner To Advanced',
  '3-Day Free Trial',
  'Cancel Anytime',
];

const solutionFeatures = [
  'Miss a run? Jogga recalculates.',
  'Feeling fatigued? Jogga adapts intensity.',
  'Unexpected busy week? Jogga keeps you progressing without burning out.',
];

const comparisonRows = [
  { feature: 'Adaptive AI Plans', jogga: 'Yes', otherApps: 'Yes' },
  { feature: 'Beginner Friendly', jogga: 'Yes', otherApps: 'Sometimes' },
  { feature: 'Adjusts Missed Runs', jogga: 'Yes', otherApps: 'Limited' },
  { feature: 'Affordable Pricing', jogga: 'Yes', otherApps: 'No' },
  { feature: 'Real-Life Flexibility', jogga: 'Yes', otherApps: 'No' },
  { feature: 'Founder Pricing', jogga: 'Yes', otherApps: 'No' },
];

const landingPlanFeatures = {
  monthly: [
    'Adaptive AI coaching',
    'Dynamic training adjustments',
    'Run tracking',
    'Goal progression',
    'Beginner-friendly guidance',
    'Google Fit integration',
  ],
  yearly: [
    'Everything in Monthly',
    'Lowest long-term price',
    'Locked-in early pricing',
    'Best value for committed runners',
  ],
} as const;

const pricingOptions = [
  {
    id: 'trial',
    title: 'Free Trial',
    price: FREE_TRIAL_LABEL,
    detail: 'Start today',
    plan: null,
    planId: 'trial' as PlanId,
    trial: true,
  },
  {
    id: 'monthly',
    title: 'Monthly',
    plan: BILLING_PLANS[0],
    planId: 'monthly' as PlanId,
    trial: false,
  },
  {
    id: 'yearly',
    title: 'Annual',
    plan: BILLING_PLANS[1],
    planId: 'yearly' as PlanId,
    trial: false,
    popular: true,
  },
];

function getBillingPriceSuffix(planId: PlanId) {
  if (planId === 'monthly') return '/mo';
  if (planId === 'yearly') return '/year';
  return '';
}

function getPricingCta(planId: PlanId) {
  if (planId === 'yearly') return 'Go Yearly';
  return 'Start Free Trial';
}

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

const trainingGuides = [
  { title: 'AI Running Coach', href: '/ai-running-coach', label: 'Personalized adaptive coaching' },
  { title: '5K Training Plan', href: '/5k-training-plan', label: 'Beginner-friendly 5K prep' },
  { title: '10K Training Plan', href: '/10k-training-plan', label: 'Build endurance and pace' },
  { title: 'Marathon Training Plan', href: '/marathon-training-plan', label: 'Long-run progression' },
  { title: 'Beginner Running Plan', href: '/beginner-running-plan', label: 'Start running safely' },
  { title: 'Half Marathon Plan', href: '/half-marathon-plan', label: 'Personalized half marathon prep' },
];

export default function LandingPage({ onStart, authError }: LandingPageProps) {
  const [loadingSource, setLoadingSource] = useState<string | null>(null);
  const [loadingPhase, setLoadingPhase] = useState<'checking' | 'google' | null>(null);
  const [localAuthError, setLocalAuthError] = useState<string | null>(null);

  const getRedirectTimeoutError = () => (
    new Error('Google sign-in did not open. Refresh the page and try again.')
  );

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
    const currentUser = auth.currentUser;
    if (currentUser) {
      persistCheckoutIntent(intent);
      onStart(intent);
      return;
    }

    setLocalAuthError(null);
    setLoadingSource(source);
    setLoadingPhase('checking');

    try {
      const botAction = source.replace(/[^a-z0-9_-]/gi, '_').slice(0, 32) || 'start';
      const challengeToken = await getBotChallengeToken(botAction);
      await verifyBotChallenge(challengeToken, botAction);
      trackEvent('landing_bot_verified', { source, configured: isBotProtectionConfigured() });

      persistCheckoutIntent(intent);
      setLoadingPhase('google');
      await authPersistenceReady;
      googleProvider.setCustomParameters({ prompt: 'select_account' });

      const redirectStarted = signInWithRedirect(auth, googleProvider).then(() => true);
      const timedOut = new Promise<false>((resolve) => {
        window.setTimeout(() => resolve(false), 8000);
      });
      const didStart = await Promise.race([redirectStarted, timedOut]);

      if (!didStart) {
        throw getRedirectTimeoutError();
      }

      window.setTimeout(() => {
        if (document.visibilityState === 'visible') {
          setLoadingSource(null);
          setLoadingPhase(null);
          setLocalAuthError('Google sign-in did not leave this page. Refresh and try again.');
        }
      }, 4000);
    } catch (error) {
      console.error('Redirect login failed', error);
      setLoadingSource(null);
      setLoadingPhase(null);
      setLocalAuthError(error instanceof Error ? error.message : 'Google sign-in could not start. Try again.');
    }
  };

  const getButtonText = (source: string, fallback: string) => (
    loadingSource === source
      ? loadingPhase === 'checking'
        ? 'Checking...'
        : 'Opening Google...'
      : fallback
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
        <section id="start" className="mx-auto grid min-h-[calc(100dvh-73px)] max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1fr_0.82fr] lg:py-14">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-7"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-xs font-bold uppercase tracking-widest text-yellow-100">
              <Sparkles size={14} />
              Premium AI running guidance for a fraction of the cost
            </div>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-light leading-[1.02] tracking-tight text-zinc-50 md:text-7xl">
                A Running Coach That Actually Adapts To Your Life
              </h1>
              <p className="max-w-2xl text-xl leading-8 text-zinc-300 md:text-2xl">
                Missed a run? Busy week? Low energy? Jogga adjusts instantly so you keep moving forward without guilt, pressure, or expensive coaching fees.
              </p>
              <p className="max-w-xl text-sm font-semibold uppercase tracking-widest text-yellow-100">
                Premium AI running guidance for a fraction of the cost.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => handleStart('hero_primary', 'trial', true)}
                disabled={Boolean(loadingSource)}
                className="flex items-center justify-center gap-2 rounded-full bg-zinc-100 px-6 py-4 text-sm font-bold text-zinc-950 shadow-xl shadow-black/30 transition hover:bg-white active:scale-95 disabled:cursor-wait disabled:opacity-70 sm:whitespace-nowrap"
              >
                {getButtonText('hero_primary', 'Start Free Trial')}
                <ChevronRight size={18} />
              </button>
              <a
                href="#how-it-works"
                onClick={() => trackEvent('landing_how_it_works_clicked')}
                className="flex items-center justify-center gap-2 rounded-full border border-zinc-700 px-6 py-4 text-sm font-bold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-900"
              >
                <PlayCircle size={18} />
                See How It Works
              </a>
            </div>

            <div className="flex max-w-2xl flex-wrap gap-2">
              {trustPoints.map((point) => (
                <span key={point} className="rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  {point}
                </span>
              ))}
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
                      <div className="flex flex-wrap justify-end gap-1">
                        <span className="rounded-full bg-yellow-300 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-950">
                          Best
                        </span>
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-950">
                          50% Off
                        </span>
                      </div>
                    )}
                    {!option.popular && option.plan && (
                      <span className="rounded-full bg-zinc-100 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-950">
                        50% Off
                      </span>
                    )}
                  </div>
                  {option.plan ? (
                    <div className="space-y-1">
                      <div className="text-xs text-zinc-500 line-through">
                        Normally {option.plan.compareAtPrice}
                      </div>
                      <div className="text-xl font-bold text-zinc-50">
                        Now {option.plan.price}
                        <span className="text-xs font-semibold text-zinc-400">
                          {getBillingPriceSuffix(option.planId)}
                        </span>
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        {getButtonText(`pricing_${option.id}`, option.plan.period)}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-lg font-semibold text-zinc-50">{option.price}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        {getButtonText(`pricing_${option.id}`, option.detail)}
                      </div>
                    </>
                  )}
                </button>
              ))}
            </div>

            {(localAuthError || authError) && (
              <p role="alert" className="max-w-lg rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {localAuthError || authError}
              </p>
            )}

            {isBotProtectionConfigured() && (
              <p className="max-w-lg text-xs leading-5 text-zinc-600">
                Protected by silent bot verification before Google sign-in.
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

        <section id="how-it-works" className="border-y border-zinc-800 bg-zinc-900/35">
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

        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-2 md:py-16">
          <div className="rounded-[2rem] border border-zinc-800 bg-zinc-900/50 p-6 md:p-8">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-200">
              <Activity size={16} />
              The old way
            </div>
            <h2 className="text-3xl font-light leading-tight text-zinc-50 md:text-4xl">
              Most Running Apps Expect Perfect Discipline
            </h2>
            <p className="mt-5 text-sm leading-7 text-zinc-300">
              Life does not work like that. You get busy. You miss workouts. You lose momentum. Then most apps make you feel behind. That is where people quit.
            </p>
          </div>

          <div className="rounded-[2rem] border border-yellow-400/25 bg-yellow-400/10 p-6 md:p-8">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-yellow-100">
              <Sparkles size={16} />
              The Jogga way
            </div>
            <h2 className="text-3xl font-light leading-tight text-zinc-50 md:text-4xl">
              Jogga Adjusts When Life Happens
            </h2>
            <p className="mt-5 text-sm leading-7 text-zinc-300">
              Instead of rigid training plans, Jogga uses adaptive AI coaching that responds to your real-world schedule and performance.
            </p>
            <div className="mt-6 space-y-3">
              {solutionFeatures.map((feature) => (
                <div key={feature} className="flex items-start gap-3 text-sm leading-6 text-zinc-200">
                  <Check size={18} className="mt-1 shrink-0 text-green-300" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm font-semibold text-yellow-50">
              This is AI coaching designed for actual humans.
            </p>
          </div>
        </section>

        <section id="pricing" className="border-y border-zinc-800 bg-zinc-900/35">
          <div className="mx-auto max-w-6xl px-5 py-12 md:py-16">
            <div className="mb-8 max-w-3xl space-y-3">
              <div className="text-xs font-bold uppercase tracking-widest text-yellow-100">Founder pricing available now</div>
              <h2 className="text-3xl font-light leading-tight text-zinc-50 md:text-5xl">
                Why Pay Premium Prices For Running Plans?
              </h2>
              <p className="text-sm leading-7 text-zinc-300 md:text-base">
                Jogga gives you adaptive AI coaching at a price that makes starting easy.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {BILLING_PLANS.map((plan) => (
                <motion.div
                  key={plan.id}
                  whileHover={{ y: -3 }}
                  className={`rounded-[2rem] border p-6 shadow-2xl shadow-black/20 ${
                    plan.popular
                      ? 'border-yellow-400/30 bg-yellow-400/10'
                      : 'border-zinc-800 bg-zinc-950/80'
                  }`}
                >
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-950">
                        {plan.popular ? 'Best Value' : '50% Off'}
                      </div>
                      <h3 className="text-2xl font-semibold text-zinc-50">{plan.shortPeriod}</h3>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-zinc-500 line-through">Normally {plan.compareAtPrice}</div>
                      <div className="mt-1 text-3xl font-bold text-zinc-50">
                        Now {plan.price}
                        <span className="text-sm font-semibold text-zinc-400">
                          {getBillingPriceSuffix(plan.id)}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        {plan.period}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {landingPlanFeatures[plan.id].map((feature) => (
                      <div key={feature} className="flex items-center gap-3 text-sm text-zinc-300">
                        <Check size={16} className="shrink-0 text-green-300" />
                        {feature}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => handleStart(`pricing_section_${plan.id}`, plan.id, plan.id === 'monthly')}
                    disabled={Boolean(loadingSource)}
                    className={`mt-6 flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-sm font-bold transition active:scale-95 disabled:cursor-wait disabled:opacity-70 ${
                      plan.popular
                        ? 'bg-zinc-100 text-zinc-950 hover:bg-white'
                        : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                    }`}
                  >
                    {getButtonText(`pricing_section_${plan.id}`, getPricingCta(plan.id))}
                    <ChevronRight size={18} />
                  </button>

                  <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    {plan.id === 'monthly' ? 'Cancel anytime.' : 'Founder pricing available now.'}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-12 md:py-16">
          <div className="mb-8 max-w-3xl space-y-3">
            <div className="text-xs font-bold uppercase tracking-widest text-yellow-100">Simple, flexible, affordable</div>
            <h2 className="text-3xl font-light leading-tight text-zinc-50 md:text-5xl">
              Jogga vs Expensive Running Apps
            </h2>
            <p className="text-sm leading-7 text-zinc-300 md:text-base">
              Stop overpaying for rigid coaching apps. Jogga gives you the motivation, structure, and adaptability you actually need at a price that makes starting easy.
            </p>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-900/50">
            <div className="grid grid-cols-[1.2fr_0.8fr_0.9fr] border-b border-zinc-800 bg-zinc-950/70 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              <div>Feature</div>
              <div className="text-center text-zinc-100">Jogga</div>
              <div className="text-center">Other Apps</div>
            </div>
            {comparisonRows.map((row) => (
              <div key={row.feature} className="grid grid-cols-[1.2fr_0.8fr_0.9fr] items-center border-b border-zinc-800/70 px-4 py-4 last:border-b-0">
                <div className="text-sm font-medium text-zinc-100">{row.feature}</div>
                <div className="flex justify-center">
                  <span className="rounded-full bg-green-400/10 px-3 py-1 text-xs font-bold text-green-200">
                    {row.jogga}
                  </span>
                </div>
                <div className="flex justify-center">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                    row.otherApps === 'No'
                      ? 'bg-zinc-800 text-zinc-500'
                      : 'bg-zinc-800/80 text-zinc-300'
                  }`}>
                    {row.otherApps}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-zinc-800 bg-zinc-900/35">
          <div className="mx-auto max-w-6xl px-5 py-10">
            <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-yellow-100">Training Guides</div>
                <h2 className="mt-2 text-3xl font-light text-zinc-50">Plans for every runner</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-zinc-400">
                Learn the basics, then start a personalized Jogga plan when you are ready to train.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {trainingGuides.map((guide) => (
                <a
                  key={guide.href}
                  href={guide.href}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-5 transition hover:border-zinc-600 hover:bg-zinc-900"
                >
                  <div className="text-lg font-semibold text-zinc-50">{guide.title}</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-400">{guide.label}</div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-[0.9fr_1fr] md:py-16">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-yellow-100">
              <ShieldCheck size={16} className="text-yellow-400" />
              Built for real momentum
            </div>
            <h2 className="max-w-xl text-3xl font-light leading-tight text-zinc-50 md:text-5xl">
              Running Should Feel Motivating, Not Stressful
            </h2>
            <p className="max-w-xl text-sm leading-7 text-zinc-300">
              You do not need perfect discipline. You need momentum. Jogga helps you keep going even when life gets messy. That is how real progress happens.
            </p>
          </div>

          <div className="grid gap-3">
            {[
              'Start with your goal, schedule, experience, and weekly mileage.',
              'Use GPS runs and feedback to keep the plan grounded in real performance.',
              'Let the dashboard keep today clear and the next step obvious.',
              'Keep moving forward without trying to make one missed run define the week.',
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
              <h2 className="text-2xl font-light text-zinc-50">Start your first run.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                3-Day Free Trial • Cancel Anytime
              </p>
            </div>
            <button
              onClick={() => handleStart('bottom_cta', 'trial', true)}
              disabled={Boolean(loadingSource)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-zinc-100 px-6 py-4 text-sm font-bold text-zinc-950 transition hover:bg-white active:scale-95 disabled:cursor-wait disabled:opacity-70 md:w-auto"
            >
              {getButtonText('bottom_cta', 'Start Your First Run')}
              <ChevronRight size={18} />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800 bg-zinc-950 px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img src="/app-icon-logo.png" alt="Jogga" className="h-9 w-9 object-contain" />
            <span className="text-sm font-semibold text-zinc-100">Jogga</span>
          </div>
          <nav aria-label="Jogga marketing footer" className="grid gap-3 text-sm text-zinc-500 sm:grid-cols-2 md:flex md:flex-wrap md:justify-end">
            <a href="/ai-running-coach" className="transition hover:text-zinc-100">AI Running Coach</a>
            <a href="/5k-training-plan" className="transition hover:text-zinc-100">Training Plans</a>
            <a href="/beginner-running-plan" className="transition hover:text-zinc-100">Beginner Running</a>
            <a href="/marathon-training-plan" className="transition hover:text-zinc-100">5K / 10K / Marathon</a>
            <a href="/privacy" className="transition hover:text-zinc-100">Privacy</a>
            <a href="/terms" className="transition hover:text-zinc-100">Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
