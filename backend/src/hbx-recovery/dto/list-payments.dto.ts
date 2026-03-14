import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class ListRecoveryPaymentsDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;

  @IsOptional()
  @IsString()
  @IsIn(['paid', 'in_progress', 'finalized', 'cancelled', 'all'])
  lifecycle?: 'paid' | 'in_progress' | 'finalized' | 'cancelled' | 'all';
}

