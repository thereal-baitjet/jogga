import React from 'react';
import { ChevronLeft, Calculator, CreditCard, Cpu, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { BILLING_PLANS } from '../config/billing';

interface ExpensesDashboardProps {
  onBack: () => void;
}

const assumptions = [
  {
    label: 'Stripe processing',
    value: '2.9% + $0.30',
    detail: 'Estimated card processing per paid checkout.',
    icon: CreditCard,
  },
  {
    label: 'AI guardrail',
    value: '10/day',
    detail: 'Paid coach-message cap keeps unit cost predictable.',
    icon: Cpu,
  },
  {
    label: 'Tester access',
    value: 'Whitelist',
    detail: 'Internal testers can use the app without checkout.',
    icon: ShieldCheck,
  },
];

const suggestedScenarios = [
  {
    title: 'Founder Monthly',
    planId: 'monthly',
    note: 'Best for users testing Jogga before a race block.',
    users: 100,
  },
  {
    title: 'Founder Yearly',
    planId: 'yearly',
    note: 'Best value and strongest retention signal.',
    users: 100,
  },
] as const;

function parsePrice(price: string) {
  return Number(price.replace(/[^0-9.]/g, ''));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function estimateStripeFee(price: number) {
  return price * 0.029 + 0.3;
}

export default function ExpensesDashboard({ onBack }: ExpensesDashboardProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto w-full">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-900 bg-zinc-950/90 p-6 backdrop-blur-xl">
        <button onClick={onBack} className="rounded-full p-2 transition-colors hover:bg-zinc-900" aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Pricing Dashboard</h1>
        <div className="w-10" />
      </div>

      <main className="flex-1 space-y-8 p-6 pb-12">
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-950">
              <Calculator size={22} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Suggested pricing</div>
              <h2 className="mt-2 text-2xl font-light tracking-tight">Keep founder pricing simple.</h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                Current pricing stays attractive while daily AI caps, deterministic planning, and tester whitelisting protect margins.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3">
          {BILLING_PLANS.map((plan) => {
            const price = parsePrice(plan.price);
            const fee = estimateStripeFee(price);
            const estimatedNet = price - fee;

            return (
              <div key={plan.id} className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{plan.name}</div>
                    <div className="mt-2 flex items-end gap-2">
                      <span className="text-4xl font-light tracking-tight">{plan.price}</span>
                      <span className="pb-1 text-xs text-zinc-500">{plan.period}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-600 line-through">Normally {plan.compareAtPrice}</div>
                  </div>
                  <span className="rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-green-200">
                    Suggested
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-zinc-950/60 p-4">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Est. Stripe fee</div>
                    <div className="mt-1 text-lg font-medium">{formatCurrency(fee)}</div>
                  </div>
                  <div className="rounded-2xl bg-zinc-950/60 p-4">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Net before ops</div>
                    <div className="mt-1 text-lg font-medium">{formatCurrency(estimatedNet)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-zinc-500">
            <TrendingUp size={14} />
            <h2 className="text-[10px] font-bold uppercase tracking-widest">Revenue scenarios</h2>
          </div>
          <div className="grid gap-3">
            {suggestedScenarios.map((scenario) => {
              const plan = BILLING_PLANS.find(item => item.id === scenario.planId)!;
              const grossRevenue = parsePrice(plan.price) * scenario.users;

              return (
                <div key={scenario.planId} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">{scenario.title}</div>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{scenario.note}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-light">{formatCurrency(grossRevenue)}</div>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">at {scenario.users} users</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-zinc-500">
            <Users size={14} />
            <h2 className="text-[10px] font-bold uppercase tracking-widest">Cost guardrails</h2>
          </div>
          <div className="grid gap-3">
            {assumptions.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-zinc-400">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{item.label}</div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.detail}</p>
                  </div>
                  <div className="shrink-0 text-sm font-bold text-zinc-100">{item.value}</div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
