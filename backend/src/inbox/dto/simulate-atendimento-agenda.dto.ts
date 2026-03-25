import { IsBoolean, IsOptional, IsString, IsIn } from 'class-validator';

export class SimulateAtendimentoAgendaDto {
  @IsString()
  groupId!: string;

  @IsIn(['abrir_guia', 'confirmar_agendamento', 'cancelar_agendamento'])
  @IsOptional()
  stage?: 'abrir_guia' | 'confirmar_agendamento' | 'cancelar_agendamento';

  @IsString()
  @IsOptional()
  selectedSlotId?: string;

  @IsString()
  @IsOptional()
  referenceDate?: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  attendantName?: string;

  @IsBoolean()
  @IsOptional()
  hasActiveBooking?: boolean;
}
