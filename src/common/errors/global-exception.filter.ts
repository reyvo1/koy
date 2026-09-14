import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { REQUEST_ID_HEADER } from '../../config/logger.config';
import { toStructuredLogError } from '../logging/log-error';
import { ERROR_CODES, errorCodeForStatus } from './error-code';
import {
  ApiErrorBody,
  ApiErrorEnvelope,
  ValidationErrorDetail,
} from './error-response';

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = this.resolveRequestId(request, reply);
    const error = this.resolveErrorBody(exception, statusCode);
    const envelope: ApiErrorEnvelope = {
      statusCode,
      error,
      requestId,
      timestamp: new Date().toISOString(),
      path: this.resolvePath(request),
    };

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({
        event: 'http.error.unhandled',
        requestId,
        statusCode,
        path: envelope.path,
        error: this.resolveSafeLogError(exception),
      });
    }

    reply.status(statusCode).send(envelope);
  }

  private resolveRequestId(
    request: FastifyRequest,
    reply: FastifyReply,
  ): string {
    const requestId =
      typeof request.id === 'string' && request.id.length > 0
        ? request.id
        : typeof request.id === 'number'
          ? String(request.id)
          : randomUUID();

    reply.header(REQUEST_ID_HEADER, requestId);

    return requestId;
  }

  private resolvePath(request: FastifyRequest): string {
    const url = typeof request.url === 'string' ? request.url : '/';
    return url.split('?')[0] || '/';
  }

  private resolveErrorBody(
    exception: unknown,
    statusCode: number,
  ): ApiErrorBody {
    if (!(exception instanceof HttpException)) {
      return {
        code: ERROR_CODES.InternalError,
        message: 'Internal server error',
      };
    }

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return {
        code: errorCodeForStatus(statusCode),
        message: this.defaultMessageForStatus(statusCode),
      };
    }

    const response = exception.getResponse();

    if (typeof response === 'string') {
      return {
        code: errorCodeForStatus(statusCode),
        message: response,
      };
    }

    if (response && typeof response === 'object') {
      const body = response as Record<string, unknown>;
      const code =
        typeof body.code === 'string' && ERROR_CODE_PATTERN.test(body.code)
          ? body.code
          : errorCodeForStatus(statusCode);
      const message =
        typeof body.message === 'string'
          ? body.message
          : this.defaultMessageForStatus(statusCode);
      const details = this.resolveValidationDetails(code, body.details);

      return details
        ? {
            code,
            message,
            details,
          }
        : {
            code,
            message,
          };
    }

    return {
      code: errorCodeForStatus(statusCode),
      message: this.defaultMessageForStatus(statusCode),
    };
  }

  private resolveValidationDetails(
    code: string,
    details: unknown,
  ): ValidationErrorDetail[] | undefined {
    if (code !== ERROR_CODES.ValidationFailed || !Array.isArray(details)) {
      return undefined;
    }

    const sanitized = details.flatMap((detail) => {
      if (!detail || typeof detail !== 'object') {
        return [];
      }

      const candidate = detail as Record<string, unknown>;

      if (
        typeof candidate.field !== 'string' ||
        !Array.isArray(candidate.messages)
      ) {
        return [];
      }

      const messages = candidate.messages.filter(
        (message): message is string => typeof message === 'string',
      );

      return messages.length > 0
        ? [
            {
              field: candidate.field,
              messages,
            },
          ]
        : [];
    });

    return sanitized.length > 0 ? sanitized : undefined;
  }

  private resolveSafeLogError(exception: unknown): {
    type: string;
    code?: string;
  } {
    const error = toStructuredLogError(exception);

    return error.code
      ? {
          type: error.type,
          code: error.code,
        }
      : {
          type: error.type,
        };
  }

  private defaultMessageForStatus(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad request';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'Resource not found';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'Unprocessable entity';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Too many requests';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'Service unavailable';
      default:
        return statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
          ? 'Internal server error'
          : 'Request failed';
    }
  }
}
