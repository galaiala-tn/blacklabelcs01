import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendChatMessageDto {
  @IsUUID()
  reservationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message!: string;
}
