import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../../../auth/guards/master.guard';
import { CnpjXrayService, estimateCnpjXrayCost } from './cnpj-xray.service';
import { parseAndValidateCnpjBatch } from './cnpj-xray-validate';

// ─── Contrato do painel Owner "Raio-X de CNPJ" (HOT-04, 02/07) — mesma cadeia de auth dos demais
// endpoints do dono (JWT + Master). Este modulo le somente a base RFB local.
//
// POST /modules/owner/cnpj-xray/estimate  { cnpjs: string[] }   (nao cria job, so estimativa local)
// POST /modules/owner/cnpj-xray/start     { cnpjs: string[] (max 10k) }
// GET  /modules/owner/cnpj-xray/jobs                 (histórico, mais recentes primeiro)
// GET  /modules/owner/cnpj-xray/jobs/:id             (status de 1 job)
// GET  /modules/owner/cnpj-xray/jobs/:id/download    (XLSX — só quando status=done)
@Controller('modules/owner/cnpj-xray')
@UseGuards(JwtAuthGuard, MasterGuard)
export class CnpjXrayController {
  constructor(private readonly xray: CnpjXrayService) {}

  /** Estimativa cadastral local. */
  @Post('estimate')
  estimate(@Body() body: { cnpjs?: string[] }) {
    const rawLines = Array.isArray(body?.cnpjs) ? body.cnpjs.map(String) : [];
    const { valid, invalid } = parseAndValidateCnpjBatch(rawLines);
    const estimate = estimateCnpjXrayCost(valid.length);
    return { validCount: valid.length, invalidCount: invalid.length, invalidReport: invalid.slice(0, 200), estimate };
  }

  @Post('start')
  start(@Req() req: any, @Body() body: { cnpjs?: string[] }) {
    return this.xray.start({
      cnpjs: Array.isArray(body?.cnpjs) ? body.cnpjs : [],
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
