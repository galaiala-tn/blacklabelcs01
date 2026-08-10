import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteLeg {
  distanceKm: number;
  durationMinutes: number;
}

export interface RouteResult {
  totalDistanceKm: number;
  totalDurationMinutes: number;
  legs: RouteLeg[];
}

/**
 * Wraps the Google Directions API. Distance/duration used for pricing must
 * always come from here (server-side), never trusted from the Flutter app —
 * the mobile app only uses Google Maps/Places for address autocomplete and
 * showing the route to the user.
 */
@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('googleMaps.apiKey') ?? '';
  }

  /**
   * Computes the route distance/duration for pickup -> [stops...] -> destination,
   * in the order given (stops are NOT re-optimized — order matters for pricing
   * and for what the chauffeur sees).
   */
  async calculateRoute(origin: LatLng, destination: LatLng, waypoints: LatLng[] = []): Promise<RouteResult> {
    if (!this.apiKey) {
      throw new BadRequestException(
        'GOOGLE_MAPS_API_KEY is not configured on the backend (see .env.example)',
      );
    }

    const params = new URLSearchParams({
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      key: this.apiKey,
    });

    if (waypoints.length > 0) {
      // no "optimize:true" — stop order must match what the customer configured
      params.set('waypoints', waypoints.map((w) => `${w.lat},${w.lng}`).join('|'));
    }

    const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;

    let json: any;
    try {
      const res = await fetch(url);
      json = await res.json();
    } catch (err) {
      this.logger.error('Google Directions API request failed', err as Error);
      throw new BadGatewayException('Could not reach the Google Maps routing service');
    }

    if (json.status !== 'OK' || !json.routes?.length) {
      throw new BadRequestException(`Could not compute route: ${json.status ?? 'unknown error'}`);
    }

    const legs = json.routes[0].legs as any[];
    const result: RouteResult = {
      totalDistanceKm: 0,
      totalDurationMinutes: 0,
      legs: [],
    };

    for (const leg of legs) {
      const distanceKm = round2(leg.distance.value / 1000);
      const durationMinutes = Math.round(leg.duration.value / 60);
      result.legs.push({ distanceKm, durationMinutes });
      result.totalDistanceKm = round2(result.totalDistanceKm + distanceKm);
      result.totalDurationMinutes += durationMinutes;
    }

    return result;
  }

  /** Direct pickup -> destination distance, ignoring stops. Used as the pricing baseline. */
  async calculateDirectDistance(origin: LatLng, destination: LatLng): Promise<RouteResult> {
    return this.calculateRoute(origin, destination, []);
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
