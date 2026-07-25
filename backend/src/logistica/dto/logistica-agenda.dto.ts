import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const HORA_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AgendaPlanoItemDto {
  @IsInt()
  @Min(1)
  productId!: number;

  @IsInt()
  @Min(1)
  @Max(9999)
  qtd!: number;

  @IsNumber()
  @Min(0)
  @Max(1000000)
  valorUnit!: number;
}

export class AgendaJanelaDto {
  @IsOptional()
  @IsString()
  @Matches(HORA_PATTERN)
  inicio?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HORA_PATTERN)
  fim?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['RIGIDA', 'PREFERENCIAL'])
  tipo?: 'RIGIDA' | 'PREFERENCIAL' | null;
}

export class AgendaAcessoDto {
  @IsString()
  @IsIn(['TERREO', 'ESCADA', 'ELEVADOR', 'OUTRO'])
  tipo!: 'TERREO' | 'ESCADA' | 'ELEVADOR' | 'OUTRO';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  andares?: number | null;

  @IsOptional()
  @IsBoolean()
  temElevador?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  observacao?: string | null;
}

export class AgendaAdicionalDto {
  @IsString()
  @IsIn(['FIXO', 'POR_UNIDADE'])
  tipo!: 'FIXO' | 'POR_UNIDADE';

  @IsNumber()
  @Min(0)
  @Max(1000000)
  valor!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  motivo?: string | null;
}

export class CreateAgendaPlanoDto {
  @IsString()
  @MaxLength(80)
  customerProfileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  localId?: string | null;

  @IsInt()
  @Min(1)
  @Max(7)
  diaSemana!: number;

  @IsString()
  @IsIn(['SEMANAL', 'QUINZENAL', 'INTERVALO'])
  frequencia!: 'SEMANAL' | 'QUINZENAL' | 'INTERVALO';

  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(364)
  intervaloDias?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  proximaData?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgendaJanelaDto)
  janela?: AgendaJanelaDto | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  tempoParadaMin?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instrucoes?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgendaAcessoDto)
  acesso?: AgendaAcessoDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgendaAdicionalDto)
  adicional?: AgendaAdicionalDto | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AgendaPlanoItemDto)
  itens!: AgendaPlanoItemDto[];
}

export class UpdateAgendaPlanoDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  localId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  diaSemana?: number;

  @IsOptional()
  @IsString()
  @IsIn(['SEMANAL', 'QUINZENAL', 'INTERVALO'])
  frequencia?: 'SEMANAL' | 'QUINZENAL' | 'INTERVALO';

  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(364)
  intervaloDias?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  proximaData?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgendaJanelaDto)
  janela?: AgendaJanelaDto | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  tempoParadaMin?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instrucoes?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgendaAcessoDto)
  acesso?: AgendaAcessoDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgendaAdicionalDto)
  adicional?: AgendaAdicionalDto | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AgendaPlanoItemDto)
  itens?: AgendaPlanoItemDto[];
}

export class ReordenarAgendaDiaDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  planoIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  planoId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  posicao?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  depoisDePlanoId?: string | null;
}

export class ExecutarAgendaDiaAcaoDto {
  @IsString()
  @MaxLength(100)
  idempotencyKey!: string;

  @IsString()
  @IsIn(['PAUSAR', 'MOVER', 'CANCELAR'])
  acao!: 'PAUSAR' | 'MOVER' | 'CANCELAR';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  destinoDiaSemana?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  dataInicio?: string;

  @IsString()
  @IsIn(['MANTER', 'MOVER', 'CANCELAR'])
  entregasAbertas!: 'MANTER' | 'MOVER' | 'CANCELAR';
}

export class AplicarLegadoAgendaDto {
  @IsString()
  @MaxLength(100)
  idempotencyKey!: string;
}

// S2 — Importar sequência pronta. GETs read-only: sem @Body, sem validação de
// class-validator; os tipos aqui só documentam a resposta do service.
export interface AgendaSequenciaResumoDto {
  id: string;
  nome: string;
  diaSemana: number | null;
  totalParadas: number;
  updatedAt: string;
}

export interface AgendaImportarPreviewOrdemItemDto {
  planoId: string;
  clienteNome: string;
  posicao: number;
}

export interface AgendaImportarPreviewForaItemDto {
  planoId: string;
  clienteNome: string;
}

export interface AgendaImportarPreviewSemPlanoItemDto {
  clienteNome: string;
  endereco: string | null;
}

export interface AgendaImportarPreviewAmbiguoItemDto {
  planoId: string;
  clienteNome: string;
  motivo: string;
}

export interface AgendaImportarPreviewDto {
  ordem: AgendaImportarPreviewOrdemItemDto[];
  foraDaSequencia: AgendaImportarPreviewForaItemDto[];
  semPlano: AgendaImportarPreviewSemPlanoItemDto[];
  ambiguos: AgendaImportarPreviewAmbiguoItemDto[];
  aplicavel: boolean;
}

// S3 — Conferência de divergência plano×parada. GET read-only: mesmo motivo
// dos DTOs da S2, sem class-validator (nada aqui vira @Body).
export type AgendaDivergenciaTipoDto = 'SO_NO_PLANO' | 'SO_NA_ROTA' | 'DUPLICADO';

export interface AgendaDivergenciaItemDto {
  tipo: AgendaDivergenciaTipoDto;
  clienteNome: string;
  endereco: string | null;
  /** Só existe para SO_NO_PLANO (é o plano sem parada correspondente). */
  planoId?: string;
  detalhe: string;
}

export interface AgendaDivergenciasDto {
  total: number;
  itens: AgendaDivergenciaItemDto[];
  /** true = dia sem rota salva "espelho"; nunca é erro, só nada pra conferir. */
  semRotaSalva?: boolean;
}
