import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import type { RequestContextStore } from './request-context.interface';

@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContextStore>();

  /**
   * Retrieves the current request context store, if within an active context.
   */
  getStore(): RequestContextStore | undefined {
    return this.als.getStore();
  }

  /**
   * Retrieves the current correlation request ID.
   */
  getRequestId(): string | undefined {
    return this.als.getStore()?.requestId;
  }

  /**
   * Retrieves the authenticated actor user ID, if set.
   */
  getActorUserId(): string | null | undefined {
    return this.als.getStore()?.actorUserId;
  }

  /**
   * Retrieves the authenticated actor username, if set.
   */
  getActorUsername(): string | null | undefined {
    return this.als.getStore()?.actorUsername;
  }

  /**
   * Retrieves the current session ID, if set.
   */
  getSessionId(): string | null | undefined {
    return this.als.getStore()?.sessionId;
  }

  /**
   * Sets or updates authenticated actor information on the active request context.
   * Called by AuthGuard after successful session validation.
   */
  setAuth(data: {
    actorUserId?: string | null;
    actorUsername?: string | null;
    sessionId?: string | null;
  }): void {
    const store = this.als.getStore();
    if (store) {
      if (data.actorUserId !== undefined) {
        store.actorUserId = data.actorUserId;
      }
      if (data.actorUsername !== undefined) {
        store.actorUsername = data.actorUsername;
      }
      if (data.sessionId !== undefined) {
        store.sessionId = data.sessionId;
      }
    }
  }

  /**
   * Runs the given callback within an explicit RequestContextStore.
   * Used by HTTP middleware and background tasks/jobs.
   */
  runWithContext<T>(store: RequestContextStore, fn: () => T): T {
    return this.als.run(store, fn);
  }
}
