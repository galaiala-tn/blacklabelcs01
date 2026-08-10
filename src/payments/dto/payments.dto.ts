import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsUUID()
  reservationId!: string;

  @IsOptional()
  @IsIn(['card', 'apple_pay', 'google_pay'])
  method?: 'card' | 'apple_pay' | 'google_pay';
}
