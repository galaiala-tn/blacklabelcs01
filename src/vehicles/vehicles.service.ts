import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateVehicleDto, UpdateVehicleCategoryDto } from './dto/vehicles.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly supabase: SupabaseService) {}

  async listCategories() {
    const { data, error } = await this.supabase
      .getClient()
      .from('vehicle_categories')
      .select('*')
      .eq('is_active', true)
      .order('min_price_one_way', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async updateCategory(id: string, dto: UpdateVehicleCategoryDto) {
    const payload: Record<string, unknown> = {};
    if (dto.minPriceOneWay !== undefined) payload.min_price_one_way = dto.minPriceOneWay;
    if (dto.hourlyRate !== undefined) payload.hourly_rate = dto.hourlyRate;
    if (dto.stopRateMinPerKm !== undefined) payload.stop_rate_min_per_km = dto.stopRateMinPerKm;
    if (dto.stopRateMaxPerKm !== undefined) payload.stop_rate_max_per_km = dto.stopRateMaxPerKm;
    if (dto.isActive !== undefined) payload.is_active = dto.isActive;

    const { data, error } = await this.supabase
      .getClient()
      .from('vehicle_categories')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Vehicle category not found');
    return data;
  }

  async listVehicles() {
    const { data, error } = await this.supabase
      .getClient()
      .from('vehicles')
      .select('*, vehicle_categories(code, display_name)')
      .eq('is_active', true);

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async createVehicle(dto: CreateVehicleDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('vehicles')
      .insert({
        category_id: dto.categoryId,
        chauffeur_id: dto.chauffeurId,
        make: dto.make,
        model: dto.model,
        year: dto.year,
        color: dto.color,
        plate_number: dto.plateNumber,
        photo_url: dto.photoUrl,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async deleteVehicle(id: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('vehicles')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Vehicle not found');
    return data;
  }
}