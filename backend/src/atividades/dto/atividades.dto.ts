import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ATIVIDADE_TIPOS = ['ligacao', 'reuniao', 'visita', 'mensagem'] as const;
export type AtividadeTipo = (typeof ATIVIDADE_TIPOS)[number];

// Resultado de conclusao — "atendeu? sim/nao/remarcar" (1 tap). Texto livre tambem
// aceito (ate 280) para observacao curta; o engajamento so olha o rotulo canonico.
export const ATIVIDADE_RESULTADOS = ['sim', 'nao', 'remarcar'] as const;

export class CreateAtividadeDto {
  @IsString()
  @MaxLength(64)
  leadId!: string;

  @IsOptional()
  @IsIn(ATIVIDADE_TIPOS as unknown as string[])
  tipo?: AtividadeTipo;

  @IsString()
  @MaxLength(160)
  titulo!: string;

  // Vencimento em ISO (data ou data+hora). "dia inteiro" = sem duracao.
  @IsISO8601()
  vencimento!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  duracao?: number;

  // Responsavel opcional; se ausente, o service assume o proprio usuario.
  @IsOptional()
  @IsInt()
  @Min(1)
  responsavelId?: number;
}

export class UpdateAtividadeDto {
  @IsOptional()
  @IsIn(ATIVIDADE_TIPOS as unknown as string[])
  tipo?: AtividadeTipo;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  titulo?: string;

  @IsOptional()
  @IsISO8601()
  vencimento?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  duracao?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  responsavelId?: number | null;
}

export class ConcluirAtividadeDto {
  // "atendeu? sim/nao/remarcar" — 1 tap. Livre tambem aceito (observacao curta).
  @IsOptional()
  @IsString()
  @MaxLength(280)
  resultado?: string;

  // remarcar → nova data da tarefa (cria uma proxima ao inves de so fechar).
  @IsOptional()
  @IsISO8601()
  remarcarPara?: string;
}

export class ListAtividadesQueryDto {
  // Escopo temporal da tela "Hoje": atrasadas | hoje | semana | todas.
  @IsOptional()
  @IsIn(['atrasadas', 'hoje', 'semana', 'todas'])
  janela?: 'atrasadas' | 'hoje' | 'semana' | 'todas';

  @IsOptional()
  @IsIn(ATIVIDADE_TIPOS as unknown as string[])
  tipo?: AtividadeTipo;

  // Filtro por responsavel (so admin/gerente ve outros; vendedor ve so o proprio).
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  responsavelId?: number;

  // Incluir concluidas na listagem (default: so pendentes na tela Hoje).
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  incluirConcluidas?: boolean;
}
