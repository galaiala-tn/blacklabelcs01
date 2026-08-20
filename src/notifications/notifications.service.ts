import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { NotificationType } from '../common/enums';

interface SendNotificationInput {
  userId: string;
  reservationId?: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const TEMPLATES: Record<NotificationType, { title: string; body: string }> = {
  [NotificationType.RESERVATION_CONFIRMED]: {
    title: 'Reservation confirmed',
    body: 'Your BlackLabel reservation has been confirmed.',
  },
  [NotificationType.CHAUFFEUR_ASSIGNED]: {
    title: 'Chauffeur assigned',
    body: 'A chauffeur has been assigned to your reservation.',
  },
  [NotificationType.CHAUFFEUR_ON_THE_WAY]: {
    title: 'Chauffeur is on the way',
    body: 'Your chauffeur is on the way to the pickup location.',
  },
  [NotificationType.CHAUFFEUR_ARRIVED]: {
    title: 'Chauffeur has arrived',
    body: 'Your chauffeur is waiting at the pickup location.',
  },
  [NotificationType.TRIP_COMPLETED]: {
    title: 'Trip completed',
    body: 'Your trip is complete. Thank you for choosing BlackLabel.',
  },
  [NotificationType.PAYMENT_RECEIVED]: {
    title: 'Payment received',
    body: 'Your payment was successfully processed.',
  },
  [NotificationType.GENERAL]: {
    title: 'BlackLabel Car Services',
    body: '',
  },
};

/**
 * Delivery model: Supabase Realtime, not FCM/APNs.
 *
 * Inserting a row into `notifications` IS the delivery mechanism — Supabase
 * streams Postgres changes to any client subscribed to this table over a
 * websocket (`supabase.channel(...).on('postgres_changes', ...)`), filtered
 * to `user_id = eq.<their id>` via RLS. The Flutter app subscribes once at
 * login and receives new notifications the moment this insert commits, with
 * no separate push step, no device tokens, and no third-party service.
 *
 * Trade-off worth knowing: this only reaches the app while it holds an open
 * realtime connection (foreground, or backgrounded on platforms that keep
 * sockets alive). It will NOT wake up a fully killed app the way FCM/APNs
 * push does. The `notifications` table read here also still backs the
 * in-app notifications list/badge regardless of realtime connectivity.
 *
 * Requires the `notifications` table to be added to the `supabase_realtime`
 * publication — see migration 00018_realtime_publication.sql.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /** Convenience: send one of the 5 standard trip-lifecycle notifications using its default copy. */
  async sendTemplate(
    userId: string,
    type: NotificationType,
    reservationId?: string,
    data?: Record<string, unknown>,
  ) {
    const template = TEMPLATES[type];
    return this.send({ userId, reservationId, type, title: template.title, body: template.body, data });
  }

  async send(input: SendNotificationInput) {
    const { data, error } = await this.supabase
      .getClient()
      .from('notifications')
      .insert({
        user_id: input.userId,
        reservation_id: input.reservationId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data ?? null,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to persist/deliver notification: ${error.message}`);
      return null;
    }

    // No further action needed — Supabase Realtime picks this insert up
    // automatically and streams it to the subscribed client.
    return data;
  }

  async listForUser(userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async markRead(notificationId: string, userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Supprime définitivement une notification.
   * Le filtre `user_id` empêche un utilisateur de supprimer la notification d'un autre.
   */
  async delete(notificationId: string, userId: string) {
    const { error } = await this.supabase
      .getClient()
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Failed to delete notification ${notificationId}: ${error.message}`);
      throw error;
    }

    return { success: true };
  }

  /** Supprime toutes les notifications de l'utilisateur courant. */
  async deleteAll(userId: string) {
    const { error } = await this.supabase
      .getClient()
      .from('notifications')
      .delete()
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Failed to delete all notifications for user ${userId}: ${error.message}`);
      throw error;
    }

    return { success: true };
  }
}