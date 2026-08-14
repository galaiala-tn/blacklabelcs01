import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationType,
  PaymentStatus,
  ReservationStatus,
} from '../common/enums';
import { CreatePaymentIntentDto } from './dto/payments.dto';

/**
 * Stripe is used as the reference payment provider. Swap the Stripe calls
 * below for another provider (Adyen, Checkout.com, etc.) without touching
 * callers — the public methods (createIntent / handleWebhookEvent) are the
 * stable contract the rest of the app depends on.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {
    const secretKey = this.config.get<string>('stripe.secretKey');
    // No explicit apiVersion pin: defaults to the account's dashboard-configured
    // API version. Pin one explicitly once you've decided on a Stripe upgrade policy.
    this.stripe = new Stripe(secretKey ?? 'sk_test_placeholder');
  }

  /** Creates a Stripe PaymentIntent for a reservation's total_price and records a `pending` payment row. */
  async createIntent(customerId: string, dto: CreatePaymentIntentDto) {
    const client = this.supabase.getClient();

    const { data: reservation, error } = await client
      .from('reservations')
      .select('id, customer_id, total_price')
      .eq('id', dto.reservationId)
      .single();

    if (error || !reservation)
      throw new NotFoundException('Reservation not found');
    if (reservation.customer_id !== customerId) {
      throw new BadRequestException('This reservation does not belong to you');
    }

    const amountCents = Math.round(Number(reservation.total_price) * 100);

    const intent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      metadata: { reservationId: reservation.id, customerId },
      automatic_payment_methods: { enabled: true },
    });

    const { data: payment, error: insertError } = await client
      .from('payments')
      .insert({
        reservation_id: reservation.id,
        customer_id: customerId,
        amount: reservation.total_price,
        currency: 'USD',
        method: dto.method ?? 'card',
        status: PaymentStatus.PENDING,
        provider: 'stripe',
        provider_ref: intent.id,
      })
      .select()
      .single();

    if (insertError) throw new BadRequestException(insertError.message);

    return {
      clientSecret: intent.client_secret,
      paymentId: payment.id,
      amount: reservation.total_price,
    };
  }

  /** Verifies and processes a Stripe webhook event (call this from a raw-body route). */
  async handleWebhookEvent(rawBody: Buffer, signature: string) {
    const webhookSecret = this.config.get<string>('stripe.webhookSecret');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret!,
      );
    } catch (err) {
      throw new BadRequestException(
        `Invalid Stripe webhook signature: ${(err as Error).message}`,
      );
    }

    switch (event.type) {
  case 'payment_intent.succeeded': {
    const intent = event.data.object as Stripe.PaymentIntent;
    await this.markPaid(intent);
    break;
  }

  case 'payment_intent.payment_failed':
    await this.markFailed(event.data.object as Stripe.PaymentIntent);
    break;

  default:
    this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
}

    return { received: true };
  }


  private async markPaid(intent: Stripe.PaymentIntent) {
    const client = this.supabase.getClient();

    const { data: payment, error } = await client
      .from('payments')
      .update({ status: PaymentStatus.PAID, paid_at: new Date().toISOString() })
      .eq('provider_ref', intent.id)
      .select()
      .single();

    if (error || !payment) {
      this.logger.error(`No payment row found for Stripe intent ${intent.id}`);
      return;
    }

    await client
      .from('reservations')
      .update({ status: ReservationStatus.CONFIRMED })
      .eq('id', payment.reservation_id);

    await this.notifications.sendTemplate(
      payment.customer_id,
      NotificationType.PAYMENT_RECEIVED,
      payment.reservation_id,
    );
  }

  private async markFailed(intent: Stripe.PaymentIntent) {
    const { error } = await this.supabase
      .getClient()
      .from('payments')
      .update({
        status: PaymentStatus.FAILED,
        failure_reason: intent.last_payment_error?.message ?? 'Payment failed',
      })
      .eq('provider_ref', intent.id);

    if (error)
      this.logger.error(`Failed to record payment failure: ${error.message}`);
  }

  async listForCustomer(customerId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** Admin-wide view — every payment, with customer name for display. */
  async listAll() {
    const { data, error } = await this.supabase
      .getClient()
      .from('payments')
      .select(
        '*, customers!payments_customer_id_fkey(profiles!customers_id_fkey(full_name, email))',
      )
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data;
  }
}
