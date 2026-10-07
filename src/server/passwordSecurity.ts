// SEC-008: Server-Side Password Security & Breached-Password Screening
import crypto from 'node:crypto';
import {
  validatePasswordBasic,
  PasswordValidationResult,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from '../utils/passwordPolicy.js';

export { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH };
export type { PasswordValidationResult };

/**
 * Privacy-preserving breached password screening using HaveIBeenPwned (HIBP) k-anonymity.
 * Only the first 5 characters of the SHA-1 hash are sent to the external service.
 * The plaintext password is NEVER sent over the network or logged.
 */
export async function checkHaveIBeenPwned(password: string): Promise<boolean> {
  try {
    const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ThesisTracker-Security/1.0',
        'Add-Padding': 'true',
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) return false;

    const body = await res.text();
    const lines = body.split('\r\n');
    for (const line of lines) {
      const [entrySuffix, countStr] = line.split(':');
      if (entrySuffix && entrySuffix.trim().toUpperCase() === suffix) {
        const count = parseInt(countStr || '0', 10);
        // Heavily compromised threshold per NIST SP 800-63B guidelines
        return count >= 500;
      }
    }
    return false;
  } catch {
    // Graceful offline fallback: If external network is down or offline, fall back safely
    return false;
  }
}

/**
 * Authoritative backend password validation.
 * Performs structural, common-blocklist, and k-anonymity breach screening.
 */
export async function validateServerPassword(password: unknown): Promise<PasswordValidationResult> {
  const basic = validatePasswordBasic(password);
  if (!basic.isValid) return basic;

  const isBreached = await checkHaveIBeenPwned(password as string);
  if (isBreached) {
    return {
      isValid: false,
      errorCode: 'WEAK_PASSWORD',
      message: 'Choose a stronger password that is not commonly used or known to be compromised.',
      isBreached: true,
    };
  }

  return { isValid: true };
}
