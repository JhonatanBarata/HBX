import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ExitMasterContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
