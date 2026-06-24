import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateFinanceiroPreferencesDto {
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  billingCycle?: string;
}

export class SaveFinanceiroCardDto {
  @IsString()
  @Length(8, 200)
  cardTokenId!: string;
}

export class CreateFinanceiroCheckoutDto {
  @IsString()
  @IsIn(['PIX', 'CARD', 'BOLETO'])
  paymentMethod!: string;

  @IsOptional()
  @IsString()
  @IsIn(['hbx_lite', 'hbx_padrao', 'hbx_pro', 'hbx_melhor'])
  planKey?: string;

  @IsOptional()
  @IsString()
  @IsIn(['MONTHLY', 'ANNUAL'])
  billingCycle?: string;

  @IsOptional()
  @IsString()
  @Length(8, 30)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @Length(3, 120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @Length(11, 18)
  taxDocument?: string;

  @IsOptional()
  @IsBoolean()
  acceptedTerms?: boolean;
}

export class CreateFinanceiroSubscriptionDto {
  @IsString()
  @IsIn(['hbx_lite', 'hbx_padrao', 'hbx_pro', 'hbx_melhor'])
  planKey!: string;

  @IsString()
  @IsIn(['MONTHLY', 'ANNUAL'])
  billingCycle!: string;

  @IsString()
  @Length(8, 200)
  cardTokenId!: string;

  @IsString()
  @Length(8, 30)
  contactPhone!: string;

  @IsOptional()
  @IsString()
  @Length(3, 120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @Length(11, 18)
  taxDocument?: string;

  @IsOptional()
  @IsBoolean()
  acceptedTerms?: boolean;

  @IsOptional()
  @IsEmail()
  payerEmail?: string;

  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  issuerId?: string;
}

// Troca de plano de assinatura ATIVA (upgrade/downgrade com proração/crédito — B6).
// cardTokenId é opcional: só é exigido quando o upgrade precisa cobrar a diferença
// no live e não há cartão reaproveitável. dryRun=true só calcula o preview.
export class ChangeFinanceiroPlanDto {
  @IsString()
  @IsIn(['hbx_lite', 'hbx_padrao', 'hbx_pro', 'hbx_melhor'])
  planKey!: string;

  @IsOptional()
  @IsString()
  @IsIn(['MONTHLY', 'ANNUAL'])
  billingCycle?: string;

  @IsOptional()
  @IsString()
  @Length(8, 200)
  cardTokenId?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

// F3 — estorno de uma cobrança pelo master. amount opcional: ausente = estorno total;
// presente (> 0) = estorno parcial (validado <= disponível no service).
export class RefundFinanceiroChargeDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  reason?: string;
}

export class ChangeFinanceiroSubscriptionCardDto {
  @IsString()
  @Length(8, 200)
  cardTokenId!: string;

  @IsOptional()
  @IsString()
  @Length(3, 120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @Length(8, 30)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @Length(11, 18)
  taxDocument?: string;

  @IsOptional()
  @IsBoolean()
  acceptedTerms?: boolean;
}
