import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationRegistryService } from './integration-registry.service';

@Module({
  imports: [PrismaModule],
  providers: [IntegrationRegistryService],
  exports: [IntegrationRegistryService],
})
export class IntegrationsModule {}
