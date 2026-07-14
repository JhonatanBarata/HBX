import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OpenMobileDeviceSessionDto } from '../../auth/dto/mobile-device.dto';

export const TRACKING_POINT_EVENT_TYPES = ['START', 'PERIODIC', 'ARRIVAL', 'END'] as const;
export type TrackingPointEventType = (typeof TRACKING_POINT_EVENT_TYPES)[number];

export class LogisticaTrackingPointDto {
  @IsUUID()
  clientPointId!: string;

  @IsInt()
  @Min(0)
  sequence!: number;

  @IsISO8601({ strict: true })
  capturedAt!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  lat!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  lng!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  accuracyM!: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  speedMps?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  bearingDeg?: number;

  @IsIn(TRACKING_POINT_EVENT_TYPES)
  eventType!: TrackingPointEventType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deliveryId?: string;
}

export class StartLogisticaTrackingSessionDto extends OpenMobileDeviceSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  routeId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LogisticaTrackingPointDto)
  initialPoint?: LogisticaTrackingPointDto;
}

export class CurrentLogisticaTrackingSessionDto extends OpenMobileDeviceSessionDto {}

export class BatchLogisticaTrackingPointsDto extends OpenMobileDeviceSessionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LogisticaTrackingPointDto)
  points!: LogisticaTrackingPointDto[];
}

export const TRACKING_SESSION_EVENT_TYPES = ['ARRIVAL', 'END'] as const;
export type TrackingSessionEventType = (typeof TRACKING_SESSION_EVENT_TYPES)[number];

export class LogisticaTrackingSessionEventDto extends OpenMobileDeviceSessionDto {
  @IsUUID()
  eventId!: string;

  @IsIn(TRACKING_SESSION_EVENT_TYPES)
  type!: TrackingSessionEventType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deliveryId?: string;

  @IsISO8601({ strict: true })
  capturedAt!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LogisticaTrackingPointDto)
  point?: LogisticaTrackingPointDto;
}
