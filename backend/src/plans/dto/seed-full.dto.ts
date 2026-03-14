import { IsEmail, IsNotEmpty, IsOptional, MinLength, IsString } from 'class-validator';

export class SeedFullDto {
  @IsEmail()
  adminEmail: string;

  @IsNotEmpty()
  @MinLength(6)
  adminPassword: string;

  @IsOptional()
  @IsString()
  adminName?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  planName?: string;
}
