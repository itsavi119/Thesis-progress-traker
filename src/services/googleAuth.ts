import { api } from './api.js';

let cachedClientId: string | null = null;

export async function getGoogleClientId(): Promise<string> {
  // 1. Check client-side build-time environment variable (e.g. Netlify env var)
  const envClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
  if (envClientId && typeof envClientId === 'string' && envClientId.trim()) {
    return envClientId.trim();
  }

  if (cachedClientId) return cachedClientId;

  // 2. Check server-side config endpoint
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

  // 3. Fallback to default client ID
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
        existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In library.')));
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In library.'));
    document.head.appendChild(script);
  });
}

/**
 * Initiates Google OAuth Sign-In via Google Identity Services.
 * Works seamlessly across both full-stack Node backends and static Netlify deployments.
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
              let authUser: any = null;

              // 1. Attempt to sync to backend server if available
              try {
                const authRes = await api.syncAuth({
                  accessToken: response.access_token,
                });
                if (authRes?.user?.id) {
                  authUser = authRes.user;
                }
              } catch (apiErr: any) {
                console.info('Backend sync skipped or offline, using direct Google user profile:', apiErr?.message);
              }

              // 2. If running on static host (e.g. Netlify without Express API), fetch Google user profile directly
              if (!authUser) {
                const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${response.access_token}` },
                });
                if (!userInfoRes.ok) {
                  throw new Error('Unable to retrieve profile from Google. Please try again.');
                }
                const gUser = await userInfoRes.json();
                authUser = {
                  id: gUser.sub,
                  email: (gUser.email || '').toLowerCase(),
                  display_name: gUser.name || gUser.email?.split('@')[0] || 'Researcher',
                  role: 'member',
                  status: 'active',
                  photo_url: gUser.picture || null,
                  has_password: false,
                  auth_provider: 'password',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
              }

              // 3. Cache session for static / client-side resilience
              if (typeof window !== 'undefined') {
                try {
                  localStorage.setItem('thesis_tracker_static_user', JSON.stringify(authUser));
                } catch {}
              }

              resolve(authUser);
            } catch (err: any) {
              reject(new Error(err?.message || 'Failed to authenticate user profile.'));
            }
          } else {
            reject(new Error('No access token returned from Google.'));
          }
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || 'Google Sign-In popup was closed or blocked.'));
        },
      });

      client.requestAccessToken({ prompt: 'select_account' });
    } catch (initErr: any) {
      reject(new Error(initErr?.message || 'Could not initialize Google Sign-In.'));
    }
  });
}
