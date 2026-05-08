export const FREE_TRIAL_DAYS = 3;
export const FREE_TRIAL_LABEL = `${FREE_TRIAL_DAYS}-Day Free Trial`;

export type BillingPlanId = 'monthly' | 'yearly';
export type PlanId = 'trial' | BillingPlanId;

export interface CheckoutIntent {
  planId: PlanId;
  trial: boolean;
  source: string;
}

export const CHECKOUT_INTENT_STORAGE_KEY = 'jogga_checkout_intent';

// Emergency hosted Stripe checkout links.
// These keep demo-day checkout working even if the Vercel API route or env vars are misconfigured.
// The API checkout flow is still preferred because it attaches user metadata for automatic unlock.
export const STRIPE_FALLBACK_CHECKOUT_LINKS: Record<BillingPlanId, string> = {
  monthly: 'https://buy.stripe.com/5kQ7sL8BM6738hz5P81wY0b',
  yearly: 'https://buy.stripe.com/3cI5kD19k8fb0P7a5o1wY0c',
};

export const BILLING_PLANS = [
  {
    id: 'monthly',
    name: 'Monthly Pass',
    price: '$5.99',
    period: 'per month',
    shortPeriod: 'Monthly',
    checkoutUrl: STRIPE_FALLBACK_CHECKOUT_LINKS.monthly,
    description: 'Unlock full access to all features.',
    features: [
      'Personalized training plans',
      'Real-time GPS tracking',
      'Audio coaching cues',
      'Performance analytics',
      'Priority support',
    ],
    popular: false,
  },
  {
    id: 'yearly',
    name: 'Annual Pass',
    price: '$34.99',
    period: 'per year',
    shortPeriod: 'Annual',
    checkoutUrl: STRIPE_FALLBACK_CHECKOUT_LINKS.yearly,
    description: 'Best value for long-term training.',
    features: [
      'Everything in Monthly',
      'Save over 50% compared to monthly',
      'Early access to new features',
      'Exclusive training content',
      'Annual performance review',
    ],
    popular: true,
  },
] as const;

export function normalizeBillingPlanId(planId: unknown): BillingPlanId | null {
  if (planId === 'trial' || planId === 'monthly') return 'monthly';
  if (planId === 'yearly') return 'yearly';
  return null;
}

export function isTrialCheckout(planId: unknown, trial: unknown) {
  return planId === 'trial' || trial === true || trial === 'true';
}
