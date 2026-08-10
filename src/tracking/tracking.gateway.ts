import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { SupabaseService } from '../supabase/supabase.service';
import { AppRole } from '../common/enums';

interface SocketUser {
  id: string;
  role: AppRole;
}

interface LocationUpdatePayload {
  reservationId: string;
  lat: number;
  lng: number;
  heading?: number;
  speedKmh?: number;
}

interface JoinReservationPayload {
  reservationId: string;
}

/**
 * Namespace: /tracking
 *
 * Chauffeur app  -> emits "location:update" every few seconds while a trip
 *                   is active. Persisted to tracking_history and broadcast.
 * Customer/Admin -> emits "reservation:join" with a reservationId to receive
 *                   "location:update" events for that trip's room.
 *
 * Auth: the Supabase access_token is passed as `auth: { token }` (or
 * `?token=` query param) on connection and verified against
 * SUPABASE_JWT_SECRET — same trust boundary as the REST JwtStrategy.
 */
@WebSocketGateway({ namespace: '/tracking', cors: { origin: '*' } })
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TrackingGateway.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const user = await this.authenticate(client);
      (client.data as { user: SocketUser }).user = user;
      this.logger.debug(`Socket connected: ${client.id} (user ${user.id}, role ${user.role})`);
    } catch (err) {
      this.logger.warn(`Rejected socket connection: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('reservation:join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinReservationPayload) {
    client.join(this.room(payload.reservationId));
    return { joined: payload.reservationId };
  }

  @SubscribeMessage('reservation:leave')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinReservationPayload) {
    client.leave(this.room(payload.reservationId));
    return { left: payload.reservationId };
  }

  @SubscribeMessage('location:update')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LocationUpdatePayload,
  ) {
    const user = (client.data as { user: SocketUser }).user;
    if (user.role !== AppRole.CHAUFFEUR) {
      throw new UnauthorizedException('Only chauffeurs can push location updates');
    }

    // Persist a breadcrumb (feeds tracking history / admin live map)
    await this.supabase
      .getClient()
      .from('tracking_history')
      .insert({
        reservation_id: payload.reservationId,
        chauffeur_id: user.id,
        lat: payload.lat,
        lng: payload.lng,
        heading: payload.heading ?? null,
        speed_kmh: payload.speedKmh ?? null,
      });

    // Keep chauffeurs.current_lat/lng fresh for the admin dashboard's live view
    await this.supabase
      .getClient()
      .from('chauffeurs')
      .update({ current_lat: payload.lat, current_lng: payload.lng })
      .eq('id', user.id);

    this.server.to(this.room(payload.reservationId)).emit('location:update', {
      reservationId: payload.reservationId,
      lat: payload.lat,
      lng: payload.lng,
      heading: payload.heading,
      speedKmh: payload.speedKmh,
      at: new Date().toISOString(),
    });

    return { ok: true };
  }

  /** Used by other services (e.g. ReservationsService) to push status events over the same room. */
  broadcastReservationEvent(reservationId: string, event: string, payload: unknown) {
    this.server.to(this.room(reservationId)).emit(event, payload);
  }

  private room(reservationId: string) {
    return `reservation:${reservationId}`;
  }

  private async authenticate(client: Socket): Promise<SocketUser> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.query?.token as string | undefined);

    if (!token) throw new Error('Missing auth token');

    const secret = this.config.get<string>('supabase.jwtSecret')!;
    const decoded = jwt.verify(token, secret) as { sub: string };

    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', decoded.sub)
      .single();

    if (error || !data || !data.is_active) throw new Error('Invalid user');

    return { id: data.id, role: data.role as AppRole };
  }
}
