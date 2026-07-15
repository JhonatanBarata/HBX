import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../../../auth/guards/master.guard';
import { CnpjXrayService, estimateCnpjXrayCost } from './cnpj-xray.service';
import { parseAndValidateCnpjBatch } from './cnpj-xray-validate';

// ─── Contrato do painel Owner "Raio-X de CNPJ" (HOT-04, 02/07) — mesma cadeia de auth dos demais
// endpoints do dono (JWT + Master), igual fabrica/missions/cnpj-backfill.
//
// POST /modules/owner/cnpj-xray/estimate  { cnpjs: string[], layers: string[] }   (não cria job — só orçamento)
// POST /modules/owner/cnpj-xray/start     { cnpjs: string[] (máx 10k), layers: string[] }
// GET  /modules/owner/cnpj-xray/jobs                 (histórico, mais recentes primeiro)
// GET  /modules/owner/cnpj-xray/jobs/:id             (status de 1 job)
// GET  /modules/owner/cnpj-xray/jobs/:id/download    (XLSX — só quando status=done)
@Controller('modules/owner/cnpj-xray')
@UseGuards(JwtAuthGuard, MasterGuard)
export class CnpjXrayController {
  constructor(private readonly xray: CnpjXrayService) {}

  /** Orçamento por camada ANTES de iniciar — dedup+valida na hora (síncrono, é só contagem). */
  @Post('estimate')
  estimate(@Body() body: { cnpjs?: string[]; layers?: string[] }) {
    const rawLines = Array.isArray(body?.cnpjs) ? body.cnpjs.map(String) : [];
    const { valid, invalid } = parseAndValidateCnpjBatch(rawLines);
    const layers = (Array.isArray(body?.layers) ? body.layers : ['cadastral']) as any;
    const estimate = estimateCnpjXrayCost(valid.length, layers.length ? layers : ['cadastral']);
    return { validCount: valid.length, invalidCount: invalid.length, invalidReport: invalid.slice(0, 200), estimate };
  }

  @Post('start')
  start(@Req() req: any, @Body() body: { cnpjs?: string[]; layers?: string[] }) {
    return this.xray.start({
      cnpjs: Array.isArray(body?.cnpjs) ? body.cnpjs : [],
      layers: Array.isArray(body?.layers) ? body.layers : [],
      requestedByUserId: Number(req?.user?.id) || null,
    });
  }

  @Get('jobs')
  listJobs(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : undefined;
    return this.xray.listJobs(Number.isFinite(parsed) ? parsed : 50);
  }

  @Get('jobs/:id')
  jobStatus(@Param('id') id: string) {
    return this.xray.status(id);
  }

  @Get('jobs/:id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const found = await this.xray.resolveDownloadPath(id);
    if (!found) {
      res.status(404).json({ ok: false, reason: 'job_nao_encontrado_ou_nao_concluido' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${found.fileName}"`,
      'Cache-Control': 'no-store',
    });
    createReadStream(found.path).pipe(res);
  }
}
