import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

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
  @IsIn(['PIX', 'CARD'])
  paymentMethod!: string;
}

export class CreateFinanceiroSubscriptionDto {
  @IsString()
  @IsIn(['hbx_lite', 'hbx_padrao', 'hbx_melhor'])
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
  @IsEmail()
  payerEmail?: string;

  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  issuerId?: string;
}

export class ChangeFinanceiroSubscriptionCardDto {
  @IsString()
  @Length(8, 200)
  cardTokenId!: string;
}
