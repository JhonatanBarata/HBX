import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

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
  @Length(2, 40)
  brand!: string;

  @IsString()
  @Length(4, 4)
  last4!: string;

  @IsString()
  @Length(2, 120)
  holderName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  expMonth!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2024)
  @Max(2100)
  expYear!: number;
}

export class CreateFinanceiroCheckoutDto {
  @IsString()
  @IsIn(['PIX', 'CARD'])
  paymentMethod!: string;
}
