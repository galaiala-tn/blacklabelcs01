import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppRole } from '../common/enums';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto, UpdateVehicleCategoryDto } from './dto/vehicles.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get('vehicle-categories')
  listCategories() {
    return this.vehiclesService.listCategories();
  }

  @UseGuards(RolesGuard)
  @Roles(AppRole.ADMIN)
  @Put('vehicle-categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateVehicleCategoryDto) {
    return this.vehiclesService.updateCategory(id, dto);
  }

  @Get('vehicles')
  listVehicles() {
    return this.vehiclesService.listVehicles();
  }

  @UseGuards(RolesGuard)
  @Roles(AppRole.ADMIN)
  @Post('vehicles')
  createVehicle(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.createVehicle(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(AppRole.ADMIN)
  @Delete('vehicles/:id')
  deleteVehicle(@Param('id') id: string) {
    return this.vehiclesService.deleteVehicle(id);
  }
}