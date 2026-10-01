import {
  PERMISSIONS,
  PERMISSION_CODE_REGEX,
  ROLE_CODE_REGEX,
  USER_STATUSES,
} from '@hms/shared';

describe('Permission Catalog and Identity Constants', () => {
  it('contains no duplicate permission codes', () => {
    const codes = PERMISSIONS.map((p) => p.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('matches the permission code regex format for all catalog entries', () => {
    for (const permission of PERMISSIONS) {
      expect(permission.code).toMatch(PERMISSION_CODE_REGEX);
    }
  });

  it('ensures the permission module strictly matches the code prefix before the dot', () => {
    for (const permission of PERMISSIONS) {
      const [prefix] = permission.code.split('.');
      expect(prefix).toBe(permission.module);
    }
  });

  it('ensures all permissions have a non-empty description', () => {
    for (const permission of PERMISSIONS) {
      expect(typeof permission.description).toBe('string');
      expect(permission.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('strictly validates role code regex', () => {
    // Valid cases
    expect(ROLE_CODE_REGEX.test('admin')).toBe(true);
    expect(ROLE_CODE_REGEX.test('receptionist')).toBe(true);
    expect(ROLE_CODE_REGEX.test('doctor_1')).toBe(true);
    expect(ROLE_CODE_REGEX.test('lab_tech_lead')).toBe(true);

    // Invalid cases
    expect(ROLE_CODE_REGEX.test('Admin')).toBe(false); // uppercase
    expect(ROLE_CODE_REGEX.test('1doctor')).toBe(false); // starts with digit
    expect(ROLE_CODE_REGEX.test('_admin')).toBe(false); // starts with underscore
    expect(ROLE_CODE_REGEX.test('a')).toBe(false); // too short (<2 chars)
    expect(ROLE_CODE_REGEX.test('a'.repeat(51))).toBe(false); // too long (>50 chars)
    expect(ROLE_CODE_REGEX.test('doctor-nurse')).toBe(false); // hyphen forbidden
  });

  it('exports user status values active and disabled', () => {
    expect(USER_STATUSES).toEqual(['active', 'disabled']);
  });
});
