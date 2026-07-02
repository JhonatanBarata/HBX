import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../../../../auth/guards/master.guard';
import { CnpjBaseContatoFilter, CnpjBaseQueryInput, CnpjBaseQueryService } from './cnpj-base-query.service';

// ─── HOT-02 + HOT-03 (fundidos) — "Base Receita" ──────────────────────────────────────────────
// Contrato consumido pela aba nova do :3107 (hbx-owner/local-agent/web) via proxy do local-agent
// (server.js). Mesma cadeia de auth dos demais endpoints do dono (JWT + Master).
//
// POST /modules/owner/cnpj-base/query        { ...filtros }        -> { count, sample[20], cursorNext, statsAmostra }
// POST /modules/owner/cnpj-base/materialize  { ...filtros, maxItems } -> { ok, batchId, requested, counts }
// GET  /modules/owner/cnpj-base/cities?q=    -> { items: [{ normalizedCity, city, state }] }
// GET  /modules/owner/cnpj-base/cnaes?q=     -> { items: [{ codigo, descricao }] }
// GET  /modules/owner/cnpj-base/stats?group= -> { groups, generatedAt } (cache pos-import, nunca live)

class CnpjBaseContatoDto implements CnpjBaseContatoFilter {
  @IsOptional() @IsBoolean() comEmail?: boolean;
  @IsOptional() @IsBoolean() comCelular?: boolean;
  @IsOptional() @IsBoolean() comTelefone?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) maxPhoneShare?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) maxEmailShare?: number;
  @IsOptional() @IsBoolean() blocklistEmail?: boolean;
}

class CnpjBaseQueryDto implements CnpjBaseQueryInput {
  @IsOptional() @IsArray() @IsString({ each: true }) cnaes?: string[];
  @IsOptional() @IsBoolean() cnaePrincipalOnly?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) naturezas?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) situacoes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) porte?: string[];
  @IsOptional() @IsBoolean() mei?: boolean;
  @IsOptional() @IsBoolean() simples?: boolean;
  @IsOptional() @IsIn(['matriz', 'filial']) matrizFilial?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) capitalMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) capitalMax?: number;
  // regime aceito mas IGNORADO no WHERE (fase 2 da RFB, sempre NULL hoje — ver cnpj-base-query.service.ts).
  @IsOptional() @IsString() regime?: string;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) cities?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) states?: string[];
  @IsOptional() @IsString() ddd?: string;
  @IsOptional() @IsString() abertaDe?: string;
  @IsOptional() @IsString() abertaAte?: string;
  @IsOptional() @IsObject() contato?: CnpjBaseContatoDto;
  @IsOptional() @IsBoolean() excluirJaEntregues?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;
  @IsOptional() @IsString() cursor?: string | null;
}

class CnpjBaseMaterializeDto extends CnpjBaseQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) maxItems?: number;
}

@Controller('modules/owner/cnpj-base')
@UseGuards(JwtAuthGuard, MasterGuard)
export class CnpjBaseController {
  constructor(private readonly cnpjBaseQuery: CnpjBaseQueryService) {}

  @Post('query')
  query(@Body() dto: CnpjBaseQueryDto) {
    return this.cnpjBaseQuery.query(dto || {});
  }

  @Post('materialize')
  materialize(@Req() req: any, @Body() dto: CnpjBaseMaterializeDto) {
    return this.cnpjBaseQuery.materialize(req.user, dto || {});
  }

  @Get('cities')
  cities(@Query('q') q?: string) {
    return this.cnpjBaseQuery.searchCities(q || '');
  }

  @Get('cnaes')
  cnaes(@Query('q') q?: string) {
    return this.cnpjBaseQuery.searchCnaes(q || '');
  }

  @Get('stats')
  stats(@Query('group') group?: string) {
    return this.cnpjBaseQuery.getStats(group);
  }
}
