import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApplication } from './support/create-test-application';

class SmokeRequestDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

@Controller('test')
class SmokeController {
  @Get('smoke')
  smoke(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Post('validation')
  validation(@Body() body: SmokeRequestDto): SmokeRequestDto {
    return body;
  }
}

describe('application bootstrap smoke', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApplication({
      moduleMetadata: {
        controllers: [SmokeController],
      },
      applicationConfiguration: {
        corsAllowedOrigins: ['https://app.example.com'],
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a request through the shared Fastify application bootstrap', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/smoke',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('allows only configured cross-origin browser access', async () => {
    const allowed = await app.inject({
      method: 'GET',
      url: '/test/smoke',
      headers: {
        origin: 'https://app.example.com',
      },
    });
    const denied = await app.inject({
      method: 'GET',
      url: '/test/smoke',
      headers: {
        origin: 'https://untrusted.example.com',
      },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://app.example.com',
    );
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves strict CORS preflight for an allowed origin', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/test/validation',
      headers: {
        origin: 'https://app.example.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-request-id',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://app.example.com',
    );
    expect(response.headers['access-control-allow-methods']).toContain('POST');
  });

  it('uses the production validation and error envelope contract', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test/validation?ignored=true',
      headers: {
        'x-request-id': 'e2e-request-1',
      },
      payload: {
        name: '',
        unexpected: 'removed',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.json()).toEqual({
      statusCode: 400,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: expect.any(String),
            messages: expect.any(Array),
          }),
        ]),
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
      path: '/test/validation',
    });
  });
});
