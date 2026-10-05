import { Module, Global } from '@nestjs/common';

import { RequestContextService } from '../../common/context/request-context.service';

import { AUDIT_RECORDER } from './audit-recorder.interface';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [
    RequestContextService,
    AuditService,
    {
      provide: AUDIT_RECORDER,
      useExisting: AuditService,
    },
  ],
  exports: [RequestContextService, AuditService, AUDIT_RECORDER],
})
export class AuditModule {}
