import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isLocalDeepEnrichmentQueueEnabled,
  LOCAL_DEEP_ENRICH_STAGE,
  type RadarMissionStage,
} from './radar-mission-queue.service';

/**
 * STATUS DE IA POR LOTE DE LEADS (CHIP E3, 05/07) — a exigência central do dono: o cliente
 * PRECISA VER que a IA trabalha no lead dele e que ele está na fila. Este serviço é a fonte
 * ÚNICA e LEVE que a vitrine (leads/page.client.tsx) e o estoque de Vendas consultam por lote
 * de leadIds — nunca 1 request por card.
 *
 * Fonte: RadarMission (stage exclusivo `local_deep_enrich_v1`) casada por
 * `payloadJson.radarLeadId` (o lookup usa o
 * payload puro pra não acoplar ao formato da dedupeKey). NÃO confundir com o
 * `RadarLeadEnrichment`/`enrichmentStatus` do pipeline genérico (night-factory) que a vitrine já
 * expõe — são fontes DIFERENTES; este endpoint é o estado da fila da PONTE 30B especificamente.
 *
 * Flag `HBX_MISSION_QUEUE_ENABLED` OFF (degrade invisível): tudo vira `none` — a UI do cliente
 * não muda enquanto a ponte não estiver ligada em produção (D1).
 */

export type RadarPonteLeadStatus =
  | { state: 'none' }
  | { state: 'queued'; position: number; stage: RadarMissionStage; queuedAt: string; stale: boolean }
  | { state: 'processing'; stage: RadarMissionStage; startedAt: string | null }
  | {
      state: 'released';
      stage: RadarMissionStage;
      releasedAt: string | null;
      noNewData: boolean;
      receipt?: { missionId: string | null };
      delta?: { phonesAdded: number; emailsAdded: number; peopleAdded: number };
    }
  | { state: 'invalidated'; stage: RadarMissionStage; invalidatedAt: string | null };

export type RadarPonteStatusMap = Record<string, RadarPonteLeadStatus>;

/** TTL de honestidade (PLANO §6 E3): missão `queued` parada além disto sem progredir vira texto
 * "processa fora do horário de pico" em vez de contador de posição — nunca spinner eterno. */
const STALE_QUEUE_MS = 15 * 60_000;

@Injectable()
export class RadarPonteStatusService {
  constructor(private readonly prisma: PrismaService) {}

  private db() {
    return this.prisma as any;
  }

  enabled(): boolean {
    return isLocalDeepEnrichmentQueueEnabled();
  }

