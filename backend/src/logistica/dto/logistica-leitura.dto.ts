import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * PR20072026 W1 — DTOs de "Leitura de Rota" (docs/PLANEJAMENTOS/PR20072026/
 * SPEC-LEITURA-DE-ROTA.md + 00-ORQUESTRACAO.md, contrato = LEI).
 *
 * Mesmo padrão do módulo: class-validator + ValidationPipe global (whitelist +
 * forbidNonWhitelisted + transform). Só campos declarados passam.
 */

export const LEITURA_MODOS = ['LEITURA', 'MANUAL'] as const;
export type LeituraModo = (typeof LEITURA_MODOS)[number];

export class IniciarLeituraDto {
  @IsOptional()
  @IsIn(LEITURA_MODOS)
  modo?: LeituraModo;
}

// Cliente novo cadastrado em campo — endereço NUNCA digitado (GPS + reverse geocode
// como sugestão editável no app); backend só persiste o que vier preenchido.
export class LeituraClienteNovoDto {
  @IsString()
  @MaxLength(140)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cep?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  numero?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bairro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  uf?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  geoFonte?: string;
}

export class LeituraParadaItemDto {
  @IsInt()
  productId!: number;

  @IsInt()
  @Min(1)
  qtd!: number;

  @IsNumber()
  @Min(0)
  valorUnit!: number;
}

export class RegistrarLeituraParadaDto {
  @IsString()
  @MaxLength(80)
  clientKey!: string;

  @IsISO8601({ strict: true })
  capturadoEm!: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  customerProfileId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeituraClienteNovoDto)
  clienteNovo?: LeituraClienteNovoDto;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  localEntregaId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LeituraParadaItemDto)
  itens!: LeituraParadaItemDto[];

  @IsOptional()
  @IsBoolean()
  telefoneConfirmado?: boolean;

  @IsOptional()
  @IsBoolean()
  atualizarPrecoAcordado?: boolean;

  // PR20072026 (feedback dono) — observação operacional do cliente capturada no
  // passo "Observações" da parada (lembrete pro motorista na entrega). Persiste
  // em CustomerProfile.observacoes (mesmo campo do /cliente).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;
}

// PATCH — mesmos campos editáveis da parada (itens/qtd/valor).
export class UpdateLeituraParadaDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LeituraParadaItemDto)
  itens?: LeituraParadaItemDto[];

  @IsOptional()
  @IsBoolean()
  telefoneConfirmado?: boolean;

  @IsOptional()
  @IsBoolean()
  atualizarPrecoAcordado?: boolean;
}

export class FinalizarLeituraDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nome?: string;

  // PR20072026-ROTA-SALVA F1 — "rota salva sem dia": passa a ser OPCIONAL. Ausente
  // (undefined) ou explicitamente null grava LogisticaRotaModelo.diaSemana=null
  // (schema já é Int?). APK atual que ainda manda 1–7 continua funcionando igual.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  diaSemana?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  ordemParadaIds?: string[];
}
