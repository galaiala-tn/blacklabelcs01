import { Controller, Delete, Get, Header, Param, Post, Body, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { SharingService } from './sharing.service';
import { CreateShareLinkDto } from './dto/sharing.dto';

@Controller()
export class SharingController {
  constructor(private readonly sharingService: SharingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('sharing')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShareLinkDto) {
    return this.sharingService.createLink(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sharing/:id')
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sharingService.revoke(user.id, id);
  }

  /** Public JSON — consumed by the Flutter app itself if it opens a shared link. */
  @Get('public/track/:token')
  getJson(@Param('token') token: string) {
    return this.sharingService.getPublicTrip(token);
  }

  /**
   * Public HTML — for a friend WITHOUT the app who just clicked a link in a
   * text message. Deliberately minimal (no JS map SDK, no exposed API key):
   * status, addresses, chauffeur first name, last known position as
   * coordinates, auto-refreshing every 15s via <meta refresh>.
   */
  @Get('public/track/:token/view')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getHtml(@Param('token') token: string, @Res() res: Response) {
    try {
      const trip = await this.sharingService.getPublicTrip(token);
      res.send(this.renderHtml(trip, token));
    } catch (err) {
      res.status(200).send(this.renderError((err as Error).message));
    }
  }

  private renderHtml(trip: Awaited<ReturnType<SharingService['getPublicTrip']>>, token: string): string {
    const statusLabels: Record<string, string> = {
      pending: 'Pending', confirmed: 'Confirmed', chauffeur_assigned: 'Chauffeur assigned',
      on_the_way: 'Chauffeur on the way', arrived: 'Chauffeur arrived', in_progress: 'Trip in progress',
      completed: 'Trip completed', cancelled: 'Trip cancelled',
    };

    const locationLine = trip.lastLocation
      ? `Last known position: ${trip.lastLocation.lat.toFixed(4)}, ${trip.lastLocation.lng.toFixed(4)}
         <br><small>as of ${new Date(trip.lastLocation.at).toLocaleTimeString()}</small>`
      : 'Location not available yet.';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="15">
  <title>BlackLabel — Trip ${trip.referenceCode}</title>
  <style>
    body { background:#0B0B0B; color:#F5F5F5; font-family: Arial, sans-serif; padding:24px; max-width:480px; margin:0 auto; }
    h1 { color:#D4AF37; font-size:20px; letter-spacing:2px; }
    .card { background:#1A1A1A; border:1px solid #2A2A2A; border-radius:12px; padding:20px; margin-top:16px; }
    .label { color:#AAAAAA; font-size:12px; text-transform:uppercase; letter-spacing:1px; }
    .value { font-size:16px; margin-bottom:14px; }
    .status { color:#D4AF37; font-weight:bold; }
  </style>
</head>
<body>
  <h1>BLACKLABEL CAR SERVICES</h1>
  <div class="card">
    <div class="label">Status</div>
    <div class="value status">${statusLabels[trip.status] ?? trip.status}</div>

    <div class="label">Pickup</div>
    <div class="value">${trip.pickupAddress}</div>

    ${trip.destinationAddress ? `<div class="label">Destination</div><div class="value">${trip.destinationAddress}</div>` : ''}

    ${trip.chauffeurFirstName ? `<div class="label">Chauffeur</div><div class="value">${trip.chauffeurFirstName}</div>` : ''}

    <div class="label">Live tracking</div>
    <div class="value">${locationLine}</div>
  </div>
  <p style="color:#666;font-size:11px;margin-top:16px;">This page refreshes automatically. Reference: ${trip.referenceCode}</p>
</body>
</html>`;
  }

  private renderError(message: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>BlackLabel</title>
<style>body{background:#0B0B0B;color:#F5F5F5;font-family:Arial,sans-serif;padding:40px;text-align:center;}</style>
</head><body><h2>Link unavailable</h2><p>${message}</p></body></html>`;
  }
}
