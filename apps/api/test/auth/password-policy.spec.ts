import { validatePasswordPolicy, hasRunOfSixOrMore } from '@hms/shared';

import { COMMON_PASSWORDS_SET } from '../../src/modules/auth/data/password-blocklist.data';

describe('Password Policy & Blocklist Rules (Rule 04 & Condition 4)', () => {
  it('accepts a strong, compliant password', () => {
    const result = validatePasswordPolicy(
      'Correct-Horse-Battery-Staple-2026!',
      'doctor_jane',
      COMMON_PASSWORDS_SET,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  describe('Length requirements (10..128)', () => {
    it('rejects passwords shorter than 10 characters', () => {
      const result = validatePasswordPolicy(
        'Short123!',
        'doctor_jane',
        COMMON_PASSWORDS_SET,
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must be at least 10 characters long',
      );
    });

    it('rejects passwords longer than 128 characters', () => {
      const longPass = 'A1b!'.repeat(33); // 132 chars
      const result = validatePasswordPolicy(
        longPass,
        'doctor_jane',
        COMMON_PASSWORDS_SET,
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must not exceed 128 characters',
      );
    });
  });

  describe('Username containment rule', () => {
    it('rejects password containing username when username has >= 4 characters', () => {
      const result = validatePasswordPolicy(
        'MySecretDoctorJane2026!',
        'doctorjane',
        COMMON_PASSWORDS_SET,
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must not contain your username',
      );
    });

    it('allows password containing short username (< 4 characters)', () => {
      const result = validatePasswordPolicy(
        'BobTheClinicalWorker2026!',
        'bob',
        COMMON_PASSWORDS_SET,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Distinct characters requirement (>= 6)', () => {
    it('rejects password with fewer than 6 distinct characters', () => {
      // 'ababababab' has only 2 distinct chars: 'a', 'b'
      const result = validatePasswordPolicy(
        'ababababab',
        'doctor_jane',
        COMMON_PASSWORDS_SET,
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least 6 distinct characters',
      );
    });

    it('accepts password with at least 6 distinct characters', () => {
      // 'abcdefghij' has 10 distinct chars, but sequential check would trigger unless non-sequential
      const result = validatePasswordPolicy(
        'kX9#mP2$vQ',
        'doctor_jane',
        COMMON_PASSWORDS_SET,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Runs of 6+ identical or sequential characters', () => {
    it('rejects runs of 6+ identical characters', () => {
      expect(hasRunOfSixOrMore('aaaaaa!2Bc')).toBe(true);
      expect(hasRunOfSixOrMore('999999!2Bc')).toBe(true);
      expect(hasRunOfSixOrMore('abc111111def')).toBe(true);

      const result = validatePasswordPolicy(
        'Secret111111Pass!',
        'doctor_jane',
        COMMON_PASSWORDS_SET,
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must not contain runs of 6 or more identical or sequential characters',
      );
    });

    it('rejects runs of 6+ ascending sequential characters', () => {
      expect(hasRunOfSixOrMore('123456Pass!')).toBe(true);
      expect(hasRunOfSixOrMore('abcdefPass!')).toBe(true);

      const result = validatePasswordPolicy(
        'MyPass123456Word!',
        'doctor_jane',
        COMMON_PASSWORDS_SET,
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must not contain runs of 6 or more identical or sequential characters',
      );
    });

    it('rejects runs of 6+ descending sequential characters', () => {
      expect(hasRunOfSixOrMore('654321Pass!')).toBe(true);
      expect(hasRunOfSixOrMore('fedcbaPass!')).toBe(true);

      const result = validatePasswordPolicy(
        'MyPass654321Word!',
        'doctor_jane',
        COMMON_PASSWORDS_SET,
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must not contain runs of 6 or more identical or sequential characters',
      );
    });

    it('rejects runs of 6+ keyboard characters', () => {
      expect(hasRunOfSixOrMore('qwerty!2Bc')).toBe(true);
      expect(hasRunOfSixOrMore('ytrewq!2Bc')).toBe(true);
      expect(hasRunOfSixOrMore('asdfgh!2Bc')).toBe(true);
    });

    it('allows runs of fewer than 6 sequential characters', () => {
      expect(hasRunOfSixOrMore('abcde!2345Z')).toBe(false);
      expect(hasRunOfSixOrMore('12345XyZ987')).toBe(false);
    });
  });

  describe('Common password blocklist', () => {
    it('rejects passwords present in the blocklist (case-insensitive)', () => {
      // Pick known entries from Wikimedia dataset: '1234567890' (also triggers sequence), 'password12'
      const result = validatePasswordPolicy(
        'password12',
        'doctor_jane',
        COMMON_PASSWORDS_SET,
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password is too common or easily guessable; choose a stronger password',
      );
    });
  });

  describe('Unicode NFKC Normalization & Non-Latin Characters', () => {
    it('normalizes decomposed accented characters (e + combining acute)', () => {
      const decomposed = 'Caf\u0065\u0301-Hospital-2026!'; // Café
      const composed = 'Café-Hospital-2026!';

      const resDecomposed = validatePasswordPolicy(decomposed, 'admin');
      const resComposed = validatePasswordPolicy(composed, 'admin');

      expect(resDecomposed.valid).toBe(true);
      expect(resComposed.valid).toBe(true);
    });

    it('supports Amharic (Ethiopic) characters properly', () => {
      // 'ሆስፒታል_አስተዳዳሪ_2026!'
      const amharicPass = 'ሆስፒታል_አስተዳዳሪ_2026!';
      const result = validatePasswordPolicy(amharicPass, 'admin');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
