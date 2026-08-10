import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AppRole } from '../common/enums';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/reviews.dto';

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.CUSTOMER)
  @Post('reviews')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(user.id, dto);
  }

  /** Public — shown on a chauffeur's profile card, no auth required. */
  @Get('chauffeurs/:id/reviews')
  listForChauffeur(@Param('id') id: string) {
    return this.reviewsService.listForChauffeur(id);
  }

  @Get('chauffeurs/:id/reviews/summary')
  getSummary(@Param('id') id: string) {
    return this.reviewsService.getChauffeurSummary(id);
  }
}
