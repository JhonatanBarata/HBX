import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AssumeMasterContextDto {
  @IsInt()
  @Min(1)
  companyId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  ttlMinutes?: number;
}
