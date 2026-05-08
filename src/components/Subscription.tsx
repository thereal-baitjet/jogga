import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Check, Zap, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  BILLING_PLANS,
  CheckoutIntent,
  FREE_TRIAL_LABEL,
  STRIPE_EMERGENCY_CHECKOUT_LINKS,
  normalizeBillingPlanId,
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
  checkoutIntent?: CheckoutIntent | null;
  onCheckoutIntentHandled?: () => void;
}

type BillingPlan = typeof BILLING_PLANS[number];

const ENABLE_EMERGENCY_CHECKOUT_LINKS = import.meta.env.VITE_ENABLE_STRIPE_EMERGENCY_LINKS === 'true';

async function readCheckoutJson(response: Response) {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    const responseText = await response.text();
    console.error('Checkout API returned non-JSON response', {
      status: response.status,
      preview: responseText.slice(0, 200),
    });
    throw new Error('Checkout API is not reachable. Check Vercel API routing and environment variables.');
  }

  return response.json() as Promise<{ url?: string; error?: string }>;
}

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

export default function Subscription({
  onBack,
  isUnlocked,
  userId,
  userEmail,
  onManageSubscription,
  onRestoreAccess,
  isRestoringAccess,
  checkoutIntent,
  onCheckoutIntentHandled,
}: SubscriptionProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isManagingBilling, setIsManagingBilling] = useState(false);
  const autoRestoreUserRef = useRef<string | null>(null);
  const autoCheckoutKeyRef = useRef<string | null>(null);
  const plans = BILLING_PLANS;

  const handleRestoreAccess = async (silent = false) => {
    if (!onRestoreAccess || isUnlocked || isRestoringAccess) return;

    setError(null);
    const restored = await onRestoreAccess();

    if (!restored && !silent) {
      setError('No active trial or subscription was found for this account.');
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

  const redirectToEmergencyCheckout = (plan: BillingPlan, trial: boolean) => {
    if (!ENABLE_EMERGENCY_CHECKOUT_LINKS) return false;

    const fallbackUrl = buildEmergencyCheckoutUrl(plan, userEmail);
    if (!fallbackUrl) return false;

    trackEvent('checkout_redirect', {
      plan_id: plan.id,
      trial,
      mode: 'emergency_payment_link',
    });
    onCheckoutIntentHandled?.();
    window.location.assign(fallbackUrl);
    return true;
  };

  const handleSubscribe = async (plan: BillingPlan, trial = false) => {
    if (isUnlocked) {
      onBack();
      return;
    }

    if (!userId) {
      setError('Sign in before starting checkout.');
      return;
    }

    if (loading) {
      return;
    }

    setError(null);
    setLoading(trial ? 'trial' : plan.id);
    trackEvent('begin_checkout', {
      plan_id: plan.id,
      plan_name: plan.name,
      billing_period: plan.period,
      trial,
    });

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          planId: trial ? 'trial' : plan.id,
          userId,
          email: userEmail,
          trial,
        }),
      });

      const session = await readCheckoutJson(response);

      if (!response.ok) {
        throw new Error(session.error || 'Unable to start secure checkout.');
      }
      
      if (session.url) {
        trackEvent('checkout_redirect', {
          plan_id: plan.id,
          trial,
          mode: 'api_checkout_session',
        });
        onCheckoutIntentHandled?.();
        window.location.assign(session.url);
      } else {
        throw new Error('Stripe did not return a checkout URL.');
      }
    } catch (err) {
      console.error('Subscription error:', err);
      trackEvent('checkout_error', {
        plan_id: plan.id,
        trial,
      });

      if (redirectToEmergencyCheckout(plan, trial)) {
        return;
      }

      setError(err instanceof Error ? err.message : 'Unable to start checkout.');
      setLoading(null);
    }
  };

  useEffect(() => {
    if (!checkoutIntent || !userId || isUnlocked || loading) return;

    const billingPlanId = normalizeBillingPlanId(checkoutIntent.planId);
    const plan = plans.find((candidate) => candidate.id === billingPlanId);
    if (!plan) return;

    const checkoutKey = `${userId}:${checkoutIntent.planId}:${checkoutIntent.trial ? 'trial' : 'paid'}`;
    if (autoCheckoutKeyRef.current === checkoutKey) return;

    autoCheckoutKeyRef.current = checkoutKey;
    void handleSubscribe(plan, checkoutIntent.trial);
  }, [checkoutIntent, isUnlocked, loading, onCheckoutIntentHandled, userId]);

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
          <h2 className="text-3xl font-light tracking-tight">Unlock the App</h2>
          <p className="text-zinc-500 text-sm leading-relaxed max-w-[280px] mx-auto">
            Choose a plan to unlock your personalized training journey. Checkout is securely handled by Stripe.
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
                Restore Access
              </>
            )}
          </button>
        )}

        <div className="space-y-4">
          {plans.map((plan) => (
            <motion.button
              key={plan.id}
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!!loading || isUnlocked}
              className={cn(
                "relative w-full bg-zinc-900 rounded-3xl p-6 border transition-all text-left",
                plan.popular ? "border-zinc-100/30 shadow-[0_0_20px_rgba(255,255,255,0.05)]" : "border-zinc-800",
                isUnlocked || loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
              )}
              onClick={(event) => {
                event.preventDefault();
                if (!isUnlocked && !loading) {
                  void handleSubscribe(plan);
                }
              }}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-zinc-100 text-zinc-950 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                  Best Value
                </div>
              )}

              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-medium">{plan.name}</h3>
                  <p className="text-xs text-zinc-500">{plan.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-light">{plan.price}</div>
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

              <div
                className={cn(
                  "w-full py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2",
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
                    Unlock Now
                  </>
                )}
              </div>
            </motion.button>
          ))}
        </div>

        <div className="space-y-4 pt-4">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              void handleSubscribe(plans[0], true);
            }}
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
          Build v1.0.4-stable
        </div>
      </div>
    </div>
  );
}
