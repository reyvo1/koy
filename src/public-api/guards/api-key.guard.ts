import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PublicApiService } from '../../public-api/public-api.service';
import { ERROR_CODES } from '../../common/errors/error-code';

/**
 * Authenticate a public API request by API key, and bind the scopes it carries.
 *
 * This is the piece that was missing: `PublicApiService.authenticate` was correct and had
 * **zero callers**, so a key could be created and revoked through `/admin/api-keys` and then
 * presented to nothing. The platform had public-API credential management and no public API.
 *
 * The tenant is taken from the key record, never from a header. A request that could assert
 * its own `x-tenant-id` alongside its key would let any integration read any tenant's data
 * with a key scoped to one of them, which is the whole class of bug this guard exists to
 * prevent.
 *
 * A missing scope is a 403 and a bad key is a 401, deliberately distinct: "your key is not
 * valid" and "your key may not do this" send an integrator to different places, and collapsing
 * them is what makes a permission problem look like a credential problem.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly publicApi: PublicApiService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const key = this.extractKey(request);

    const identity = await this.publicApi.authenticate(key);
    if (!identity) {
      throw new UnauthorizedException({
        code: ERROR_CODES.Unauthorized,
        message: 'API key tidak valid, dicabut, atau kedaluwarsa.',
      });
    }

    // Bound here so a handler cannot forget to do it: the tenant is a property of the key.
    request.publicApi = identity;
    return true;
  }

  /**
   * `Authorization: Bearer <key>` with `X-API-Key` as the documented alternative.
   *
   * Both are read because integrations pick one and a client that sends only the header
   * should not have to be told which spelling wins. A missing header is a 401, not a crash.
   */
  private extractKey(request: {
    headers: Record<string, string | string[] | undefined>;
  }): string {
    const headerKey = request.headers['x-api-key'];
    if (typeof headerKey === 'string' && headerKey.length > 0) return headerKey;

    const authorization = request.headers.authorization;
    if (typeof authorization === 'string' && /^bearer\s+/i.test(authorization)) {
      return authorization.replace(/^bearer\s+/i, '').trim();
    }

    throw new UnauthorizedException({
      code: ERROR_CODES.Unauthorized,
      message: 'X-API-Key atau Authorization: Bearer wajib disertakan.',
    });
  }
}

/**
 * Require a scope on the request's API key.
 *
 * A guard, not a check inside the handler, so a new public route is scope-checked by
 * construction and the requirement is visible at the decorator — the same reason
 * `rescue:validate` can read a controller and know what it protects.
 */
export function RequireApiScope(scope: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function (...args: unknown[]) {
      const request = args.find(
        (arg) => arg && typeof arg === 'object' && 'publicApi' in arg,
      ) as { publicApi?: { scopes?: string[] } } | undefined;

      const scopes = request?.publicApi?.scopes ?? [];
      if (!scopes.includes(scope)) {
        throw new ForbiddenException({
          code: ERROR_CODES.Forbidden,
          message: `API key ini tidak memiliki scope ${scope}.`,
        });
      }
      return original.apply(this, args);
    };
    return descriptor;
  };
}
