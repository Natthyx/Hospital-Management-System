import { randomInt } from 'node:crypto';

/**
 * 56-character unambiguous alphanumeric alphabet.
 * Excludes easily confused characters: 'O', '0', 'o', 'l', '1', 'I'.
 */
export const UNAMBIGUOUS_ALPHANUMERIC =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Generates a cryptographically random, unambiguous alphanumeric password.
 * Guarantees length >= 10 and not equal to the username 'admin' (Rule 04 compliance).
 */
export function generateSeedPassword(length = 24): string {
  if (length < 10) {
    throw new Error('Seed password length must be at least 10 characters');
  }

  const chars: string[] = [];
  const alphabetLength = UNAMBIGUOUS_ALPHANUMERIC.length;

  for (let i = 0; i < length; i++) {
    const idx = randomInt(0, alphabetLength);
    chars.push(UNAMBIGUOUS_ALPHANUMERIC.charAt(idx));
  }

  const password = chars.join('');
  if (password.toLowerCase() === 'admin') {
    return generateSeedPassword(length);
  }

  return password;
}
