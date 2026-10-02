import { Module, Global } from '@nestjs/common';

import { CLOCK, SystemClock } from './clock';

@Global()
@Module({
  providers: [
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
    SystemClock,
  ],
  exports: [CLOCK, SystemClock],
})
export class TimeModule {}
