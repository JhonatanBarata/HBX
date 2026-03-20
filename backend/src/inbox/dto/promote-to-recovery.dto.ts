import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PromoteToRecoveryDto {
  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  @Type(() => Number)
  openAmount!: number;

  @IsOptional()
  @IsString()
  saleDate?: string | null;

  @IsOptional()
  @IsString()
  companyName?: string | null;
}
