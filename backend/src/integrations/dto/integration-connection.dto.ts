import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateIntegrationConnectionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  provider!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  instanceName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  secret?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateIntegrationConnectionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  provider?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  instanceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  secret?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}