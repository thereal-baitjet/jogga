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
   git clone https://github.com/thereal-baitjet/Jogga.git
   cd Jogga
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add your configuration (see `.env.example` for reference):
   ```env
   STRIPE_SECRET_KEY=your_stripe_secret_key
   VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
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

## 📱 Screenshots

| Dashboard | Workout Detail | Live Tracking |
| :---: | :---: | :---: |
| ![Dashboard](https://picsum.photos/seed/jogga-dash/300/600) | ![Workout](https://picsum.photos/seed/jogga-workout/300/600) | ![Tracking](https://picsum.photos/seed/jogga-track/300/600) |

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ for runners everywhere.
