import {
  VALIDATION_FAILED,
  UNAUTHENTICATED,
  FORBIDDEN,
  NOT_FOUND,
  CONFLICT,
  RATE_LIMITED,
  INTERNAL_ERROR,
  SERVICE_UNAVAILABLE,
  type ErrorCode,
} from '@hms/shared';
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';

import { REQUEST_ID_HEADER, resolveRequestId } from '../utils/request-id.util';

interface ErrorResponseEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = process.env.NODE_ENV === 'production';

    interface MaybeIdRequest {
      id?: string | undefined;
    }
    const customReq = request as unknown as MaybeIdRequest;
    const headerReqId = request.headers[REQUEST_ID_HEADER];
    const resHeaderId = response.getHeader(REQUEST_ID_HEADER);
    const rawReqId = customReq.id ?? headerReqId ?? resHeaderId;
    const requestId = resolveRequestId(rawReqId);

    // Guarantee the response header carries the same validated request ID
    response.setHeader(REQUEST_ID_HEADER, requestId);

    let status = 500;
    let code: ErrorCode = INTERNAL_ERROR;
    let message = 'An unexpected error occurred';
    let details: unknown = undefined;

    if (exception instanceof ZodValidationException) {
      status = HttpStatus.BAD_REQUEST;
      code = VALIDATION_FAILED;
      message = 'Validation failed';
      const zodError = exception.getZodError();
      if (zodError instanceof ZodError) {
        details = zodError.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse: unknown = exception.getResponse();

      switch (status) {
        case 400:
          code = VALIDATION_FAILED;
          break;
        case 401:
          code = UNAUTHENTICATED;
          break;
        case 403:
          code = FORBIDDEN;
          break;
        case 404:
          code = NOT_FOUND;
          break;
        case 409:
          code = CONFLICT;
          break;
        case 429:
          code = RATE_LIMITED;
          break;
        case 503:
          code = SERVICE_UNAVAILABLE;
          break;
        default:
          code =
            status >= 500
              ? INTERNAL_ERROR
              : (('HTTP_' + String(status)) as ErrorCode);
      }

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (isRecord(exceptionResponse)) {
        if (typeof exceptionResponse.message === 'string') {
          message = exceptionResponse.message;
        } else if (Array.isArray(exceptionResponse.message)) {
          message = 'Validation failed';
          details = exceptionResponse.message;
        }
        if (
          typeof exceptionResponse.error === 'string' &&
          message.length === 0
        ) {
          message = exceptionResponse.error;
        }
      }
    } else {
      // Unhandled / system exception (e.g. database error, syntax error, null ref)
      status = 500;
      code = INTERNAL_ERROR;
      message = isProduction
        ? 'An unexpected error occurred'
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

      if (process.env.NODE_ENV !== 'test') {
        this.logger.error(
          `Unhandled exception on ${request.method} ${request.url} [req: ${requestId}]`,
          exception instanceof Error ? exception.stack : String(exception),
        );
      }
    }

    const payload: ErrorResponseEnvelope = {
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
        requestId,
      },
    };

    response.status(status).json(payload);
  }
}
