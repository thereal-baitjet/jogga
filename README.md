# Jogga 🏃‍♂️

**Jogga** is a personalized, adaptive running coach designed to help runners of all levels achieve their goals. A powerful **Runna alternative** for less than 1/3 the price, Jogga provides the structure, motivation, and insights you need to succeed without the premium price tag.

![Jogga Preview](https://picsum.photos/seed/running/1200/600)

## ✨ Features

- **Adaptive Training Plans**: Custom plans generated based on your experience level, goals, and preferred training days.
- **Real-Time Tracking**: GPS-powered run tracking with live distance, pace, and duration metrics.
- **Readiness Score**: Daily insights into your recovery and performance potential based on your recent training consistency and fatigue.
- **Interactive Workouts**: Detailed workout instructions with specific targets for pace and effort.
- **Performance Analytics**: Track your progress over time with comprehensive post-run check-ins and history.
- **Premium Experience**: Secure subscription management powered by Stripe to unlock advanced coaching features.

## 🚀 Tech Stack

- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Animations**: [Motion](https://motion.dev/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Backend**: [Express](https://expressjs.com/) (Node.js)
- **Payments**: [Stripe](https://stripe.com/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)

## 🛠️ Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/thereal-baitjet/jogga-fork.git
   cd jogga-fork
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add your configuration (see `.env.example` for reference):
   ```env
   APP_URL=https://jogga.santosautomation.com
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_MONTHLY_PRICE_ID=price_...
   STRIPE_YEARLY_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   GEMINI_API_KEY=...
   OPENAI_API_KEY=...
   FIREBASE_SERVICE_ACCOUNT_JSON='{"project_id":"...","client_email":"...","private_key":"..."}'
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   npm start
   ```

## Firestore User Records

On sign-in, Jogga creates or updates `users/{uid}` with Firebase auth metadata, including `uid`, `email`, `displayName`, `photoURL`, `authProvider`, `createdAt`, and `lastLoginAt`. Onboarding then merges training profile fields into the same document with `profileCompleted: true`. Stripe subscription fields are fulfilled server-side through Firebase Admin from verified Stripe webhook and session/status API data. Firestore rules allow users to read/write only their own user document and workout subcollection.

## AI Provider Setup

AI coach and audio endpoints require Firebase auth, an active Stripe subscription, and rate limits before any model request is made. The server prefers Gemini when `GEMINI_API_KEY` is configured. If Gemini is missing or returns an error and `OPENAI_API_KEY` is configured, the same endpoints fall back to OpenAI.

OpenAI defaults can be overridden with:

```env
OPENAI_TEXT_MODEL=gpt-4o-mini
OPENAI_TTS_MODEL=gpt-4o-mini-tts
```

Auth does not fall back to OpenAI. Firebase remains the identity provider and the API fails closed when auth or subscription verification does not pass.

## 💳 Stripe Setup

Jogga uses server-created Stripe Checkout Sessions for subscriptions. Create two recurring Prices in Stripe, add their IDs to `STRIPE_MONTHLY_PRICE_ID` and `STRIPE_YEARLY_PRICE_ID`, then set `STRIPE_SECRET_KEY`.

Hosted Stripe Payment Links are intentionally not used in the app. The subscription buttons call `/api/create-checkout-session`, and Stripe Checkout returns to `APP_URL` on `jogga.santosautomation.com` after payment.

Current Stripe objects created for Jogga:

```text
Product: prod_UPX71y7IL8bHR3
Monthly price: price_1TQi3jDyN7ZsSI75hfTKOr0s
Yearly price: price_1TQi3nDyN7ZsSI75Pzra5Cpt
```

Checkout redirects back with a Stripe Session ID. The app verifies that session through `/api/checkout-session/:sessionId` before updating local access state, so a user cannot unlock premium access by typing a fake success URL. Permanent subscription fields are written server-side with Firebase Admin credentials, not by the React client.

Subscribers can open Stripe Customer Portal from their profile or subscription screen to cancel a free trial, cancel a monthly/yearly plan, update payment methods, or manage billing. If the app has a stored Stripe customer ID, it creates a direct portal session through `/api/create-billing-portal-session`; otherwise it falls back to the hosted portal login URL in `VITE_STRIPE_BILLING_PORTAL_URL` (https://billing.stripe.com/p/login/4gM7sL6tEfHD0P7cdw1wY00).

For production subscription state sync, configure a Stripe webhook endpoint at `/api/stripe/webhook`, set `STRIPE_WEBHOOK_SECRET`, and set Firebase Admin credentials with either `FIREBASE_SERVICE_ACCOUNT_JSON` or the split `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` variables. The webhook verifies the Stripe signature before fulfillment, unlocks `active` and `trialing` subscriptions, marks `past_due` as locked, and revokes canceled subscriptions unless `users/{uid}.accessSource` is `admin`.

## PWA Update Flow

Jogga registers a service worker through `vite-plugin-pwa`. When a new build is available, the app shows an "Update App" button that activates the new service worker and reloads the app. The app also checks for updates when the window regains focus, when visibility returns, and once per hour while open.

## 🌐 Custom Domain

Production is deployed on Vercel:

```text
https://jogga-fork-main.vercel.app
```

The intended custom domain is:

```text
https://jogga.santosautomation.com
```

Set `APP_URL=https://jogga.santosautomation.com` in the production environment before deploying. Stripe Checkout success/cancel URLs and Google Health OAuth callbacks use this value. This value is already set in the linked Vercel production environment.

The domain `santosautomation.com` is currently using Namecheap DNS. Vercel has `jogga.santosautomation.com` attached to the `jogga-fork-main` project. Add this host record in Namecheap:

```text
Type: A
Host: jogga
Value: 76.76.21.21
TTL: Automatic
```

Alternatively, move the domain's nameservers to Vercel:

```text
ns1.vercel-dns.com
ns2.vercel-dns.com
```

Keeping Namecheap DNS and adding the `A` record is the smallest change.

After DNS is active, update external service allowlists:

- Firebase Auth authorized domains: `jogga-fork-main.vercel.app` and `jogga.santosautomation.com`
- Google OAuth redirect URI: `https://jogga.santosautomation.com/auth/google-health/callback`
- Cordova Google OAuth redirect URI: `https://jogga.santosautomation.com/oauth/google/callback`
- Stripe webhook endpoint: `https://jogga.santosautomation.com/api/stripe/webhook`
- Stripe Checkout success/cancel URLs are generated from `APP_URL`

## Google Auth Setup

Firebase Google sign-in is handled by the client app. In Firebase Console, enable Authentication > Sign-in method > Google, then add these authorized domains:

```text
localhost
jogga-fork-main.vercel.app
jogga.santosautomation.com
```

The app uses popup sign-in first and falls back to redirect sign-in when popups are blocked or unsupported. If Firebase still returns `auth/unauthorized-domain`, the domain is missing from the Firebase authorized domains list.

Google Health connect uses Firebase Google reauthentication with Google Fitness read scopes, so the in-app button does not require `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET`. In Google Cloud Console for the Firebase project, enable the Fitness API and make sure the OAuth consent screen is configured for the requested Fitness scopes.

For testing before Google verification, add your Google account under OAuth consent screen > Test users. The app requests these scopes:

```text
https://www.googleapis.com/auth/fitness.activity.read
https://www.googleapis.com/auth/fitness.body.read
https://www.googleapis.com/auth/fitness.heart_rate.read
https://www.googleapis.com/auth/fitness.sleep.read
```

The server OAuth endpoints in `/api/auth/google-health/*` are still present as an optional fallback. Only those endpoints require `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the redirect URI `https://jogga.santosautomation.com/auth/google-health/callback`.

## Cordova OAuth Setup

Cordova builds use a manual Google OAuth flow through `cordova-plugin-inappbrowser`, then pass the returned Google credential into Firebase Auth. Web/PWA builds continue using the normal Firebase popup/redirect flow.

Install the Cordova browser plugin in the Cordova wrapper project:

```bash
cordova plugin add cordova-plugin-inappbrowser
```

Set these client-side build variables before building the web assets for Cordova:

```env
VITE_GOOGLE_OAUTH_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
VITE_CORDOVA_GOOGLE_REDIRECT_URI=https://jogga.santosautomation.com/oauth/google/callback
```

In Google Cloud Console, add `https://jogga.santosautomation.com/oauth/google/callback` to the authorized redirect URIs for the same OAuth web client ID. The Cordova flow requests `openid email profile` for sign-in and adds Google Fitness read scopes when connecting Health Metrics.

## 📱 Screenshots

| Dashboard | Workout Detail | Live Tracking |
| :---: | :---: | :---: |
| ![Dashboard](https://picsum.photos/seed/jogga-dash/300/600) | ![Workout](https://picsum.photos/seed/jogga-workout/300/600) | ![Tracking](https://picsum.photos/seed/jogga-track/300/600) |

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ for runners everywhere.
