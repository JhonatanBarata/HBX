import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { INTEGRATION_PROVIDER_IDS } from '../integration-provider.types';

export class CreateIntegrationConnectionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @IsIn(INTEGRATION_PROVIDER_IDS)
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
  @IsString()
  @MaxLength(4000)
  appKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  authMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalAccountId?: string;

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
  @IsIn(INTEGRATION_PROVIDER_IDS)
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
  @IsString()
  @MaxLength(4000)
  appKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  authMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalAccountId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}