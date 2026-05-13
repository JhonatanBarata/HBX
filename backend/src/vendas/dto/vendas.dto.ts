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
  Max,
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

export class BulkDeleteVendasLeadsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  leadIds?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  all?: boolean;
}

export class ReportVendasLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(600)
  reason?: string;
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
  @MaxLength(2)
  state?: string;

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

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on', 'none', 'skip'].includes(value.trim().toLowerCase());
    return value;
  })
  skipWhatsappValidation?: boolean;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportWebscrapingLeadItemDto)
  leads!: ImportWebscrapingLeadItemDto[];
}

export class UpdateVendasProspectingConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  segment?: string;

  @IsOptional()
  @IsIn(['hbx', 'google'])
  engine?: 'hbx' | 'google';

  @IsOptional()
  @IsIn(['pj', 'pf', 'agenda_pf'])
  targetType?: 'pj' | 'pf' | 'agenda_pf';

  @IsOptional()
  filtersJson?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  messageTemplate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  intervalMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  dailyLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  minLeadBuffer?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  desiredLeadBuffer?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  maxAttemptsPerLead?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  workingHoursStart?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  workingHoursEnd?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(45)
  typingSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  typingVarianceSeconds?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  positiveIntentKeywords?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  negativeIntentKeywords?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  optOutMessage?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  optOutReplyEnabled?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  websiteFallbackEnabled?: boolean;
}

export class StartVendasProspectingDto extends UpdateVendasProspectingConfigDto {}
