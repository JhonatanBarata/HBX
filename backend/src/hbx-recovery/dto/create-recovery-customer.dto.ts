import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateRecoveryCustomerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  clientName?: string;

  @IsString()
  @IsNotEmpty()
  whatsappNumber!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openAmount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  workdaySaleDay?: number;

  @IsString()
  @IsOptional()
  registrationDate?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  recurringDelays?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  paymentHistoryScore?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  totalPaid?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  averageDelay?: number;

  @IsString()
  @IsOptional()
  lastContact?: string;
}
