import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AppRole } from '../common/enums';
import { ReservationsService } from './reservations.service';
import {
  AssignChauffeurDto,
  CreateReservationDto,
  UpdateReservationStatusDto,
} from './dto/reservations.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Roles(AppRole.CUSTOMER)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReservationDto) {
    return this.reservationsService.create(user.id, dto);
  }

  /** Reservation history — scoped to the caller's own role. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    if (user.role === AppRole.ADMIN) return this.reservationsService.listAll();
    if (user.role === AppRole.CHAUFFEUR) return this.reservationsService.listForChauffeur(user.id);
    return this.reservationsService.listForCustomer(user.id);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reservationsService.getById(id, user);
  }

  @Roles(AppRole.ADMIN)
  @Patch(':id/assign-chauffeur')
  assignChauffeur(@Param('id') id: string, @Body() dto: AssignChauffeurDto) {
    return this.reservationsService.assignChauffeur(id, dto);
  }

  /** Chauffeur progresses the trip (on_the_way/arrived/in_progress/completed), or customer/admin cancels. */
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReservationStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reservationsService.updateStatus(id, dto, user);
  }
}
