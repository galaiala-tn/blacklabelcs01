import { Type } from 'class-transformer';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreateTipDto {
  @IsUUID()
  reservationId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;
}
