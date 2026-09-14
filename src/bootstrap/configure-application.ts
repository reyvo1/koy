import { LoggerService, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { GlobalExceptionFilter } from '../common/errors/global-exception.filter';
import { createValidationException } from '../common/errors/validation-exception.factory';

export interface ApplicationConfigurationOptions {
  enableSwagger?: boolean;
  logger?: LoggerService;
  corsAllowedOrigins?: string[];
}

export function configureApplication(
  app: NestFastifyApplication,
  options: ApplicationConfigurationOptions = {},
): void {
  if (options.logger) {
    app.useLogger(options.logger);
  }

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: createValidationException,
    }),
  );

  if (options.corsAllowedOrigins?.length) {
    app.enableCors({
      origin: options.corsAllowedOrigins,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-Request-Id',
        'X-Tenant-Id',
        'X-Device-Id',
        'X-Device-Secret',
        'X-Webhook-Secret',
      ],
      exposedHeaders: ['X-Request-Id'],
      credentials: false,
      maxAge: 600,
    });
  }

  if (options.enableSwagger === false) {
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('IoT Platform API')
    .setDescription('IoT Platform Backend API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document);
}
