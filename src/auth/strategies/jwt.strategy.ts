import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { SupabaseService } from '../../supabase/supabase.service';
import { AppRole } from '../../common/enums';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: AppRole;
  fullName: string;
}

interface SupabaseJwtPayload {
  sub: string; // auth.users.id
  email: string;
}

/**
 * Every request to a protected route carries the Supabase access_token as a
 * Bearer token. Supabase signs it with SUPABASE_JWT_SECRET (HS256), so we
 * can verify it here without an extra round trip to Supabase Auth. We then
 * look up the app role from `profiles` (role isn't in the default Supabase
 * JWT claims) and attach the full user object to the request.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    super({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  ignoreExpiration: false,
  algorithms: ['ES256'],
  secretOrKeyProvider: passportJwtSecret({
    jwksUri: `${config.get<string>('supabase.url')}/auth/v1/.well-known/jwks.json`,
    cache: true,
    rateLimit: true,
  }),
});
  }

  async validate(payload: SupabaseJwtPayload): Promise<AuthenticatedUser> {
    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .select('id, role, full_name, email, is_active')
      .eq('id', payload.sub)
      .single();

    if (error || !data) {
      throw new UnauthorizedException('User profile not found');
    }
    if (!data.is_active) {
      throw new UnauthorizedException('Account is deactivated');
    }

    return {
      id: data.id,
      email: data.email,
      role: data.role as AppRole,
      fullName: data.full_name,
    };
  }
}
