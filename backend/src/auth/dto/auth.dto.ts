import { IsEmail, IsIn, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class SignupDto {
  @IsOptional()
  @IsIn(['PF', 'PJ'])
  entityType?: 'PF' | 'PJ';

  @IsOptional()
  @IsNotEmpty()
  companyName?: string;

  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsIn(['vendas', 'recovery'])
  trialModuleSelection?: 'vendas' | 'recovery';

  @IsOptional()
  @IsIn(['google', 'instagram', 'youtube', 'indicacao', 'parceiro', 'outro'])
  acquisitionSource?: 'google' | 'instagram' | 'youtube' | 'indicacao' | 'parceiro' | 'outro';

  @IsOptional()
  acquisitionSourceDetail?: string;

  @IsOptional()
  referralReferrerName?: string;

  @IsOptional()
  referralCode?: string;

  @IsNotEmpty()
  username: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(4)
  password: string;
}

export class LoginDto {
  @IsNotEmpty()
  username: string;

  @IsNotEmpty()
  password: string;
}

export class RecoverPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsNotEmpty()
  token: string;

  @IsNotEmpty()
  @MinLength(4)
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
