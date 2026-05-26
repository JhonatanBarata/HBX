import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsObject,
  IsBoolean,
  MaxLength,
  MinLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const LEAD_STATUSES = ['novo', 'contato', 'retorno', 'qualificado', 'encerrado'] as const;
const SALE_STATUSES = ['none', 'activation_pending', 'trial_started', 'sale_confirmed', 'inactive', 'canceled'] as const;
const COMMISSION_STATUSES = ['none', 'pending', 'payable', 'paid', 'canceled'] as const;
const MASTER_NOTICE_AUDIENCES = ['seller', 'customer'] as const;
const MASTER_NOTICE_TONES = ['info', 'success', 'warning', 'urgent'] as const;

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
  @IsString()
  @MaxLength(32)
  websiteStatus?: string;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  attemptCount?: number;
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  attemptCount?: number;

  @IsOptional()
  @IsIn(SALE_STATUSES)
  saleStatus?: (typeof SALE_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  saleValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  salePlanKey?: string;

  @IsOptional()
  @IsIn(COMMISSION_STATUSES)
  commissionStatus?: (typeof COMMISSION_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(280)
  commissionNote?: string;
}

export class CreateHbxSalesHandoffDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  salePlanKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  origin?: string;
}

export class CreateHbxAssistedSignupDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  salePlanKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @Transform(({ value }) => optionalEmail(value))
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password?: string;
}

export class CreateMasterNoticeDto {
  @IsOptional()
  @IsIn(MASTER_NOTICE_AUDIENCES)
  audience?: (typeof MASTER_NOTICE_AUDIENCES)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(96)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1200)
  body!: string;

  @IsOptional()
  @IsIn(MASTER_NOTICE_TONES)
  tone?: (typeof MASTER_NOTICE_TONES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  forceSeconds?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateCommissionPayoutDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sellerUserId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  @IsBoolean()
  includeNotYetDue?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;
}

export class CancelCommissionPayoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;
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
  @MaxLength(32)
  emailStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  emailSource?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  emailConfidence?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  facebookUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  socialStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  socialConfidence?: number;

  @IsOptional()
  @IsIn(['instagram', 'facebook', 'both'])
  primarySocial?: 'instagram' | 'facebook' | 'both' | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  googleMapsUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  openingHoursStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recommendedChannel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  painType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  painLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  painPitch?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  enrichmentScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  enrichmentConfidence?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  opportunityScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  opportunityReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sourceEngine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceUrl?: string;

  @IsOptional()
  enrichmentJson?: unknown;

  @IsOptional()
  quality?: {
    status?: string | null;
    billable?: boolean | null;
    segmentMatchScore?: number | null;
    contactQualityScore?: number | null;
    commercialScore?: number | null;
    reasons?: string[];
  } | null;

  @IsOptional()
  qualityV2?: unknown;

  @IsOptional()
  @IsIn(['candidate', 'list_basic', 'enrichment_pending', 'lead_plus_qualified', 'review_backup', 'blocked'])
  visibilityTier?: string;

  @IsOptional()
  @IsBoolean()
  billable?: boolean;

  @IsOptional()
  @IsBoolean()
  debitEligible?: boolean;

  @IsOptional()
  @IsIn(['list', 'lead_plus'])
  deliveryProduct?: 'list' | 'lead_plus';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  qualityReason?: string;

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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assignedUserId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on', 'none', 'skip'].includes(value.trim().toLowerCase());
    return value;
  })
  skipWhatsappValidation?: boolean;

  @IsOptional()
  @IsIn(['list', 'lead_plus'])
  qualityMode?: 'list' | 'lead_plus';

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  @IsBoolean()
  debitOnImport?: boolean;

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
  @Min(0)
  @Max(180)
  intervalVarianceMinutes?: number;

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
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  whatIsItIntentKeywords?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  neutralIntentKeywords?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  firstContactVariants?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  positiveReplyVariants?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  whatIsItReplyVariants?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  optOutVariants?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  neutralHandoffVariants?: string[];

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

export class UpdateSalesProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  whatDoYouSell?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  offerCategory?: string;

  @IsOptional()
  @IsObject()
  targetAudience?: { labels?: string[]; notes?: string };

  @IsOptional()
  @IsObject()
  targetSegments?: { labels?: string[]; weights?: Record<string, number> };

  @IsOptional()
  @IsObject()
  avoidSegments?: { labels?: string[]; hardReject?: string[] };

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  preferredCities?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  preferredStates?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  preferredChannels?: string[];

  @IsOptional()
  @IsObject()
  leadPreferences?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ticketRange?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  salesGoal?: string;

  @IsOptional()
  @IsObject()
  negativeRules?: Record<string, any>;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    return value;
  })
  @IsBoolean()
  weeklyAutoUpdateEnabled?: boolean;
}
