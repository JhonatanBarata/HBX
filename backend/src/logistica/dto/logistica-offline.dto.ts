import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OpenMobileDeviceSessionDto } from '../../auth/dto/mobile-device.dto';

export const OFFLINE_OPERATION_TYPES = ['CONFIRM_DELIVERY', 'CANCEL_DELIVERY'] as const;
export type OfflineOperationType = (typeof OFFLINE_OPERATION_TYPES)[number];

export class PrepareLogisticaOfflineRouteDto extends OpenMobileDeviceSessionDto {
  @IsString()
  @MaxLength(80)
  routeId!: string;
}

export class LogisticaOfflineCommandDto {
  @IsString()
  @MaxLength(80)
  commandId!: string;

  @IsIn(OFFLINE_OPERATION_TYPES)
  type!: OfflineOperationType;

  @IsString()
  @MaxLength(80)
  deliveryId!: string;

  @IsString()
  @MaxLength(80)
  idempotencyKey!: string;

  @IsISO8601({ strict: true })
  capturedAt!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class SyncLogisticaOfflineRouteDto extends OpenMobileDeviceSessionDto {
  @IsString()
  @MaxLength(4096)
  grant!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LogisticaOfflineCommandDto)
  commands!: LogisticaOfflineCommandDto[];
}

export class UploadLogisticaOfflineProofDto extends OpenMobileDeviceSessionDto {
  @IsString()
  @MaxLength(4096)
  grant!: string;

  @IsString()
  @MaxLength(80)
  deliveryId!: string;

  @IsIn(['foto', 'assinatura'])
  tipo!: 'foto' | 'assinatura';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clientKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sha256?: string;
}
