import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SEO_PAGE_BY_PATH } from './components/seo/seoPages';
import { SeoTrainingPage } from './components/seo/SeoTrainingPage';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { initAnalytics } from './services/analyticsService';

let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;
let hasReloadedForUpdate = false;

function reloadForAppUpdate() {
  if (hasReloadedForUpdate) return;
  hasReloadedForUpdate = true;
  window.location.reload();
}

function applyAppUpdate() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', reloadForAppUpdate, { once: true });
  }

  try {
    void updateServiceWorker?.(true);
  } catch (error) {
    console.error('Failed to apply app update:', error);
  }

  window.setTimeout(reloadForAppUpdate, 1500);
}

function checkForAppUpdate() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.getRegistration().then((registration) => {
    registration?.update();
  }).catch((error) => {
    console.error('Failed to check for app updates:', error);
  });
}

updateServiceWorker = registerSW({
  onNeedRefresh() {
    applyAppUpdate();
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});

window.addEventListener('focus', checkForAppUpdate);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkForAppUpdate();
  }
});
window.setInterval(checkForAppUpdate, 60 * 60 * 1000);

initAnalytics();

const normalizedPath = window.location.pathname.replace(/\/$/, '') || '/';
const seoPage = SEO_PAGE_BY_PATH[normalizedPath];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {seoPage ? <SeoTrainingPage page={seoPage} /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
