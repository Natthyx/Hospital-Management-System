/**
 * Injectable Clock abstraction for deterministic time comparisons in tests.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = 'CLOCK';

/**
 * Production system clock using standard JavaScript Date.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/**
 * Controllable clock for unit and integration testing.
 */
export class TestClock implements Clock {
  private currentTime: Date;

  constructor(initialTime: Date = new Date()) {
    this.currentTime = new Date(initialTime.getTime());
  }

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  setTime(time: Date | string | number): void {
    this.currentTime = new Date(time);
  }

  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}
