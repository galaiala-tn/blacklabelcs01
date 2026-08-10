import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreatePromoCodeDto, PreviewPromoDto, UpdatePromoCodeDto } from './dto/promo.dto';

@Injectable()
export class PromoService {
  constructor(private readonly supabase: SupabaseService) {}

  // ---------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------
  async create(dto: CreatePromoCodeDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('promo_codes')
      .insert({
        code: dto.code.toUpperCase(),
        description: dto.description ?? null,
        discount_type: dto.discountType,
        discount_value: dto.discountValue,
        max_discount_amount: dto.maxDiscountAmount ?? null,
        min_trip_amount: dto.minTripAmount ?? 0,
        valid_from: dto.validFrom ?? new Date().toISOString(),
        valid_until: dto.validUntil ?? null,
        max_total_uses: dto.maxTotalUses ?? null,
        max_uses_per_customer: dto.maxUsesPerCustomer ?? 1,
        applicable_category_ids: dto.applicableCategoryIds ?? null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') throw new BadRequestException('A promo code with this code already exists');
      throw new BadRequestException(error.message);
    }
    return data;
  }

  async update(id: string, dto: UpdatePromoCodeDto) {
    const payload: Record<string, unknown> = {};
    if (dto.isActive !== undefined) payload.is_active = dto.isActive;
    if (dto.validUntil !== undefined) payload.valid_until = dto.validUntil;

    const { data, error } = await this.supabase
      .getClient()
      .from('promo_codes')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Promo code not found');
    return data;
  }

  async listAll() {
    const { data, error } = await this.supabase
      .getClient()
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async remove(id: string) {
    const { error, count } = await this.supabase
      .getClient()
      .from('promo_codes')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);
    if (!count) throw new NotFoundException('Promo code not found');
    return { deleted: true };
  }

  // ---------------------------------------------------------------------
  // Customer-facing
  // ---------------------------------------------------------------------

  /** Validates a code and returns the discount amount WITHOUT redeeming it. */
  async preview(customerId: string, dto: PreviewPromoDto): Promise<{ discount: number }> {
    const { data, error } = await this.supabase.getClient().rpc('preview_promo_discount', {
      p_code: dto.code,
      p_customer_id: customerId,
      p_subtotal: dto.subtotal,
      p_category_id: dto.categoryId,
    });

    if (error) {
      // The SQL function raises a descriptive exception (invalid code,
      // expired, usage limit reached, etc.) — surface it as-is.
      throw new BadRequestException(error.message);
    }

    return { discount: Number(data) };
  }

  /**
   * Called internally by ReservationsService once a reservation has been
   * created with a promo applied — records the redemption and bumps the
   * usage counter. Not exposed as its own HTTP route.
   */
  async redeem(promoCode: string, customerId: string, reservationId: string, discountAmount: number) {
    const client = this.supabase.getClient();

    const { data: promo, error: promoError } = await client
      .from('promo_codes')
      .select('id, times_used')
      .ilike('code', promoCode)
      .single();

    if (promoError || !promo) throw new BadRequestException('Promo code not found at redemption time');

    const { error: redemptionError } = await client.from('promo_code_redemptions').insert({
      promo_code_id: promo.id,
      customer_id: customerId,
      reservation_id: reservationId,
      discount_amount: discountAmount,
    });

    if (redemptionError) throw new BadRequestException(redemptionError.message);

    await client
      .from('promo_codes')
      .update({ times_used: promo.times_used + 1 })
      .eq('id', promo.id);

    return { id: promo.id };
  }

  async findByCode(code: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('promo_codes')
      .select('*')
      .ilike('code', code)
      .single();

    if (error || !data) throw new NotFoundException('Promo code not found');
    return data;
  }
}
