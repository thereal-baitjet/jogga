import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Check, Zap, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

interface SubscriptionProps {
  onBack: () => void;
  onUnlock: () => void;
  isUnlocked?: boolean;
}

export default function Subscription({ onBack, onUnlock, isUnlocked }: SubscriptionProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [clickCount, setClickCount] = useState(0);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState(false);

  const handleTrialClick = () => {
    if (isUnlocked) {
      onBack();
      return;
    }
    setShowCodeInput(true);
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode.toUpperCase() === 'JOGGA2026' || accessCode.toUpperCase() === 'JOGGER2026') {
      onUnlock();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  const handleVersionClick = () => {
    const newCount = clickCount + 1;
    if (newCount >= 5) {
      const code = prompt('Enter access code:');
      if (code === 'JOGGA2026' || code === 'JOGGER2026') {
        onUnlock();
      }
      setClickCount(0);
    } else {
      setClickCount(newCount);
    }
  };

  const plans = [
    {
      id: 'monthly',
      name: 'Monthly Pass',
      price: '$5.99',
      period: 'per month',
      url: 'https://buy.stripe.com/aFa00j8BM52Z8hzfpI1wY01',
      description: 'Unlock full access to all features.',
      features: [
        'Personalized training plans',
        'Real-time GPS tracking',
        'Audio coaching cues',
        'Performance analytics',
        'Priority support'
      ]
    },
    {
      id: 'yearly',
      name: 'Annual Pass',
      price: '$34.99',
      period: 'per year',
      url: 'https://buy.stripe.com/4gM7sL6tEfHD0P7cdw1wY00',
      description: 'Best value for long-term training.',
      features: [
        'Everything in Monthly',
        'Save over 50% compared to monthly',
        'Early access to new features',
        'Exclusive training content',
        'Annual performance review'
      ],
      popular: true
    }
  ];

  const handleSubscribe = async (plan: typeof plans[0]) => {
    // If already unlocked, just go back
    if (isUnlocked) {
      onBack();
      return;
    }

    if ('url' in plan && plan.url) {
      window.location.href = plan.url;
      return;
    }

    setLoading(plan.id);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId: plan.id }),
      });

      const session = await response.json();
      
      if (session.url) {
        window.location.href = session.url;
      } else {
        console.error('Failed to create checkout session: No URL returned');
      }
    } catch (err) {
      console.error('Subscription error:', err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto w-full p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-12">
        {!isUnlocked ? (
          <div className="w-10" />
        ) : (
          <button onClick={onBack} className="p-2 hover:bg-zinc-900 rounded-full transition-colors">
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
            Choose a plan to unlock your personalized training journey and start running today.
          </p>
        </div>

        <div className="space-y-4">
          {plans.map((plan) => (
            <motion.div
              key={plan.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "relative bg-zinc-900 rounded-3xl p-6 border transition-all cursor-pointer",
                plan.popular ? "border-zinc-100/30 shadow-[0_0_20px_rgba(255,255,255,0.05)]" : "border-zinc-800",
                isUnlocked && "opacity-50 cursor-not-allowed"
              )}
              onClick={() => !isUnlocked && handleSubscribe(plan)}
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
            </motion.div>
          ))}
        </div>

        <div className="space-y-4 pt-4">
          {!showCodeInput ? (
            <button
              onClick={handleTrialClick}
              className="w-full py-4 rounded-3xl bg-zinc-100 text-zinc-900 font-bold text-sm hover:bg-white transition-all shadow-xl shadow-zinc-100/10 flex items-center justify-center gap-2"
            >
              <Sparkles size={18} />
              Start 7-Day Free Trial
            </button>
          ) : (
            <motion.form 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleCodeSubmit}
              className="space-y-3"
            >
              <input
                type="text"
                placeholder="Enter Access Code"
                className={cn(
                  "w-full bg-zinc-900 border-2 p-4 rounded-2xl text-center font-mono tracking-[0.3em] outline-none transition-all",
                  error ? "border-red-500 text-red-500" : "border-zinc-800 focus:border-zinc-100"
                )}
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                autoFocus
              />
              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-zinc-100 text-zinc-900 font-bold text-xs hover:bg-white transition-all"
              >
                Verify Code
              </button>
              <button 
                type="button"
                onClick={() => setShowCodeInput(false)}
                className="w-full text-[10px] text-zinc-600 uppercase tracking-widest hover:text-zinc-400 transition-colors"
              >
                Cancel
              </button>
            </motion.form>
          )}
          <p className="text-[10px] text-zinc-500 text-center">
            No credit card required. Cancel anytime.
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
        <button 
          onClick={handleVersionClick}
          className="text-[8px] text-zinc-800 uppercase tracking-[0.2em] hover:text-zinc-700 transition-colors"
        >
          Build v1.0.4-stable
        </button>
      </div>
    </div>
  );
}
