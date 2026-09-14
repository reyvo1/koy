import {
  BadRequestException,
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

export class DomainServiceUnavailableException extends ServiceUnavailableException {
  constructor(code: ErrorCode, message: string) {
    super(response(code, message));
  }
}
