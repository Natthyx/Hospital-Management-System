/**
 * Password Policy Enforcement Rules per Rule 04 & Milestone F4.
 * Pure validation functions (no network calls, no database access).
 */

const KEYBOARD_PATTERNS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];

/**
 * Checks for runs of 6 or more consecutive characters that are:
 * - Identical (e.g. 'aaaaaa', '111111')
 * - Sequential ASCII characters ascending/descending (e.g. '123456', '654321', 'abcdef')
 * - Sequential QWERTY keyboard characters ascending/descending (e.g. 'qwerty', 'ytrewq')
 */
export function hasRunOfSixOrMore(input: string): boolean {
  if (input.length < 6) {
    return false;
  }

  // 1. Identical repeated characters (6+ in a row)
  if (/(.)\1{5,}/u.test(input)) {
    return true;
  }

  const lower = input.toLowerCase();

  // 2. Sequential character codes (ascending or descending 6+ in a row)
  for (let i = 0; i <= lower.length - 6; i++) {
    let isAsc = true;
    let isDesc = true;
    for (let j = 0; j < 5; j++) {
      const a = lower.charCodeAt(i + j);
      const b = lower.charCodeAt(i + j + 1);
      // Only treat alphanumeric ranges as sequential runs
      const isAlphaNumA = (a >= 48 && a <= 57) || (a >= 97 && a <= 122);
      const isAlphaNumB = (b >= 48 && b <= 57) || (b >= 97 && b <= 122);

      if (!isAlphaNumA || !isAlphaNumB) {
        isAsc = false;
        isDesc = false;
        break;
      }
      if (b !== a + 1) isAsc = false;
      if (b !== a - 1) isDesc = false;
    }
    if (isAsc || isDesc) {
      return true;
    }
  }

  // 3. Sequential keyboard row substrings (6+ in a row)
  for (const row of KEYBOARD_PATTERNS) {
    const revRow = row.split('').reverse().join('');
    for (let i = 0; i <= row.length - 6; i++) {
      const sliceAsc = row.slice(i, i + 6);
      const sliceDesc = revRow.slice(i, i + 6);
      if (lower.includes(sliceAsc) || lower.includes(sliceDesc)) {
        return true;
      }
    }
  }

  return false;
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a password against the HMS password policy.
 * Applies Unicode NFKC normalization consistently.
 *
 * Rules:
 * 1. Min 10, max 128 characters after NFKC normalization.
 * 2. Reject username containment when username is >= 4 characters.
 * 3. Require at least 6 distinct characters.
 * 4. Reject runs of 6+ identical or sequential characters.
 * 5. Reject if present in common-password blocklist (case-insensitive NFKC).
 */
export function validatePasswordPolicy(
  password: string,
  username?: string,
  blocklistSet?: ReadonlySet<string>,
): PasswordValidationResult {
  const errors: string[] = [];

  // Unicode NFKC normalization
  const normPassword = password.normalize('NFKC');

  // Rule 1: Length min 10, max 128
  if (normPassword.length < 10) {
    errors.push('Password must be at least 10 characters long');
  }
  if (normPassword.length > 128) {
    errors.push('Password must not exceed 128 characters');
  }

  // Rule 2: Username containment (only when username >= 4 chars)
  if (username) {
    const normUsername = username.normalize('NFKC').toLowerCase().trim();
    if (normUsername.length >= 4) {
      if (normPassword.toLowerCase().includes(normUsername)) {
        errors.push('Password must not contain your username');
      }
    }
  }

  // Rule 3: At least 6 distinct characters
  const distinctChars = new Set(Array.from(normPassword));
  if (distinctChars.size < 6) {
    errors.push('Password must contain at least 6 distinct characters');
  }

  // Rule 4: Reject runs of 6+ identical or sequential characters
  if (hasRunOfSixOrMore(normPassword)) {
    errors.push(
      'Password must not contain runs of 6 or more identical or sequential characters',
    );
  }

  // Rule 5: Blocklist check (case-insensitive NFKC)
  if (blocklistSet?.has(normPassword.toLowerCase())) {
    errors.push(
      'Password is too common or easily guessable; choose a stronger password',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
