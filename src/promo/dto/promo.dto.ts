import { Type } from 'class-transformer';
import {
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
} from 'class-validator';

export class CreatePromoCodeDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['percent', 'flat'])
  discountType!: 'percent' | 'flat';

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  discountValue!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxDiscountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minTripAmount?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxTotalUses?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsesPerCustomer?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  applicableCategoryIds?: string[];
}

export class UpdatePromoCodeDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class PreviewPromoDto {
  @IsString()
  code!: string;

  @IsUUID()
  categoryId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal!: number;
}
