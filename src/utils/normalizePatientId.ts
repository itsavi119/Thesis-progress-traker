/**
 * Thesis Case Tracker - Centralized Patient ID Normalization & Validation Utility
 *
 * Rules:
 * 1. Standardizes casing to uppercase (e.g. "p-1002" -> "P1002").
 * 2. Smart ID Normalization: ignores spaces, hyphens (-), and underscores (_) so that
 *    "P-1002", "p 1002", "p1002", and "P 1002" all normalize to the same canonical identifier.
 * 3. Preserves patientId original formatting for display while checking duplicates against normalizedId.
 * 4. Validates non-emptiness and acceptable length bounds (1 to 64 characters).
 */

export interface NormalizationResult {
  isValid: boolean;
  normalizedId: string;
  errorMessage?: string;
}

export function normalizePatientId(rawInput: string | null | undefined): string {
  if (!rawInput) return '';

  return rawInput
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]+/g, ''); // P-1002, p 1002, p1002, P 1002 -> P1002
}

export function validatePatientId(rawInput: string | null | undefined): NormalizationResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      isValid: false,
      normalizedId: '',
      errorMessage: 'Patient ID cannot be empty.',
    };
  }

  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      normalizedId: '',
      errorMessage: 'Patient ID cannot be empty or only whitespace.',
    };
  }

  if (trimmed.length > 64) {
    return {
      isValid: false,
      normalizedId: '',
      errorMessage: 'Patient ID exceeds maximum allowed length of 64 characters.',
    };
  }

  // Prevent injection or control characters while permitting standard hospital format: A-Z, 0-9, hyphens, slashes, underscores, dots, spaces
  const validPattern = /^[A-Za-z0-9\-_./ ]+$/;
  if (!validPattern.test(trimmed)) {
    return {
      isValid: false,
      normalizedId: '',
      errorMessage: 'Patient ID contains invalid characters. Use letters, numbers, hyphens, slashes, or dots only.',
    };
  }

  const normalized = normalizePatientId(trimmed);

  return {
    isValid: true,
    normalizedId: normalized,
  };
}
