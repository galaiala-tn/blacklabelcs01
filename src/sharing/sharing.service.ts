import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateShareLinkDto } from './dto/sharing.dto';

@Injectable()
export class SharingService {
  constructor(private readonly supabase: SupabaseService) {}

  async createLink(customerId: string, dto: CreateShareLinkDto) {
    const client = this.supabase.getClient();

    const { data: reservation, error: fetchError } = await client
      .from('reservations')
      .select('id, customer_id, status')
      .eq('id', dto.reservationId)
      .single();

    if (fetchError || !reservation) throw new NotFoundException('Reservation not found');
    if (reservation.customer_id !== customerId) {
      throw new ForbiddenException('This is not your reservation');
    }
    if (['completed', 'cancelled'].includes(reservation.status)) {
      throw new BadRequestException('Cannot share a trip that has already ended');
    }

    const { data, error } = await client
      .from('trip_share_tokens')
      .insert({ reservation_id: dto.reservationId, created_by: customerId })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async revoke(customerId: string, tokenId: string) {
    const { error, count } = await this.supabase
      .getClient()
      .from('trip_share_tokens')
      .update({ revoked_at: new Date().toISOString() }, { count: 'exact' })
      .eq('id', tokenId)
      .eq('created_by', customerId);

    if (error) throw new BadRequestException(error.message);
    if (!count) throw new NotFoundException('Share link not found');
    return { revoked: true };
  }

  /**
   * Public, unauthenticated, token-scoped. Returns only what a friend
   * following the trip needs — never the customer's full profile, payment
   * details, or anything beyond this one reservation's live status.
   */
  async getPublicTrip(token: string) {
    const client = this.supabase.getClient();

    const { data: shareToken, error } = await client
      .from('trip_share_tokens')
      .select('reservation_id, expires_at, revoked_at')
      .eq('token', token)
      .single();

    if (error || !shareToken) throw new NotFoundException('This link is invalid');
    if (shareToken.revoked_at) throw new BadRequestException('This link has been revoked');
    if (new Date(shareToken.expires_at) < new Date()) {
      throw new BadRequestException('This link has expired');
    }

    const { data: reservation, error: resError } = await client
      .from('reservations')
      .select(
        `id, reference_code, status, pickup_address, pickup_lat, pickup_lng,
         destination_address, destination_lat, destination_lng, scheduled_at,
         chauffeurs:chauffeur_id(id, profiles:id(full_name)), vehicle_categories(display_name)`,
      )
      .eq('id', shareToken.reservation_id)
      .single();

    if (resError || !reservation) throw new NotFoundException('Trip not found');

    const { data: lastLocation } = await client
      .from('tracking_history')
      .select('lat, lng, recorded_at')
      .eq('reservation_id', shareToken.reservation_id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const chauffeurName = (reservation as any).chauffeurs?.profiles?.full_name as string | undefined;

    return {
      referenceCode: reservation.reference_code,
      status: reservation.status,
      pickupAddress: reservation.pickup_address,
      destinationAddress: reservation.destination_address,
      scheduledAt: reservation.scheduled_at,
      categoryName: (reservation as any).vehicle_categories?.display_name,
      chauffeurFirstName: chauffeurName ? chauffeurName.split(' ')[0] : null,
      lastLocation: lastLocation ? { lat: lastLocation.lat, lng: lastLocation.lng, at: lastLocation.recorded_at } : null,
    };
  }
}
