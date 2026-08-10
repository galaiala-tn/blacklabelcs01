import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { ReservationsService } from '../reservations/reservations.service';
import { ReservationType } from '../common/enums';
import { CreateRecurringBookingDto, UpdateRecurringBookingDto } from './dto/recurring-bookings.dto';

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

@Injectable()
export class RecurringBookingsService {
  private readonly logger = new Logger(RecurringBookingsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly reservationsService: ReservationsService,
  ) {}

  // ---------------------------------------------------------------------
  // Template CRUD
  // ---------------------------------------------------------------------
  async create(customerId: string, dto: CreateRecurringBookingDto) {
    if (dto.type === 'hourly_chauffeur' && (!dto.bookedHours || dto.bookedHours < 3)) {
      throw new BadRequestException('bookedHours (>= 3) is required for hourly_chauffeur templates');
    }
    if (dto.type === 'one_way_transfer' && !dto.destinationAddress) {
      throw new BadRequestException('destinationAddress is required for one_way_transfer templates');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('recurring_bookings')
      .insert({
        customer_id: customerId,
        category_id: dto.categoryId,
        type: dto.type,
        pickup_address: dto.pickupAddress,
        pickup_lat: dto.pickupLat,
        pickup_lng: dto.pickupLng,
        destination_address: dto.destinationAddress ?? null,
        destination_lat: dto.destinationLat ?? null,
        destination_lng: dto.destinationLng ?? null,
        booked_hours: dto.bookedHours ?? null,
        days_of_week: dto.daysOfWeek,
        time_of_day: dto.timeOfDay,
        meet_and_greet: dto.meetAndGreet ?? false,
        notes_for_chauffeur: dto.notesForChauffeur ?? null,
        starts_on: dto.startsOn ?? new Date().toISOString().slice(0, 10),
        ends_on: dto.endsOn ?? null,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async listForCustomer(customerId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('recurring_bookings')
      .select('*, vehicle_categories(code, display_name)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async update(customerId: string, id: string, dto: UpdateRecurringBookingDto) {
    const payload: Record<string, unknown> = {};
    if (dto.isActive !== undefined) payload.is_active = dto.isActive;
    if (dto.daysOfWeek !== undefined) payload.days_of_week = dto.daysOfWeek;
    if (dto.timeOfDay !== undefined) payload.time_of_day = dto.timeOfDay;
    if (dto.endsOn !== undefined) payload.ends_on = dto.endsOn;

    const { data, error } = await this.supabase
      .getClient()
      .from('recurring_bookings')
      .update(payload)
      .eq('id', id)
      .eq('customer_id', customerId)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Recurring booking not found');
    return data;
  }

  async remove(customerId: string, id: string) {
    const { error, count } = await this.supabase
      .getClient()
      .from('recurring_bookings')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('customer_id', customerId);

    if (error) throw new BadRequestException(error.message);
    if (!count) throw new NotFoundException('Recurring booking not found');
    return { deleted: true };
  }

  // ---------------------------------------------------------------------
  // Daily generation job
  // ---------------------------------------------------------------------

  /**
   * Runs once a day (06:00 UTC) — NOTE: template times are interpreted in
   * UTC for now. If chauffeurs/customers span multiple timezones, store a
   * timezone per template and adjust here before going to production.
   */
  @Cron('0 6 * * *', { name: 'generate-recurring-bookings' })
  async handleDailyGeneration() {
    await this.generateDueReservations();
  }

  /** Exposed separately so it can also be triggered manually/tested without waiting for the cron. */
  async generateDueReservations(): Promise<{ generated: number; failed: number }> {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const todayCode = DAY_CODES[today.getUTCDay()];

    const { data: templates, error } = await this.supabase
      .getClient()
      .from('recurring_bookings')
      .select('*')
      .eq('is_active', true)
      .contains('days_of_week', [todayCode])
      .lte('starts_on', todayStr)
      .or(`ends_on.is.null,ends_on.gte.${todayStr}`)
      .or(`last_generated_date.is.null,last_generated_date.lt.${todayStr}`);

    if (error) {
      this.logger.error(`Could not load recurring booking templates: ${error.message}`);
      return { generated: 0, failed: 0 };
    }

    let generated = 0;
    let failed = 0;

    for (const template of templates ?? []) {
      try {
        const [hours, minutes] = (template.time_of_day as string).split(':').map(Number);
        const scheduledAt = new Date(
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), hours, minutes),
        );

        const reservation = await this.reservationsService.create(template.customer_id, {
          type: template.type as ReservationType,
          categoryId: template.category_id,
          scheduledAt: scheduledAt.toISOString(),
          pickupAddress: template.pickup_address,
          pickupLat: template.pickup_lat,
          pickupLng: template.pickup_lng,
          destinationAddress: template.destination_address ?? undefined,
          destinationLat: template.destination_lat ?? undefined,
          destinationLng: template.destination_lng ?? undefined,
          bookedHours: template.booked_hours ?? undefined,
          meetAndGreet: template.meet_and_greet,
          notesForChauffeur: template.notes_for_chauffeur ?? undefined,
        } as any);

        await this.supabase
          .getClient()
          .from('reservations')
          .update({ recurring_booking_id: template.id })
          .eq('id', (reservation as any).id);

        await this.supabase
          .getClient()
          .from('recurring_bookings')
          .update({ last_generated_date: todayStr })
          .eq('id', template.id);

        generated++;
      } catch (err) {
        failed++;
        this.logger.error(
          `Failed to generate reservation from recurring booking ${template.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`Recurring bookings run: ${generated} generated, ${failed} failed`);
    return { generated, failed };
  }
}
