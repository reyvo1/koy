import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request = require('supertest');
import { configureApplication } from '../../bootstrap/configure-application';
import { ERROR_CODES } from './error-code';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainForbiddenException,
  DomainNotFoundException,
  DomainUnauthorizedException,
} from './domain-exceptions';

class CompletionReviewDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  name: string;
}

@Controller('error-review')
class ErrorHandlingCompletionController {
  @Get('generic')
  generic(): never {
    throw new BadRequestException('Invalid request');
  }

  @Get('domain-bad-request')
  domainBadRequest(): never {
    throw new DomainBadRequestException(
      ERROR_CODES.CommandPayloadInvalid,
      'Invalid command payload',
    );
  }

  @Get('domain-unauthorized')
  domainUnauthorized(): never {
    throw new DomainUnauthorizedException(
      ERROR_CODES.AuthCredentialsInvalid,
      'Invalid credentials',
    );
  }

  @Get('domain-forbidden')
  domainForbidden(): never {
    throw new DomainForbiddenException(
      ERROR_CODES.TenantMembershipInvalid,
      'Invalid tenant membership',
    );
  }

  @Get('domain-not-found')
  domainNotFound(): never {
    throw new DomainNotFoundException(
      ERROR_CODES.DeviceNotFound,
      'Device not found',
    );
  }

  @Get('domain-conflict')
  domainConflict(): never {
    throw new DomainConflictException(
      ERROR_CODES.AuthUserAlreadyExists,
      'User already exists',
    );
  }

  @Get('malformed-code')
  malformedCode(): never {
    throw new BadRequestException({
      code: 'invalid-dynamic-code',
      message: 'Invalid request',
      details: [{ field: 'secret', messages: ['must not escape'] }],
    });
  }

  @Get('uncommon-status')
  uncommonStatus(): never {
    throw new HttpException('Teapot', 418);
  }

  @Get('service-unavailable')
  serviceUnavailable(): never {
    throw new ServiceUnavailableException('private broker address');
  }

  @Get('unexpected')
  unexpected(): never {
    throw new Error('private database password');
  }

  @Post('validate')
  validate(@Body() body: CompletionReviewDto): CompletionReviewDto {
    return body;
  }
}

