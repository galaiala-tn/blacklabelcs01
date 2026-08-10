import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { RawBodyRequest } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AppRole } from '../common/enums';
import { PaymentsService } from './payments.service';
import { CreatePaymentIntentDto } from './dto/payments.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('intent')
  createIntent(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentIntentDto) {
    return this.paymentsService.createIntent(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    if (user.role === AppRole.ADMIN) return this.paymentsService.listAll();
    return this.paymentsService.listForCustomer(user.id);
  }

  /**
   * Stripe webhook — intentionally NOT behind JwtAuthGuard (Stripe calls this,
   * not a logged-in user). Authenticity is verified via the signature instead.
   * Requires `rawBody: true` in NestFactory.create(...) (see main.ts) so
   * req.rawBody is the untouched byte buffer Stripe's SDK needs to verify it.
   */
  @Post('webhook')
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    if (!req.rawBody) {
      throw new BadRequestException('Raw body not available — check rawBody:true in main.ts');
    }
    return this.paymentsService.handleWebhookEvent(req.rawBody, signature);
  }
}
