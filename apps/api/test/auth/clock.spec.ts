import { SystemClock, TestClock } from '../../src/common/time/clock';

describe('Clock Abstraction (Condition 6)', () => {
  it('SystemClock returns current system date', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const now = clock.now().getTime();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('TestClock allows deterministic time control', () => {
    const initial = new Date('2026-10-01T12:00:00.000Z');
    const clock = new TestClock(initial);

    expect(clock.now().toISOString()).toBe('2026-10-01T12:00:00.000Z');

    clock.advance(15 * 60 * 1000); // advance 15 minutes
    expect(clock.now().toISOString()).toBe('2026-10-01T12:15:00.000Z');

    clock.setTime('2026-10-02T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });
});
