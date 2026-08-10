import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AppRole } from '../common/enums';
import { TipsService } from './tips.service';
import { CreateTipDto } from './dto/tips.dto';

@UseGuards(JwtAuthGuard)
@Controller('tips')
export class TipsController {
  constructor(private readonly tipsService: TipsService) {}

  @Post('intent')
  createIntent(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTipDto) {
    return this.tipsService.createIntent(user.id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(AppRole.CHAUFFEUR)
  @Get('mine')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.tipsService.listForChauffeur(user.id);
  }
}
