import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { AppRole } from '../common/enums';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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
      this.logger.error(`Supabase admin.createUser failed for ${dto.email}: ${this.describeError(error)}`);
      throw new BadRequestException(this.extractMessage(error));
    }

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

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const { data: existingProfile } = await this.supabase
      .getClient()
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .single();
    const oldAvatarUrl = existingProfile?.avatar_url as string | undefined;

    const ext = file.originalname.split('.').pop() || 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await this.supabase
      .getClient()
      .storage.from('photo')
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      this.logger.error(`Avatar upload failed for ${userId}: ${this.describeError(uploadError)}`);
      throw new BadRequestException('Avatar upload failed');
    }

    const { data: publicUrlData } = this.supabase
      .getClient()
      .storage.from('photo')
      .getPublicUrl(path);

    const avatarUrl = publicUrlData.publicUrl;

    const { error: updateError } = await this.supabase
      .getClient()
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId);

    if (updateError) {
      this.logger.error(`Profile avatar_url update failed for ${userId}: ${this.describeError(updateError)}`);
      throw new BadRequestException('Could not save avatar');
    }

    if (oldAvatarUrl) {
      const oldPath = this.extractStoragePath(oldAvatarUrl);
      if (oldPath) {
        const { error: removeError } = await this.supabase
          .getClient()
          .storage.from('photo')
          .remove([oldPath]);
        if (removeError) {
          this.logger.warn(`Could not delete old avatar for ${userId}: ${this.describeError(removeError)}`);
        }
      }
    }

    return { avatar_url: avatarUrl };
  }

  /** Extracts the storage object path (e.g. "userId/123.jpg") from a public avatar URL. */
  private extractStoragePath(url: string): string | null {
    const marker = '/object/public/photo/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.substring(idx + marker.length);
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

  /** Best-effort human-readable message from a Supabase AuthError, which
   *  doesn't always populate `.message` (e.g. some admin-API failures). */
  private extractMessage(error: unknown): string {
    if (!error) return 'Registration failed';
    const e = error as { message?: string; msg?: string; error_description?: string; status?: number };
    return e.message || e.msg || e.error_description || `Registration failed (status ${e.status ?? 'unknown'})`;
  }

  /** Full diagnostic dump for server-side logs only — never sent to the client. */
  private describeError(error: unknown): string {
    try {
      return JSON.stringify(error, Object.getOwnPropertyNames(error as object));
    } catch {
      return String(error);
    }
  }
}