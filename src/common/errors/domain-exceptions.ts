import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode } from './error-code';

interface DomainErrorResponse {
  code: ErrorCode;
  message: string;
}

function response(code: ErrorCode, message: string): DomainErrorResponse {
  return { code, message };
}

export class DomainBadRequestException extends BadRequestException {
  constructor(code: ErrorCode, message: string) {
    super(response(code, message));
  }
}

export class DomainUnauthorizedException extends UnauthorizedException {
  constructor(code: ErrorCode, message: string) {
    super(response(code, message));
  }
}

export class DomainForbiddenException extends ForbiddenException {
  constructor(code: ErrorCode, message: string) {
    super(response(code, message));
  }
}

export class DomainNotFoundException extends NotFoundException {
  constructor(code: ErrorCode, message: string) {
    super(response(code, message));
  }
}

export class DomainConflictException extends ConflictException {
  constructor(code: ErrorCode, message: string) {
    super(response(code, message));
  }
}

/**
 * 402 — the request is understood and correct, but the tenant is not entitled to it.
 *
 * This exists because `GlobalExceptionFilter` only translates `HttpException` subclasses. The
 * device quota check used to throw `Object.assign(new Error(msg), { code, status: 402 })`,
 * which is a plain `Error` carrying a `status` property the filter never reads — so the denial
 * answered 500 INTERNAL_ERROR. That path was never noticed because the quota never denied
 * anything: with no subscription rows, `checkDeviceQuota` failed open for every tenant.
 */
export class DomainPaymentRequiredException extends HttpException {
  constructor(code: ErrorCode, message: string) {
    // Nest ships no 402 exception class, so it is built here from `HttpException` directly.
    // It still has to be an `HttpException` for `GlobalExceptionFilter` to read its status.
    super(response(code, message), HttpStatus.PAYMENT_REQUIRED);
  }
}

export class DomainServiceUnavailableException extends ServiceUnavailableException {
  constructor(code: ErrorCode, message: string) {
    super(response(code, message));
  }
}
