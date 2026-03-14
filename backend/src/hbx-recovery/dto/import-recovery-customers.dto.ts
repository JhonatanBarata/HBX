import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class ImportRecoveryCustomerRowDto {
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

  @IsString()
  @IsOptional()
  registrationDate?: string;
}

export class ImportRecoveryCustomersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportRecoveryCustomerRowDto)
  rows!: ImportRecoveryCustomerRowDto[];
}
