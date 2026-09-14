import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ERROR_CODES } from './error-code';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainForbiddenException,
  DomainNotFoundException,
  DomainUnauthorizedException,
} from './domain-exceptions';

describe('Domain Exceptions', () => {
  const cases = [
    {
      exception: new DomainBadRequestException(
        ERROR_CODES.CommandPayloadInvalid,
        'Invalid payload',
      ),
      base: BadRequestException,
      status: 400,
      code: ERROR_CODES.CommandPayloadInvalid,
      message: 'Invalid payload',
    },
    {
      exception: new DomainUnauthorizedException(
        ERROR_CODES.AuthCredentialsInvalid,
        'Invalid credentials',
      ),
      base: UnauthorizedException,
      status: 401,
      code: ERROR_CODES.AuthCredentialsInvalid,
      message: 'Invalid credentials',
    },
    {
      exception: new DomainForbiddenException(
        ERROR_CODES.TenantMembershipInvalid,
        'Invalid tenant membership',
      ),
      base: ForbiddenException,
      status: 403,
      code: ERROR_CODES.TenantMembershipInvalid,
      message: 'Invalid tenant membership',
    },
    {
      exception: new DomainNotFoundException(
        ERROR_CODES.DeviceNotFound,
        'Device not found',
      ),
      base: NotFoundException,
      status: 404,
      code: ERROR_CODES.DeviceNotFound,
      message: 'Device not found',
    },
    {
      exception: new DomainConflictException(
        ERROR_CODES.AuthUserAlreadyExists,
        'User already exists',
      ),
      base: ConflictException,
      status: 409,
      code: ERROR_CODES.AuthUserAlreadyExists,
      message: 'User already exists',
    },
  ];

  it.each(cases)(
    'preserves HTTP semantics and stable code $code',
    ({ exception, base, status, code, message }) => {
      expect(exception).toBeInstanceOf(base);
      expect(exception.getStatus()).toBe(status);
      expect(exception.message).toBe(message);
      expect(exception.getResponse()).toEqual({ code, message });
    },
  );
});