const NORMALIZED_BOUNDARY_TARGETS = [
  'src/auth/auth.service.ts',
  'src/auth/strategies/jwt.strategy.ts',
  'src/users/guards/tenant-context.guard.ts',
  'src/device/device.service.ts',
  'src/device/device-public.controller.ts',
  'src/device/guards/device-auth.guard.ts',
  'src/device/capability.service.ts',
  'src/device/capability.validator.ts',
  'src/device/command.service.ts',
  'src/telemetry/telemetry.service.ts',
  'src/telemetry/mqtt.webhook.controller.ts',
  'src/mqtt/mqtt.service.ts',
  'src/mqtt/mqtt.webhook.controller.ts',
] as const;

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Error Handling Completion Review', () => {
  let app: NestFastifyApplication;
  let loggerErrorSpy: jest.SpyInstance;

  beforeAll(async () => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const moduleRef = await Test.createTestingModule({
      controllers: [ErrorHandlingCompletionController],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureApplication(app, { enableSwagger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    loggerErrorSpy.mockRestore();
  });

  it('registers the approved global filter and validation factory through the shared bootstrap', () => {
    const runtimeSource = readSource('src/bootstrap/production-runtime.ts');
    const configurationSource = readSource(
      'src/bootstrap/configure-application.ts',
    );

    expect(runtimeSource).toContain('configureApplication(app');
    expect(configurationSource).toContain(
      'app.useGlobalFilters(new GlobalExceptionFilter())',
    );
    expect(configurationSource).toContain(
      'exceptionFactory: createValidationException',
    );
  });

  it('keeps the generic HTTP error envelope stable and correlatable', async () => {
    const response = await request(app.getHttpServer())
      .get('/error-review/generic?token=must-not-appear')
      .set('x-request-id', 'client-request-id')
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      error: {
        code: ERROR_CODES.BadRequest,
        message: 'Invalid request',
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
      path: '/error-review/generic',
    });
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
    expect(JSON.stringify(response.body)).not.toContain('must-not-appear');
  });

  it.each([
    {
      path: 'domain-bad-request',
      status: 400,
      code: ERROR_CODES.CommandPayloadInvalid,
      message: 'Invalid command payload',
    },
    {
      path: 'domain-unauthorized',
      status: 401,
      code: ERROR_CODES.AuthCredentialsInvalid,
      message: 'Invalid credentials',
    },
    {
      path: 'domain-forbidden',
      status: 403,
      code: ERROR_CODES.TenantMembershipInvalid,
      message: 'Invalid tenant membership',
    },
    {
      path: 'domain-not-found',
      status: 404,
      code: ERROR_CODES.DeviceNotFound,
      message: 'Device not found',
    },
    {
      path: 'domain-conflict',
      status: 409,
      code: ERROR_CODES.AuthUserAlreadyExists,
      message: 'User already exists',
    },
  ])(
    'preserves status $status and stable code $code',
    async ({ path, status, code, message }) => {
      const response = await request(app.getHttpServer())
        .get(`/error-review/${path}`)
        .expect(status);

      expect(response.body.error).toEqual({ code, message });
      expect(response.body.statusCode).toBe(status);
    },
  );

  it('falls back from malformed custom codes and omits unapproved details', async () => {
    const response = await request(app.getHttpServer())
      .get('/error-review/malformed-code')
      .expect(400);

    expect(response.body.error).toEqual({
      code: ERROR_CODES.BadRequest,
      message: 'Invalid request',
    });
    expect(JSON.stringify(response.body)).not.toContain('must not escape');
  });

  it('uses the stable fallback code for uncommon HTTP statuses', async () => {
    const response = await request(app.getHttpServer())
      .get('/error-review/uncommon-status')
      .expect(418);

    expect(response.body.error).toEqual({
      code: ERROR_CODES.HttpError,
      message: 'Teapot',
    });
  });

  it('masks server-side HttpException details', async () => {
    const response = await request(app.getHttpServer())
      .get('/error-review/service-unavailable')
      .expect(503);

    expect(response.body.error).toEqual({
      code: ERROR_CODES.ServiceUnavailable,
      message: 'Service unavailable',
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'private broker address',
    );
  });

  it('masks unexpected errors in both response and structured log event', async () => {
    loggerErrorSpy.mockClear();
    const response = await request(app.getHttpServer())
      .get('/error-review/unexpected')
      .expect(500);

    expect(response.body.error).toEqual({
      code: ERROR_CODES.InternalError,
      message: 'Internal server error',
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'private database password',
    );
    expect(JSON.stringify(loggerErrorSpy.mock.calls)).not.toContain(
      'private database password',
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http.error.unhandled',
        statusCode: 500,
        error: { type: 'Error' },
      }),
    );
  });

  it('keeps validation errors structured and strips rejected values', async () => {
    const response = await request(app.getHttpServer())
      .post('/error-review/validate')
      .send({
        email: 'private-invalid-email',
        password: 'private-password',
      })
      .expect(400);

    expect(response.body.error.code).toBe(ERROR_CODES.ValidationFailed);
    expect(response.body.error.message).toBe('Request validation failed');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'password' }),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain(
      'private-invalid-email',
    );
    expect(JSON.stringify(response.body)).not.toContain('private-password');
  });

  it('keeps every registered error code unique, static, and convention compliant', () => {
    const codes = Object.values(ERROR_CODES);

    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeGreaterThan(40);

    for (const code of codes) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]{2,63}$/);
      expect(code).not.toMatch(/[{}:/\\.\s]/);
    }
  });

  it.each(NORMALIZED_BOUNDARY_TARGETS)(
    '%s uses domain exceptions instead of generic Nest HTTP exceptions',
    (target) => {
      const source = readSource(target);

      expect(source).not.toMatch(
        /new\s+(BadRequestException|UnauthorizedException|ForbiddenException|NotFoundException|ConflictException)\s*\(/,
      );
      expect(source).not.toMatch(/code:\s*['"][A-Z][A-Z0-9_]+['"]/);
    },
  );

  it('keeps normalized boundaries limited to declared error-code keys', () => {
    const declaredKeys = new Set(Object.keys(ERROR_CODES));
    const source = NORMALIZED_BOUNDARY_TARGETS.map(readSource).join('\n');
    const referencedKeys = [
      ...source.matchAll(/ERROR_CODES\.([A-Za-z0-9_]+)/g),
    ].map((match) => match[1]);

    expect(referencedKeys.length).toBeGreaterThan(30);
    expect(referencedKeys.every((key) => declaredKeys.has(key))).toBe(true);
  });

  it('documents the completed security and compatibility guarantees', () => {
    const documentation = readSource('docs/error-handling.md');

    expect(documentation).toContain('Standard Error Envelope');
    expect(documentation).toContain('Domain Error Codes');
    expect(documentation).toContain('Validation Errors');
    expect(documentation).toContain('Unexpected Errors');
    expect(documentation).toContain('Module 09 remains inactive.');
  });
});
