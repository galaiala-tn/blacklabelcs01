import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { AppRole } from '../common/enums';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  /** Public (anon-key) client — used only for password-based sign-in/refresh,
   *  since the GoTrue admin API (service role) doesn't do password auth. */
  private readonly publicClient: SupabaseClient;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {
    this.publicClient = createClient(
      this.config.get<string>('supabase.url')!,
      this.config.get<string>('supabase.anonKey')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  async register(dto: RegisterDto) {
    const role = dto.role ?? AppRole.CUSTOMER;

    if (role === AppRole.CHAUFFEUR && !dto.licenseNumber) {
      throw new BadRequestException('licenseNumber is required when registering as a chauffeur');
    }

    // Creates the auth.users row with metadata that Phase 1's
    // handle_new_auth_user trigger reads to create profiles/customers/chauffeurs.
    const { data, error } = await this.supabase.getClient().auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: {
        full_name: dto.fullName,
        role,
        phone: dto.phone,
        license_number: dto.licenseNumber,
      },
    });

    if (error || !data.user) {
      console.error(
        '[register] Supabase createUser raw error:',
        JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})),
      );
      throw new BadRequestException(error?.message ?? 'Registration failed');
    }

    // Immediately sign in to return usable tokens to the client.
    return this.login({ email: dto.email, password: dto.password });
  }

  async login(dto: LoginDto) {
    const { data, error } = await this.publicClient.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.session) {
      throw new UnauthorizedException(error?.message ?? 'Invalid credentials');
    }

    const profile = await this.getProfile(data.user.id);

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user: profile,
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const { data, error } = await this.publicClient.auth.refreshSession({
      refresh_token: dto.refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Could not refresh session');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    };
  }

  /**
   * Public on purpose: this is the single source of truth for "what a user
   * profile looks like over the wire". Both /auth/login and /auth/me call
   * this so the Flutter app's UserProfile.fromJson() always receives the
   * exact same shape — including created_at and is_active, which
   * UserProfile.fromJson() requires (created_at) or defaults (is_active).
   * Previously /auth/me returned the JWT-derived AuthenticatedUser object
   * instead (different, camelCase, missing fields), which crashed the app
   * on the next cold start after a successful login.
   */
  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .select('id, role, full_name, email, phone, avatar_url, is_active, created_at')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new UnauthorizedException('User profile not found');
    }
    return data;
  }

  async testSupabase() {
    try {
      const { data, error } = await this.supabase.getClient().auth.admin.listUsers();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, usersCount: data.users.length };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}