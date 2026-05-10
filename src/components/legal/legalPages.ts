import { SITE_URL } from '../seo/seoPages';

export interface LegalPageSection {
  heading: string;
  body: string[];
}

export interface LegalPageContent {
  path: string;
  title: string;
  description: string;
  h1: string;
  updatedAt: string;
  updatedIso: string;
  sections: LegalPageSection[];
}

export const LEGAL_PAGES: LegalPageContent[] = [
  {
    path: '/privacy',
    title: 'Privacy Policy | Jogga',
    description:
      'Privacy policy for Jogga, including how the app handles account data, training plans, GPS workouts, health metrics, payments, analytics, and bot protection.',
    h1: 'Privacy Policy',
    updatedAt: 'May 10, 2026',
    updatedIso: '2026-05-10',
    sections: [
      {
        heading: 'Overview',
        body: [
          'Jogga is an AI running coach that helps users create adaptive training plans, track workouts, review GPS-based run feedback, and understand fitness trends. This policy explains what information Jogga collects, how it is used, and the choices available to users.',
          'Jogga is designed for fitness and wellness support. It is not a medical device and does not provide diagnosis, treatment, or medical advice.',
        ],
      },
      {
        heading: 'Information We Collect',
        body: [
          'Account information: email address, display name, profile photo, authentication provider, and Firebase user ID when you sign in with Google.',
          'Training profile information: name, experience level, race or fitness goal, goal date, preferred training days, and current weekly mileage.',
          'Workout information: planned workouts, completed workouts, distance, duration, pace, perceived effort, notes, readiness scores, streaks, and plan adjustments.',
          'Location and GPS workout data: if you start a tracked run, Jogga may collect route points, GPS accuracy, distance, pace, duration, timestamps, and related run metrics to display the run and update coaching feedback.',
          'Health metrics: if you connect Google Fit or another supported source, Jogga requests read-only access and stores summarized daily metrics where possible, such as steps, distance, active calories, heart rate summaries, sleep summaries, weight, and recovery-related scores. Jogga does not store raw Google OAuth tokens in Firestore.',
          'Payment information: Stripe handles checkout, subscriptions, payment methods, invoices, cancellations, and billing portal access. Jogga stores subscription identifiers and status, but does not store full card numbers.',
          'Usage, analytics, and device information: Jogga may collect page views, feature events, app errors, browser or device information, and approximate technical data needed to operate, secure, and improve the app.',
          'Bot protection signals: when enabled, Cloudflare Turnstile may process browser and interaction signals to help distinguish legitimate users from automated traffic before sign-in or form actions.',
        ],
      },
      {
        heading: 'How We Use Information',
        body: [
          'To create, save, and update personalized training plans.',
          'To calculate readiness, recovery, streaks, workout feedback, and plan changes.',
          'To measure real runs using GPS metrics and show route or performance summaries.',
          'To generate AI coaching summaries, post-run feedback, audio cues, and explanations. Jogga sends only the information needed for the coaching task where possible and avoids sending raw GPS route arrays to AI providers unless necessary.',
          'To process subscriptions, verify paid access, restore access, prevent canceled subscriptions from retaining premium features, and provide billing support through Stripe.',
          'To protect the app from abuse, spam, credential attacks, excessive AI usage, and automated signups.',
          'To debug, maintain, secure, and improve Jogga.',
        ],
      },
      {
        heading: 'AI Providers',
        body: [
          'Jogga may use third-party AI providers such as Google Gemini or OpenAI to generate coaching responses. AI prompts are designed to be concise and structured, and the app includes deterministic fallbacks when an AI provider is unavailable.',
          'AI coaching is informational fitness guidance only. It should not replace medical, legal, safety, or professional healthcare advice.',
        ],
      },
      {
        heading: 'Third-Party Services',
        body: [
          'Jogga uses service providers to operate the app, including Firebase for authentication and database services, Vercel for hosting and serverless functions, Stripe for payments and subscriptions, Google services for authentication, health data sync, analytics, maps, or AI features, Cloudflare Turnstile for bot detection when configured, and AI providers for coaching features.',
          'These providers process information according to their own terms and privacy practices. Jogga uses them to provide the app, secure the service, process payments, measure usage, and generate app features.',
        ],
      },
      {
        heading: 'How We Share Information',
        body: [
          'Jogga does not sell personal training, GPS, or health metric data.',
          'Jogga shares information with service providers only as needed to run the app, process payments, verify subscriptions, provide authentication, sync connected health metrics, protect against abuse, generate AI coaching, or comply with legal obligations.',
          'Jogga may disclose information if required by law, to protect users or the service, or as part of a business transfer such as a merger, acquisition, financing, or sale of assets.',
        ],
      },
      {
        heading: 'Health, Fitness, and Location Data',
        body: [
          'Jogga treats fitness, health metric, and precise location information as sensitive. Users choose when to start GPS tracking or connect supported health data sources.',
          'Google Fit and health metric sync is read-only in the current MVP. Jogga asks for access only after the user taps a connect action and stores summarized daily metrics where possible.',
          'You can disconnect third-party access through the relevant Google, Firebase, browser, or device settings. Some historical app records may remain until deleted according to the retention practices below.',
        ],
      },
      {
        heading: 'Security and Abuse Prevention',
        body: [
          'Jogga uses authentication, Firestore rules, server-side subscription checks, webhook fulfillment, API rate limits, usage caps, and optional bot verification to reduce unauthorized access and abuse.',
          'No internet service can be guaranteed completely secure. Users should keep their Google account secure and report suspicious activity.',
        ],
      },
      {
        heading: 'Retention and Deletion',
        body: [
          'Jogga keeps account, profile, workout, subscription, and summarized health information for as long as needed to provide the service, maintain business records, resolve disputes, prevent abuse, or comply with legal obligations.',
          'Users may request deletion of account-related information. Some records may need to be retained for legitimate business, payment, security, tax, or legal reasons.',
        ],
      },
      {
        heading: 'Children',
        body: [
          'Jogga is not intended for children under 13. Do not use Jogga if you are under 13. If we learn that a child under 13 provided personal information, we will take reasonable steps to delete it.',
        ],
      },
      {
        heading: 'Your Choices',
        body: [
          'You can choose not to connect health metrics, not to start GPS-tracked workouts, or not to provide optional workout notes.',
          'You can manage billing through Stripe, revoke Google account access through Google settings, disable browser permissions such as location access, and contact Jogga to request account data deletion.',
        ],
      },
      {
        heading: 'Changes to This Policy',
        body: [
          'Jogga may update this policy as the app, providers, or legal requirements change. The updated date above shows when this page was last revised.',
        ],
      },
      {
        heading: 'Contact',
        body: [
          'For privacy questions or deletion requests, contact Jogga at baitjet@gmail.com. Jogga is based in Union City, NJ.',
        ],
      },
    ],
  },
  {
    path: '/terms',
    title: 'Terms of Service | Jogga',
    description:
      'Terms of service for Jogga, including subscriptions, AI coaching, GPS tracking, health metrics, acceptable use, and fitness disclaimers.',
    h1: 'Terms of Service',
    updatedAt: 'May 10, 2026',
    updatedIso: '2026-05-10',
    sections: [
      {
        heading: 'Agreement to These Terms',
        body: [
          'These Terms govern access to and use of Jogga, an AI running coach and adaptive training app. By using Jogga, you agree to these Terms and the Privacy Policy.',
          'If you do not agree, do not use the app.',
        ],
      },
      {
        heading: 'Jogga Is Not Medical Advice',
        body: [
          'Jogga provides fitness and wellness information, training plan organization, run tracking, readiness cues, and AI-generated coaching summaries. Jogga does not provide medical advice, diagnosis, treatment, emergency support, or professional healthcare services.',
          'Running and exercise involve risk. Consult a qualified healthcare professional before starting or changing training if you have health concerns, injuries, symptoms, medical conditions, or any doubt about safe participation.',
        ],
      },
      {
        heading: 'Accounts and Authentication',
        body: [
          'You may need to sign in with Google or another supported provider to use Jogga. You are responsible for keeping your account secure and for activity that occurs under your account.',
          'You must provide accurate information during onboarding so the app can generate a reasonable training plan.',
        ],
      },
      {
        heading: 'Training Plans and AI Coaching',
        body: [
          'Jogga generates training plans using your goals, schedule, experience level, mileage preference, completed workouts, GPS metrics, readiness signals, and other available app data.',
          'AI coaching may be inaccurate, incomplete, delayed, or unsuitable for your specific situation. Use judgment, stop if something feels unsafe, and do not follow app guidance that conflicts with medical advice or real-world conditions.',
        ],
      },
      {
        heading: 'GPS, Health Metrics, and Device Data',
        body: [
          'GPS distance, route, pace, and accuracy can vary depending on device sensors, permissions, signal quality, location, battery settings, and network conditions.',
          'Health metric integrations are read-only in the current MVP and are intended for personal fitness insights. Jogga does not guarantee that connected health data is complete, accurate, or available at all times.',
        ],
      },
      {
        heading: 'Subscriptions, Trials, and Billing',
        body: [
          'Jogga may offer paid subscriptions, annual plans, monthly plans, and free trials. Checkout, payment methods, invoices, billing portal access, cancellations, and payment processing are handled by Stripe.',
          'A free trial may require a payment method and may convert to a paid subscription unless canceled before the trial ends. Plan names, pricing, trial length, and availability may change for future purchases.',
          'Canceling a subscription may remove premium access at the end of the applicable billing or trial period, depending on Stripe status and app configuration.',
        ],
      },
      {
        heading: 'Refunds',
        body: [
          'Refunds are not guaranteed unless required by law. If there is a billing issue, contact support with the account email and Stripe receipt information so the issue can be reviewed.',
        ],
      },
      {
        heading: 'Acceptable Use',
        body: [
          'Do not misuse Jogga, attempt to bypass paywalls or usage limits, attack or scrape the service, overload APIs, abuse AI endpoints, interfere with security controls, reverse engineer restricted parts of the service, upload malicious content, or use Jogga in a way that violates law or harms others.',
          'Automated signup, fake account creation, bot traffic, payment fraud, and attempts to bypass bot protection may result in blocked access or account termination.',
        ],
      },
      {
        heading: 'Ownership',
        body: [
          'Jogga, including its design, code, brand elements, content, and app experience, is owned by its operators or licensors. You may not copy, resell, or exploit the service except as allowed by these Terms.',
          'You retain ownership of information you provide, but grant Jogga the rights needed to host, process, display, analyze, and use that information to operate and improve the service.',
        ],
      },
      {
        heading: 'Third-Party Services',
        body: [
          'Jogga depends on third-party services such as Firebase, Vercel, Stripe, Google services, Cloudflare Turnstile, and AI providers. Their services may have separate terms, privacy practices, limitations, outages, or requirements.',
          'Jogga is not responsible for third-party services outside its control.',
        ],
      },
      {
        heading: 'Availability and Changes',
        body: [
          'Jogga may change, suspend, limit, or discontinue features at any time. The app may be unavailable because of maintenance, provider outages, network issues, deployment changes, or other operational reasons.',
        ],
      },
      {
        heading: 'Disclaimers',
        body: [
          'Jogga is provided on an "as is" and "as available" basis. To the fullest extent allowed by law, Jogga disclaims warranties of accuracy, fitness for a particular purpose, uninterrupted availability, and error-free operation.',
          'You are responsible for deciding whether a workout, pace, distance, route, health metric interpretation, or coaching recommendation is safe for you.',
        ],
      },
      {
        heading: 'Limitation of Liability',
        body: [
          'To the fullest extent allowed by law, Jogga will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, lost data, personal injury, training outcomes, race outcomes, or service interruptions arising from use of the app.',
        ],
      },
      {
        heading: 'Termination',
        body: [
          'Jogga may suspend or terminate access if you violate these Terms, misuse the service, create risk for the app or other users, fail to pay for a subscription, or if continued access would create legal or security concerns.',
        ],
      },
      {
        heading: 'Changes to These Terms',
        body: [
          'Jogga may update these Terms as the app changes. The updated date above shows when this page was last revised. Continued use after changes means you accept the updated Terms.',
        ],
      },
      {
        heading: 'Contact',
        body: [
          'For terms, billing, or account questions, contact Jogga at baitjet@gmail.com. Jogga is based in Union City, NJ.',
        ],
      },
    ],
  },
];

export const LEGAL_PAGE_BY_PATH = LEGAL_PAGES.reduce<Record<string, LegalPageContent>>((pages, page) => {
  pages[page.path] = page;
  return pages;
}, {});

export function buildLegalCanonicalUrl(page: LegalPageContent) {
  return `${SITE_URL}${page.path}`;
}
