import { Injectable, Logger } from '@nestjs/common';

/**
 * CAMINHO ÚNICO de escrita da tabela LeadPerson (WORM-16, 02/07) — contato por PESSOA
 * (nome + cargo), separado do LeadContact (por canal).
 *
 * Por que NÃO reusa o LeadContactWriteService: o gate anti-alucinação dele é de CANAL
 * (telefone/e-mail com formato + literal-na-fonte). Uma PESSOA do QSA da Receita é nome
 * cadastral + cargo — dado oficial, não canal scrapeado; forçá-la pelo gate de telefone/e-mail
 * não faz sentido. Os CANAIS reais (telefone/e-mail descobertos no crawl) continuam indo por
 * LeadContactWriteService — este serviço só normaliza a PESSOA.
 *
 * Contrato:
 *  - Idempotente por (radarLeadId, personKey). personKey = source + nome normalizado.
 *  - ADITIVO: nunca é fonte do presenter (metadataJson/enrichmentJson continuam a evidência).
 *  - Best-effort: erro de banco vira log/contagem, nunca exceção pra cima.
 */

export type LeadPersonCandidate = {
  name: string;
  role?: string | null;
  phoneDigits?: string | null;
  email?: string | null;
  /** 'receita_qsa' | 'crawl' | 'manual' | 'ia' */
  source: string;
  rank?: number;
};

/** Nome normalizado (sem acento/caixa/espaço duplo) — usado na chave de idempotência. */
export function normalizePersonName(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildPersonKey(source: string, name: string): string {
  return `${String(source || 'unknown').trim().toLowerCase()}:${normalizePersonName(name)}`;
}

@Injectable()
export class LeadPersonWriteService {
  private readonly logger = new Logger(LeadPersonWriteService.name);

  async writePeople(
    prisma: any,
    radarLeadId: string,
    candidates: LeadPersonCandidate[],
  ): Promise<{ written: number; skipped: number }> {
    const leadId = String(radarLeadId || '').trim();
    if (!leadId || !prisma?.leadPerson?.create) return { written: 0, skipped: 0 };

    let written = 0;
    let skipped = 0;
    const seenKeys = new Set<string>();

    for (const person of Array.isArray(candidates) ? candidates : []) {
      const name = String(person?.name || '').trim();
      const normalized = normalizePersonName(name);
      // nome tem que existir e ser plausível (2+ caracteres) — evita lixo do blob.
      if (!name || normalized.length < 2) continue;
      const source = String(person?.source || 'unknown').trim() || 'unknown';
      const personKey = buildPersonKey(source, name);
      // dedup dentro do lote (o mesmo nome pode vir de ownerName E ownerNames[0]).
      if (seenKeys.has(personKey)) { skipped += 1; continue; }
      seenKeys.add(personKey);

      const phoneDigits = String(person?.phoneDigits || '').replace(/\D/g, '') || null;
      const email = String(person?.email || '').trim().toLowerCase() || null;
      const role = String(person?.role || '').trim() || null;
      const rank = Math.max(1, Math.trunc(Number(person?.rank) || 1));

      try {
        const exists = await prisma.leadPerson.findFirst({
          where: { radarLeadId: leadId, personKey },
          select: { id: true },
        });
        if (exists) { skipped += 1; continue; }
        await prisma.leadPerson.create({
          data: { radarLeadId: leadId, name, role, phoneDigits, email, source, personKey, rank },
        });
        written += 1;
      } catch {
        // best-effort — LeadPerson é índice de consulta, não fonte de verdade
        skipped += 1;
      }
    }
    if (written) {
      this.logger.debug(`lead=${leadId}: ${written} pessoa(s) gravada(s), ${skipped} puladas`);
    }
    return { written, skipped };
  }
}
