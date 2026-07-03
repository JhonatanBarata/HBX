import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ensureMasterBillingRuntimeSchema } from '../modules/master-runtime';
import { FiscalEngineService, type AnexoAplicado } from './fiscal-engine.service';

// ===========================================================================
// CONTABIL — Sincronização da RECEITA REAL do HBX (regime de caixa)
// ===========================================================================
// FONTE DE VERDADE DA RECEITA (decisão do executor S1, documentada aqui):
//
//   Tabela  : "MasterBillingLedgerEntry"  (o LEDGER de faturamento do /master)
//   Filtro  : entryGroup = 'revenue' AND status = 'APPROVED'
//   Agrupa  : por "competence" ('YYYY-MM')   ← regime de CAIXA (dinheiro que entrou)
//   Soma    : "amount" (DOUBLE, em REAIS)  →  cents = ROUND(SUM(amount)*100)
//
// POR QUÊ essa fonte (e não CompanySubscription nem FinanceiroCharge):
//   - MasterBillingLedgerEntry é o razão consolidado de faturamento do master:
//     TODO pagamento MP aprovado (assinatura recorrente, checkout avulso, cartão)
//     grava aqui uma linha revenue/APPROVED com `competence` e `paidAt`
//     (financeiro.service.ts: insertBillingLedgerEntry + updateLedgerEntryStatus,
//     origins financeiro_subscription / financeiro_checkout / financeiro_mock*).
//   - CompanySubscription é ESTADO de assinatura (status atual), não um evento de
//     dinheiro por mês — não serve p/ somar caixa mensal.
//   - FinanceiroCharge é a cobrança individual (Float BRL, sem rollup de receita);
//     o ledger já é a projeção "dinheiro reconhecido" que a janela Pagamentos do
//     master exibe — a MESMA superfície que o dono confere a olho.
//   - `competence` = mês de reconhecimento do caixa (monthKey de paidAt na origem);
//     por isso agrupamos por competence (e não por paidAt) — é o campo canônico.
//
// STATUS: o ledger grava status em UPPERCASE ('APPROVED'). Comparamos case-insensitive
// por segurança. Estornos ('REFUNDED'/'PARTIALLY_REFUNDED') NÃO entram como receita
// (só 'APPROVED' conta) — refinamento de dedução de estorno fica p/ S4 (Livro Caixa).
//
// Idempotente: re-rodar a mesma competência recomputa e faz upsert (não duplica).
// Nada aqui ESCREVE em fluxo de pagamento — só LÊ o ledger (Lei do Contabil).
// ===========================================================================

interface RevenueRow {
  cents: bigint | number | null;
}

@Injectable()
export class RevenueSyncService {
  private readonly logger = new Logger(RevenueSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: FiscalEngineService,
  ) {}

