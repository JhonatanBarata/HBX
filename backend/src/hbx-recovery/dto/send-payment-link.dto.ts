import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class SendRecoveryPaymentLinkDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @IsOptional()
  amount?: number;
}

