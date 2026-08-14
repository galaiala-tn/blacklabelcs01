import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class EarningsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getForChauffeur(chauffeurId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('chauffeur_earnings')
      .select('*')
      .eq('chauffeur_id', chauffeurId)
      .order('completed_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);

    const totalEarnings = (data ?? []).reduce(
      (sum, row) => sum + Number(row.chauffeur_earning),
      0,
    );

    const totalTrips = (data ?? []).length;

    return {
      totalEarnings: round2(totalEarnings),
      totalTrips,
      trips: data,
    };
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}