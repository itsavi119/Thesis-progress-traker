import { api } from './api.js';

let cachedClientId: string | null = null;

export async function getGoogleClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  try {
    const res = await fetch('/api/auth/google-client-id');
    if (res.ok) {
      const data = await res.json();
      if (data?.clientId) {
        cachedClientId = data.clientId;
        return data.clientId;
      }
    }
  } catch {}
  return '316905229392-vlbm26gmdut9flij49ddl7gjhfc4d781.apps.googleusercontent.com';
}

export async function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') return;
  if ((window as any).google?.accounts) return;

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('google-gsi-client');
    if (existing) {
      if ((window as any).google?.accounts) {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In service.')));
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In service.'));
    document.head.appendChild(script);
  });
}

/**
 * Initiates Google OAuth Sign-In via Google Identity Services.
 * Securely uses standard OAuth Client ID with zero API keys exposed in URLs or client bundles.
 */
export async function triggerGoogleOAuth(): Promise<any> {
  const clientId = await getGoogleClientId();
  await loadGoogleIdentityScript();

  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    throw new Error('Google Sign-In is unavailable in this browser environment.');
  }

  return new Promise((resolve, reject) => {
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'email profile openid',
        callback: async (response: any) => {
          if (response?.error) {
            reject(new Error(response.error_description || response.error || 'Google Sign-In cancelled.'));
            return;
          }

          if (response?.access_token) {
            try {
              const authRes = await api.syncAuth({
                accessToken: response.access_token,
              });
              resolve(authRes.user);
            } catch (syncErr: any) {
              reject(new Error(syncErr?.message || 'Failed to complete authentication with server.'));
            }
          } else {
            reject(new Error('No access token returned from Google.'));
          }
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || 'Google Sign-In popup was closed or blocked.'));
        },
      });

      client.requestAccessToken();
    } catch (initErr: any) {
      reject(new Error(initErr?.message || 'Could not initialize Google Sign-In.'));
    }
  });
}
