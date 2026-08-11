import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AppRole } from '../common/enums';
import { AdminCreateUserDto, CreateGiftCardDto, UpdateChauffeurDto, UpdateCustomerActiveDto, VerifyChauffeurDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(private readonly supabase: SupabaseService) {}

  // ---------------------------------------------------------------------
  // User creation — the only path that can create an 'admin' account,
  // and an admin-driven alternative to self-registration for chauffeurs
  // (e.g. onboarding a chauffeur who doesn't do it themselves).
  // ---------------------------------------------------------------------
  async createUser(dto: AdminCreateUserDto) {
    if (dto.role === AppRole.CHAUFFEUR && !dto.licenseNumber) {
      throw new BadRequestException('licenseNumber is required when creating a chauffeur');
    }

    const { data, error } = await this.supabase.getClient().auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: {
        full_name: dto.fullName,
        role: dto.role,
        phone: dto.phone,
        license_number: dto.licenseNumber,
      },
    });

    if (error || !data.user) {
      throw new BadRequestException(error?.message ?? 'Could not create user');
    }

    // handle_new_auth_user (Phase 1 trigger) has already created profiles/
    // customers/chauffeurs by the time this resolves — fetch it back for the response.
    const { data: profile } = await this.supabase
      .getClient()
      .from('profiles')
      .select('id, role, full_name, email, phone, is_active')
      .eq('id', data.user.id)
      .single();

    return profile ?? { id: data.user.id, role: dto.role, fullName: dto.fullName, email: dto.email };
  }

  // ---------------------------------------------------------------------
  // Dashboard stats
  // ---------------------------------------------------------------------
  async getStats() {
    const client = this.supabase.getClient();

    const [
      { count: totalCustomers },
      { count: totalChauffeurs },
      { count: activeTrips },
      { count: completedTrips },
      { count: cancelledTrips },
      { data: revenueRows },
    ] = await Promise.all([
      client.from('customers').select('*', { count: 'exact', head: true }),
      client.from('chauffeurs').select('*', { count: 'exact', head: true }),
      client
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .in('status', ['confirmed', 'chauffeur_assigned', 'on_the_way', 'arrived', 'in_progress']),
      client.from('reservations').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      client.from('reservations').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
      client.from('reservations').select('total_price').eq('status', 'completed'),
    ]);

    const totalRevenue = (revenueRows ?? []).reduce(
      (sum: number, r: { total_price: number }) => sum + Number(r.total_price),
      0,
    );

    const { data: byCategory } = await client
      .from('reservations')
      .select('category_id, vehicle_categories(display_name)')
      .eq('status', 'completed');

    const categoryBreakdown: Record<string, number> = {};
    for (const row of byCategory ?? []) {
      const name = (row as any).vehicle_categories?.display_name ?? 'Unknown';
      categoryBreakdown[name] = (categoryBreakdown[name] ?? 0) + 1;
    }

    return {
      totalCustomers: totalCustomers ?? 0,
      totalChauffeurs: totalChauffeurs ?? 0,
      activeTrips: activeTrips ?? 0,
      completedTrips: completedTrips ?? 0,
      cancelledTrips: cancelledTrips ?? 0,
      totalRevenue: round2(totalRevenue),
      completedTripsByCategory: categoryBreakdown,
    };
  }

  // ---------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------
  async listCustomers() {
    const { data, error } = await this.supabase
      .getClient()
      .from('customers')
      .select('*, profiles:id(full_name, email, phone, is_active, created_at)')
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async setCustomerActive(customerId: string, dto: UpdateCustomerActiveDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .update({ is_active: dto.isActive })
      .eq('id', customerId)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Customer not found');
    return data;
  }

  // ---------------------------------------------------------------------
  // Chauffeurs
  // ---------------------------------------------------------------------
  async listChauffeurs() {
  const { data, error } = await this.supabase
    .getClient()
    .from('chauffeurs')
    .select('*, profiles!chauffeurs_id_fkey(full_name, email, phone, is_active), vehicles!vehicles_chauffeur_id_fkey(make, model, plate_number)')
    .order('created_at', { ascending: false });

  if (error) throw new BadRequestException(error.message);
  return data;
}


  async updateChauffeur(chauffeurId: string, dto: UpdateChauffeurDto) {
    const payload: Record<string, unknown> = {};
    if (dto.licenseNumber !== undefined) payload.license_number = dto.licenseNumber;
    if (dto.status !== undefined) payload.status = dto.status;

    const { data, error } = await this.supabase
      .getClient()
      .from('chauffeurs')
      .update(payload)
      .eq('id', chauffeurId)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Chauffeur not found');
    return data;
  }

  // ---------------------------------------------------------------------
  // Chauffeur document verification
  // ---------------------------------------------------------------------
  async verifyChauffeur(chauffeurId: string, adminId: string, dto: VerifyChauffeurDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('chauffeurs')
      .update({
        verification_status: dto.status,
        verification_notes: dto.notes ?? null,
        verified_at: new Date().toISOString(),
        verified_by: adminId,
      })
      .eq('id', chauffeurId)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Chauffeur not found');
    return data;
  }

  async listPendingVerifications() {
  const { data, error } = await this.supabase
    .getClient()
    .from('chauffeurs')
    .select('*, profiles!chauffeurs_id_fkey(full_name, email, phone)')
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw new BadRequestException(error.message);
  return data;
}

  // ---------------------------------------------------------------------
  // Gift cards
  // ---------------------------------------------------------------------
  async createGiftCard(dto: CreateGiftCardDto) {
    const code = (dto.code ?? this.generateGiftCardCode()).toUpperCase();

    const { data, error } = await this.supabase
      .getClient()
      .from('gift_cards')
      .insert({
        code,
        initial_value: dto.initialValue,
        remaining_value: dto.initialValue,
        expires_at: dto.expiresAt ?? null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') throw new BadRequestException('A gift card with this code already exists');
      throw new BadRequestException(error.message);
    }
    return data;
  }

  async listGiftCards() {
    const { data, error } = await this.supabase
      .getClient()
      .from('gift_cards')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  private generateGiftCardCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
    let code = 'GC-';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
