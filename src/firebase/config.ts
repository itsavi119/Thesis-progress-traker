import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  type Auth,
} from 'firebase/auth';
import appletConfig from '../../firebase-applet-config.json';

/**
 * Firebase Client Configuration
 * Priority:
 * 1. Explicit Vite environment variables (VITE_FIREBASE_*) if defined in .env
 * 2. Official provisioned project configuration from firebase-applet-config.json
 */
export const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || appletConfig.apiKey || '',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || appletConfig.authDomain || '',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || appletConfig.projectId || '',
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || appletConfig.storageBucket || '',
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || appletConfig.messagingSenderId || '',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || appletConfig.appId || '',
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string) || appletConfig.measurementId || '',
};

/**
 * Checks if a real, valid Firebase configuration is active.
 */
export const isFirebaseConfigured: boolean = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey.trim().length > 10 &&
  !firebaseConfig.apiKey.includes('YOUR_') &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId.trim().length > 0 &&
  !firebaseConfig.projectId.includes('YOUR_')
);

// Initialize or reuse singleton Firebase App instance
export const app: FirebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig);

// Initialize Firebase Authentication instance
export const auth: Auth = getAuth(app);

// Configure robust local persistence so user sessions survive page refreshes, tab closures, and navigation
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('[Auth] Notice configuring browserLocalPersistence:', err);
  });
}

// Initialize official Google Auth Provider
export const googleProvider: GoogleAuthProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Returns configuration state details
 */
export function getFirebaseConfigStatus(): {
  isConfigured: boolean;
  projectId: string;
  authDomain: string;
} {
  return {
    isConfigured: isFirebaseConfigured,
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
  };
}
