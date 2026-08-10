import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReservationStatus, ReservationType } from '../../common/enums';

export class StopDto {
  @IsString()
  address!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

export class CreateReservationDto {
  @IsIn(['one_way_transfer', 'hourly_chauffeur'])
  type!: ReservationType;

  @IsUUID()
  categoryId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsString()
  pickupAddress!: string;

  @IsNumber()
  pickupLat!: number;

  @IsNumber()
  pickupLng!: number;

  // Required for one_way_transfer
  @IsOptional()
  @IsString()
  destinationAddress?: string;

  @IsOptional()
  @IsNumber()
  destinationLat?: number;

  @IsOptional()
  @IsNumber()
  destinationLng?: number;

  // Required for hourly_chauffeur
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  bookedHours?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => StopDto)
  stops?: StopDto[];

  @IsOptional()
  @IsNumber()
  stopRatePerKm?: number; // must fall within the category's allowed range; defaults to midpoint

  @IsOptional()
  @IsString()
  flightNumber?: string;

  @IsOptional()
  @IsString()
  trainNumber?: string;

  @IsOptional()
  @IsString()
  notesForChauffeur?: string;

  @IsOptional()
  @IsBoolean()
  meetAndGreet?: boolean;

  @IsOptional()
  @IsString()
  promoCode?: string;

  @IsOptional()
  @IsBoolean()
  useCredit?: boolean;
}

export class AssignChauffeurDto {
  @IsUUID()
  chauffeurId!: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}

export class UpdateReservationStatusDto {
  @IsIn([
    'pending',
    'confirmed',
    'chauffeur_assigned',
    'on_the_way',
    'arrived',
    'in_progress',
    'completed',
    'cancelled',
  ])
  status!: ReservationStatus;

  @IsOptional()
  @IsString()
  cancelledReason?: string;
}
