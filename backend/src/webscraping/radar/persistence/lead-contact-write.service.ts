import { Injectable, Logger } from '@nestjs/common';
import {
  gateLeadContacts,
  type LeadContactCandidate,
  type LeadContactKind,
} from './lead-contact-gate';

/**
 * CAMINHO ÚNICO de escrita da tabela normalizada LeadContact (Sprint 5 MOTOR-RFB-FILA, 02/07).
 *
 * Extraído de `webscraping.service.ts#upsertLeadContactsForRadarLead` (regra do escoteiro:
 * o trecho tocado vira serviço NestJS com contrato explícito). TODO ponto que descobre
 * contato grava por aqui — fábrica de e-mail (apply-contacts), chegada no pool
 * (persistRadarLeadPoolBatch), L4/sócio (cnpj-l4), lead-harvest import e extração por IA.
 *
 * Contrato:
 *  - `source` e `confidence` são OBRIGATÓRIOS em cada candidato (auditoria de onde veio).
 *  - Gate anti-alucinação SEMPRE roda (formato; + proveniência quando `sourceText` vem).
 *    Reprovado NÃO grava — e não derruba o fluxo de quem chamou.
 *  - Idempotente: pula se já existe (radarLeadId, kind, valueNormalized).
 *  - ADITIVO: NUNCA é fonte do presenter (metadataJson/enrichmentJson continuam a evidência
 *    e a fonte de exibição) — LeadContact serve consulta/filtro/export em lote.
 *  - Best-effort: erro de banco vira log/contagem, nunca exceção pra cima.
 */
@Injectable()
export class LeadContactWriteService {
  private readonly logger = new Logger(LeadContactWriteService.name);

  async writeContacts(
    prisma: any,
    radarLeadId: string,
    candidates: LeadContactCandidate[],
    options: { sourceText?: string | null } = {},
  ): Promise<{ written: number; skipped: number; rejected: Array<{ kind: LeadContactKind; value: string; reason: string }> }> {
    const leadId = String(radarLeadId || '').trim();
    if (!leadId || !prisma?.leadContact?.create) return { written: 0, skipped: 0, rejected: [] };

    const { approved, rejected } = gateLeadContacts(candidates, { sourceText: options.sourceText });
    if (rejected.length) {
      this.logger.warn(
        `gate reprovou ${rejected.length} contato(s) lead=${leadId}: `
        + rejected.map((r) => `${r.kind}:${r.value}(${r.reason})`).join(', '),
      );
    }

    let written = 0;
    let skipped = 0;
    for (const contact of approved) {
      try {
        const exists = await prisma.leadContact.findFirst({
          where: { radarLeadId: leadId, kind: contact.kind, valueNormalized: contact.valueNormalized },
          select: { id: true },
        });
        if (exists) { skipped += 1; continue; }
        await prisma.leadContact.create({
          data: {
            radarLeadId: leadId,
            kind: contact.kind,
            value: contact.value,
            valueNormalized: contact.valueNormalized,
            rank: Math.max(1, Math.trunc(Number(contact.rank) || 1)),
            source: String(contact.source || 'unknown'),
            confidence: Math.max(0, Math.min(100, Math.trunc(Number(contact.confidence) || 0))),
          },
        });
        written += 1;
      } catch {
        // best-effort — LeadContact é índice de consulta, não fonte de verdade
      }
    }
    return { written, skipped, rejected };
  }
}
