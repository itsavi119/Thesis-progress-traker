/**
 * Converts Firebase error codes and network conditions into clear,
 * professional, and non-technical user-facing messages.
 * Does NOT expose internal configurations, OAuth secrets, API keys, or raw stack traces.
 */
export function getFirebaseErrorMessage(error: any): string {
  if (!error) return 'An unexpected authentication error occurred.';

  const code: string = (typeof error === 'string' ? error : error?.code || '').toLowerCase();
  let rawMsg: string = String(error?.message || error || '');

  // Strip technical Firebase prefix boilerplate
  rawMsg = rawMsg
    .replace(/^Firebase:\s*/i, '')
    .replace(/^Error\s*\([^)]*\):\s*/i, '')
    .replace(/\(auth\/[^)]+\)\.?/gi, '')
    .trim();

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const domainHint = currentHost ? ` (${currentHost})` : '';

  // 1. Explicitly handled Google OAuth & popup errors (Requirement 4)
  if (code === 'auth/unauthorized-domain' || rawMsg.toLowerCase().includes('unauthorized domain')) {
    return `This domain${domainHint} is not authorized for Google Sign-In. Add "${currentHost}" to Authorized Domains in the Firebase Console (Authentication → Settings → Authorized domains) or sign in using your email credentials.`;
  }

  if (code === 'auth/popup-blocked') {
    return 'The sign-in popup was blocked by your browser. Please allow popups for this site or try again.';
  }

  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/user-cancelled'
  ) {
    return 'Sign-in was cancelled before completion. Please try again.';
  }

  if (code === 'auth/cancelled-popup-request') {
    return 'Another sign-in request was already in progress. Please try again.';
  }

  if (code === 'auth/network-request-failed') {
    return 'Network connection error. Please check your internet connection and try again.';
  }

  if (code === 'auth/account-exists-with-different-credential') {
    return 'An account already exists with this email address using a different sign-in method. Please sign in using your original method.';
  }

  // 2. Email & Password credential errors
  if (
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials'
  ) {
    return 'Invalid email address or password. Please verify your credentials and try again.';
  }

  if (code === 'auth/user-not-found') {
    return 'No registered account found with this email address. Please check your spelling or create an account.';
  }

  if (code === 'auth/email-already-in-use') {
    return 'An account is already registered with this email address. Please sign in instead.';
  }

  if (code === 'auth/weak-password') {
    return 'The password is too weak. Please use at least 10 characters with a mix of letters, numbers, and symbols.';
  }

  if (code === 'auth/invalid-email') {
    return 'Please enter a valid institutional or personal email address.';
  }

  // 3. Security status and rate limiting
  if (code === 'auth/too-many-requests') {
    return 'Access has been temporarily restricted due to repeated unsuccessful attempts. Please wait a few minutes or reset your password.';
  }

  if (code === 'auth/user-disabled') {
    return 'This research account has been deactivated. Please contact your principal investigator or institutional administrator.';
  }

  if (code === 'auth/operation-not-allowed') {
    return 'This authentication method is currently disabled in the Firebase Console. Please sign in with your email credentials.';
  }

  // 4. Internal and configuration fallbacks
  if (code === 'auth/internal-error' || code.includes('internal-error')) {
    return 'Unable to complete sign-in with Google. This occurs when browser popups or cross-site cookies are restricted, or on mobile browsers. Please try signing in again, or use your email and password below.';
  }

  // Fallback: sanitized friendly message
  return 'Authentication could not be completed. Please verify your credentials and try again.';
}