  /** 'YYYY-MM' → validação. Lança se malformado. */
  private assertCompetencia(competencia: string): string {
    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      throw new Error(`competencia inválida: '${competencia}' (esperado 'YYYY-MM')`);
    }
    return competencia;
  }

  /** Competência anterior a 'YYYY-MM'. */
  private competenciaAnterior(competencia: string, back = 1): string {
    const [y, m] = competencia.split('-').map((n) => Number(n));
    const d = new Date(Date.UTC(y, m - 1 - back, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /** Lista das N competências que terminam em `competencia` (inclusive), da mais antiga p/ recente. */
  private janela12m(competencia: string, n = 12): string[] {
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) out.push(this.competenciaAnterior(competencia, i));
    return out;
  }

  /**
   * Receita de caixa (cents) reconhecida numa competência, direto do ledger.
   * ROUND(SUM(amount)*100) evita drift de float na soma em reais.
   */
  async receitaCaixaCents(competencia: string): Promise<number> {
    this.assertCompetencia(competencia);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const rows = await this.prisma.$queryRaw<RevenueRow[]>(Prisma.sql`
      SELECT COALESCE(ROUND(SUM("amount") * 100), 0) AS "cents"
      FROM "MasterBillingLedgerEntry"
      WHERE "entryGroup" = 'revenue'
        AND UPPER("status") = 'APPROVED'
        AND "competence" = ${competencia}
    `);
    const cents = rows?.[0]?.cents;
    return Math.max(0, Math.trunc(Number(cents ?? 0)));
  }

  /**
   * Consolida a competência: puxa receita real do ledger, recalcula a cadeia
   * rbt12/folha12m/fatorR/anexo/efetiva/DAS/INSS/IRRF a partir das 12 competências
   * anteriores (proporcionalizando início de atividade) e faz upsert idempotente
   * em FiscalRevenueMonth. Preserva ajuste manual e folha do mês já registrados.
   */
  async syncCompetencia(competencia: string): Promise<any> {
    this.assertCompetencia(competencia);

    const receitaCaixaCents = await this.receitaCaixaCents(competencia);

    // Estado persistido (ajuste manual + folha do mês são inputs do dono — preservar).
    const existente = await (this.prisma as any).fiscalRevenueMonth.findUnique({
      where: { competencia },
    });
    const ajusteManualCents = Number(existente?.ajusteManualCents ?? 0);
    const folhaMesCents = Math.max(0, Number(existente?.folhaMesCents ?? 0));

    // Receita efetiva do mês (caixa + notas + ajuste). receitaNotasCents = S6 (0 aqui).
    const receitaNotasCents = Math.max(0, Number(existente?.receitaNotasCents ?? 0));
    const receitaMesCents = Math.max(0, receitaCaixaCents + receitaNotasCents + ajusteManualCents);

    // Janela dos 12 meses ANTERIORES à competência (p/ RBT12/folha12m).
    const meses = this.janela12m(this.competenciaAnterior(competencia), 12);
    const receitasHist: number[] = [];
    const folhasHist: number[] = [];
    let mesesAtividade = 0;
    for (const m of meses) {
      const [rec, folha, ativo] = await this.receitaEFolhaDe(m);
      receitasHist.push(rec);
      folhasHist.push(folha);
      if (ativo) mesesAtividade += 1;
    }
    // Inclui a própria competência corrente na janela dos 12m (regra do PGDAS-D:
    // RBT12 = 12 meses anteriores; mas o mês corrente entra p/ empresa nova cuja
    // atividade começou dentro da janela). Contamos o mês corrente como ativo.
    receitasHist.push(receitaMesCents);
    folhasHist.push(folhaMesCents);
    if (receitaMesCents > 0 || folhaMesCents > 0 || existente) mesesAtividade += 1;

    // Proporcionalização só quando há < 12 meses de atividade real.
    const propMeses = mesesAtividade > 0 && mesesAtividade < 12 ? mesesAtividade : undefined;
    const rbt12Cents = this.engine.rbt12(receitasHist, propMeses);
    const folha12mCents = this.engine.folha12m(folhasHist, propMeses);

    const fatorR = this.engine.fatorR(folha12mCents, rbt12Cents);
    const anexoAplicado: AnexoAplicado = this.engine.anexoPorFatorR(fatorR);
    const aliquotaEfetiva = this.engine.aliquotaEfetiva(rbt12Cents, anexoAplicado, competencia);
    const dasPrevistoCents = this.engine.dasDoMes(receitaMesCents, aliquotaEfetiva);
    const inssPrevistoCents = this.engine.inssProlabore(folhaMesCents, competencia);
    const irrfPrevistoCents = this.engine.irrfProlabore(folhaMesCents, inssPrevistoCents, competencia);

    const data = {
      receitaCaixaCents,
      receitaNotasCents,
      rbt12Cents,
      folha12mCents,
      fatorR,
      anexoAplicado,
      aliquotaEfetiva,
      dasPrevistoCents,
      inssPrevistoCents,
      irrfPrevistoCents,
    };

    const saved = await (this.prisma as any).fiscalRevenueMonth.upsert({
      where: { competencia },
      create: { competencia, ...data, ajusteManualCents, folhaMesCents },
      update: data,
    });
    return saved;
  }

  /** Receita+folha de uma competência a partir de FiscalRevenueMonth (fallback: ledger p/ receita). */
  private async receitaEFolhaDe(competencia: string): Promise<[number, number, boolean]> {
    const row = await (this.prisma as any).fiscalRevenueMonth.findUnique({ where: { competencia } });
    if (row) {
      const rec = Math.max(
        0,
        Number(row.receitaCaixaCents ?? 0) +
          Number(row.receitaNotasCents ?? 0) +
          Number(row.ajusteManualCents ?? 0),
      );
      return [rec, Math.max(0, Number(row.folhaMesCents ?? 0)), true];
    }
    // Sem linha consolidada: usa receita do ledger (folha desconhecida = 0).
    const rec = await this.receitaCaixaCents(competencia);
    return [rec, 0, rec > 0];
  }
}
