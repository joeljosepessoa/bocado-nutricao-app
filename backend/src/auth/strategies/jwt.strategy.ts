import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

interface AccessTokenPayload {
  sub: string;
  role: AuthenticatedUser['role'];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    // Outros JWTs assinados com o mesmo segredo (ex.: token de URL assinada de
    // arquivo, sem sub/role) nunca podem passar por access token.
    if (!payload?.sub || !payload?.role) {
      throw new UnauthorizedException('Token inválido.');
    }
    return { id: payload.sub, role: payload.role };
  }
}
