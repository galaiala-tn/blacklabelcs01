import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateReviewDto } from './dto/reviews.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(customerId: string, dto: CreateReviewDto) {
    const client = this.supabase.getClient();

    const { data: reservation, error: fetchError } = await client
      .from('reservations')
      .select('id, customer_id, chauffeur_id, status')
      .eq('id', dto.reservationId)
      .single();

    if (fetchError || !reservation) throw new NotFoundException('Reservation not found');
    if (reservation.customer_id !== customerId) {
      throw new ForbiddenException('You can only review your own reservations');
    }
    if (reservation.status !== 'completed') {
      throw new BadRequestException('You can only review a completed trip');
    }
    if (!reservation.chauffeur_id) {
      throw new BadRequestException('This reservation has no chauffeur to review');
    }

    const { data, error } = await client
      .from('reviews')
      .insert({
        reservation_id: dto.reservationId,
        customer_id: customerId,
        chauffeur_id: reservation.chauffeur_id,
        rating: dto.rating,
        comment: dto.comment ?? null,
      })
      .select()
      .single();

    if (error) {
      // unique constraint on reservation_id -> already reviewed
      if (error.code === '23505') {
        throw new BadRequestException('You have already reviewed this trip');
      }
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async listForChauffeur(chauffeurId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('reviews')
      .select('*, customers:customer_id(profiles:id(full_name))')
      .eq('chauffeur_id', chauffeurId)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async getChauffeurSummary(chauffeurId: string) {
    const client = this.supabase.getClient();

    const { data: chauffeur, error: chauffeurError } = await client
      .from('chauffeurs')
      .select('rating_avg')
      .eq('id', chauffeurId)
      .single();

    if (chauffeurError || !chauffeur) throw new NotFoundException('Chauffeur not found');

    const { count } = await client
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('chauffeur_id', chauffeurId);

    return { ratingAvg: chauffeur.rating_avg, totalReviews: count ?? 0 };
  }
}
