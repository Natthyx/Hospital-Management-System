import {
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';

const BaseZodValidationPipe = createZodValidationPipe({
  strictSchemaDeclaration: true,
});

/**
 * Global ZodValidationPipe configured with strictSchemaDeclaration: true.
 *
 * Guarantees that any controller route parameter (body, query, param) that lacks
 * a validated ZodDto is rejected with ZodSchemaDeclarationException, ensuring no
 * untyped or unvalidated inputs bypass validation.
 *
 * Custom param decorators (type: 'custom', e.g. @CurrentUser()) extract internal
 * server-side request state rather than external user input and are passed through.
 */
@Injectable()
export class AppZodValidationPipe implements PipeTransform {
  private readonly basePipe = new BaseZodValidationPipe();

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type === 'custom') {
      return value;
    }
    return this.basePipe.transform(value, metadata);
  }
}
