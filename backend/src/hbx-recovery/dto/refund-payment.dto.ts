import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class RefundRecoveryPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  amount?: number;
}

