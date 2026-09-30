import type { ArgumentMetadata } from '@nestjs/common';
import { ZodSchemaDeclarationException } from 'nestjs-zod';

import { AppZodValidationPipe } from './zod-validation.pipe';

describe('AppZodValidationPipe', () => {
  let pipe: InstanceType<typeof AppZodValidationPipe>;

  beforeEach(() => {
    pipe = new AppZodValidationPipe();
  });

  it('throws ZodSchemaDeclarationException when metatype is not a ZodDto', () => {
    class RegularClass {
      name!: string;
    }

    const metadata: ArgumentMetadata = {
      type: 'body',
      metatype: RegularClass,
    };

    expect(() => {
      pipe.transform({ name: 'test' }, metadata);
    }).toThrow(ZodSchemaDeclarationException);
  });
});
