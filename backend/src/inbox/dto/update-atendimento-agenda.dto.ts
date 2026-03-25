import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class UpdateAtendimentoAgendaInitialMessageDto {
  @IsString()
  @IsOptional()
  greeting?: string;

  @IsString()
  @IsOptional()
  companyLabel?: string;

  @IsString()
  @IsOptional()
  attendantLabel?: string;

  @IsString()
  @IsOptional()
  introText?: string;

  @IsIn(['botoes', 'lista'])
  @IsOptional()
  sendType?: 'botoes' | 'lista';

  @IsString()
  @IsOptional()
  fallbackText?: string;
}

class UpdateAtendimentoAgendaFlowMessagesDto {
  @IsString()
  @IsOptional()
  availabilityIntro?: string;

  @IsString()
  @IsOptional()
  fallbackFutureSlots?: string;

  @IsString()
  @IsOptional()
  confirmationMessage?: string;

  @IsString()
  @IsOptional()
  cancellationPrompt?: string;

  @IsString()
  @IsOptional()
  cancellationSuccess?: string;

  @IsString()
  @IsOptional()
  cancellationNotFound?: string;
}

class UpdateAtendimentoAgendaSlotDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  label?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

class UpdateAtendimentoAgendaGroupDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  buttonLabel?: string;

  @IsIn(['abrir_agenda', 'cancelar_agendamento', 'acao_customizada'])
  @IsOptional()
  actionType?: 'abrir_agenda' | 'cancelar_agendamento' | 'acao_customizada';

  @IsString()
  @IsOptional()
  linkedAgendaId?: string;

  @IsString()
  @IsOptional()
  customActionKey?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  @IsOptional()
  sortOrder?: number;

  @IsString()
  @IsOptional()
  introMessage?: string;

  @IsString()
  @IsOptional()
  emptyMessage?: string;

  @IsString()
  @IsOptional()
  noImmediateAvailabilityMessage?: string;

  @IsString()
  @IsOptional()
  linkedUserName?: string;

  @IsEmail()
  @IsOptional()
  linkedEmail?: string;

  @IsString()
  @IsOptional()
  accentColor?: string;

  @IsIn(['not_linked', 'pending', 'connected'])
  @IsOptional()
  connectionStatus?: 'not_linked' | 'pending' | 'connected';

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @IsOptional()
  workdays?: number[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(14)
  @IsOptional()
  visibleBusinessDays?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  searchWindowDays?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  suggestedSlotsCount?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  @IsOptional()
  fallbackFutureSlotsCount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAtendimentoAgendaSlotDto)
  @IsOptional()
  slots?: UpdateAtendimentoAgendaSlotDto[];
}

export class UpdateAtendimentoAgendaDto {
  @IsString()
  @IsOptional()
  timezone?: string;

  @ValidateNested()
  @Type(() => UpdateAtendimentoAgendaInitialMessageDto)
  @IsOptional()
  initialMessage?: UpdateAtendimentoAgendaInitialMessageDto;

  @ValidateNested()
  @Type(() => UpdateAtendimentoAgendaFlowMessagesDto)
  @IsOptional()
  flowMessages?: UpdateAtendimentoAgendaFlowMessagesDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAtendimentoAgendaGroupDto)
  groups!: UpdateAtendimentoAgendaGroupDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  holidays?: string[];
}
