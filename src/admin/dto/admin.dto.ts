import { IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { AppRole } from '../../common/enums';

export class UpdateChauffeurDto {
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsIn(['offline', 'available', 'busy'])
  status?: 'offline' | 'available' | 'busy';

  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}

export class UpdateCustomerActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

/**
 * Admin-only user creation — the ONLY way to create an 'admin' account.
 * Public self-registration (POST /auth/register) deliberately only allows
 * 'customer' and 'chauffeur', so nobody can grant themselves admin access.
 */
export class AdminCreateUserDto {
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

  @IsEnum(AppRole)
  role!: AppRole;

  @IsOptional()
  @IsString()
  licenseNumber?: string; // required when role = chauffeur, validated in service
}

export class VerifyChauffeurDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateGiftCardDto {
  @IsOptional()
  @IsString()
  code?: string; // auto-generated if omitted

  @IsNumber()
  initialValue!: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}