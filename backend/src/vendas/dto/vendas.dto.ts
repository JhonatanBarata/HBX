import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const LEAD_STATUSES = ['novo', 'contato', 'retorno', 'qualificado', 'encerrado'] as const;

function optionalEmail(value: unknown) {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

export class CreateManualVendasLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => optionalEmail(value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  rating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reviews?: number;

  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: (typeof LEAD_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(140)
  nextAction?: string;

  @IsOptional()
  @IsString()
  returnAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  shortNote?: string;
}

export class UpdateVendasLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => optionalEmail(value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  address?: string;

  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: (typeof LEAD_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(140)
  nextAction?: string;

  @IsOptional()
  @IsString()
  returnAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  shortNote?: string;
}

export class ImportWebscrapingLeadItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @IsString()
  phoneDigits?: string;

  @IsOptional()
  @Transform(({ value }) => optionalEmail(value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  rating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reviews?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  segment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  shortNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  scriptText?: string;

  @IsOptional()
  @IsString()
  sourceHistoryId?: string;
}

export class ImportWebscrapingLeadsDto {
  @IsOptional()
  @IsString()
  sourceHistoryId?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ImportWebscrapingLeadItemDto)
  leads!: ImportWebscrapingLeadItemDto[];
}
