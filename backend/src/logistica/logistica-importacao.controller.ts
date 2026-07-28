import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { LogisticaImportacaoService } from './logistica-importacao.service';
import { CriarLoteTextoDto, EfetivarLoteDto, PatchImportacaoItemDto } from './dto/logistica-importacao.dto';

/**
 * F4 (27/07, PR27072026-ROTA-3-NIVEIS) — `/logistica/importacao`, a "boca única"
 * de onboarding (arquivo/texto/foto) + quarentena. Mesmo gate de
 * logistica-base-saude.controller.ts (`@Admin()` — criar cliente em massa é ação
 * gerencial, não do motorista); controller PRÓPRIO, arquivo novo, zero edição nos
 * controllers vizinhos que outra frente edita em paralelo.
 */
@Controller('logistica/importacao')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@ModuleAccess('logistica')
@Admin()
export class LogisticaImportacaoController {
  constructor(private readonly importacao: LogisticaImportacaoService) {}

  private companyId(req: any): number {
    const companyId = Math.trunc(Number(req?.user?.companyId || 0));
    if (!companyId) throw new ForbiddenException('Empresa não identificada.');
    return companyId;
  }

  private userId(req: any): number {
    return Math.trunc(Number(req?.user?.id || 0)) || 0;
  }

  // ── criação de lote (3 bocas) ────────────────────────────────────────────────

  @Post('lote/arquivo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  criarLoteArquivo(@Req() req: any, @UploadedFile() file: any) {
    return this.importacao.criarLoteArquivo(this.companyId(req), this.userId(req), file);
  }

  @Post('lote/texto')
  criarLoteTexto(@Req() req: any, @Body() dto: CriarLoteTextoDto) {
    return this.importacao.criarLoteTexto(this.companyId(req), this.userId(req), dto);
  }

  @Post('lote/foto')
  @UseInterceptors(FilesInterceptor('files', 20, { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  criarLoteFoto(@Req() req: any, @UploadedFiles() files: any[]) {
    return this.importacao.criarLoteFoto(this.companyId(req), this.userId(req), files);
  }

  // ── leitura ──────────────────────────────────────────────────────────────────

  @Get('lotes')
  listarLotes(@Req() req: any, @Query('status') status?: string, @Query('page') page?: string) {
    return this.importacao.listarLotes(this.companyId(req), { status, page: page ? Number(page) : undefined });
  }

  @Get('lote/:id')
  obterLote(
    @Req() req: any,
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.importacao.obterLote(this.companyId(req), id, { status, page: page ? Number(page) : undefined });
  }

  // ── correção manual ──────────────────────────────────────────────────────────

  @Patch('lote/:id/item/:itemId')
  corrigirItem(
    @Req() req: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: PatchImportacaoItemDto,
  ) {
    return this.importacao.corrigirItem(this.companyId(req), id, itemId, dto);
  }

  // ── sanitizar (CNEFE em lote, repetível) ─────────────────────────────────────

  @Post('lote/:id/sanitizar')
  sanitizarLote(@Req() req: any, @Param('id') id: string) {
    return this.importacao.sanitizarLote(this.companyId(req), id);
  }

  // ── efetivar / descartar ─────────────────────────────────────────────────────

  @Post('lote/:id/efetivar')
  efetivarLote(@Req() req: any, @Param('id') id: string, @Body() dto: EfetivarLoteDto) {
    return this.importacao.efetivarLote(this.companyId(req), this.userId(req), id, dto.itemIds);
  }

  @Post('lote/:id/descartar')
  descartarLote(@Req() req: any, @Param('id') id: string) {
    return this.importacao.descartarLote(this.companyId(req), id);
  }

  // ── foto pendente (visualização pra transcrição manual) ──────────────────────

  @Get('item/:itemId/foto')
  async fotoItem(@Req() req: any, @Res() res: Response, @Param('itemId') itemId: string) {
    const foto = await this.importacao.getFotoItem(this.companyId(req), itemId);
    res.setHeader('Content-Type', foto.contentType);
    res.setHeader('Content-Length', String(foto.byteSize));
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(foto.filename)}"`);
    res.end(foto.content);
  }
}
