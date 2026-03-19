import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class UpdateAtendimentoAgendaSlotDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  label?: string;

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
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  buttonLabel?: string;

  @IsString()
  @IsOptional()
  introMessage?: string;

  @IsString()
  @IsOptional()
  emptyMessage?: string;

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAtendimentoAgendaGroupDto)
  groups!: UpdateAtendimentoAgendaGroupDto[];
}
