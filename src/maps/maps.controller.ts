import { Controller, Get, Query } from '@nestjs/common';
import { MapsService } from './maps.service';

/**
 * Proxy endpoints for Google Places, called by the Flutter app.
 * The app must NEVER call maps.googleapis.com directly (CORS on web +
 * would expose the API key) — everything goes through here.
 */
@Controller('maps')
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  @Get('autocomplete')
  autocomplete(
    @Query('input') input: string,
    @Query('sessionToken') sessionToken?: string,
    @Query('language') language?: string,
  ) {
    return this.mapsService.autocompletePlaces(input, sessionToken, language ?? 'en');
  }

  @Get('place-details')
  placeDetails(@Query('placeId') placeId: string, @Query('sessionToken') sessionToken?: string) {
    return this.mapsService.getPlaceDetails(placeId, sessionToken);
  }
}