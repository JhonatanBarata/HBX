import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { type CommercialPlanKey } from '../../commercial-plans/commercial-plan-catalog';

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

  // P0.2 (PR10072026 W1): plano morreu no signup público. Campo mantido SÓ por
  // compat com clients velhos em cache (whitelist derrubaria com 400 se sumisse
  // daqui) — qualquer string é aceita e o service IGNORA.
  @IsOptional()
  @IsString()
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

// F3 (CONFIRMACAO-TELEFONE) — verificação de telefone do usuário JÁ LOGADO (banner
// pós-Google). Sem pollToken: a rota roda sob o JWT da sessão. O confirm reusa o
// WhatsappConfirmCodeDto (challengeToken + code).
export class PhoneVerificationStartDto {
  @IsNotEmpty()
  phone: string;
}

export class ResendConfirmationDto {
  @IsEmail()
  email: string;
}

export class GoogleOAuthDto {
  @IsNotEmpty()
  idToken: string;

  // P0.2 (PR10072026 W1): aceito-e-IGNORADO (compat clients velhos) — ver SignupDto.
  @IsOptional()
  @IsString()
  selectedPlanKey?: CommercialPlanKey;

  @IsOptional()
  companyName?: string;
}
