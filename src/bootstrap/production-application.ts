import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module';
import { createProductionFastifyAdapter } from './production-fastify-adapter';

export async function createProductionApplication(): Promise<NestFastifyApplication> {
  return NestFactory.create<NestFastifyApplication>(
    AppModule,
    createProductionFastifyAdapter(),
  );
}
