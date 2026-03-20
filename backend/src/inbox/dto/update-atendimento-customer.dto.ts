import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAtendimentoCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  registrationStatus?: string;
}
