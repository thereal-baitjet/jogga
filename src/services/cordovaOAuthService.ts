import { Auth, GoogleAuthProvider, User, reauthenticateWithCredential, signInWithCredential } from 'firebase/auth';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const DEFAULT_GOOGLE_SCOPES = ['openid', 'email', 'profile'];
const CORDOVA_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '';
const CORDOVA_GOOGLE_REDIRECT_URI = (
  import.meta.env.VITE_CORDOVA_GOOGLE_REDIRECT_URI ||
  'https://jogga.santosautomation.com/oauth/google/callback'
).replace(/\/$/, '');

interface CordovaBrowserEvent {
  url?: string;
}

interface CordovaBrowserRef {
  addEventListener: (event: 'loadstart' | 'loaderror' | 'exit', callback: (event: CordovaBrowserEvent) => void) => void;
  removeEventListener?: (event: 'loadstart' | 'loaderror' | 'exit', callback: (event: CordovaBrowserEvent) => void) => void;
  close: () => void;
}

interface CordovaInAppBrowser {
  open: (url: string, target?: string, options?: string) => CordovaBrowserRef;
}

declare global {
  interface Window {
    cordova?: {
      InAppBrowser?: CordovaInAppBrowser;
    };
  }
}

interface CordovaGoogleOAuthResult {
  accessToken: string | null;
  idToken: string | null;
}

function randomOAuthValue() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function getCordovaInAppBrowser() {
  return window.cordova?.InAppBrowser;
}

export function isCordovaRuntime() {
  return Boolean(window.cordova);
}

export function isCordovaOAuthAvailable() {
  return Boolean(getCordovaInAppBrowser());
}

function getClientId() {
  if (!CORDOVA_GOOGLE_CLIENT_ID) {
    throw new Error('Cordova Google OAuth is missing VITE_GOOGLE_OAUTH_CLIENT_ID.');
  }

  return CORDOVA_GOOGLE_CLIENT_ID;
}

function getRedirectUri() {
  return CORDOVA_GOOGLE_REDIRECT_URI;
}

function buildGoogleOAuthUrl(scopes: string[], state: string, nonce: string, prompt: string) {
  const normalizedScopes = [...new Set([...DEFAULT_GOOGLE_SCOPES, ...scopes])];
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'id_token token',
    scope: normalizedScopes.join(' '),
    state,
    nonce,
    prompt,
    include_granted_scopes: 'true',
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

function getOAuthParams(url: string) {
  const parsedUrl = new URL(url);
  const params = new URLSearchParams(parsedUrl.search);
  const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));

  hashParams.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });

  return params;
}

function isRedirectUrl(url: string, redirectUri: string) {
  try {
    const parsedUrl = new URL(url);
    const parsedRedirect = new URL(redirectUri);
    const normalizedPath = parsedUrl.pathname.replace(/\/$/, '');
    const normalizedRedirectPath = parsedRedirect.pathname.replace(/\/$/, '');

    return parsedUrl.origin === parsedRedirect.origin && normalizedPath === normalizedRedirectPath;
  } catch {
    return false;
  }
}

function removeBrowserListeners(browser: CordovaBrowserRef, listeners: Record<'loadstart' | 'loaderror' | 'exit', (event: CordovaBrowserEvent) => void>) {
  if (!browser.removeEventListener) return;
  browser.removeEventListener('loadstart', listeners.loadstart);
  browser.removeEventListener('loaderror', listeners.loaderror);
  browser.removeEventListener('exit', listeners.exit);
}

export function openCordovaGoogleOAuth(scopes: string[] = [], options: { prompt?: string } = {}): Promise<CordovaGoogleOAuthResult> {
  const browserApi = getCordovaInAppBrowser();

  if (!browserApi) {
    throw new Error('Cordova OAuth requires cordova-plugin-inappbrowser.');
  }

  const state = randomOAuthValue();
  const nonce = randomOAuthValue();
  const redirectUri = getRedirectUri();
  const authUrl = buildGoogleOAuthUrl(scopes, state, nonce, options.prompt || 'select_account');

  return new Promise((resolve, reject) => {
    let settled = false;
    const browser = browserApi.open(
      authUrl,
      '_blank',
      'location=yes,clearcache=yes,clearsessioncache=yes,hardwareback=yes,hideurlbar=yes'
    );

    const finish = (error: Error | null, result?: CordovaGoogleOAuthResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      removeBrowserListeners(browser, listeners);

      try {
        browser.close();
      } catch {
        // The browser may already be closed by the user.
      }

      if (error) {
        reject(error);
        return;
      }

      resolve(result || { accessToken: null, idToken: null });
    };

    const listeners = {
      loadstart: (event: CordovaBrowserEvent) => {
        if (!event.url || !isRedirectUrl(event.url, redirectUri)) return;

        const params = getOAuthParams(event.url);
        const error = params.get('error');
        const returnedState = params.get('state');

        if (error) {
          finish(new Error(params.get('error_description') || `Google OAuth failed: ${error}`));
          return;
        }

        if (returnedState !== state) {
          finish(new Error('Google OAuth state check failed.'));
          return;
        }

        const accessToken = params.get('access_token');
        const idToken = params.get('id_token');

        if (!accessToken && !idToken) {
          finish(new Error('Google OAuth did not return a usable token.'));
          return;
        }

        finish(null, { accessToken, idToken });
      },
      loaderror: (event: CordovaBrowserEvent) => {
        if (event.url && isRedirectUrl(event.url, redirectUri)) return;
        finish(new Error('Google OAuth browser failed to load.'));
      },
      exit: () => {
        finish(new Error('Google sign-in was closed before it finished.'));
      },
    };

    const timeoutId = window.setTimeout(() => {
      finish(new Error('Google OAuth timed out. Try again.'));
    }, 2 * 60 * 1000);

    browser.addEventListener('loadstart', listeners.loadstart);
    browser.addEventListener('loaderror', listeners.loaderror);
    browser.addEventListener('exit', listeners.exit);
  });
}

function buildGoogleCredential(result: CordovaGoogleOAuthResult) {
  return GoogleAuthProvider.credential(result.idToken || undefined, result.accessToken || undefined);
}

export async function signInWithCordovaGoogle(auth: Auth) {
  const result = await openCordovaGoogleOAuth();
  return signInWithCredential(auth, buildGoogleCredential(result));
}

export async function reauthenticateWithCordovaGoogle(user: User, scopes: string[] = []) {
  const result = await openCordovaGoogleOAuth(scopes, { prompt: 'consent select_account' });
  const credential = buildGoogleCredential(result);

  await reauthenticateWithCredential(user, credential);

  return result;
}
