import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AppRole } from '../common/enums';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { SendChatMessageDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  constructor(private readonly supabase: SupabaseService) {}

  private async assertInvolved(reservationId: string, user: AuthenticatedUser) {
    const { data: reservation, error } = await this.supabase
      .getClient()
      .from('reservations')
      .select('id, customer_id, chauffeur_id')
      .eq('id', reservationId)
      .single();

    if (error || !reservation) throw new NotFoundException('Reservation not found');

    const involved = reservation.customer_id === user.id || reservation.chauffeur_id === user.id;
    if (!involved && user.role !== AppRole.ADMIN) {
      throw new ForbiddenException('You are not part of this trip');
    }
    return reservation;
  }

  /**
   * Inserting the row is the entire "send" operation — Supabase Realtime
   * (see migration 00018) streams it to whichever party is subscribed to
   * this reservation's chat_messages, no separate push/broadcast step here.
   */
  async sendMessage(sender: AuthenticatedUser, dto: SendChatMessageDto) {
    await this.assertInvolved(dto.reservationId, sender);

    const { data, error } = await this.supabase
      .getClient()
      .from('chat_messages')
      .insert({
        reservation_id: dto.reservationId,
        sender_id: sender.id,
        message: dto.message,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async getHistory(reservationId: string, user: AuthenticatedUser) {
    await this.assertInvolved(reservationId, user);

    const { data, error } = await this.supabase
      .getClient()
      .from('chat_messages')
      .select('*')
      .eq('reservation_id', reservationId)
      .order('created_at', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async markRead(reservationId: string, user: AuthenticatedUser) {
    await this.assertInvolved(reservationId, user);

    // Mark as read every message in this thread NOT sent by the caller.
    const { error } = await this.supabase
      .getClient()
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('reservation_id', reservationId)
      .neq('sender_id', user.id)
      .is('read_at', null);

    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }
}
