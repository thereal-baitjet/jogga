export const SITE_URL = 'https://jogga.santosautomation.com';
export const DEFAULT_META_TITLE = 'Jogga — AI Running Coach';
export const DEFAULT_META_DESCRIPTION = 'Personalized AI running coach with adaptive training plans, GPS tracking, readiness scoring, and race preparation.';

export interface SeoPageContent {
  path: string;
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  intro: string;
  cta: string;
  primaryKeyword: string;
  sections: {
    heading: string;
    body: string;
  }[];
}

export const SEO_PAGES: SeoPageContent[] = [
  {
    path: '/ai-running-coach',
    title: 'AI Running Coach | Personalized Adaptive Training Plans | Jogga',
    description:
      'Train smarter with Jogga, the AI running coach that builds adaptive personalized running plans for beginners, 5K runners, marathon training, and long-term consistency.',
    h1: 'Your AI Running Coach',
    eyebrow: 'AI running coach',
    intro:
      'Jogga turns your goal, schedule, run history, and recovery signals into a plan that adjusts as your training changes.',
    cta: 'Start Your Personalized Running Plan',
    primaryKeyword: 'AI running coach',
    sections: [
      {
        heading: 'What is an AI running coach?',
        body:
          'An AI running coach helps translate your running goal into daily training decisions. Instead of following a fixed PDF, Jogga gives you a plan that considers where you are today and what you are trying to build toward.',
      },
      {
        heading: 'How Jogga adapts your training',
        body:
          'Jogga is built around adaptive training. If your schedule changes, you miss a run, or your progress shifts, the app keeps your upcoming work aligned with the bigger goal.',
      },
      {
        heading: 'GPS and readiness tracking',
        body:
          'Runs are measured with GPS so coaching can reflect distance, pace, duration, and completed effort. Readiness signals help shape when to push and when to recover.',
      },
      {
        heading: 'Personalized plans',
        body:
          'A beginner runner, a 5K runner, and a marathon runner need different progressions. Jogga builds around experience level, preferred training days, mileage, and race timing.',
      },
      {
        heading: 'Why runners quit and how Jogga helps',
        body:
          'Most runners quit because the plan feels too generic, too hard, or too easy to ignore. Jogga keeps the next step clear so consistency feels manageable.',
      },
    ],
  },
  {
    path: '/5k-training-plan',
    title: '5K Training Plan for Beginners | Jogga',
    description:
      'Start your first 5K with an adaptive beginner-friendly training plan powered by Jogga AI.',
    h1: '5K Training Plan for Beginners',
    eyebrow: '5K training',
    intro:
      'A good first 5K plan should build confidence, protect recovery, and help you show up consistently without guessing what to do next.',
    cta: 'Start Your 5K Plan',
    primaryKeyword: '5K training plan',
    sections: [
      {
        heading: 'How long does it take to train for a 5K?',
        body:
          'Many beginners can prepare for a 5K in several weeks, but the right timeline depends on current fitness, consistency, and how often you can train. Jogga shapes the plan around your starting point.',
      },
      {
        heading: 'Beginner mistakes',
        body:
          'New runners often go too fast too soon, skip recovery, or compare every run to the last one. A smarter plan keeps effort controlled while building the habit.',
      },
      {
        heading: 'Weekly progression',
        body:
          'A beginner 5K progression usually blends easy running, walk-run intervals, rest, and gradual distance increases. Jogga keeps the weekly load clear and realistic.',
      },
      {
        heading: 'Recovery and pacing',
        body:
          'Recovery days are part of training. Jogga uses them to reduce injury risk and make your next quality run more productive.',
      },
      {
        heading: 'Why adaptive plans matter',
        body:
          'Fixed plans break when life changes. Adaptive planning keeps your 5K goal moving even when a workout is missed or your week gets rearranged.',
      },
    ],
  },
  {
    path: '/10k-training-plan',
    title: '10K Training Plan | Adaptive Running Coach | Jogga',
    description:
      'Build endurance and improve consistency with Jogga’s adaptive 10K running plan.',
    h1: 'Adaptive 10K Training Plan',
    eyebrow: '10K training',
    intro:
      'A 10K plan should build endurance, pacing control, and repeatable weekly rhythm without pushing every run too hard.',
    cta: 'Start Your 10K Plan',
    primaryKeyword: '10K training plan',
    sections: [
      {
        heading: 'Training structure',
        body:
          'A useful 10K structure balances easy mileage, longer aerobic runs, controlled faster work, and rest. Jogga organizes those pieces into a week you can actually follow.',
      },
      {
        heading: 'Weekly mileage',
        body:
          'Mileage should grow gradually and match your experience. Jogga starts from your current running base so the plan is challenging without being reckless.',
      },
      {
        heading: 'Tempo and endurance runs',
        body:
          'Tempo work helps you handle steady effort, while endurance runs build the engine for the full distance. Jogga places them with recovery in mind.',
      },
      {
        heading: 'Recovery importance',
        body:
          'The best 10K progress comes from stacking good weeks, not from forcing one heroic workout. Recovery protects that consistency.',
      },
      {
        heading: 'Adaptive coaching benefits',
        body:
          'When your week changes, Jogga adjusts the training path so your next workout still fits your body, schedule, and goal.',
      },
    ],
  },
  {
    path: '/marathon-training-plan',
    title: 'Marathon Training Plan | AI Running Coach | Jogga',
    description:
      'Prepare for your marathon with adaptive pacing, recovery, and long-run planning powered by Jogga AI.',
    h1: 'AI Marathon Training Plan',
    eyebrow: 'Marathon training',
    intro:
      'Marathon training needs more than a long-run calendar. Jogga helps organize pacing, recovery, and readiness so the plan stays usable week after week.',
    cta: 'Train for Your Marathon',
    primaryKeyword: 'marathon training plan',
    sections: [
      {
        heading: 'Marathon preparation overview',
        body:
          'A marathon plan should build aerobic capacity, durability, fueling practice, and confidence over time. Jogga turns those needs into daily training decisions.',
      },
      {
        heading: 'Long run structure',
        body:
          'Long runs are the backbone of marathon preparation, but they need careful spacing. Jogga helps progress long runs while protecting the quality of the rest of the week.',
      },
      {
        heading: 'Avoiding burnout',
        body:
          'Burnout often comes from stacking too much intensity or ignoring fatigue. Adaptive planning helps keep the training load productive instead of overwhelming.',
      },
      {
        heading: 'Recovery optimization',
        body:
          'Recovery is where marathon fitness consolidates. Jogga treats rest, easy days, and readiness as part of the plan, not as afterthoughts.',
      },
      {
        heading: 'Race readiness',
        body:
          'Race readiness comes from consistent preparation, realistic pacing, and knowing when to adjust. Jogga keeps those signals visible as your marathon approaches.',
      },
    ],
  },
  {
    path: '/beginner-running-plan',
    title: 'Beginner Running Plan | Start Running with Confidence | Jogga',
    description:
      'A beginner-friendly adaptive running plan that helps new runners build consistency safely.',
    h1: 'Beginner Running Plan',
    eyebrow: 'Beginner running',
    intro:
      'Starting to run should feel structured, calm, and sustainable. Jogga helps new runners build consistency without turning every workout into a test.',
    cta: 'Start Running with Jogga',
    primaryKeyword: 'beginner running plan',
    sections: [
      {
        heading: 'How to start running',
        body:
          'The best way to start running is to begin with manageable efforts, repeat them consistently, and progress only when your body is ready.',
      },
      {
        heading: 'Consistency over intensity',
        body:
          'Beginners improve by showing up repeatedly, not by making every run hard. Jogga keeps the next workout clear and appropriately paced.',
      },
      {
        heading: 'Rest and recovery',
        body:
          'Rest days let your body adapt. Jogga includes recovery as a normal part of training so progress can build without unnecessary strain.',
      },
      {
        heading: 'Building confidence',
        body:
          'Confidence grows when the plan feels achievable. Jogga helps turn running into a repeatable routine instead of a guessing game.',
      },
      {
        heading: 'Staying motivated',
        body:
          'Motivation is easier when the next step is obvious. Jogga keeps goals, progress, and upcoming runs visible so momentum is easier to maintain.',
      },
    ],
  },
  {
    path: '/half-marathon-plan',
    title: 'Half Marathon Training Plan | Personalized Running Coach | Jogga',
    description:
      'Train for your half marathon with adaptive pacing, long-run progression, and AI-powered coaching.',
    h1: 'Half Marathon Training Plan',
    eyebrow: 'Half marathon training',
    intro:
      'A half marathon plan should grow endurance, sharpen pacing, and keep recovery under control so the distance becomes manageable.',
    cta: 'Start Your Half Marathon Plan',
    primaryKeyword: 'half marathon training plan',
    sections: [
      {
        heading: 'Half marathon preparation',
        body:
          'Half marathon preparation blends endurance, pacing, and durability. Jogga organizes those pieces around your current fitness and target date.',
      },
      {
        heading: 'Weekly progression',
        body:
          'The plan should gradually increase long-run distance and weekly consistency while avoiding sudden jumps. Jogga keeps that progression visible.',
      },
      {
        heading: 'Recovery and nutrition',
        body:
          'Recovery, sleep, hydration, and fueling all affect training quality. Jogga helps you respect recovery so the next run has a purpose.',
      },
      {
        heading: 'Pace guidance',
        body:
          'Pacing matters for the half marathon. Jogga helps you separate easy running from harder work so you do not race every workout.',
      },
      {
        heading: 'Race-day readiness',
        body:
          'Race-day readiness comes from knowing the distance, practicing steady effort, and arriving healthy. Jogga keeps the plan pointed at that outcome.',
      },
    ],
  },
];

export const SEO_PAGE_BY_PATH = SEO_PAGES.reduce<Record<string, SeoPageContent>>((pages, page) => {
  pages[page.path] = page;
  return pages;
}, {});
