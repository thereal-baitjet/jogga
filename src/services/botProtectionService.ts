const TURNSTILE_SCRIPT_ID = 'jogga-turnstile-script';
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

type TurnstileWidgetId = string;

interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  size: 'invisible';
  callback: (token: string) => void;
  'error-callback': () => void;
  'timeout-callback': () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => TurnstileWidgetId;
      execute: (widgetId: TurnstileWidgetId) => void;
      remove: (widgetId: TurnstileWidgetId) => void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

export function isBotProtectionConfigured() {
  return Boolean(TURNSTILE_SITE_KEY?.trim());
}

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Bot verification could not load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Bot verification could not load.')), { once: true });
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export async function getBotChallengeToken(action: string) {
  const siteKey = TURNSTILE_SITE_KEY?.trim();
  if (!siteKey) return null;

  await loadTurnstileScript();
  if (!window.turnstile) {
    throw new Error('Bot verification is unavailable. Refresh and try again.');
  }

  return new Promise<string>((resolve, reject) => {
    const container = document.createElement('div');
    container.setAttribute('aria-hidden', 'true');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);

    let widgetId: TurnstileWidgetId | null = null;
    let settled = false;

    const cleanup = () => {
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
      container.remove();
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error('Bot verification timed out. Try again.')));
    }, 12000);

    try {
      widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        action,
        size: 'invisible',
        callback: (token) => {
          window.clearTimeout(timeoutId);
          finish(() => resolve(token));
        },
        'error-callback': () => {
          window.clearTimeout(timeoutId);
          finish(() => reject(new Error('Bot verification failed. Refresh and try again.')));
        },
        'timeout-callback': () => {
          window.clearTimeout(timeoutId);
          finish(() => reject(new Error('Bot verification timed out. Try again.')));
        },
      });

      window.turnstile.execute(widgetId);
    } catch (error) {
      window.clearTimeout(timeoutId);
      finish(() => reject(error instanceof Error ? error : new Error('Bot verification failed. Refresh and try again.')));
    }
  });
}

export async function verifyBotChallenge(token: string | null, action: string) {
  if (!isBotProtectionConfigured()) {
    return { ok: true, configured: false };
  }

  if (!token) {
    throw new Error('Bot verification token is missing. Refresh and try again.');
  }

  const response = await fetch('/api/bot/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, action }),
  });
  const data = await response.json();

  if (!response.ok || data?.ok !== true) {
    throw new Error(data?.error || 'Bot verification failed. Refresh and try again.');
  }

  return data as { ok: true; configured: boolean };
}
