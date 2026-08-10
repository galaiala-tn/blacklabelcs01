import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AppRole } from '../common/enums';
import { RecurringBookingsService } from './recurring-bookings.service';
import { CreateRecurringBookingDto, UpdateRecurringBookingDto } from './dto/recurring-bookings.dto';

@UseGuards(JwtAuthGuard)
@Controller('recurring-bookings')
export class RecurringBookingsController {
  constructor(private readonly recurringBookingsService: RecurringBookingsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRecurringBookingDto) {
    return this.recurringBookingsService.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.recurringBookingsService.listForCustomer(user.id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRecurringBookingDto,
  ) {
    return this.recurringBookingsService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.recurringBookingsService.remove(user.id, id);
  }

  /** Admin/ops escape hatch — trigger a generation run on demand instead of waiting for the daily cron. */
  @UseGuards(RolesGuard)
  @Roles(AppRole.ADMIN)
  @Post('run-now')
  runNow() {
    return this.recurringBookingsService.generateDueReservations();
  }
}
