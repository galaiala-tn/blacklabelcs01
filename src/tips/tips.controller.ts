import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TipsService } from './tips.service';
import { CreateTipDto } from './dto/tips.dto';

@UseGuards(JwtAuthGuard)
@Controller('reservations/:id/tip')
export class TipsController {
  constructor(private readonly tipsService: TipsService) {}

  /** Customer starts a tip for a completed reservation — returns a Stripe client_secret. */
  @Post()
  createIntent(
    @Param('id') id: string,
    @Body() dto: CreateTipDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tipsService.createIntent(user.id, id, dto);
  }

  /** Returns the paid tip for this reservation, or null if none yet. */
  @Get()
  getExisting(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tipsService.getForReservation(id, user);
  }
}
