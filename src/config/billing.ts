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

export const BILLING_PLANS = [
  {
    id: 'monthly',
    name: 'Monthly Pass',
    price: '$5.99',
    period: 'per month',
    shortPeriod: 'Monthly',
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
