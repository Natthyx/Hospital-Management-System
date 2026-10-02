import { Module, Global } from '@nestjs/common';

import { AUDIT_RECORDER } from './audit-recorder.interface';
import { InMemoryAuditRecorder } from './in-memory-audit-recorder';

@Global()
@Module({
  providers: [
    InMemoryAuditRecorder,
    {
      provide: AUDIT_RECORDER,
      useExisting: InMemoryAuditRecorder,
    },
  ],
  exports: [AUDIT_RECORDER, InMemoryAuditRecorder],
})
export class AuditModule {}
