import { PaymentProvider } from './payment-adapter';

/**
 * The port, as a token.
 *
 * Depending on the concrete `MidtransSandboxAdapter` is what let that class sit unused for a wave:
 * nothing in the dependency graph required it, so no test or caller ever reached it. Injecting the
 * port makes the binding load-bearing — if no provider is registered, the graph fails to resolve
 * rather than quietly billing nobody.
 */
export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export type PaymentProviderRef = PaymentProvider;
