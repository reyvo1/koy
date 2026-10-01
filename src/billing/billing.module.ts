import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { BillingQuotaService } from './billing-quota.service';
import { BillingCycleService } from './billing-cycle.service';
import { BillingCycleController } from './billing-cycle.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { InvoiceService } from './invoice.service';
import { MidtransSandboxAdapter } from './payment-adapter';
import { PAYMENT_PROVIDER } from './tokens';

/**
 * Billing.
 *
 * The payment provider is provided against {@link PAYMENT_PROVIDER} rather than registered as a bare
 * class. It was previously imported by nothing at all: not the module, not a spec outside its own,
 * not a route. A class that is never in a graph is a class that was never running, whatever its
 * docblock claimed.
 */
@Module({
  imports: [PrismaModule],
  // Unauthenticated by design: the provider holds no session. The signature is the authentication,
  // and it is verified before any write happens.
  controllers: [BillingWebhookController, BillingCycleController],
  providers: [
    BillingQuotaService,
    InvoiceService,
    BillingCycleService,
    MidtransSandboxAdapter,
    { provide: PAYMENT_PROVIDER, useExisting: MidtransSandboxAdapter },
  ],
  exports: [
    BillingQuotaService,
    InvoiceService,
    BillingCycleService,
    PAYMENT_PROVIDER,
    MidtransSandboxAdapter,
  ],
})
export class BillingModule {}
