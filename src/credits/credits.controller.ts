import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CreditsService } from './credits.service';
import { RedeemGiftCardDto } from './dto/credits.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get('credits/balance')
  getBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.creditsService.getBalance(user.id);
  }

  @Get('credits/transactions')
  listTransactions(@CurrentUser() user: AuthenticatedUser) {
    return this.creditsService.listTransactions(user.id);
  }

  @Post('gift-cards/redeem')
  redeem(@CurrentUser() user: AuthenticatedUser, @Body() dto: RedeemGiftCardDto) {
    return this.creditsService.redeemGiftCard(user.id, dto);
  }

  @Get('referrals/me')
  getReferralInfo(@CurrentUser() user: AuthenticatedUser) {
    return this.creditsService.getReferralInfo(user.id);
  }
}
