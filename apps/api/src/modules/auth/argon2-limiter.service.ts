import {
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as argon2 from 'argon2';

import { validateEnv, type EnvConfig } from '../../config/env.schema';

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  timeoutTimer: NodeJS.Timeout;
}

@Injectable()
export class Argon2LimiterService implements OnModuleInit {
  private readonly config: EnvConfig;
  private readonly maxConcurrency: number;
  private readonly maxQueue: number;
  private readonly queueTimeoutMs: number;

  private activeCount = 0;
  private readonly queue: QueuedTask<unknown>[] = [];
  private dummyHash = '';

  constructor(envOverride?: EnvConfig) {
    this.config = envOverride ?? validateEnv();
    this.maxConcurrency = this.config.ARGON2_MAX_CONCURRENCY;
    this.maxQueue = this.config.ARGON2_MAX_QUEUE;
    this.queueTimeoutMs = this.config.ARGON2_QUEUE_TIMEOUT_MS;
  }

  async onModuleInit(): Promise<void> {
    // Pre-compute a valid argon2id dummy hash using configured parameters
    // for timing-attack resistance during unknown user logins.
    this.dummyHash = await argon2.hash('hms_timing_dummy_password', {
      memoryCost: this.config.ARGON2_MEMORY,
      timeCost: this.config.ARGON2_ITERATIONS,
      parallelism: this.config.ARGON2_PARALLELISM,
      type: argon2.argon2id,
    });
  }

  /**
   * Hashes a password using Argon2id with Unicode NFKC normalization,
   * gated by the concurrency limiter and queue cap.
   */
  async hash(password: string): Promise<string> {
    const normPassword = password.normalize('NFKC');
    return this.enqueue(() =>
      argon2.hash(normPassword, {
        memoryCost: this.config.ARGON2_MEMORY,
        timeCost: this.config.ARGON2_ITERATIONS,
        parallelism: this.config.ARGON2_PARALLELISM,
        type: argon2.argon2id,
      }),
    );
  }

  /**
   * Verifies a password against an Argon2id hash with Unicode NFKC normalization,
   * gated by the concurrency limiter and queue cap.
   */
  async verify(hash: string, password: string): Promise<boolean> {
    const normPassword = password.normalize('NFKC');
    return this.enqueue(async () => {
      try {
        return await argon2.verify(hash, normPassword);
      } catch {
        return false;
      }
    });
  }

  /**
   * Verifies a password against the pre-computed dummy hash to prevent timing attacks.
   */
  async verifyDummy(password: string): Promise<boolean> {
    const normPassword = password.normalize('NFKC');
    return this.enqueue(async () => {
      try {
        await argon2.verify(this.dummyHash, normPassword);
      } catch {
        // Intentionally swallow error; dummy verify always returns false
      }
      return false;
    });
  }

  /**
   * Enqueues an Argon2 task under the semaphore queue.
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      return this.executeTask(fn);
    }

    // Queue depth exceeded -> immediate 503 fast-fail
    if (this.queue.length >= this.maxQueue) {
      throw new ServiceUnavailableException(
        'Authentication service is busy, please retry',
      );
    }

    return new Promise<T>((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        const idx = this.queue.findIndex(
          (task) => task.timeoutTimer === timeoutTimer,
        );
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          reject(
            new ServiceUnavailableException(
              'Authentication service is busy, please retry',
            ),
          );
        }
      }, this.queueTimeoutMs);

      this.queue.push({
        fn,
        resolve: resolve as (val: unknown) => void,
        reject,
        timeoutTimer,
      });
    });
  }

  private async executeTask<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } finally {
      this.activeCount--;
      this.dispatchNext();
    }
  }

  private dispatchNext(): void {
    if (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        clearTimeout(nextTask.timeoutTimer);
        this.activeCount++;
        nextTask
          .fn()
          .then((result) => {
            nextTask.resolve(result);
          })
          .catch((error: unknown) => {
            nextTask.reject(error);
          })
          .finally(() => {
            this.activeCount--;
            this.dispatchNext();
          });
      }
    }
  }

  /**
   * Expose queue statistics for metrics/testing.
   */
  getQueueStats(): { active: number; queued: number } {
    return {
      active: this.activeCount,
      queued: this.queue.length,
    };
  }
}
