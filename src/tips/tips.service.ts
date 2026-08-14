import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, ReservationStatus } from '../common/enums';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CreateTipDto } from './dto/tips.dto';

/**
 * Tips are a separate PaymentIntent from the reservation's own payment
 * (see PaymentsService), sharing the same Stripe webhook endpoint —
 * distinguished via `metadata.type === 'tip'` (see
 * PaymentsService.handleWebhookEvent, which delegates here).
 */
@Injectable()
export class TipsService {
  private readonly logger = new Logger(TipsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {
    const secretKey = this.config.get<string>('stripe.secretKey');
    this.stripe = new Stripe(secretKey ?? 'sk_test_placeholder');
  }

  /** Creates a Stripe PaymentIntent for a tip and records a `pending` tip row. */
  async createIntent(customerId: string, reservationId: string, dto: CreateTipDto) {
    const client = this.supabase.getClient();

    const { data: reservation, error } = await client
      .from('reservations')
      .select('id, customer_id, chauffeur_id, status')
      .eq('id', reservationId)
      .single();

    if (error || !reservation) throw new NotFoundException('Reservation not found');

    if (reservation.customer_id !== customerId) {
      throw new ForbiddenException('This reservation does not belong to you');
    }
    if (reservation.status !== ReservationStatus.COMPLETED) {
      throw new BadRequestException('You can only tip your chauffeur after the trip is completed');
    }
    if (!reservation.chauffeur_id) {
      throw new BadRequestException('No chauffeur is associated with this reservation');
    }

    // The DB also enforces this (partial unique index on paid tips), but
    // checking here lets us return a clean 400 instead of a raw DB error.
    const { data: existingPaidTip } = await client
      .from('tips')
      .select('id')
      .eq('reservation_id', reservationId)
      .eq('status', 'paid')
      .maybeSingle();

    if (existingPaidTip) {
      throw new BadRequestException('You have already tipped for this trip');
    }

    const amountCents = Math.round(dto.amount * 100);

    const intent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      metadata: {
        type: 'tip',
        reservationId,
        customerId,
        chauffeurId: reservation.chauffeur_id,
      },
      automatic_payment_methods: { enabled: true },
    });

    const { data: tip, error: insertError } = await client
      .from('tips')
      .insert({
        reservation_id: reservationId,
        customer_id: customerId,
        chauffeur_id: reservation.chauffeur_id,
        amount: dto.amount,
        currency: 'USD',
        status: 'pending',
        provider: 'stripe',
        provider_ref: intent.id,
      })
      .select()
      .single();

    if (insertError) {
      // Nothing was charged yet (PaymentIntent isn't confirmed until the
      // client completes the Payment Sheet), so it's safe to just surface
      // the error — there's no charge to roll back.
      throw new BadRequestException(insertError.message);
    }

    return {
      clientSecret: intent.client_secret,
      tipId: tip.id,
      amount: dto.amount,
    };
  }

  /** Returns the paid tip for a reservation, or null if none exists yet. */
  async getForReservation(reservationId: string, user: AuthenticatedUser) {
    const { data: reservation, error: resError } = await this.supabase
      .getClient()
      .from('reservations')
      .select('id, customer_id, chauffeur_id')
      .eq('id', reservationId)
      .single();

    if (resError || !reservation) throw new NotFoundException('Reservation not found');

    const involved = reservation.customer_id === user.id || reservation.chauffeur_id === user.id;
    if (!involved && user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this reservation');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('tips')
      .select('*')
      .eq('reservation_id', reservationId)
      .eq('status', 'paid')
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // ---------------------------------------------------------------------
  // Called from PaymentsService.handleWebhookEvent for metadata.type === 'tip'
  // ---------------------------------------------------------------------
  async markPaid(intent: Stripe.PaymentIntent) {
    const client = this.supabase.getClient();

    const { data: tip, error } = await client
      .from('tips')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('provider_ref', intent.id)
      .select()
      .single();

    if (error || !tip) {
      this.logger.error(`No tip row found for Stripe intent ${intent.id}`);
      return;
    }

    await this.notifications.sendTemplate(
      tip.chauffeur_id,
      NotificationType.GENERAL,
      tip.reservation_id,
      { message: `You received a $${Number(tip.amount).toFixed(2)} tip!` },
    );
  }

  async markFailed(intent: Stripe.PaymentIntent) {
    const { error } = await this.supabase
      .getClient()
      .from('tips')
      .update({
        status: 'failed',
        failure_reason: intent.last_payment_error?.message ?? 'Payment failed',
      })
      .eq('provider_ref', intent.id);

    if (error) this.logger.error(`Failed to record tip failure: ${error.message}`);
  }
}
