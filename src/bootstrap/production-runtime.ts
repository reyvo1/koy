import { ConfigService } from '@nestjs/config';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { configureApplication } from './configure-application';
import { resolveCorsAllowedOrigins } from '../security/production-security.config';

export interface ProductionServerSettings {
  host: string;
  port: number;
  swaggerEnabled: boolean;
  corsAllowedOrigins: string[];
}

export type ProductionApplicationFactory =
  () => Promise<NestFastifyApplication>;

export function resolveProductionServerSettings(
  configService: ConfigService,
): ProductionServerSettings {
  return {
    host: configService.getOrThrow<string>('HOST'),
    port: configService.getOrThrow<number>('PORT'),
    swaggerEnabled: configService.getOrThrow<boolean>('SWAGGER_ENABLED'),
    corsAllowedOrigins: resolveCorsAllowedOrigins(configService),
  };
}

export async function startProductionApplication(
  createApplication: ProductionApplicationFactory,
): Promise<NestFastifyApplication> {
  const app = await createApplication();
  const configService = app.get(ConfigService);
  const settings = resolveProductionServerSettings(configService);

  configureApplication(app, {
    logger: app.get(Logger),
    enableSwagger: settings.swaggerEnabled,
    corsAllowedOrigins: settings.corsAllowedOrigins,
  });
  app.enableShutdownHooks();

  await app.listen(settings.port, settings.host);

  return app;
}
