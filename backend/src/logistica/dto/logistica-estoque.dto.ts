import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * PR27072026 F2 (27/07) — DTOs de ESCRITA do ESTOQUE DE CARGA (conferência de
 * caminhão do dia — NÃO é almoxarifado/WMS). Mesmo padrão do resto do módulo:
 * class-validator + ValidationPipe global (whitelist + forbidNonWhitelisted +
 * transform) — só campo declarado passa; companyId/userId NUNCA vêm do body,
 * saem sempre do JWT no controller.
 */

// ── declarar a carga do dia (o que subiu no caminhão) ────────────────────────
export class CargaDiaItemDeclararDto {
  @IsInt()
  @Min(1)
  productId!: number;

  @IsInt()
  @Min(0)
  @Max(999999)
  qtdCarregada!: number;
}

export class DeclararCargaDiaDto {
  // Dia civil SP (YYYY-MM-DD); ausente = hoje (canonicalRouteDate no serviço).
  @IsOptional()
  @IsString()
  @MaxLength(10)
  dataISO?: string;

  // MVP é 1 caminhão/empresa/dia (o front nem seleciona motorista); ausente =
  // caminhão único da empresa. Aceito aqui só pra não fechar a porta pro futuro
  // multi-caminhão — sem UI hoje.
  @IsOptional()
  @IsInt()
  @Min(1)
  entregadorId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CargaDiaItemDeclararDto)
  itens!: CargaDiaItemDeclararDto[];
}

// ── conferir o retorno (fim do dia) ──────────────────────────────────────────
export class CargaDiaItemRetornoDto {
  @IsInt()
  @Min(1)
  productId!: number;

  @IsInt()
  @Min(0)
  @Max(999999)
  qtdRetorno!: number;
}

export class ConferirRetornoCargaDiaDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  dataISO?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  entregadorId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CargaDiaItemRetornoDto)
  itens!: CargaDiaItemRetornoDto[];
}
