import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/locations.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly supabase: SupabaseService) {}

  async listForCustomer(customerId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('locations')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async create(customerId: string, dto: CreateLocationDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('locations')
      .insert({
        customer_id: customerId,
        label: dto.label ?? null,
        formatted_address: dto.formattedAddress,
        place_id: dto.placeId ?? null,
        lat: dto.lat,
        lng: dto.lng,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async update(customerId: string, id: string, dto: UpdateLocationDto) {
    const payload: Record<string, unknown> = {};
    if (dto.label !== undefined) payload.label = dto.label;
    if (dto.formattedAddress !== undefined) payload.formatted_address = dto.formattedAddress;

    const { data, error } = await this.supabase
      .getClient()
      .from('locations')
      .update(payload)
      .eq('id', id)
      .eq('customer_id', customerId) // ownership check baked into the query
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Location not found');
    return data;
  }

  async remove(customerId: string, id: string) {
    const { error, count } = await this.supabase
      .getClient()
      .from('locations')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('customer_id', customerId);

    if (error) throw new BadRequestException(error.message);
    if (!count) throw new NotFoundException('Location not found');
    return { deleted: true };
  }
}
