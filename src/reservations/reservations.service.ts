import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PricingService } from '../pricing/pricing.service';
import { MapsService } from '../maps/maps.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { InvoicesService } from '../invoices/invoices.service';
import { PromoService } from '../promo/promo.service';
import { CreditsService } from '../credits/credits.service';
import {
  AppRole,
  NotificationType,
  ReservationStatus,
  ReservationType,
  STATUS_TO_NOTIFICATION,
} from '../common/enums';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import {
  AssignChauffeurDto,
  CreateReservationDto,
  UpdateReservationStatusDto,
} from './dto/reservations.dto';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly pricingService: PricingService,
    private readonly mapsService: MapsService,
    private readonly notificationsService: NotificationsService,
    private readonly trackingGateway: TrackingGateway,
    private readonly invoicesService: InvoicesService,
    private readonly promoService: PromoService,
    private readonly creditsService: CreditsService,
  ) {}

  async create(customerId: string, dto: CreateReservationDto) {
    if (dto.type === ReservationType.ONE_WAY_TRANSFER) {
      return this.createOneWay(customerId, dto);
    }
    return this.createHourly(customerId, dto);
  }

  // ---------------------------------------------------------------------
  // One Way Transfer
  // ---------------------------------------------------------------------
  private async createOneWay(customerId: string, dto: CreateReservationDto) {
    if (dto.destinationLat === undefined || dto.destinationLng === undefined || !dto.destinationAddress) {
      throw new BadRequestException('destinationAddress/lat/lng are required for one_way_transfer');
    }

    const origin = { lat: dto.pickupLat, lng: dto.pickupLng };
    const destination = { lat: dto.destinationLat, lng: dto.destinationLng };

    // Authoritative distance/duration — always computed server-side.
    const direct = await this.mapsService.calculateDirectDistance(origin, destination);

    let extraStopsKm = 0;
    if (dto.stops && dto.stops.length > 0) {
      const withStops = await this.mapsService.calculateRoute(
        origin,
        destination,
        dto.stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      );
      extraStopsKm = Math.max(0, round2(withStops.totalDistanceKm - direct.totalDistanceKm));
    }

    const breakdown = await this.pricingService.quoteOneWayTransfer({
      categoryId: dto.categoryId,
      distanceKm: direct.totalDistanceKm,
      extraStopsKm,
      stopRatePerKm: dto.stopRatePerKm,
      meetAndGreet: dto.meetAndGreet,
    });

    return this.persistReservation(customerId, dto, {
      distanceKm: direct.totalDistanceKm,
      durationMinutes: direct.totalDurationMinutes,
      bookedHours: null,
      breakdown,
    });
  }

  // ---------------------------------------------------------------------
  // Hourly Chauffeur Service
  // ---------------------------------------------------------------------
  private async createHourly(customerId: string, dto: CreateReservationDto) {
    if (!dto.bookedHours || dto.bookedHours < 3) {
      throw new BadRequestException('bookedHours is required and must be at least 3 for hourly_chauffeur');
    }

    let extraStopsKm = 0;
    if (dto.stops && dto.stops.length > 0 && dto.destinationLat !== undefined && dto.destinationLng !== undefined) {
      const origin = { lat: dto.pickupLat, lng: dto.pickupLng };
      const destination = { lat: dto.destinationLat, lng: dto.destinationLng };
      const direct = await this.mapsService.calculateDirectDistance(origin, destination);
      const withStops = await this.mapsService.calculateRoute(
        origin,
        destination,
        dto.stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      );
      extraStopsKm = Math.max(0, round2(withStops.totalDistanceKm - direct.totalDistanceKm));
    }

    const breakdown = await this.pricingService.quoteHourlyChauffeur({
      categoryId: dto.categoryId,
      hours: dto.bookedHours,
      extraStopsKm,
      stopRatePerKm: dto.stopRatePerKm,
      meetAndGreet: dto.meetAndGreet,
    });

    return this.persistReservation(customerId, dto, {
      distanceKm: null,
      durationMinutes: null,
      bookedHours: dto.bookedHours,
      breakdown,
    });
  }

  // ---------------------------------------------------------------------
  // Shared persistence
  // ---------------------------------------------------------------------
  private async persistReservation(
    customerId: string,
    dto: CreateReservationDto,
    computed: {
      distanceKm: number | null;
      durationMinutes: number | null;
      bookedHours: number | null;
      breakdown: { basePrice: number; stopsPrice: number; optionsPrice: number; subtotal: number; taxMultiplier: number; totalPrice: number };
    },
  ) {
    const client = this.supabase.getClient();

    // Optional promo code: re-validate against the ACTUAL computed subtotal
    // (never trust a discount amount from the client) and recompute the
    // total accordingly. Redemption is recorded only after the reservation
    // insert succeeds, so a failed insert never burns a customer's use of
    // the code.
    let discountAmount = 0;
    let promoCodeId: string | null = null;
    let finalTotalPrice = computed.breakdown.totalPrice;

    if (dto.promoCode) {
      const { discount } = await this.promoService.preview(customerId, {
        code: dto.promoCode,
        categoryId: dto.categoryId,
        subtotal: computed.breakdown.subtotal,
      });
      discountAmount = discount;
      const discountedSubtotal = Math.max(computed.breakdown.subtotal - discountAmount, 0);
      finalTotalPrice = round2(discountedSubtotal * computed.breakdown.taxMultiplier);

      const promo = await this.promoService.findByCode(dto.promoCode);
      promoCodeId = promo.id;
    }

    // Optional account credit (from referral rewards / gift cards): applied
    // AFTER the promo discount, capped at whatever subtotal remains and at
    // the customer's actual balance (never trust a client-supplied amount —
    // we look the balance up ourselves).
    let creditApplied = 0;
    if (dto.useCredit) {
      const { balance } = await this.creditsService.getBalance(customerId);
      const subtotalAfterPromo = Math.max(computed.breakdown.subtotal - discountAmount, 0);
      creditApplied = round2(Math.min(balance, subtotalAfterPromo));
      if (creditApplied > 0) {
        const subtotalAfterCredit = Math.max(subtotalAfterPromo - creditApplied, 0);
        finalTotalPrice = round2(subtotalAfterCredit * computed.breakdown.taxMultiplier);
      }
    }

    // NOTE: in production this should start as 'pending' and flip to
    // 'confirmed' once PaymentsService confirms payment. Set to 'confirmed'
    // directly here to keep this module usable end-to-end before Phase 2b
    // (payment provider) is wired in.
    const { data: reservation, error } = await client
      .from('reservations')
      .insert({
        customer_id: customerId,
        category_id: dto.categoryId,
        type: dto.type,
        status: ReservationStatus.CONFIRMED,
        pickup_address: dto.pickupAddress,
        pickup_lat: dto.pickupLat,
        pickup_lng: dto.pickupLng,
        destination_address: dto.destinationAddress ?? null,
        destination_lat: dto.destinationLat ?? null,
        destination_lng: dto.destinationLng ?? null,
        scheduled_at: dto.scheduledAt,
        distance_km: computed.distanceKm,
        duration_minutes: computed.durationMinutes,
        booked_hours: computed.bookedHours,
        flight_number: dto.flightNumber ?? null,
        train_number: dto.trainNumber ?? null,
        notes_for_chauffeur: dto.notesForChauffeur ?? null,
        meet_and_greet: dto.meetAndGreet ?? false,
        base_price: computed.breakdown.basePrice,
        stops_price: computed.breakdown.stopsPrice,
        options_price: computed.breakdown.optionsPrice,
        subtotal: computed.breakdown.subtotal,
        tax_multiplier_applied: computed.breakdown.taxMultiplier,
        promo_code_id: promoCodeId,
        discount_amount: discountAmount,
        credit_applied: creditApplied,
        total_price: finalTotalPrice,
      })
      .select()
      .single();

    if (error || !reservation) {
      throw new BadRequestException(error?.message ?? 'Could not create reservation');
    }

    if (promoCodeId && dto.promoCode) {
      await this.promoService.redeem(dto.promoCode, customerId, reservation.id, discountAmount).catch((err) => {
        this.logger.error(`Promo redemption failed for reservation ${reservation.id}: ${err.message}`);
      });
    }

    if (creditApplied > 0) {
      await this.creditsService.debitForTrip(customerId, creditApplied, reservation.id).catch((err) => {
        this.logger.error(`Credit debit failed for reservation ${reservation.id}: ${err.message}`);
      });
    }

    if (dto.stops && dto.stops.length > 0) {
      const stopRows = dto.stops.map((s, idx) => ({
        reservation_id: reservation.id,
        order_index: idx,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        // Aggregate stops distance/price is tracked on the reservation itself
        // (stops_price above); per-stop attribution can be refined later.
        extra_distance_km: 0,
        extra_price: 0,
      }));
      const { error: stopsError } = await client.from('reservation_stops').insert(stopRows);
      if (stopsError) this.logger.error(`Failed to persist stops: ${stopsError.message}`);
    }

    await this.notificationsService.sendTemplate(
      customerId,
      NotificationType.RESERVATION_CONFIRMED,
      reservation.id,
    );

    return reservation;
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------
  async listForCustomer(customerId: string) {
    return this.selectReservations().eq('customer_id', customerId);
  }

  async listForChauffeur(chauffeurId: string) {
    return this.selectReservations().eq('chauffeur_id', chauffeurId);
  }

  async listAll() {
    return this.selectReservations();
  }

  async getById(id: string, user: AuthenticatedUser) {
    const { data, error } = await this.supabase
      .getClient()
      .from('reservations')
      .select(
        `*, reservation_stops(*), vehicle_categories(code, display_name), chauffeurs(id, profiles!chauffeurs_id_fkey(full_name, phone, avatar_url)), vehicles(make, model, color, plate_number, photo_url)`,
      )
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Reservation not found');

    const row = data as any;
    const involved = row.customer_id === user.id || row.chauffeur_id === user.id;
    if (!involved && user.role !== AppRole.ADMIN) {
      throw new ForbiddenException('You do not have access to this reservation');
    }
    return row;
  }

  private selectReservations() {
    return this.supabase
      .getClient()
      .from('reservations')
      .select('*, vehicle_categories(code, display_name)')
      .order('scheduled_at', { ascending: false }) as any;
  }

  // ---------------------------------------------------------------------
  // Admin: assign chauffeur
  // ---------------------------------------------------------------------
  async assignChauffeur(reservationId: string, dto: AssignChauffeurDto) {
    const client = this.supabase.getClient();

    const { data: chauffeur, error: chauffeurError } = await client
      .from('chauffeurs')
      .select('id, verification_status')
      .eq('id', dto.chauffeurId)
      .single();

    if (chauffeurError || !chauffeur) throw new NotFoundException('Chauffeur not found');
    if (chauffeur.verification_status !== 'approved') {
      throw new BadRequestException(
        'This chauffeur has not been verified yet (license/insurance documents pending admin approval)',
      );
    }

    const { data: reservation, error } = await client
      .from('reservations')
      .update({
        chauffeur_id: dto.chauffeurId,
        vehicle_id: dto.vehicleId ?? null,
        status: ReservationStatus.CHAUFFEUR_ASSIGNED,
      })
      .eq('id', reservationId)
      .select()
      .single();

    if (error || !reservation) throw new NotFoundException('Reservation not found');

    await client.from('chauffeurs').update({ status: 'busy' }).eq('id', dto.chauffeurId);

    await this.notificationsService.sendTemplate(
      reservation.customer_id,
      NotificationType.CHAUFFEUR_ASSIGNED,
      reservation.id,
    );
    await this.notificationsService.sendTemplate(
      dto.chauffeurId,
      NotificationType.GENERAL,
      reservation.id,
      { message: 'You have been assigned a new reservation.' },
    );

    this.trackingGateway.broadcastReservationEvent(reservation.id, 'status:update', {
      status: reservation.status,
    });

    return reservation;
  }

  // ---------------------------------------------------------------------
  // Status transitions (chauffeur progresses the trip, or admin/customer cancels)
  // ---------------------------------------------------------------------
  async updateStatus(reservationId: string, dto: UpdateReservationStatusDto, actingUser: AuthenticatedUser) {
    const client = this.supabase.getClient();

    const { data: existing, error: fetchError } = await client
      .from('reservations')
      .select('id, customer_id, chauffeur_id, status')
      .eq('id', reservationId)
      .single();

    if (fetchError || !existing) throw new NotFoundException('Reservation not found');

    const isOwner = existing.customer_id === actingUser.id;
    const isAssignedChauffeur = existing.chauffeur_id === actingUser.id;
    const isAdmin = actingUser.role === AppRole.ADMIN;

    if (dto.status === ReservationStatus.CANCELLED) {
      if (!isOwner && !isAdmin) {
        throw new ForbiddenException('Only the customer or an admin can cancel a reservation');
      }
    } else if (!isAssignedChauffeur && !isAdmin) {
      throw new ForbiddenException('Only the assigned chauffeur or an admin can update trip status');
    }

    const { data: updated, error } = await client
      .from('reservations')
      .update({
        status: dto.status,
        cancelled_reason: dto.status === ReservationStatus.CANCELLED ? dto.cancelledReason ?? null : undefined,
      })
      .eq('id', reservationId)
      .select()
      .single();

    if (error || !updated) throw new BadRequestException(error?.message ?? 'Could not update status');

    if (dto.status === ReservationStatus.CANCELLED || dto.status === ReservationStatus.COMPLETED) {
      if (existing.chauffeur_id) {
        await client.from('chauffeurs').update({ status: 'available' }).eq('id', existing.chauffeur_id);
      }
    }

    const notificationType = STATUS_TO_NOTIFICATION[dto.status as ReservationStatus];
    if (notificationType) {
      await this.notificationsService.sendTemplate(updated.customer_id, notificationType, updated.id);
    }

    if (dto.status === ReservationStatus.COMPLETED) {
      // Generate the invoice + PDF automatically once a trip is completed.
      this.invoicesService.generateForReservation(updated.id).catch((err) => {
        this.logger.error(`Invoice generation failed for reservation ${updated.id}: ${err.message}`);
      });
    }

    this.trackingGateway.broadcastReservationEvent(updated.id, 'status:update', {
      status: updated.status,
    });

    return updated;
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}