// SEC-008: Centralized Password Policy & Common Password Definitions

export const MIN_PASSWORD_LENGTH = 10;
export const RECOMMENDED_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export type PasswordErrorCode =
  | 'INVALID_TYPE'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'WEAK_PASSWORD'
  | 'MISMATCH';

export interface PasswordValidationResult {
  isValid: boolean;
  errorCode?: PasswordErrorCode;
  message?: string;
  isBreached?: boolean;
}

// Curated set of known compromised, default, or trivially predictable passwords (lowercase)
export const COMMON_PASSWORDS: readonly string[] = [
  '12345678',
  '123456789',
  '1234567890',
  '123456789012',
  'password',
  'password1',
  'password12',
  'password123',
  'password1234',
  'password12345',
  'qwertyuiop',
  'asdfghjkl;',
  'admin12345',
  'admin123456',
  'administrator',
  'welcome123',
  'welcome1234',
  'welcome12345',
  'iloveyou123',
  'passphrase1',
  'thesis1234',
  'thesis2024',
  'thesis2025',
  'thesis2026',
  'hospital123',
  'hospital1234',
  'doctor12345',
  'medicine123',
  'clinical123',
  'research123',
  'sunshine123',
  'princess123',
  'football123',
  'monkey12345',
  'shadow12345',
  'master12345',
  'dragon12345',
  'superman123',
  'trustno1111',
  'charlie1234',
  'letmein1234',
  '0000000000',
  '1111111111',
  '2222222222',
  '3333333333',
  '4444444444',
  '5555555555',
  '6666666666',
  '7777777777',
  '8888888888',
  '9999999999',
];

const COMMON_SET = new Set(COMMON_PASSWORDS.map((p) => p.toLowerCase()));

// Detect sequential characters like 0123456789 or abcdefghij
function isSequential(str: string): boolean {
  if (str.length < 6) return false;
  let ascending = 0;
  let descending = 0;
  for (let i = 1; i < str.length; i++) {
    const diff = str.charCodeAt(i) - str.charCodeAt(i - 1);
    if (diff === 1) ascending++;
    else ascending = 0;
    if (diff === -1) descending++;
    else descending = 0;
    if (ascending >= 5 || descending >= 5) return true;
  }
  return false;
}

/**
 * Synchronous client- and server-safe structural validation
 */
export function validatePasswordBasic(password: unknown): PasswordValidationResult {
  if (typeof password !== 'string') {
    return {
      isValid: false,
      errorCode: 'INVALID_TYPE',
      message: 'Password must be a valid string.',
    };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      isValid: false,
      errorCode: 'TOO_SHORT',
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters. (Password must be at least 6 characters is no longer permitted; minimum ${MIN_PASSWORD_LENGTH} characters required).`,
    };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      isValid: false,
      errorCode: 'TOO_LONG',
      message: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`,
    };
  }

  const normalized = password.toLowerCase();

  // Known common passwords blocklist
  if (COMMON_SET.has(normalized)) {
    return {
      isValid: false,
      errorCode: 'WEAK_PASSWORD',
      message: 'Choose a stronger password that is not commonly used or known to be compromised.',
    };
  }

  // Check if string is composed entirely of a single repeated character (e.g. aaaaaaaaaa)
  if (/^(.)\1+$/.test(password)) {
    return {
      isValid: false,
      errorCode: 'WEAK_PASSWORD',
      message: 'Choose a stronger password that is not commonly used or known to be compromised.',
    };
  }

  // Check sequential character patterns (e.g. 1234567890, 0123456789)
  if (isSequential(normalized)) {
    return {
      isValid: false,
      errorCode: 'WEAK_PASSWORD',
      message: 'Choose a stronger password that is not commonly used or known to be compromised.',
    };
  }

  return { isValid: true };
}

/**
 * Validate password confirmation matching
 */
export function validatePasswordConfirmation(password: string, confirmPassword: string): PasswordValidationResult {
  if (password !== confirmPassword) {
    return {
      isValid: false,
      errorCode: 'MISMATCH',
      message: 'Passwords do not match.',
    };
  }
  return { isValid: true };
}
