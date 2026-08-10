import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AppRole } from '../common/enums';
import { AdminService } from './admin.service';
import {
  AdminCreateUserDto,
  CreateGiftCardDto,
  UpdateChauffeurDto,
  UpdateCustomerActiveDto,
  VerifyChauffeurDto,
} from './dto/admin.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** Creates a customer, chauffeur, or admin account. Only path that can create 'admin'. */
  @Post('users')
  createUser(@Body() dto: AdminCreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('customers')
  listCustomers() {
    return this.adminService.listCustomers();
  }

  @Patch('customers/:id/active')
  setCustomerActive(@Param('id') id: string, @Body() dto: UpdateCustomerActiveDto) {
    return this.adminService.setCustomerActive(id, dto);
  }

  @Get('chauffeurs')
  listChauffeurs() {
    return this.adminService.listChauffeurs();
  }

  @Patch('chauffeurs/:id')
  updateChauffeur(@Param('id') id: string, @Body() dto: UpdateChauffeurDto) {
    return this.adminService.updateChauffeur(id, dto);
  }

  @Get('chauffeurs/pending-verification')
  listPendingVerifications() {
    return this.adminService.listPendingVerifications();
  }

  @Patch('chauffeurs/:id/verify')
  verifyChauffeur(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: VerifyChauffeurDto,
  ) {
    return this.adminService.verifyChauffeur(id, admin.id, dto);
  }

  @Post('gift-cards')
  createGiftCard(@Body() dto: CreateGiftCardDto) {
    return this.adminService.createGiftCard(dto);
  }

  @Get('gift-cards')
  listGiftCards() {
    return this.adminService.listGiftCards();
  }
}
