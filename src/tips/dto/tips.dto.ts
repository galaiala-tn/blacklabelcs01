import { IsNumber, Min } from 'class-validator';

export class CreateTipDto {
  @IsNumber()
  @Min(0.5)
  amount!: number;
}
