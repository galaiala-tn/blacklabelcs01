import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateVehicleDto {
  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  chauffeurId?: string;

  @IsString()
  make!: string;

  @IsString()
  model!: string;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsString()
  plateNumber!: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export class UpdateVehicleCategoryDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPriceOneWay?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stopRateMinPerKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stopRateMaxPerKm?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
