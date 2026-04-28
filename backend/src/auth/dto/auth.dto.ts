import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, MinLength } from 'class-validator';
import { COMMERCIAL_PLAN_KEYS, type CommercialPlanKey } from '../../commercial-plans/commercial-plan-catalog';

export class SignupDto {
  @IsOptional()
  @IsIn(['PF', 'PJ'])
  entityType?: 'PF' | 'PJ';

  @IsOptional()
  companyName?: string;

  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsIn(['vendas'])
  trialModuleSelection?: 'vendas';

  @IsOptional()
  @IsIn([COMMERCIAL_PLAN_KEYS.LITE, COMMERCIAL_PLAN_KEYS.PADRAO, COMMERCIAL_PLAN_KEYS.MELHOR])
  selectedPlanKey?: CommercialPlanKey;

  @IsOptional()
  @IsIn(['google', 'instagram', 'youtube', 'indicacao', 'parceiro', 'outro'])
  acquisitionSource?: 'google' | 'instagram' | 'youtube' | 'indicacao' | 'parceiro' | 'outro';

  @IsOptional()
  acquisitionSourceDetail?: string;

  @IsOptional()
  referralReferrerName?: string;

  @IsOptional()
  referralCode?: string;

  @IsOptional()
  username?: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

export class LoginDto {
  @IsNotEmpty()
  username: string;

  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsBoolean()
  forceSession?: boolean;
}

export class RecoverPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsNotEmpty()
  token: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

export class ConfirmEmailDto {
  @IsNotEmpty()
  token: string;
}

export class ResendConfirmationDto {
  @IsEmail()
  email: string;
}
