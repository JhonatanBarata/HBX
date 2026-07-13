import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const MOBILE_ACTION_KINDS = ['call', 'whatsapp'] as const;
export const MOBILE_ACTION_EVENTS = [
  'opened',
  'external_started',
  'returned',
  'completed',
  'canceled',
  'failed',
] as const;

export class CreateMobileActionDto {
  @IsIn(MOBILE_ACTION_KINDS)
  kind!: (typeof MOBILE_ACTION_KINDS)[number];

  @IsString()
  @MaxLength(40)
  @Matches(/[0-9]/, { message: 'Informe um telefone válido.' })
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  leadId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceId?: string;
}

export class MobileDeviceCredentialDto {
  @IsString()
  @Length(32, 512)
  deviceToken!: string;

  @IsString()
  @Length(16, 120)
  installationId!: string;
}

export class RegisterMobilePushDto extends MobileDeviceCredentialDto {
  @IsString()
  @Length(20, 4096)
  pushToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  appVersion?: string;
}

export class PullMobileActionsDto extends MobileDeviceCredentialDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  take?: number;
}

export class MobileActionEventDto extends MobileDeviceCredentialDto {
  @IsIn(MOBILE_ACTION_EVENTS)
  event!: (typeof MOBILE_ACTION_EVENTS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  elapsedSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  result?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
