import { createZodValidationPipe } from 'nestjs-zod';

/**
 * Global ZodValidationPipe configured with strictSchemaDeclaration: true.
 *
 * Guarantees that any controller route parameter that lacks a validated ZodDto
 * is rejected with ZodSchemaDeclarationException, ensuring no untyped or
 * unvalidated inputs bypass validation.
 */
export const AppZodValidationPipe = createZodValidationPipe({
  strictSchemaDeclaration: true,
});
