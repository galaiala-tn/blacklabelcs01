import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateTipDto } from './dto/tips.dto';

@Injectable()
export class TipsService {
  private readonly stripe: Stripe;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {
    const secretKey = this.config.get<string>('stripe.secretKey');
    this.stripe = new Stripe(secretKey ?? 'sk_test_placeholder');
  }

  async createIntent(customerId: string, dto: CreateTipDto) {
    const { data: reservation, error } = await this.supabase
      .getClient()
      .from('reservations')
      .select('id, customer_id, chauffeur_id, status')
      .eq('id', dto.reservationId)
      .single();

    if (error || !reservation) throw new NotFoundException('Reservation not found');
    if (reservation.customer_id !== customerId) {
      throw new ForbiddenException('This is not your reservation');
    }
    if (reservation.status !== 'completed') {
      throw new BadRequestException('You can only tip after the trip is completed');
    }
    if (!reservation.chauffeur_id) {
      throw new BadRequestException('This reservation has no chauffeur to tip');
    }

    const { data: existingTip } = await this.supabase
      .getClient()
      .from('tips')
      .select('id')
      .eq('reservation_id', dto.reservationId)
      .maybeSingle();
    if (existingTip) throw new BadRequestException('You have already tipped this trip');

    const intent = await this.stripe.paymentIntents.create(
      {
        amount: Math.round(dto.amount * 100),
        currency: 'usd',
        metadata: {
          type: 'tip',
          reservationId: reservation.id,
          customerId,
          chauffeurId: reservation.chauffeur_id,
        },
        automatic_payment_methods: { enabled: true },
      },
      {
        // Deterministic per reservation + amount: a network retry
        // (double-tap, dropped response, etc.) for the SAME amount reuses
        // the same PaymentIntent instead of creating — and charging — a
        // second one. Amount is included so that if the customer genuinely
        // changes the amount (e.g. after a decline) and retries, Stripe
        // sees it as a new key rather than rejecting it as a parameter
        // mismatch on the old one. Stripe keys expire after 24h.
        idempotencyKey: `tip-intent-${reservation.id}-${Math.round(dto.amount * 100)}`,
      },
    );

    return { clientSecret: intent.client_secret, amount: dto.amount };
  }

  async listForChauffeur(chauffeurId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('tips')
      .select('*')
      .eq('chauffeur_id', chauffeurId)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data;
  }
}