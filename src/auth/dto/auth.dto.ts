import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AppRole } from '../../common/enums';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  fullName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Only 'customer' and 'chauffeur' are self-registerable; admins are created out-of-band. */
  @IsOptional()
  @IsEnum(AppRole)
  role?: AppRole.CUSTOMER | AppRole.CHAUFFEUR;

  @IsOptional()
  @IsString()
  licenseNumber?: string; // required if role = chauffeur, validated in service
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}
