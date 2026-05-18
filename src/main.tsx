import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LEGAL_PAGE_BY_PATH } from './components/legal/legalPages';
import { LegalPage } from './components/legal/LegalPage';
import { SEO_PAGE_BY_PATH } from './components/seo/seoPages';
import { SeoTrainingPage } from './components/seo/SeoTrainingPage';
import './index.css';
import { initAnalytics } from './services/analyticsService';

let hasReloadedForUpdate = false;

function reloadForAppUpdate() {
  if (hasReloadedForUpdate) return;
  hasReloadedForUpdate = true;
  window.location.reload();
}

function checkForAppUpdate() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.getRegistration().then((registration) => {
    registration?.update();
  }).catch((error) => {
    console.error('Failed to check for app updates:', error);
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('Jogga service worker registered');
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            navigator.serviceWorker.addEventListener('controllerchange', reloadForAppUpdate, { once: true });
            installingWorker.postMessage({ type: 'SKIP_WAITING' });
            window.setTimeout(reloadForAppUpdate, 1500);
          }
        });
      });
    }).catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  });
}

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
const legalPage = LEGAL_PAGE_BY_PATH[normalizedPath];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {legalPage ? <LegalPage page={legalPage} /> : seoPage ? <SeoTrainingPage page={seoPage} /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
