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

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

export interface PlaceDetails {
  placeId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

/**
 * Wraps the Google Directions & Places APIs. Distance/duration used for pricing
 * must always come from here (server-side), never trusted from the Flutter app.
 *
 * Places Autocomplete / Place Details are ALSO proxied here: Google's Places API
 * cannot be called directly from a browser (Flutter Web) due to CORS, and doing
 * so would expose the API key client-side. The Flutter app must call our own
 * /maps/autocomplete and /maps/place-details endpoints instead.
 */
@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('googleMaps.apiKey') ?? '';
  }

  private ensureApiKey(): void {
    if (!this.apiKey) {
      throw new BadRequestException(
        'GOOGLE_MAPS_API_KEY is not configured on the backend (see .env.example)',
      );
    }
  }

  /**
   * Computes the route distance/duration for pickup -> [stops...] -> destination,
   * in the order given (stops are NOT re-optimized — order matters for pricing
   * and for what the chauffeur sees).
   */
  async calculateRoute(origin: LatLng, destination: LatLng, waypoints: LatLng[] = []): Promise<RouteResult> {
    this.ensureApiKey();

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

  /**
   * Server-side proxy for Google Places Autocomplete.
   * `sessionToken` should be a UUID generated client-side and reused for the
   * whole search session (autocomplete + the final place-details call) — this
   * is what lets Google bill the session as a single "search" instead of
   * per-keystroke, and it's required to get the cheaper Autocomplete pricing.
   */
  async autocompletePlaces(input: string, sessionToken?: string, language = 'en'): Promise<PlaceSuggestion[]> {
    this.ensureApiKey();

    const trimmed = input?.trim() ?? '';
    if (trimmed.length === 0) {
      return [];
    }

    const params = new URLSearchParams({
      input: trimmed,
      key: this.apiKey,
      language,
    });
    if (sessionToken) {
      params.set('sessiontoken', sessionToken);
    }

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;

    let json: any;
    try {
      const res = await fetch(url);
      json = await res.json();
    } catch (err) {
      this.logger.error('Google Places Autocomplete request failed', err as Error);
      throw new BadGatewayException('Could not reach the Google Places service');
    }

    // ZERO_RESULTS is a normal "nothing matches yet" response, not an error.
    if (json.status === 'ZERO_RESULTS') {
      return [];
    }
    if (json.status !== 'OK') {
      this.logger.warn(`Places Autocomplete non-OK status: ${json.status} ${json.error_message ?? ''}`);
      throw new BadRequestException(`Could not fetch suggestions: ${json.status ?? 'unknown error'}`);
    }

    return (json.predictions as any[]).map((p) => ({
      placeId: p.place_id,
      description: p.description,
    }));
  }

  /** Resolves a place_id (from autocompletePlaces) into a formatted address + lat/lng. */
  async getPlaceDetails(placeId: string, sessionToken?: string): Promise<PlaceDetails> {
    this.ensureApiKey();

    if (!placeId) {
      throw new BadRequestException('placeId is required');
    }

    const params = new URLSearchParams({
      place_id: placeId,
      key: this.apiKey,
      fields: 'formatted_address,geometry',
    });
    if (sessionToken) {
      params.set('sessiontoken', sessionToken);
    }

    const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;

    let json: any;
    try {
      const res = await fetch(url);
      json = await res.json();
    } catch (err) {
      this.logger.error('Google Place Details request failed', err as Error);
      throw new BadGatewayException('Could not reach the Google Places service');
    }

    if (json.status !== 'OK' || !json.result) {
      throw new BadRequestException(`Could not fetch place details: ${json.status ?? 'unknown error'}`);
    }

    const result = json.result;
    return {
      placeId,
      formattedAddress: result.formatted_address,
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
    };
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}