import { RequestContextService } from './request-context.service';

describe('RequestContextService (ALS)', () => {
  let service: RequestContextService;

  beforeEach(() => {
    service = new RequestContextService();
  });

  it('returns undefined store when outside an active context', () => {
    expect(service.getStore()).toBeUndefined();
    expect(service.getRequestId()).toBeUndefined();
    expect(service.getActorUserId()).toBeUndefined();
    expect(service.getActorUsername()).toBeUndefined();
    expect(service.getSessionId()).toBeUndefined();
  });

  it('runs within explicit context and provides getters', () => {
    const store = {
      requestId: 'req-trace-123',
      ip: '127.0.0.1',
      userAgent: 'Jest/Test',
      actorUserId: '00000000-0000-0000-0000-000000000001',
      actorUsername: 'admin',
      sessionId: '00000000-0000-0000-0000-000000000002',
    };

    service.runWithContext(store, () => {
      expect(service.getStore()).toEqual(store);
      expect(service.getRequestId()).toBe('req-trace-123');
      expect(service.getActorUserId()).toBe(
        '00000000-0000-0000-0000-000000000001',
      );
      expect(service.getActorUsername()).toBe('admin');
      expect(service.getSessionId()).toBe(
        '00000000-0000-0000-0000-000000000002',
      );
    });
  });

  it('updates auth context via setAuth', () => {
    const store = {
      requestId: 'req-auth-update',
      ip: null,
      userAgent: null,
      actorUserId: null,
      actorUsername: null,
      sessionId: null,
    };

    service.runWithContext(store, () => {
      expect(service.getActorUsername()).toBeNull();

      service.setAuth({
        actorUserId: 'user-uuid-123',
        actorUsername: 'dr_alice',
        sessionId: 'session-uuid-456',
      });

      expect(service.getActorUserId()).toBe('user-uuid-123');
      expect(service.getActorUsername()).toBe('dr_alice');
      expect(service.getSessionId()).toBe('session-uuid-456');
    });
  });
});
