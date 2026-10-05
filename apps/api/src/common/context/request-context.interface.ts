export interface RequestContextStore {
  requestId: string;
  ip?: string | null;
  userAgent?: string | null;
  actorUserId?: string | null;
  actorUsername?: string | null;
  sessionId?: string | null;
}