  /**
   * Status por lote — 1 query de missões + 1 de contatos (agregada), nunca N+1. `leadIds` já
   * devem estar filtrados pelo tenant do chamador (RBAC é responsabilidade do controller/service
   * que resolve `context.companyId` antes de chamar este método — aqui só se olha o que foi
   * pedido, sem lookup de ownership próprio pra não duplicar a regra do webscraping.service).
   */
  async getStatusForLeads(leadIds: string[]): Promise<RadarPonteStatusMap> {
    const ids = Array.from(new Set((leadIds || []).map((id) => String(id || '').trim()).filter(Boolean))).slice(0, 200);
    const result: RadarPonteStatusMap = {};
    for (const id of ids) result[id] = { state: 'none' };
    if (!ids.length) return result;
    if (!this.enabled()) return result;
    if (!(await this.prisma.hasTable('RadarMission').catch(() => false))) return result;

    const db = this.db();
    // Só a missão residencial exclusiva; stages do VPS e o enrich_lead legado nunca vazam aqui.
    const rows = await db.radarMission.findMany({
      where: {
        stage: LOCAL_DEEP_ENRICH_STAGE,
        status: { in: ['queued', 'leased', 'completed', 'dead', 'canceled'] },
      },
      select: {
        id: true, stage: true, status: true, payloadJson: true, resultJson: true, receiptJson: true,
        createdAt: true, updatedAt: true, heartbeatAt: true, completedAt: true, nextAttemptAt: true,
      },
      orderBy: [{ priority: 'desc' }, { nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: 5000,
    }).catch(() => []);

    // Posição ordinal: ordem entre as missões `queued` (aproxima o "lugar na fila" sem contar
    // exatamente quantos workers existem — o pedido do plano é "posição aproximada").
    let queuedOrdinal = 0;
    const byLead = new Map<string, { queued?: any; leased?: any; completed?: any; invalidated?: any }>();
    for (const row of rows as any[]) {
      const payload = this.parseJson(row?.payloadJson);
      const leadId = String(payload?.radarLeadId || '').trim();
      if (!leadId || !ids.includes(leadId)) {
        if (String(row?.status) === 'queued') queuedOrdinal++; // conta pra posição mesmo se não for um dos IDs pedidos
        continue;
      }
      if (!byLead.has(leadId)) byLead.set(leadId, {});
      const bucket = byLead.get(leadId)!;
      if (row.status === 'queued') {
        queuedOrdinal++;
        // fica a PRIMEIRA missão queued do lead (a mais antiga/prioritária, já que a query vem ordenada)
        if (!bucket.queued) bucket.queued = { ...row, ordinal: queuedOrdinal };
      } else if (row.status === 'leased') {
        if (!bucket.leased) bucket.leased = row;
      } else if (row.status === 'completed') {
        // guarda o completed mais recente da missão local para o lead
        if (!bucket.completed || (row.completedAt && row.completedAt > bucket.completed.completedAt)) {
          bucket.completed = row;
        }
      } else if (row.status === 'dead' || row.status === 'canceled') {
        if (!bucket.invalidated || (row.updatedAt && row.updatedAt > bucket.invalidated.updatedAt)) {
          bucket.invalidated = row;
        }
      }
    }

    const now = Date.now();
    for (const id of ids) {
      const bucket = byLead.get(id);
      if (!bucket) continue; // permanece 'none'
      if (bucket.leased) {
        result[id] = {
          state: 'processing',
          stage: bucket.leased.stage,
          startedAt: bucket.leased.heartbeatAt instanceof Date ? bucket.leased.heartbeatAt.toISOString()
            : bucket.leased.createdAt instanceof Date ? bucket.leased.createdAt.toISOString() : null,
        };
        continue;
      }
      if (bucket.queued) {
        const queuedAtDate = bucket.queued.createdAt instanceof Date ? bucket.queued.createdAt : null;
        const ageMs = queuedAtDate ? now - queuedAtDate.getTime() : 0;
        result[id] = {
          state: 'queued',
          position: bucket.queued.ordinal,
          stage: bucket.queued.stage,
          queuedAt: queuedAtDate ? queuedAtDate.toISOString() : new Date().toISOString(),
          stale: ageMs >= STALE_QUEUE_MS,
        };
        continue;
      }
      const completedAtMs = bucket.completed?.completedAt instanceof Date ? bucket.completed.completedAt.getTime() : 0;
      const invalidatedAtMs = bucket.invalidated?.updatedAt instanceof Date ? bucket.invalidated.updatedAt.getTime() : 0;
      if (bucket.completed && completedAtMs >= invalidatedAtMs) {
        const detail = this.readMissionDelta(bucket.completed);
        result[id] = {
          state: 'released',
          stage: bucket.completed.stage,
          releasedAt: bucket.completed.completedAt instanceof Date ? bucket.completed.completedAt.toISOString() : null,
          noNewData: detail.noNewData,
          receipt: { missionId: String(bucket.completed.id || '') || null },
          delta: detail.delta,
        };
        continue;
      }
      if (bucket.invalidated) {
        result[id] = {
          state: 'invalidated',
          stage: bucket.invalidated.stage,
          invalidatedAt: bucket.invalidated.updatedAt instanceof Date ? bucket.invalidated.updatedAt.toISOString() : null,
        };
      }
    }
    return result;
  }

  /** Conta apenas o recibo/delta DESTA missão. Nunca consulta contatos históricos do lead. */
  private readMissionDelta(row: any) {
    const result = this.parseJson(row?.resultJson);
    const materialReceipt = this.parseJson(row?.receiptJson);
    const receipt = Object.keys(materialReceipt).length ? materialReceipt : this.parseJson(result?.receipt || result);
    const summary = this.parseJson(result?.delta || result?.summary || receipt?.delta || receipt?.summary);
    const createdContacts = Array.isArray(receipt?.createdContacts) ? receipt.createdContacts : [];
    const createdPeople = Array.isArray(receipt?.createdPersonIds) ? receipt.createdPersonIds : [];
    const countKind = (kind: string) => createdContacts.filter((contact: any) => String(contact?.kind || '') === kind).length;
    const phonesAdded = Math.max(0, Number(summary?.phonesAdded) || countKind('phone'));
    const emailsAdded = Math.max(0, Number(summary?.emailsAdded) || countKind('email'));
    const peopleAdded = Math.max(0, Number(summary?.peopleAdded) || createdPeople.length);
    const noNewData = Boolean(result?.noNewData ?? receipt?.noNewData ?? (phonesAdded + emailsAdded + peopleAdded === 0));
    return { noNewData, delta: { phonesAdded, emailsAdded, peopleAdded } };
  }

  private parseJson(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
    try { return JSON.parse(String(value)) || {}; } catch { return {}; }
  }
}
