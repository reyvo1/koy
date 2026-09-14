import { FastifyAdapter } from '@nestjs/platform-fastify';
import {
  PRODUCTION_HTTP_BODY_LIMIT_BYTES,
  PRODUCTION_HTTP_REQUEST_TIMEOUT_MS,
  PRODUCTION_TRUSTED_PROXIES,
} from '../security/production-security.config';

export function createProductionFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    bodyLimit: PRODUCTION_HTTP_BODY_LIMIT_BYTES,
    requestTimeout: PRODUCTION_HTTP_REQUEST_TIMEOUT_MS,
    trustProxy: [...PRODUCTION_TRUSTED_PROXIES],
  });
}
