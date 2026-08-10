import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AppRole } from '../common/enums';
import { EarningsService } from './earnings.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @UseGuards(RolesGuard)
  @Roles(AppRole.CHAUFFEUR)
  @Get('earnings/me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.earningsService.getForChauffeur(user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(AppRole.ADMIN)
  @Get('admin/chauffeurs/:id/earnings')
  getForChauffeur(@Param('id') id: string) {
    return this.earningsService.getForChauffeur(id);
  }
}
