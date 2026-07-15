import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { isMissionQueueEnabled, PONTE_MISSION_STAGES, type RadarMissionStage } from './radar-mission-queue.service';

/**
 * STATUS DE IA POR LOTE DE LEADS (CHIP E3, 05/07) — a exigência central do dono: o cliente
 * PRECISA VER que a IA trabalha no lead dele e que ele está na fila. Este serviço é a fonte
 * ÚNICA e LEVE que a vitrine (leads/page.client.tsx) e o estoque de Vendas consultam por lote
 * de leadIds — nunca 1 request por card.
 *
 * Fonte: RadarMission (stages `enrich_lead`/`xray_note` da PONTE, CHIP E1) casada por
 * `payloadJson.radarLeadId` (dedupeKey é `lead:<id>`/`xray-note:<id>`, mas o lookup usa o
 * payload puro pra não acoplar ao formato da dedupeKey). NÃO confundir com o
 * `RadarLeadEnrichment`/`enrichmentStatus` histórico que a vitrine já expõe — são fontes
 * diferentes; este endpoint é o estado da fila da PONTE 30B especificamente.
 *
 * Flag `HBX_MISSION_QUEUE_ENABLED` OFF (degrade invisível): tudo vira `none` — a UI do cliente
 * não muda enquanto a ponte não estiver ligada em produção (D1).
 */

export type RadarPonteLeadStatus =
  | { state: 'none' }
  | { state: 'queued'; position: number; stage: RadarMissionStage; queuedAt: string; stale: boolean }
  | { state: 'processing'; stage: RadarMissionStage; startedAt: string | null }
  | {
      state: 'done';
      completedAt: string | null;
      summary: { phonesAdded: number; emailsAdded: number; hasNote: boolean; noteScore: number | null };
    };

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
    return isMissionQueueEnabled();
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
    // A fila aceita somente as duas missões da PONTE local.
    const rows = await db.radarMission.findMany({
      where: {
        stage: { in: PONTE_MISSION_STAGES as unknown as string[] },
        status: { in: ['queued', 'leased', 'completed'] },
      },
      select: {
        id: true, stage: true, status: true, payloadJson: true, resultJson: true,
        createdAt: true, heartbeatAt: true, completedAt: true, nextAttemptAt: true,
      },
      orderBy: [{ priority: 'desc' }, { nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: 5000,
    }).catch(() => []);

    // Posição ordinal: ordem entre as missões `queued` (aproxima o "lugar na fila" sem contar
    // exatamente quantos workers existem — o pedido do plano é "posição aproximada").
    let queuedOrdinal = 0;
    const byLead = new Map<string, { queued?: any; leased?: any; completed?: any }>();
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
        // guarda o mais recente completed (pode haver enrich_lead + xray_note completos)
        if (!bucket.completed || (row.completedAt && row.completedAt > bucket.completed.completedAt)) {
          bucket.completed = row;
        }
      }
    }

    const now = Date.now();
    const completedLeadIds: string[] = [];
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
      if (bucket.completed) {
        completedLeadIds.push(id);
        result[id] = {
          state: 'done',
          completedAt: bucket.completed.completedAt instanceof Date ? bucket.completed.completedAt.toISOString() : null,
          summary: { phonesAdded: 0, emailsAdded: 0, hasNote: false, noteScore: null },
        };
      }
    }

    if (completedLeadIds.length) await this.fillDoneSummaries(result, completedLeadIds);
    return result;
  }

  /** Resumo do que chegou pros leads `done`: +N telefones/e-mails (LeadContact source
   * ai_extraction) e a nota ICP (RadarLeadPool.metadataJson.aiNote), gravados pelo
   * MissionResultApplyService (caminho único — ver E1). Falha aqui nunca derruba o status geral. */
  private async fillDoneSummaries(result: RadarPonteStatusMap, leadIds: string[]): Promise<void> {
    const db = this.db();
    try {
      const [contactRows, leadRows] = await Promise.all([
        (await this.prisma.hasTable('LeadContact').catch(() => false))
          ? db.leadContact.findMany({
              where: { radarLeadId: { in: leadIds }, source: 'ai_extraction' },
              select: { radarLeadId: true, kind: true },
            }).catch(() => [])
          : Promise.resolve([]),
        (await this.prisma.hasTable('RadarLeadPool').catch(() => false))
          ? db.radarLeadPool.findMany({
              where: { id: { in: leadIds } },
              select: { id: true, metadataJson: true },
            }).catch(() => [])
          : Promise.resolve([]),
      ]);

      const contactCounts = new Map<string, { phones: number; emails: number }>();
      for (const row of Array.isArray(contactRows) ? contactRows : []) {
        const leadId = String(row?.radarLeadId || '');
        if (!leadId) continue;
        const bucket = contactCounts.get(leadId) || { phones: 0, emails: 0 };
        if (row.kind === 'phone') bucket.phones++;
        else if (row.kind === 'email') bucket.emails++;
        contactCounts.set(leadId, bucket);
      }

      const noteByLead = new Map<string, { hasNote: boolean; noteScore: number | null }>();
      for (const row of Array.isArray(leadRows) ? leadRows : []) {
        const leadId = String(row?.id || '');
        if (!leadId) continue;
        const meta = this.parseJson(row?.metadataJson);
        const aiNote = meta?.aiNote;
        const notaIcp = aiNote?.notaIcp;
        const nota = Number.isFinite(Number(notaIcp)) ? Number(notaIcp) : null;
        noteByLead.set(leadId, { hasNote: Boolean(aiNote), noteScore: nota });
      }

      for (const leadId of leadIds) {
        const current = result[leadId];
        if (!current || current.state !== 'done') continue;
        const counts = contactCounts.get(leadId) || { phones: 0, emails: 0 };
        const note = noteByLead.get(leadId) || { hasNote: false, noteScore: null };
        current.summary = {
          phonesAdded: counts.phones,
          emailsAdded: counts.emails,
          hasNote: note.hasNote,
          noteScore: note.noteScore,
        };
      }
    } catch {
      // Falha no resumo NUNCA derruba o status "done" — o badge some sem o detalhe (+N), não trava.
    }
  }

  private parseJson(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
    try { return JSON.parse(String(value)) || {}; } catch { return {}; }
  }
}
