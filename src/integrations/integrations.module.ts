import { RuntimeConnectionsModule } from '../runtime-connections/runtime-connections.service';
import { IntegrationRuntimeController } from './integration-runtime.controller';
import { IntegrationRuntimeService } from './integration-runtime.service';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MqttBridgeAdapter } from './adapters/mqtt-bridge.adapter';
import { IntegrationRegistryService } from './integration-registry.service';
import { IntegrationRegistryController } from './integration-registry.controller';

@Module({
  imports: [PrismaModule, RuntimeConnectionsModule],
  // The controller is the writer for `integrations`. The service existed with no route to it,
  // and the table held zero rows, so a tenant could not register an external ecosystem at all.
  controllers: [IntegrationRegistryController, IntegrationRuntimeController],
  providers: [IntegrationRuntimeService, IntegrationRegistryService,
    MqttBridgeAdapter,
  ],
  exports: [IntegrationRegistryService,
    MqttBridgeAdapter,
  ],
})
export class IntegrationsModule {}
