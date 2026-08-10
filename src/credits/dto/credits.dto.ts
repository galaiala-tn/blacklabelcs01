import { IsString } from 'class-validator';

export class RedeemGiftCardDto {
  @IsString()
  code!: string;
}
