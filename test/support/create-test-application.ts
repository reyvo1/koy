import { ModuleMetadata } from '@nestjs/common/interfaces';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModuleBuilder, TestingModule } from '@nestjs/testing';
import {
  ApplicationConfigurationOptions,
  configureApplication,
} from '../../src/bootstrap/configure-application';

export interface TestApplicationOptions {
  moduleMetadata: ModuleMetadata;
  overrideProviders?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  applicationConfiguration?: ApplicationConfigurationOptions;
}

export async function createTestApplication(
  options: TestApplicationOptions,
): Promise<NestFastifyApplication> {
  let builder = Test.createTestingModule(options.moduleMetadata);

  if (options.overrideProviders) {
    builder = options.overrideProviders(builder);
  }

  const moduleRef: TestingModule = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
    { logger: false },
  );

  configureApplication(app, {
    enableSwagger: false,
    ...options.applicationConfiguration,
  });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}
