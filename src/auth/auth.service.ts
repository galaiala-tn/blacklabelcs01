// auth.service.ts
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

  // ─────────────────────────────────────────────
  // AUTHENTICATION
  // ─────────────────────────────────────────────

  /**
   * Inscription d'un nouvel utilisateur
   */
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

  /**
   * Connexion d'un utilisateur
   */
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

  /**
   * Rafraîchissement du token
   */
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
   * Déconnexion (invalide la session côté client uniquement)
   * Note: Supabase ne permet pas d'invalider un token côté serveur
   * La déconnexion est gérée côté client en supprimant le token
   */
  async logout(userId: string) {
    // Supabase ne permet pas de révoquer un token spécifique côté serveur
    // La déconnexion est gérée côté client
    this.logger.log(`User ${userId} logged out`);
    return { success: true };
  }

  // ─────────────────────────────────────────────
  // PROFILE MANAGEMENT
  // ─────────────────────────────────────────────

  /**
   * Récupère le profil d'un utilisateur
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

  /**
   * Met à jour le nom complet de l'utilisateur
   */
  async updateName(userId: string, newName: string) {
    if (!newName || newName.trim().length === 0) {
      throw new BadRequestException('Name cannot be empty');
    }

    if (newName.trim().length < 2) {
      throw new BadRequestException('Name must be at least 2 characters long');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .update({ full_name: newName.trim() })
      .eq('id', userId)
      .select('id, role, full_name, email, phone, avatar_url, is_active, created_at')
      .single();

    if (error || !data) {
      this.logger.error(`Update name failed for ${userId}: ${this.describeError(error)}`);
      throw new BadRequestException('Could not update name');
    }

    this.logger.log(`✅ Name updated for user ${userId}: ${newName}`);
    return data;
  }

  /**
   * Met à jour le numéro de téléphone de l'utilisateur
   */
  async updatePhone(userId: string, newPhone: string) {
    if (!newPhone || newPhone.trim().length === 0) {
      throw new BadRequestException('Phone number cannot be empty');
    }

    // Validation du numéro de téléphone
    const phoneRegex = /^[\+\d\s\-\(\)]{8,20}$/;
    if (!phoneRegex.test(newPhone.trim())) {
      throw new BadRequestException('Invalid phone number format. Use 8-20 characters including +, -, spaces, parentheses');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .update({ phone: newPhone.trim() })
      .eq('id', userId)
      .select('id, role, full_name, email, phone, avatar_url, is_active, created_at')
      .single();

    if (error || !data) {
      this.logger.error(`Update phone failed for ${userId}: ${this.describeError(error)}`);
      throw new BadRequestException('Could not update phone number');
    }

    this.logger.log(`✅ Phone updated for user ${userId}: ${newPhone}`);
    return data;
  }

  /**
   * Met à jour plusieurs champs du profil en une seule requête
   */
  async updateProfile(userId: string, updates: { fullName?: string; phone?: string }) {
    const updateData: Record<string, any> = {};

    if (updates.fullName !== undefined) {
      if (!updates.fullName.trim()) {
        throw new BadRequestException('Name cannot be empty');
      }
      if (updates.fullName.trim().length < 2) {
        throw new BadRequestException('Name must be at least 2 characters long');
      }
      updateData.full_name = updates.fullName.trim();
    }

    if (updates.phone !== undefined) {
      if (!updates.phone.trim()) {
        throw new BadRequestException('Phone number cannot be empty');
      }
      const phoneRegex = /^[\+\d\s\-\(\)]{8,20}$/;
      if (!phoneRegex.test(updates.phone.trim())) {
        throw new BadRequestException('Invalid phone number format. Use 8-20 characters including +, -, spaces, parentheses');
      }
      updateData.phone = updates.phone.trim();
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select('id, role, full_name, email, phone, avatar_url, is_active, created_at')
      .single();

    if (error || !data) {
      this.logger.error(`Update profile failed for ${userId}: ${this.describeError(error)}`);
      throw new BadRequestException('Could not update profile');
    }

    this.logger.log(`✅ Profile updated for user ${userId}: ${Object.keys(updateData).join(', ')}`);
    return data;
  }

  /**
   * Upload de l'avatar
   */
  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Vérification du type de fichier
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, GIF and WEBP are allowed');
    }

    // Vérification de la taille du fichier (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('File too large. Maximum size is 5MB');
    }

    // Récupération de l'ancien avatar
    const { data: existingProfile } = await this.supabase
      .getClient()
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .single();
    const oldAvatarUrl = existingProfile?.avatar_url as string | undefined;

    // Upload du nouveau fichier
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

    // Récupération de l'URL publique
    const { data: publicUrlData } = this.supabase
      .getClient()
      .storage.from('photo')
      .getPublicUrl(path);

    const avatarUrl = publicUrlData.publicUrl;

    // Mise à jour du profil
    const { error: updateError } = await this.supabase
      .getClient()
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId);

    if (updateError) {
      this.logger.error(`Profile avatar_url update failed for ${userId}: ${this.describeError(updateError)}`);
      throw new BadRequestException('Could not save avatar');
    }

    // Suppression de l'ancien avatar si différent
    if (oldAvatarUrl && oldAvatarUrl !== avatarUrl) {
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

  /**
   * Supprime l'avatar de l'utilisateur
   */
  async deleteAvatar(userId: string) {
    const { data: existingProfile } = await this.supabase
      .getClient()
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .single();
    
    const oldAvatarUrl = existingProfile?.avatar_url as string | undefined;

    if (oldAvatarUrl) {
      const oldPath = this.extractStoragePath(oldAvatarUrl);
      if (oldPath) {
        const { error: removeError } = await this.supabase
          .getClient()
          .storage.from('photo')
          .remove([oldPath]);
        if (removeError) {
          this.logger.error(`Could not delete avatar for ${userId}: ${this.describeError(removeError)}`);
          throw new BadRequestException('Could not delete avatar');
        }
      }
    }

    const { error: updateError } = await this.supabase
      .getClient()
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', userId);

    if (updateError) {
      this.logger.error(`Profile avatar_url update failed for ${userId}: ${this.describeError(updateError)}`);
      throw new BadRequestException('Could not remove avatar');
    }

    this.logger.log(`✅ Avatar deleted for user ${userId}`);
    return { success: true };
  }

  // ─────────────────────────────────────────────
  // UTILITY METHODS
  // ─────────────────────────────────────────────

  /**
   * Extrait le chemin du fichier dans le storage à partir de l'URL publique
   */
  private extractStoragePath(url: string): string | null {
    const marker = '/object/public/photo/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.substring(idx + marker.length);
  }

  /**
   * Test de connexion à Supabase
   */
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

  /**
   * Extrait un message lisible à partir d'une erreur Supabase
   */
  private extractMessage(error: unknown): string {
    if (!error) return 'Registration failed';
    const e = error as { message?: string; msg?: string; error_description?: string; status?: number };
    return e.message || e.msg || e.error_description || `Registration failed (status ${e.status ?? 'unknown'})`;
  }

  /**
   * Diagnostic complet pour les logs serveur uniquement
   */
  private describeError(error: unknown): string {
    try {
      return JSON.stringify(error, Object.getOwnPropertyNames(error as object));
    } catch {
      return String(error);
    }
  }
}