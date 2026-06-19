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
  @IsIn([COMMERCIAL_PLAN_KEYS.LITE, COMMERCIAL_PLAN_KEYS.PADRAO, COMMERCIAL_PLAN_KEYS.PRO, COMMERCIAL_PLAN_KEYS.MELHOR])
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
  trialContactName?: string;

  @IsOptional()
  trialTaxDocument?: string;

  @IsOptional()
  trialContactPhone?: string;

  @IsOptional()
  @IsBoolean()
  acceptedTerms?: boolean;

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

export class EmailConfirmationStatusDto {
  @IsNotEmpty()
  pollToken: string;
}

// F4 (19/06): retomada do funil. Mesmo token de acompanhamento do cadastro
// (sessão restrita) — prova posse sem expor sessão plena.
export class OnboardingResumeDto {
  @IsNotEmpty()
  pollToken: string;
}

// F6 (19/06): confirmação por WhatsApp do Master. start gera o código (envio
// gated/mock-first); confirm valida pelo challengeToken (carrega só o hash).
export class WhatsappConfirmStartDto {
  @IsNotEmpty()
  pollToken: string;

  @IsNotEmpty()
  phone: string;
}

export class WhatsappConfirmCodeDto {
  @IsNotEmpty()
  challengeToken: string;

  @IsNotEmpty()
  code: string;
}

export class ResendConfirmationDto {
  @IsEmail()
  email: string;
}

export class GoogleOAuthDto {
  @IsNotEmpty()
  idToken: string;

  @IsOptional()
  @IsIn([COMMERCIAL_PLAN_KEYS.LITE, COMMERCIAL_PLAN_KEYS.PADRAO, COMMERCIAL_PLAN_KEYS.PRO, COMMERCIAL_PLAN_KEYS.MELHOR])
  selectedPlanKey?: CommercialPlanKey;

  @IsOptional()
  companyName?: string;
}
