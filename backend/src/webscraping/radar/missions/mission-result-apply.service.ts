import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LeadContactWriteService } from '../persistence/lead-contact-write.service';
import type { LeadContactCandidate } from '../persistence/lead-contact-gate';

/**
 * APLICAÇÃO DE RESULTADO DE MISSÃO DA PONTE (CHIP E1, 05/07).
 *
 * O worker local da ponte (hbx-owner/local-agent) NUNCA escreve no banco direto — ele roda o 30B,
 * gera o resultado bruto e o devolve no `complete`. É AQUI, no backend, que o resultado flui pelo
 * CAMINHO ÚNICO de escrita:
 *   - `enrich_lead`  → contatos passam pelo LeadContactWriteService (gate anti-alucinação SEMPRE,
 *                      source `ai_extraction` conf. 60, proveniência literal contra a `sourceText`).
 *
 * IDEMPOTÊNCIA: o LeadContactWriteService já pula contato existente (radarLeadId, kind,
 * valueNormalized). Reaplicar a mesma missão é seguro por construção.
 *
 * O gate roda no BACKEND (fonte única da verdade), com a `sourceText` que o worker devolveu — o
 * worker até roda o gate localmente pra economizar, mas quem MANDA é este caminho. Sem `sourceText`,
 * a proveniência literal reprova tudo (rede de segurança: nada entra sem fonte pra conferir).
 */

export type MissionResultApplyOutcome = {
  applied: boolean;
  kind: 'contacts' | 'noop';
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

    if (stage === 'enrich_lead') return this.applyContacts(payload, result);
    // Estágios da fábrica in-process não têm resultado da ponte — complete segue normal (noop).
    return { applied: true, kind: 'noop' };
  }

  private resolveLeadId(payload: Record<string, unknown>, result: Record<string, unknown>): string {
    return String(result?.radarLeadId || payload?.radarLeadId || '').trim();
  }

  /**
   * `enrich_lead`: o worker devolve o JSON BRUTO do 30B (telefones/emails/nome_dono) + a `sourceText`
   * crawleada. Aqui a gente reconstrói os candidatos e passa TUDO pelo LeadContactWriteService — o
   * gate reprova o que não existe literalmente na fonte. Alucinação morre no backend, não no worker.
   */
  private async applyContacts(
    payload: Record<string, unknown>,
    result: Record<string, unknown>,
  ): Promise<MissionResultApplyOutcome> {
    const leadId = this.resolveLeadId(payload, result);
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
      .writeContacts(this.db(), leadId, candidates, { sourceText })
      .catch((error) => {
        this.logger.warn(`aplicação de contatos falhou lead=${leadId}: ${error instanceof Error ? error.message : error}`);
        return null;
      });
    if (!outcome) return { applied: false, kind: 'contacts', reason: 'write_falhou' };
    return { applied: true, kind: 'contacts', written: outcome.written, skipped: outcome.skipped, rejected: outcome.rejected.length };
  }
}
