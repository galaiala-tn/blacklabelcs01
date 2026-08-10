import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RedeemGiftCardDto } from './dto/credits.dto';

@Injectable()
export class CreditsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getBalance(customerId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('customers')
      .select('credit_balance')
      .eq('id', customerId)
      .single();

    if (error || !data) throw new NotFoundException('Customer not found');
    return { balance: Number(data.credit_balance) };
  }

  async listTransactions(customerId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('credit_transactions')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async redeemGiftCard(customerId: string, dto: RedeemGiftCardDto) {
    const { data, error } = await this.supabase.getClient().rpc('redeem_gift_card', {
      p_code: dto.code,
      p_customer_id: customerId,
    });

    if (error) throw new BadRequestException(error.message);
    return { credited: Number(data) };
  }

  /** Referral code + a simple count of successful referrals for display. */
  async getReferralInfo(userId: string) {
    const client = this.supabase.getClient();

    const { data: profile, error } = await client
      .from('profiles')
      .select('referral_code')
      .eq('id', userId)
      .single();

    if (error || !profile) throw new NotFoundException('Profile not found');

    const { count } = await client
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('referred_by', userId);

    return { referralCode: profile.referral_code, totalReferred: count ?? 0 };
  }

  /** Called by ReservationsService when a customer applies their credit balance to a trip. */
  async debitForTrip(customerId: string, amount: number, reservationId: string) {
    if (amount <= 0) return;
    const { error } = await this.supabase.getClient().from('credit_transactions').insert({
      customer_id: customerId,
      amount: -amount,
      type: 'trip_redemption',
      description: 'Applied to trip fare',
      related_reservation_id: reservationId,
    });
    if (error) throw new BadRequestException(error.message);
  }
}
