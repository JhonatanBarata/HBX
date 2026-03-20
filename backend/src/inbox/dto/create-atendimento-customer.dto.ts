import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAtendimentoCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

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
}
