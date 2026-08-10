import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AppRole } from '../common/enums';
import { InvoicesService } from './invoices.service';

@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  /** Admin sees every invoice; everyone else sees only their own. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    if (user.role === AppRole.ADMIN) return this.invoicesService.listAll();
    return this.invoicesService.listForCustomer(user.id);
  }

  @Get(':id/download')
  download(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const scopeToCustomer = user.role === AppRole.ADMIN ? undefined : user.id;
    return this.invoicesService.getDownloadUrl(id, scopeToCustomer);
  }
}
