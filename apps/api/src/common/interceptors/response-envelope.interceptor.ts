import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * ResponseEnvelopeInterceptor wraps successful responses in a standard envelope:
 *   { "data": ... }
 * or
 *   { "data": ..., "meta": ... }
 *
 * Rules:
 * 1. If the return value is already an object with a 'data' key, it is NOT double-wrapped.
 * 2. Does not touch or wrap error responses (handled by AllExceptionsFilter).
 * 3. Returns { "data": null } for null/undefined returns.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  unknown
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        if (data === null || data === undefined) {
          return { data: null };
        }

        // Avoid double-wrapping if already an envelope with 'data' key
        if (
          typeof data === 'object' &&
          !Array.isArray(data) &&
          'data' in data
        ) {
          return data;
        }

        return { data };
      }),
    );
  }
}
