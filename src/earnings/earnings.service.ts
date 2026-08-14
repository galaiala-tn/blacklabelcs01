import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class EarningsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getForChauffeur(chauffeurId: string) {
    const client = this.supabase.getClient();

    const [{ data: trips, error: tripsError }, { data: tips, error: tipsError }] =
      await Promise.all([
        client
          .from('chauffeur_earnings')
          .select('*')
          .eq('chauffeur_id', chauffeurId)
          .order('completed_at', { ascending: false }),
        client
          .from('tips')
          .select('reservation_id, amount')
          .eq('chauffeur_id', chauffeurId)
          .eq('status', 'paid'),
      ]);

    if (tripsError) throw new BadRequestException(tripsError.message);
    if (tipsError) throw new BadRequestException(tipsError.message);

    // Paid tips are stored separately from ride earnings, keyed by
    // reservation, so a chauffeur can only be tipped once per trip.
    const tipByReservation = new Map<string, number>();
    for (const tip of tips ?? []) {
      tipByReservation.set(tip.reservation_id, Number(tip.amount));
    }

    const tripsWithTips = (trips ?? []).map((row) => ({
      ...row,
      tip_amount: tipByReservation.get(row.reservation_id) ?? 0,
    }));

    const totalRideEarnings = tripsWithTips.reduce(
      (sum, row) => sum + Number(row.chauffeur_earning),
      0,
    );
    const totalTips = (tips ?? []).reduce((sum, tip) => sum + Number(tip.amount), 0);

    return {
      totalEarnings: round2(totalRideEarnings + totalTips),
      totalTips: round2(totalTips),
      totalTrips: tripsWithTips.length,
      trips: tripsWithTips,
    };
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}