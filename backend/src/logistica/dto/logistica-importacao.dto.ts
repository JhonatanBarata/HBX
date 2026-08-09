import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * F4 (27/07, PR27072026-ROTA-3-NIVEIS) — DTOs de ESCRITA da quarentena de
 * importação ("máquina de engolir lista podre"). Mesmo padrão do resto do módulo:
 * class-validator + ValidationPipe global (whitelist + forbidNonWhitelisted +
 * transform) — só campo declarado passa; companyId/userId NUNCA vêm do body, saem
 * sempre do JWT no controller.
 */

// ── criar lote por TEXTO colado (WhatsApp/caderno de papel) ─────────────────────
export class CriarLoteTextoDto {
  @IsString()
  @MaxLength(40000)
  texto!: string;

  // Rota real quase nunca repete a cidade em toda linha — o operador informa 1x.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidadePadrao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  ufPadrao?: string;
}

// ── criar lote por ARQUIVO (xlsx/csv) — nomeArquivo vem do multipart, sem DTO de body.

// ── corrigir um item (PATCH) — revalida sanitização depois de aplicado ───────────
export class PatchImportacaoItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nome?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  endereco?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  numero?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bairro?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  uf?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(9)
  cep?: string | null;

  // ISO 1=segunda…7=domingo (mesma convenção de ClienteProduto.diasSemana).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  diasSemana?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  produtoId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  qtd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  valorUnit?: number;
}

// ── efetivar (lote inteiro ou itens selecionados) ────────────────────────────────
export class EfetivarLoteDto {
  // Ausente/vazio = efetivar TODOS os itens VERDE do lote.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  itemIds?: string[];
}

// Listagem de lotes/itens usa @Query() cru (string) no controller + Number() na
// service — MESMO padrão de nucleo.controller.ts (listEmpresas/listContatos), sem
// DTO: página/status de querystring não passam pelo ValidationPipe de class-validator
// aqui (evita a pegadinha de @IsInt() exigir number e receber string da URL).
