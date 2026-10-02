import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EdgeGatewayService } from './edge-gateway.service';

/**
 * Wave 12 — edge gateway identity and attribution (ADR-010).
 *
 * No bridge, relay or store-and-forward ships with this module: none has been observed in any environment,
 * and the ADR is explicit about that. What is here is the identity, the allowlist and the attribution.
 */
@Module({
  imports: [PrismaModule],
  providers: [EdgeGatewayService],
  exports: [EdgeGatewayService],
})
export class EdgeModule {}