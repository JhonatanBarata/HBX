import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LeadContactWriteService } from '../persistence/lead-contact-write.service';
import type { LeadContactCandidate } from '../persistence/lead-contact-gate';
import { inspectRadarPaidAcquisitionProof } from './radar-paid-acquisition-proof';

/**
 * APLICAÇÃO DE RESULTADO DE MISSÃO DA PONTE (CHIP E1, 05/07).
 *
 * O worker local da ponte (hbx-owner/local-agent) NUNCA escreve no banco direto — ele roda o 30B,
 * gera o resultado bruto e o devolve no `complete`. É AQUI, no backend, que o resultado flui pelo
 * CAMINHO ÚNICO de escrita:
 *   - `enrich_lead`  → contatos passam pelo LeadContactWriteService (gate anti-alucinação SEMPRE,
 *                      source `ai_extraction` conf. 60, proveniência literal contra a `sourceText`).
 *   - `xray_note`    → nota ICP + resumo gravam no metadataJson do RadarLeadPool (mesma fonte de
 *                      evidência que o presenter já lê — sem migration, aditivo).
 *
 * IDEMPOTÊNCIA: o LeadContactWriteService já pula contato existente (radarLeadId, kind,
 * valueNormalized); a nota é um upsert de campo em metadataJson (reprocessar sobrescreve o mesmo
 * bloco `aiNote`, não duplica). Reaplicar a mesma missão é seguro por construção.
 *
 * O gate roda no BACKEND (fonte única da verdade), com a `sourceText` que o worker devolveu — o
 * worker até roda o gate localmente pra economizar, mas quem MANDA é este caminho. Sem `sourceText`,
 * a proveniência literal reprova tudo (rede de segurança: nada entra sem fonte pra conferir).
 */

export type MissionResultApplyOutcome = {
  applied: boolean;
  kind: 'contacts' | 'note' | 'noop';
  written?: number;
  skipped?: number;
  rejected?: number;
  reason?: string;
};

@Injectable()
export class MissionResultApplyService {
  private readonly logger = new Logger(MissionResultApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadContactWrite: LeadContactWriteService,
  ) {}

  private db() {
    return this.prisma as any;
  }

  /**
   * Aplica o resultado de uma missão da ponte. Chamado pelo handler de `complete` ANTES de marcar a
   * missão completa — se a aplicação falhar de verdade (não só "nada a fazer"), o handler pode negar
   * o complete e devolver a missão pra fila (o worker marca fail retryable).
   */
  async apply(input: {
    stage: string;
    payload: Record<string, unknown> | null | undefined;
    result: Record<string, unknown> | null | undefined;
  }): Promise<MissionResultApplyOutcome> {
    const stage = String(input?.stage || '').trim();
    const result = (input?.result || {}) as Record<string, unknown>;
    const payload = (input?.payload || {}) as Record<string, unknown>;

    if (!['enrich_lead', 'xray_note'].includes(stage)) throw new Error(`RADAR_MISSION_STAGE_BLOCKED:${stage}`);
    if (!this.resolveLeadId(payload)) {
      return { applied: false, kind: stage === 'enrich_lead' ? 'contacts' : 'note', reason: 'lead_id_ausente' };
    }
    const db = this.db();
    const execute = async (tx: any) => {
      const proof = await inspectRadarPaidAcquisitionProof(tx, payload);
      if ('reason' in proof) {
        return { applied: false, kind: stage === 'enrich_lead' ? 'contacts' : 'note', reason: `paid_proof_${proof.reason}` } as MissionResultApplyOutcome;
      }
      if (stage === 'enrich_lead') return this.applyContacts(payload, result, tx);
      return this.applyNote(payload, result, tx);
    };
    // Serializavel fecha a janela entre validar o ledger e persistir o resultado:
    // refund concorrente faz uma das transacoes repetir/falhar, nunca grava PII
    // silenciosamente depois da revogacao.
    if (typeof db.$transaction === 'function') {
      return db.$transaction((tx: any) => execute(tx), { isolationLevel: 'Serializable' });
    }
    return execute(db);
  }

  private resolveLeadId(payload: Record<string, unknown>): string {
    // O worker nao escolhe o destino da escrita. O lead vem exclusivamente do
    // payload cercado pela prova paga persistida na missao.
    return String(payload?.radarLeadId || '').trim();
  }

