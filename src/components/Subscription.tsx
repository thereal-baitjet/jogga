import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Check, Zap, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  BILLING_PLANS,
  FREE_TRIAL_LABEL,
  STRIPE_EMERGENCY_CHECKOUT_LINKS,
} from '../config/billing';
import { trackEvent } from '../services/analyticsService';

interface SubscriptionProps {
  onBack: () => void;
  isUnlocked?: boolean;
  userId?: string;
  userEmail?: string | null;
  hasBillingCustomer?: boolean;
  onManageSubscription?: () => Promise<void>;
  onRestoreAccess?: () => Promise<boolean>;
  isRestoringAccess?: boolean;
  onCheckoutIntentHandled?: () => void;
}

type BillingPlan = typeof BILLING_PLANS[number];

const ENABLE_EMERGENCY_CHECKOUT_LINKS = import.meta.env.VITE_ENABLE_STRIPE_EMERGENCY_LINKS === 'true';

function buildEmergencyCheckoutUrl(plan: BillingPlan, userEmail?: string | null) {
  const fallbackUrl = STRIPE_EMERGENCY_CHECKOUT_LINKS[plan.id];
  if (!fallbackUrl) return null;

  try {
    const url = new URL(fallbackUrl);
    if (userEmail && userEmail.includes('@')) {
      url.searchParams.set('prefilled_email', userEmail);
    }
    return url.toString();
  } catch {
    return fallbackUrl;
  }
}

function buildCheckoutRedirectUrl(plan: BillingPlan, userId: string, userEmail?: string | null, trial = false) {
  const params = new URLSearchParams({
    planId: trial ? 'trial' : plan.id,
    userId,
    trial: trial ? 'true' : 'false',
  });

  if (userEmail && userEmail.includes('@')) {
    params.set('email', userEmail);
  }

  return `/api/checkout-redirect?${params.toString()}`;
}

function getBillingPriceSuffix(plan: BillingPlan) {
  return plan.id === 'monthly' ? '/mo' : '/year';
}

