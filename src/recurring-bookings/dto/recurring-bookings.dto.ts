import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export class CreateRecurringBookingDto {
  @IsUUID()
  categoryId!: string;

  @IsIn(['one_way_transfer', 'hourly_chauffeur'])
  type!: 'one_way_transfer' | 'hourly_chauffeur';

  @IsString()
  pickupAddress!: string;

  @IsNumber()
  pickupLat!: number;

  @IsNumber()
  pickupLng!: number;

  @IsOptional()
  @IsString()
  destinationAddress?: string;

  @IsOptional()
  @IsNumber()
  destinationLat?: number;

  @IsOptional()
  @IsNumber()
  destinationLng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  bookedHours?: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(DAY_CODES, { each: true })
  daysOfWeek!: string[];

  /** 24h "HH:mm" format, e.g. "08:30" */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'timeOfDay must be in HH:mm format' })
  timeOfDay!: string;

  @IsOptional()
  @IsBoolean()
  meetAndGreet?: boolean;

  @IsOptional()
  @IsString()
  notesForChauffeur?: string;

  @IsOptional()
  @IsString()
  startsOn?: string; // date, defaults to today

  @IsOptional()
  @IsString()
  endsOn?: string; // date, null = indefinite
}

export class UpdateRecurringBookingDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(DAY_CODES, { each: true })
  daysOfWeek?: string[];

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'timeOfDay must be in HH:mm format' })
  timeOfDay?: string;

  @IsOptional()
  @IsString()
  endsOn?: string;
}
