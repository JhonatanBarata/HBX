import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../../../auth/guards/master.guard';
import {
  RadarMissionQueueService,
  RadarMissionStage,
} from './radar-mission-queue.service';
import { MissionResultApplyService } from './mission-result-apply.service';

// ─── Contrato PULL da PONTE (Sprint 4 MOTOR-RFB-FILA) ──────────────────────────────────────────
// A fila mora na VPS; o nó LOCAL PUXA missão por HTTP — nunca push (sem porta aberta em casa; o
// scraping roda no IP residencial). Mesma cadeia de auth dos endpoints do dono (JWT + Master),
// como cnpj-backfill: cockpit → owner agent → ops-control → backend.
//
// POST /modules/owner/missions/lease            { workerId, stages?, batchSize?, leaseTtlSeconds? }
// POST /modules/owner/missions/:id/heartbeat    { leaseId }
// POST /modules/owner/missions/:id/complete     { leaseId, result? }         (idempotente)
// POST /modules/owner/missions/:id/fail         { leaseId, error?, retryable? } (idempotente)
// GET  /modules/owner/missions/stats
// POST /modules/owner/missions/redrive          { stage?, ids? }             (dead-letter → fila)
@Controller('modules/owner/missions')
@UseGuards(JwtAuthGuard, MasterGuard)
export class RadarMissionsController {
  constructor(
    private readonly missionQueue: RadarMissionQueueService,
    private readonly resultApply: MissionResultApplyService,
  ) {}

  @Post('lease')
  lease(@Body() body: {
    workerId?: string;
    stages?: string[];
    batchSize?: number;
    correlationId?: string;
    leaseTtlSeconds?: number;
  }) {
    const leaseTtlSeconds = Number(body?.leaseTtlSeconds);
    return this.missionQueue.lease({
      workerId: String(body?.workerId || 'local-node'),
      stages: Array.isArray(body?.stages) ? (body.stages as RadarMissionStage[]) : null,
      batchSize: Number(body?.batchSize) || 1,
      correlationId: body?.correlationId || null,
      leaseTtlMs: Number.isFinite(leaseTtlSeconds) && leaseTtlSeconds > 0 ? leaseTtlSeconds * 1000 : null,
    });
  }

  @Post(':id/heartbeat')
  heartbeat(@Param('id') id: string, @Body() body: { leaseId?: string }) {
    return this.missionQueue.heartbeat(id, String(body?.leaseId || ''));
  }

  // Complete da PONTE: o resultado do 30B flui pelo CAMINHO ÚNICO de escrita ANTES de marcar completa.
  // Se a aplicação falhar de verdade (não "nada a fazer"), NÃO completa — devolve retryable=false do
  // apply só quando é erro de payload, senão deixa a missão pra fila (worker marca fail retryable).
  @Post(':id/complete')
  async complete(@Param('id') id: string, @Body() body: { leaseId?: string; result?: Record<string, unknown> }) {
    const leaseId = String(body?.leaseId || '');
    const ctx = await this.missionQueue.getLeasedContext(id, leaseId);
    if (ctx.ok && !ctx.alreadyCompleted) {
      const outcome = await this.resultApply.apply({ stage: ctx.stage, payload: ctx.payload, result: body?.result || null });
      if (!outcome.applied) {
        // aplicação falhou (write/update falhou ou lead sumiu) → NÃO completa; missão volta pra fila
        // via fail retryable do worker. Idempotente: reprocessar reaplica sem duplicar.
        return { ok: false, reason: `apply_failed:${outcome.reason || 'desconhecido'}`, retryable: outcome.reason !== 'lead_id_ausente' };
      }
    }
    return this.missionQueue.complete(id, leaseId, body?.result || null);
  }

  @Post(':id/fail')
  fail(@Param('id') id: string, @Body() body: { leaseId?: string; error?: string; retryable?: boolean }) {
    return this.missionQueue.fail(id, String(body?.leaseId || ''), body?.error || null, body?.retryable !== false);
  }

  @Get('stats')
  stats() {
    return this.missionQueue.stats();
  }

  @Post('redrive')
  redrive(@Body() body: { stage?: string; ids?: string[] }) {
    return this.missionQueue.redriveDead({
      stage: (body?.stage as RadarMissionStage) || null,
      ids: Array.isArray(body?.ids) ? body.ids : null,
    });
  }
}
