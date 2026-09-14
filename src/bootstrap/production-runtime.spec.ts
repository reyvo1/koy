import { ConfigService } from '@nestjs/config';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import {
  resolveProductionServerSettings,
  startProductionApplication,
} from './production-runtime';

describe('production application lifecycle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves validated host, port, and Swagger policy', () => {
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string | number | boolean> = {
          HOST: '127.0.0.1',
          PORT: 3100,
          SWAGGER_ENABLED: false,
          CORS_ALLOWED_ORIGINS:
            'https://app.example.com,https://admin.example.com',
        };

        return values[key];
      }),
    } as unknown as ConfigService;

    expect(resolveProductionServerSettings(configService)).toEqual({
      host: '127.0.0.1',
      port: 3100,
      swaggerEnabled: false,
      corsAllowedOrigins: [
        'https://app.example.com',
        'https://admin.example.com',
      ],
    });
  });

  it('configures shutdown hooks and listens on validated settings', async () => {
    const logger = {};
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string | number | boolean> = {
          HOST: '0.0.0.0',
          PORT: 3200,
          SWAGGER_ENABLED: false,
          CORS_ALLOWED_ORIGINS: 'https://app.example.com',
        };

        return values[key];
      }),
    } as unknown as ConfigService;
    const app = {
      get: jest.fn((token: unknown) => {
        if (token === ConfigService) {
          return configService;
        }

        if (token === Logger) {
          return logger;
        }

        throw new Error('Unexpected application token');
      }),
      useLogger: jest.fn(),
      useGlobalFilters: jest.fn(),
      useGlobalPipes: jest.fn(),
      enableCors: jest.fn(),
      enableShutdownHooks: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    } as unknown as NestFastifyApplication;
    const createApplication = jest.fn().mockResolvedValue(app);
    const swaggerSetup = jest.spyOn(SwaggerModule, 'setup');

    const result = await startProductionApplication(createApplication);

    expect(result).toBe(app);
    expect(app.useLogger).toHaveBeenCalledWith(logger);
    expect(app.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: ['https://app.example.com'],
        credentials: false,
      }),
    );
    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledWith(3200, '0.0.0.0');
    expect(swaggerSetup).not.toHaveBeenCalled();
  });

  it('does not listen when application configuration fails', async () => {
    const configService = {
      getOrThrow: jest.fn(() => {
        throw new Error('missing configuration');
      }),
    } as unknown as ConfigService;
    const app = {
      get: jest.fn(() => configService),
      enableShutdownHooks: jest.fn(),
      listen: jest.fn(),
    } as unknown as NestFastifyApplication;

    await expect(
      startProductionApplication(jest.fn().mockResolvedValue(app)),
    ).rejects.toThrow('missing configuration');

    expect(app.enableShutdownHooks).not.toHaveBeenCalled();
    expect(app.listen).not.toHaveBeenCalled();
  });
});
