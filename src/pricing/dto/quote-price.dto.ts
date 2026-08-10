import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class QuotePriceDto {
  @IsUUID()
  categoryId!: string;

  @IsIn(['one_way_transfer', 'hourly_chauffeur'])
  type!: 'one_way_transfer' | 'hourly_chauffeur';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  distanceKm?: number; // required for one_way_transfer

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  hours?: number; // required for hourly_chauffeur

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  extraStopsKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stopRatePerKm?: number;

  @IsOptional()
  @IsBoolean()
  meetAndGreet?: boolean;
}
