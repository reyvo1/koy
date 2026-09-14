import {
  BadRequestException,
  Body,
  Controller,
  Get,
  INestApplication,
  Logger,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { IsEmail, IsNotEmpty } from 'class-validator';
import request = require('supertest');
import { ERROR_CODES } from './error-code';
import { GlobalExceptionFilter } from './global-exception.filter';
import { createValidationException } from './validation-exception.factory';

class ContractDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  name: string;
}

@Controller('error-contract')
class ErrorContractController {
  @Get('bad-request')
  badRequest(): never {
    throw new BadRequestException('Invalid request');
  }

  @Get('unexpected')
  unexpected(): never {
    throw new Error('private database failure');
  }

  @Post('validate')
  validate(@Body() body: ContractDto): ContractDto {
    return body;
  }
}

describe('Error Contract', () => {
  let app: INestApplication;
  let loggerErrorSpy: jest.SpyInstance;

  beforeAll(async () => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const moduleRef = await Test.createTestingModule({
      controllers: [ErrorContractController],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: createValidationException,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    loggerErrorSpy.mockRestore();
  });

  it('returns a stable envelope for known HTTP exceptions', async () => {
    const response = await request(app.getHttpServer())
      .get('/error-contract/bad-request')
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 400,
        requestId: expect.any(String),
        timestamp: expect.any(String),
        path: '/error-contract/bad-request',
        error: {
          code: ERROR_CODES.BadRequest,
          message: 'Invalid request',
        },
      }),
    );
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
  });

  it('returns normalized validation details', async () => {
    const response = await request(app.getHttpServer())
      .post('/error-contract/validate')
      .send({ email: 'invalid', extra: 'not-allowed' })
      .expect(400);

    expect(response.body.error.code).toBe(ERROR_CODES.ValidationFailed);
    expect(response.body.error.message).toBe('Request validation failed');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'extra' }),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain('not-allowed');
  });

  it('hides internal exception details', async () => {
    loggerErrorSpy.mockClear();
    const response = await request(app.getHttpServer())
      .get('/error-contract/unexpected')
      .expect(500);

    expect(response.body.error).toEqual({
      code: ERROR_CODES.InternalError,
      message: 'Internal server error',
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'private database failure',
    );
    expect(JSON.stringify(loggerErrorSpy.mock.calls[0][0])).not.toContain(
      'private database failure',
    );
  });
});
