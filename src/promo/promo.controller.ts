import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AppRole } from '../common/enums';
import { PromoService } from './promo.service';
import { CreatePromoCodeDto, PreviewPromoDto, UpdatePromoCodeDto } from './dto/promo.dto';

@Controller('promo-codes')
export class PromoController {
  constructor(private readonly promoService: PromoService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.ADMIN)
  @Post()
  create(@Body() dto: CreatePromoCodeDto) {
    return this.promoService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.ADMIN)
  @Get()
  listAll() {
    return this.promoService.listAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePromoCodeDto) {
    return this.promoService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promoService.remove(id);
  }

  /** Customer checks a code before booking — validated but not redeemed yet. */
  @UseGuards(JwtAuthGuard)
  @Post('preview')
  preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreviewPromoDto) {
    return this.promoService.preview(user.id, dto);
  }
}
