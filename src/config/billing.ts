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

// Hosted Stripe links are kept only as an explicit emergency fallback.
// Production checkout must use /api/create-checkout-session so Stripe receives app user metadata.
export const STRIPE_EMERGENCY_CHECKOUT_LINKS: Record<BillingPlanId, string> = {
  monthly: 'https://buy.stripe.com/5kQ7sL8BM6738hz5P81wY0b',
  yearly: 'https://buy.stripe.com/3cI5kD19k8fb0P7a5o1wY0c',
};

export const BILLING_PLANS = [
  {
    id: 'monthly',
    name: 'Monthly Pass',
    price: '$6',
    compareAtPrice: '$12.50',
    period: 'per month',
    shortPeriod: 'Monthly',
    description: 'Private AI coaching layered on top of Strava Free.',
    features: [
      'Strava Free run import',
      'Private readiness and training load',
      'Adaptive AI coaching',
      'Niche-aware plan adjustments',
      'No social feed or leaderboard pressure',
    ],
    popular: false,
  },
  {
    id: 'yearly',
    name: 'Annual Pass',
    price: '$49',
    compareAtPrice: '$149.99',
    period: 'per year',
    shortPeriod: 'Annual',
    description: 'Best value versus the Strava+Runna bundle.',
    features: [
      'Everything in Monthly',
      '67% cheaper than Strava+Runna',
      'Read-only Strava sync',
      'Private-by-default coaching',
      'Consistency-first plan support',
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
