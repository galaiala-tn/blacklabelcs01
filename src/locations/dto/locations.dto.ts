import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateLocationDto {
  @IsOptional()
  @IsString()
  label?: string; // 'Home', 'Office', etc.

  @IsString()
  formattedAddress!: string;

  @IsOptional()
  @IsString()
  placeId?: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  formattedAddress?: string;
}