export default function Subscription({
  onBack,
  isUnlocked,
  userId,
  userEmail,
  onManageSubscription,
  onRestoreAccess,
  isRestoringAccess,
  onCheckoutIntentHandled,
}: SubscriptionProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isManagingBilling, setIsManagingBilling] = useState(false);
  const autoRestoreUserRef = useRef<string | null>(null);
  const plans = BILLING_PLANS;

  const handleRestoreAccess = async (silent = false) => {
    if (!onRestoreAccess || isUnlocked || isRestoringAccess) return;

    setError(null);
    const restored = await onRestoreAccess();

    if (!restored && !silent) {
      setError('No active trial or subscription was found for this account. If you just paid, wait a few seconds and tap Restore Access.');
    }
  };

  useEffect(() => {
    if (!userId || isUnlocked || !onRestoreAccess) return;
    if (autoRestoreUserRef.current === userId) return;

    autoRestoreUserRef.current = userId;
    void handleRestoreAccess(true);
  }, [userId, isUnlocked]);

  const handleManageBilling = async () => {
    if (!onManageSubscription || isManagingBilling) return;

    setError(null);
    setIsManagingBilling(true);
    try {
      await onManageSubscription();
    } catch (err) {
      console.error('Billing portal error:', err);
      setError(err instanceof Error ? err.message : 'Unable to open billing settings.');
      setIsManagingBilling(false);
    }
  };

  const handleSubscribe = (plan: BillingPlan, trial = false) => {
    if (isUnlocked) {
      onBack();
      return;
    }

    if (!userId) {
      setError('Sign in before starting checkout.');
      return;
    }

    if (loading) return;

    const loadingKey = trial ? 'trial' : plan.id;
    setError(null);
    setLoading(loadingKey);

    trackEvent('begin_checkout', {
      plan_id: plan.id,
      plan_name: plan.name,
      billing_period: plan.period,
      trial,
      mode: 'server_redirect',
    });

    onCheckoutIntentHandled?.();

    const checkoutUrl = buildCheckoutRedirectUrl(plan, userId, userEmail, trial);

    try {
      window.location.assign(checkoutUrl);
    } catch (err) {
      console.error('Checkout redirect failed:', err);

      if (ENABLE_EMERGENCY_CHECKOUT_LINKS) {
        const fallbackUrl = buildEmergencyCheckoutUrl(plan, userEmail);
        if (fallbackUrl) {
          trackEvent('checkout_redirect', {
            plan_id: plan.id,
            trial,
            mode: 'emergency_payment_link',
          });
          window.location.assign(fallbackUrl);
          return;
        }
      }

      setLoading(null);
      setError('Unable to open checkout. Please refresh and try again.');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto w-full p-8">
      <div className="flex items-center justify-between mb-12">
        {!isUnlocked ? (
          <div className="w-10" />
        ) : (
          <button type="button" onClick={onBack} className="p-2 hover:bg-zinc-900 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
        )}
        <h1 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Access</h1>
        <div className="w-10" />
      </div>

      <div className="space-y-8 flex-1">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto border border-zinc-800 shadow-2xl">
            <ShieldCheck size={40} className="text-zinc-100" />
          </div>
          <h2 className="text-3xl font-light tracking-tight">Unlock Jogga</h2>
          <p className="text-zinc-500 text-sm leading-relaxed max-w-[280px] mx-auto">
            Choose one plan below. Checkout opens securely on Stripe.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-xs text-red-300 text-center">
            {error}
          </div>
        )}

        {isUnlocked && onManageSubscription && (
          <button
            type="button"
            onClick={handleManageBilling}
            disabled={isManagingBilling}
            className="w-full bg-zinc-100 text-zinc-900 rounded-3xl p-4 font-bold text-sm hover:bg-white transition-all shadow-xl shadow-zinc-100/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isManagingBilling ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <CreditCard size={18} />
                Manage or Cancel Subscription
              </>
            )}
          </button>
        )}

        {!isUnlocked && onRestoreAccess && (
          <button
            type="button"
            onClick={() => handleRestoreAccess(false)}
            disabled={isRestoringAccess}
            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-3xl p-4 font-bold text-sm hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait"
          >
            {isRestoringAccess ? (
              <>
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Checking Stripe Access
              </>
            ) : (
              <>
                <ShieldCheck size={18} />
                I already paid — Restore Access
              </>
            )}
          </button>
        )}

        <div className="space-y-4">
          {plans.map((plan) => (
            <motion.div
              key={plan.id}
              whileHover={!loading && !isUnlocked ? { scale: 1.01 } : undefined}
              whileTap={!loading && !isUnlocked ? { scale: 0.99 } : undefined}
              className={cn(
                "relative bg-zinc-900 rounded-3xl p-6 border transition-all",
                plan.popular ? "border-zinc-100/30 shadow-[0_0_20px_rgba(255,255,255,0.05)]" : "border-zinc-800",
                isUnlocked || loading ? "opacity-70" : ""
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-zinc-100 text-zinc-950 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                  Best Value
                </div>
              )}

              <div className="flex justify-between items-start mb-4">
                <div className="pr-4">
                  <div className="mb-2 inline-flex rounded-full bg-yellow-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-yellow-200 ring-1 ring-yellow-400/20">
                    50% Off
                  </div>
                  <h3 className="text-lg font-medium">{plan.name}</h3>
                  <p className="text-xs text-zinc-500">{plan.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-zinc-500 line-through">
                    Normally {plan.compareAtPrice}
                  </div>
                  <div className="mt-1 text-2xl font-bold text-zinc-50">
                    Now {plan.price}
                    <span className="align-baseline text-xs font-semibold text-zinc-400">
                      {getBillingPriceSuffix(plan)}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">{plan.period}</div>
                </div>
              </div>

              <div className="space-y-2 mb-6">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-zinc-400">
                    <Check size={14} className="text-zinc-100 shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={!!loading || isUnlocked}
                onClick={() => handleSubscribe(plan, false)}
                className={cn(
                  "w-full py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
                  plan.popular 
                    ? "bg-zinc-100 text-zinc-900 hover:bg-white" 
                    : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                )}
              >
                {loading === plan.id ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : isUnlocked ? (
                  <>
                    <Check size={18} />
                    Unlocked
                  </>
                ) : (
                  <>
                    <CreditCard size={18} />
                    Continue to Stripe
                  </>
                )}
              </button>
            </motion.div>
          ))}
        </div>

        <div className="space-y-4 pt-4">
          <button
            type="button"
            onClick={() => handleSubscribe(plans[0], true)}
            disabled={!!loading || isUnlocked}
            className="w-full py-4 rounded-3xl bg-zinc-100 text-zinc-900 font-bold text-sm hover:bg-white transition-all shadow-xl shadow-zinc-100/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading === 'trial' ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles size={18} />
                Start {FREE_TRIAL_LABEL}
              </>
            )}
          </button>
          <p className="text-[10px] text-zinc-500 text-center">
            Trial and subscription billing are processed by Stripe. Cancel anytime.
          </p>
        </div>

        <div className="flex items-center justify-center gap-8 py-4">
          <div className="flex flex-col items-center gap-1">
            <ShieldCheck size={20} className="text-zinc-500" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Secure</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Zap size={20} className="text-zinc-500" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Instant</span>
          </div>
        </div>
      </div>

      <div className="text-center mt-8 space-y-2">
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Subscriptions will automatically renew unless canceled at least 24 hours before the end of the current period.
        </p>
        <div className="text-[8px] text-zinc-800 uppercase tracking-[0.2em]">
          Build v1.0.6-single-paywall
        </div>
      </div>
    </div>
  );
}
