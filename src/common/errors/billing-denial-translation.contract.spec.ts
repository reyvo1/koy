import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GlobalExceptionFilter } from './global-exception.filter';
import { DomainPaymentRequiredException } from './domain-exceptions';
import { ERROR_CODES } from './error-code';

/**
 * A quota denial must arrive as 402, and it used to arrive as 500.
 *
 * `device.controller.ts` threw `Object.assign(new Error(msg), { code, status: 402 })` — a
 * plain `Error` with a `status` property. `GlobalExceptionFilter` derives the status with
 * `exception instanceof HttpException` and its fallback is 500, so the `status` property was
 * never read. Confirmed live: the container logged `http.error.unhandled` with
 * `statusCode: 500` and `code: BILLING_DEVICE_QUOTA_EXCEEDED`.
 *
 * This went unnoticed because the quota never denied anything — with no subscription rows in
 * the database, `checkDeviceQuota` failed open for every tenant. A defect that is only
 * reachable once another defect is fixed is exactly the kind that survives a green suite, so
 * the translation is asserted here directly against the filter rather than left to a live
 * probe.
 */
describe('GlobalExceptionFilter — a billing denial is not a server fault', () => {
  let filter: GlobalExceptionFilter;

  const host = (reply: { status: (n: number) => { send: (b: unknown) => void } }) =>
    ({
      switchToHttp: () => ({
        getResponse: () => reply,
        getRequest: () => ({ method: 'POST', url: '/devices' }),
      }),
    }) as unknown as ArgumentsHost;

  const run = (exception: unknown) => {
    const reply = {
      statusCode: 0,
      body: undefined as unknown,
      headers: {} as Record<string, string>,
      // The filter sets the request-id header before sending, so a double that only stubs
      // `status`/`send` dies with "reply.header is not a function" and never reaches the
      // assertion it was written for.
      header(name: string, value: string) {
        this.headers[name] = value;
        return this;
      },
      status(n: number) {
        this.statusCode = n;
        return {
          send: (b: unknown) => {
            this.body = b;
          },
        };
      },
    };
    filter.catch(exception, host(reply));
    return reply as { statusCode: number; body: { error?: { code?: string } } };
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [GlobalExceptionFilter],
    }).compile();
    filter = moduleRef.get(GlobalExceptionFilter);
  });

  it('keeps 402 as 402 for a DomainPaymentRequiredException', () => {
    const res = run(
      new DomainPaymentRequiredException(
        ERROR_CODES.BillingDeviceQuotaExceeded,
        'Kuota perangkat habis: 10/10.',
      ),
    );

    expect(res.statusCode).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(res.body.error?.code).toBe('BILLING_DEVICE_QUOTA_EXCEEDED');
  });

  it('does not read a `status` property off a plain Error', () => {
    // The regression itself, pinned. If a future change made the filter honour
    // `exception.status`, this assertion would flip and the test would say so.
    const res = run(Object.assign(new Error('quota'), { code: 'BILLING_DEVICE_QUOTA_EXCEEDED', status: 402 }));

    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('is genuinely an HttpException, which is what the filter tests for', () => {
    const thrown: HttpException = new DomainPaymentRequiredException(
      ERROR_CODES.BillingDeviceQuotaExceeded,
      'x',
    );

    expect(thrown).toBeInstanceOf(HttpException);
    expect(thrown.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
  });
});
