import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../../common/errors/error-code';
import { DomainUnauthorizedException } from '../../common/errors/domain-exceptions';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    if (!payload)
      throw new DomainUnauthorizedException(
        ERROR_CODES.AuthAccessTokenInvalid,
        'Invalid access token',
      );
    return { userId: payload.sub, tenantId: payload.tenantId };
  }
}
