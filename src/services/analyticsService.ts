type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsParams = Record<string, AnalyticsValue>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';
let isInitialized = false;

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function cleanParams(params: AnalyticsParams = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
  );
}

export function isAnalyticsConfigured() {
  return Boolean(GA_MEASUREMENT_ID);
}

export function initAnalytics() {
  if (!isBrowser() || isInitialized || !isAnalyticsConfigured()) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || ((...args: unknown[]) => {
    window.dataLayer?.push(args);
  });

  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    anonymize_ip: true,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.appendChild(script);

  isInitialized = true;
}

export function setAnalyticsUser(userId: string | null | undefined) {
  if (!isBrowser() || !isAnalyticsConfigured()) return;

  initAnalytics();
  window.gtag?.('set', { user_id: userId || undefined });
}

export function trackPageView(path: string, title: string, params: AnalyticsParams = {}) {
  if (!isBrowser() || !isAnalyticsConfigured()) return;

  initAnalytics();
  window.gtag?.('event', 'page_view', {
    page_title: title,
    page_location: `${window.location.origin}${path}`,
    page_path: path,
    ...cleanParams(params),
  });
}

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  if (!isBrowser() || !isAnalyticsConfigured()) return;

  initAnalytics();
  window.gtag?.('event', name, cleanParams(params));
}
