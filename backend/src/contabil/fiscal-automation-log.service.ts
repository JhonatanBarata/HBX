import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ===========================================================================
// CONTABIL S6/S7 — trilha de auditoria de chamadas externas (Lei do Contabil nº4).
// TODA chamada a API oficial (NFS-e Nacional / Serpro Integra Contador) grava
// uma linha aqui: o que foi pedido (resumo SEM segredo), o status HTTP, se deu
// certo, a referência do resultado (chave de acesso / recibo) e quem aprovou.
//
// GUARDRAIL DE SEGREDO: requestResumo NUNCA carrega certificado, senha, XML
// assinado inteiro nem credencial. O caller monta um resumo curto e neutro
// (competência, valor em reais, tomador anonimizado) — este service só grava.
// Best-effort: falha de gravação NUNCA derruba a operação fiscal em si.
// ===========================================================================

export type FiscalAutomationSistema = 'NFSE' | 'SERPRO';

export interface FiscalAutomationLogInput {
  sistema: FiscalAutomationSistema;
  operacao: string; // EMITIR_DPS | DECLARAR_PGDASD | GERAR_DAS | ...
  requestResumo: string; // SEM dados sensíveis
  httpStatus?: number | null;
  sucesso: boolean;
  resultRef?: string | null; // chave de acesso / nº recibo / protocolo
  aprovadoPor?: string | null; // 'auto-flag' | userId do dono
}

@Injectable()
export class FiscalAutomationLogService {
  private readonly logger = new Logger(FiscalAutomationLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Grava uma linha da trilha. Best-effort — nunca lança pro caller. */
  async registrar(input: FiscalAutomationLogInput): Promise<void> {
    try {
      await (this.prisma as any).fiscalAutomationLog.create({
        data: {
          sistema: input.sistema,
          operacao: String(input.operacao || '').slice(0, 60),
          requestResumo: String(input.requestResumo || '').slice(0, 2000),
          httpStatus: input.httpStatus ?? null,
          sucesso: Boolean(input.sucesso),
          resultRef: input.resultRef ? String(input.resultRef).slice(0, 120) : null,
          aprovadoPor: input.aprovadoPor ? String(input.aprovadoPor).slice(0, 80) : null,
        },
      });
    } catch (err) {
      this.logger.warn(`[contabil] falha ao gravar trilha de automação: ${String((err as Error)?.message || err)}`);
    }
  }

  /** Lista a trilha (mais recentes primeiro) — auditoria no painel. */
  async listar(opts: { sistema?: FiscalAutomationSistema; limite?: number } = {}) {
    const where: Record<string, unknown> = {};
    if (opts.sistema) where.sistema = opts.sistema;
    const rows = await (this.prisma as any).fiscalAutomationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(200, Math.trunc(opts.limite || 50))),
    });
    return rows.map((r: any) => ({
      id: r.id,
      sistema: r.sistema,
      operacao: r.operacao,
      requestResumo: r.requestResumo,
      httpStatus: r.httpStatus ?? null,
      sucesso: r.sucesso,
      resultRef: r.resultRef ?? null,
      aprovadoPor: r.aprovadoPor ?? null,
      createdAt: r.createdAt,
    }));
  }
}