  /**
   * `enrich_lead`: o worker devolve o JSON BRUTO do 30B (telefones/emails/nome_dono) + a `sourceText`
   * crawleada. Aqui a gente reconstrói os candidatos e passa TUDO pelo LeadContactWriteService — o
   * gate reprova o que não existe literalmente na fonte. Alucinação morre no backend, não no worker.
   */
  private async applyContacts(
    payload: Record<string, unknown>,
    result: Record<string, unknown>,
    db: any,
  ): Promise<MissionResultApplyOutcome> {
    const leadId = this.resolveLeadId(payload);
    if (!leadId) return { applied: false, kind: 'contacts', reason: 'lead_id_ausente' };

    const sourceText = String(result?.sourceText || '');
    const phones = Array.isArray((result as any).telefones) ? (result as any).telefones.map(String) : [];
    const emails = Array.isArray((result as any).emails) ? (result as any).emails.map(String) : [];

    const candidates: LeadContactCandidate[] = [
      ...phones.map((value: string, idx: number) => ({
        kind: 'phone' as const, value, source: 'ai_extraction', confidence: 60, rank: idx + 1,
      })),
      ...emails.map((value: string, idx: number) => ({
        kind: 'email' as const, value, source: 'ai_extraction', confidence: 60, rank: idx + 1,
      })),
    ];

    if (!candidates.length) return { applied: true, kind: 'contacts', written: 0, skipped: 0, rejected: 0 };

    const outcome = await this.leadContactWrite
      .writeContacts(db, leadId, candidates, { sourceText })
      .catch((error) => {
        this.logger.warn(`aplicação de contatos falhou lead=${leadId}: ${error instanceof Error ? error.message : error}`);
        return null;
      });
    if (!outcome) return { applied: false, kind: 'contacts', reason: 'write_falhou' };
    return { applied: true, kind: 'contacts', written: outcome.written, skipped: outcome.skipped, rejected: outcome.rejected.length };
  }

  /**
   * `xray_note`: grava nota ICP (0-100) + resumo no metadataJson do lead (bloco `aiNote`). Aditivo,
   * idempotente (sobrescreve o mesmo bloco), sem migration. Só grava se a nota for um número válido
   * (rede de segurança: worker que degradou devolve nota null → noop, não zera a nota existente).
   */
  private async applyNote(
    payload: Record<string, unknown>,
    result: Record<string, unknown>,
    db: any,
  ): Promise<MissionResultApplyOutcome> {
    const leadId = this.resolveLeadId(payload);
    if (!leadId) return { applied: false, kind: 'note', reason: 'lead_id_ausente' };

    // null/undefined = worker degradou → nota nula (NÃO coagir null pra 0, que zeraria a nota existente).
    const notaValue = (result as any).notaIcp;
    const notaRaw = notaValue == null ? NaN : Number(notaValue);
    const nota = Number.isFinite(notaRaw) ? Math.max(0, Math.min(100, Math.round(notaRaw))) : null;
    const resumo = String((result as any).resumo || '').trim().slice(0, 140) || null;
    if (nota == null) return { applied: true, kind: 'note', reason: 'nota_nula_noop', written: 0 };

    if (!db?.radarLeadPool?.update) return { applied: false, kind: 'note', reason: 'sem_tabela' };

    try {
      const row = await db.radarLeadPool.findUnique({ where: { id: leadId }, select: { metadataJson: true } }).catch(() => null);
      if (!row) return { applied: false, kind: 'note', reason: 'lead_nao_encontrado' };
      let metadata: Record<string, unknown> = {};
      if (row.metadataJson) {
        try { metadata = JSON.parse(String(row.metadataJson)) || {}; } catch { metadata = {}; }
      }
      metadata.aiNote = {
        notaIcp: nota,
        resumo,
        model: String((result as any).model || 'qwen3:30b-a3b-instruct-2507-q4_K_M'),
        at: new Date().toISOString(),
        source: 'ponte_30b',
      };
      await db.radarLeadPool.update({ where: { id: leadId }, data: { metadataJson: JSON.stringify(metadata) } });
      return { applied: true, kind: 'note', written: 1 };
    } catch (error) {
      this.logger.warn(`aplicação de nota falhou lead=${leadId}: ${error instanceof Error ? error.message : error}`);
      return { applied: false, kind: 'note', reason: 'update_falhou' };
    }
  }
}
