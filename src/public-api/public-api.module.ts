import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicApiService } from './public-api.service';
import { PublicApiController } from './public-api.controller';
import { ApiKeyGuard } from './guards/api-key.guard';

/**
 * The module gained a controller and a guard, which is what made `PublicApiService` a public
 * API rather than credential management.
 *
 * `ApiKeyGuard` is listed in `providers` because `@UseGuards(ApiKeyGuard)` on a controller
 * resolves the class through the module's injector, and Nest does not instantiate a guard
 * class that was never provided. It is not exported: nothing outside this module
 * authenticates an API key, and exporting it would invite a second surface with its own idea
 * of what a tenant is.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PublicApiController],
  providers: [PublicApiService, ApiKeyGuard],
  exports: [PublicApiService],
})
export class PublicApiModule {}
