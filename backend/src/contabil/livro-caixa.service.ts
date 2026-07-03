import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ensureMasterBillingRuntimeSchema } from '../modules/master-runtime';
import { FiscalEngineService } from './fiscal-engine.service';
import { RevenueSyncService } from './revenue-sync.service';
import type { CriarLancamentoManualDto, EstornarLancamentoDto, FecharAnoDto } from './dto/contabil.dto';

// ===========================================================================
// CONTABIL S4 — Livro Caixa automático (art. 26 LC 123) + lucro isento.
// ---------------------------------------------------------------------------
// ENTRADAS automáticas: espelham cada linha de "MasterBillingLedgerEntry"
// (entryGroup='revenue', status APROVADO OU estornado) — MESMA fonte do S1
// (revenue-sync.service.ts). Dedução de estorno: o `amount` do ledger NUNCA
// muda quando um pagamento é estornado (só o `status` vira REFUNDED/
// PARTIALLY_REFUNDED — ver financeiro.service.ts refundFinanceiroChargeById).
// O valor REAL estornado mora em "FinanceiroCharge.refundAmount", ligado via
// "FinanceiroCharge.ledgerEntryId" = "MasterBillingLedgerEntry.id". Por isso
// o espelhamento faz LEFT JOIN com FinanceiroCharge e lança
// `valorLiquido = amount − COALESCE(refundAmount, 0)` como ENTRADA — nunca
// negativo (se o valor líquido cair a zero, o espelho vira uma entrada de
// R$ 0,00 e some do Livro Caixa daquela linha específica é feito via UPDATE
// idempotente, não recriação — ver upsertEspelhoMp).
//
// SAÍDAS automáticas: quando uma FiscalObligation DAS/DARF_INSS vira PAGO
// (contabil.service.ts marcarObrigacao), lança a SAIDA correspondente com
// origem=AUTO_OBRIGACAO, refId=obligation.id (idempotente via @@unique).
//
// Lançamento AUTOMÁTICO nunca é editável direto — correção via ESTORNO novo
// (trilha limpa, Guardrail do sprint). Fechamento anual é sinalização
// (anoFechado=true nas linhas do ano) — não bloqueia fisicamente no banco,
// mas o service recusa novo lançamento manual em competência de ano fechado
// (edição só com motivo, via estorno, mesmo depois de fechado).
// ===========================================================================

interface MpRevenueRow {
  id: string;
  competence: string | null;
  paidAt: Date | null;
  amount: number; // reais
  status: string;
  refundAmountReais: number | null; // reais, da FinanceiroCharge ligada (0 se não achou)
  referenceLabel: string | null;
}

const CATEGORIAS_MANUAIS = new Set(['PROLABORE', 'DISTRIBUICAO_LUCRO', 'INFRA', 'FERRAMENTA', 'OUTRO']);

@Injectable()
export class LivroCaixaService {
  private readonly logger = new Logger(LivroCaixaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: FiscalEngineService,
    private readonly revenueSync: RevenueSyncService,
  ) {}

  private assertCompetencia(competencia: string) {
    if (!/^\d{4}-\d{2}$/.test(String(competencia || ''))) {
      throw new BadRequestException(`competência inválida: '${competencia}' (esperado 'YYYY-MM')`);
    }
  }

  private competenciaDe(data: Date): string {
    return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  // -------------------------------------------------------------------------
  // ESPELHAMENTO AUTOMÁTICO — ENTRADAS (regime de caixa, mesma fonte do S1)
  // -------------------------------------------------------------------------

  /**
   * Espelha as linhas do MasterBillingLedgerEntry (revenue) de UMA competência
   * como ENTRADA/RECEITA_ASSINATURA no Livro Caixa, deduzindo estorno real
   * (via FinanceiroCharge.refundAmount). Idempotente: upsert por (AUTO_MP, refId=ledgerId).
   * Nunca mexe no fluxo de pagamento — só LEITURA do ledger/charge + escrita no Livro Caixa.
   */
  async espelharCompetencia(competencia: string): Promise<{ processadas: number; gravadas: number }> {
    this.assertCompetencia(competencia);
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const rows = await this.prisma.$queryRaw<MpRevenueRow[]>(Prisma.sql`
      SELECT
        mble."id"              AS "id",
        mble."competence"      AS "competence",
        mble."paidAt"          AS "paidAt",
        mble."amount"          AS "amount",
        mble."status"          AS "status",
        mble."referenceLabel"  AS "referenceLabel",
        fc."refundAmount"      AS "refundAmountReais"
      FROM "MasterBillingLedgerEntry" mble
      LEFT JOIN "FinanceiroCharge" fc ON fc."ledgerEntryId" = mble."id"
      WHERE mble."entryGroup" = 'revenue'
        AND UPPER(mble."status") IN ('APPROVED', 'REFUNDED', 'PARTIALLY_REFUNDED')
        AND mble."competence" = ${competencia}
    `);

    let gravadas = 0;
    for (const row of rows) {
      const ok = await this.upsertEspelhoMp(row, competencia);
      if (ok) gravadas += 1;
    }
    return { processadas: rows.length, gravadas };
  }

  /**
   * Soma (cents) das ENTRADAS/RECEITA_ASSINATURA espelhadas de uma competência
   * — ou seja, a receita do Livro Caixa. Por construção (mesma definição
   * líquida-de-estorno do helper único do S1) deve ser IDÊNTICA à base do DAS.
   */
  async receitaEspelhadaCents(competencia: string): Promise<number> {
    this.assertCompetencia(competencia);
    const rows = await (this.prisma as any).fiscalLedgerEntry.findMany({
      where: { competencia, tipo: 'ENTRADA', categoria: 'RECEITA_ASSINATURA' },
    });
    return rows.reduce((s: number, r: any) => s + r.valorCents, 0);
  }

  /**
   * RECONCILIAÇÃO (fix S4↔S1, 03/07): garante que a receita do Livro Caixa
   * (soma das ENTRADAS espelhadas) bate com a base do DAS (helper único do S1,
   * `receitaLiquidaCentsPorCompetencia`). Espelha primeiro (idempotente), depois
   * compara. Retorna as duas somas + `bate`. Divergência aqui = bug de camada
   * de dinheiro — o DAS e o Livro Caixa não podem contar receita diferente.
   */
  async reconciliarReceita(competencia: string): Promise<{ dasBaseCents: number; livroCaixaCents: number; bate: boolean }> {
    this.assertCompetencia(competencia);
    await this.espelharCompetencia(competencia);
    const dasBaseCents = await this.revenueSync.receitaLiquidaCentsPorCompetencia(competencia);
    const livroCaixaCents = await this.receitaEspelhadaCents(competencia);
    const bate = dasBaseCents === livroCaixaCents;
    if (!bate) {
      this.logger.warn(
        `[livro-caixa] RECONCILIAÇÃO DIVERGENTE em ${competencia}: DAS base=${dasBaseCents} != Livro Caixa=${livroCaixaCents}`,
      );
    }
    return { dasBaseCents, livroCaixaCents, bate };
  }

  private async upsertEspelhoMp(row: MpRevenueRow, competencia: string): Promise<boolean> {
    const brutoCents = Math.max(0, Math.round(Number(row.amount || 0) * 100));
    const refundCents = Math.max(0, Math.round(Number(row.refundAmountReais || 0) * 100));
    const liquidoCents = Math.max(0, brutoCents - refundCents);
    const data = row.paidAt ? new Date(row.paidAt) : this.competenciaParaData(competencia);
    const descricaoBase = row.referenceLabel ? `Receita MP — ${row.referenceLabel}` : 'Receita MP (assinatura/checkout)';
    const descricao = refundCents > 0 ? `${descricaoBase} (líquido de estorno)` : descricaoBase;

    // valorCents=0 é uma linha válida (pagamento 100% estornado) — mantemos o
    // espelho por rastreabilidade, mas ela não move o saldo do Livro Caixa.
    const existente = await (this.prisma as any).fiscalLedgerEntry.findUnique({
      where: { origem_refId: { origem: 'AUTO_MP', refId: row.id } },
    });
    if (existente) {
      // Idempotência com correção: se o estorno mudou depois do 1º espelhamento
      // (ex.: estorno parcial chegou depois), atualiza o MESMO registro AUTO_MP
      // em vez de duplicar — automático nunca "edita" dado do dono, só se
      // autocorrige em cima da própria fonte (ledger MP), que é read-only aqui.
      if (existente.valorCents === liquidoCents && existente.descricao === descricao) return false;
      await (this.prisma as any).fiscalLedgerEntry.update({
        where: { id: existente.id },
        data: { valorCents: liquidoCents, descricao, data },
      });
      return true;
    }

    await (this.prisma as any).fiscalLedgerEntry.create({
      data: {
        data,
        competencia,
        tipo: 'ENTRADA',
        categoria: 'RECEITA_ASSINATURA',
        descricao,
        valorCents: liquidoCents,
        origem: 'AUTO_MP',
        refId: row.id,
      },
    });
    return true;
  }

  private competenciaParaData(competencia: string): Date {
    const [y, m] = competencia.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
  }

  // -------------------------------------------------------------------------
  // ESPELHAMENTO AUTOMÁTICO — SAÍDAS (hook DAS/DARF_INSS PAGO)
  // -------------------------------------------------------------------------

  /**
   * Chamado pelo ContabilService.marcarObrigacao quando uma FiscalObligation
   * DAS/DARF_INSS transiciona PARA 'PAGO'. Lança a SAIDA correspondente com
   * origem=AUTO_OBRIGACAO, refId=obligation.id — idempotente via @@unique
   * (chamar 2x pra mesma obrigação não duplica; ver ContabilService que só
   * chama quando o estado REALMENTE mudou para PAGO nesta transição).
   * Falha aqui NUNCA derruba a marcação da obrigação (best-effort + log) —
   * o Livro Caixa é um espelho, não pode travar o fluxo fiscal principal.
   */
  async lancarSaidaObrigacaoPaga(obligation: {
    id: string;
    competencia: string;
    tipo: string; // 'DAS' | 'DARF_INSS' | outros (ignorados)
    dueDate: Date;
  }): Promise<void> {
    if (obligation.tipo !== 'DAS' && obligation.tipo !== 'DARF_INSS') return;
    try {
      const jaExiste = await (this.prisma as any).fiscalLedgerEntry.findUnique({
        where: { origem_refId: { origem: 'AUTO_OBRIGACAO', refId: obligation.id } },
      });
      if (jaExiste) return; // idempotência — já lançado

      const valorCents = await this.valorPrevistoDaObrigacao(obligation.competencia, obligation.tipo);
      if (valorCents <= 0) {
        this.logger.warn(
          `[livro-caixa] obrigação ${obligation.id} (${obligation.tipo}/${obligation.competencia}) marcada PAGO sem valor previsto — SAÍDA não lançada`,
        );
        return;
      }

      const competenciaValida = /^\d{4}-\d{2}$/.test(obligation.competencia)
        ? obligation.competencia
        : this.competenciaDe(new Date());
      const label = obligation.tipo === 'DAS' ? 'DAS (Simples Nacional)' : 'DARF INSS (pró-labore)';

      await (this.prisma as any).fiscalLedgerEntry.create({
        data: {
          data: new Date(),
          competencia: competenciaValida,
          tipo: 'SAIDA',
          categoria: obligation.tipo,
          descricao: `${label} pago — competência ${obligation.competencia}`,
          valorCents,
          origem: 'AUTO_OBRIGACAO',
          refId: obligation.id,
        },
      });
    } catch (err) {
      this.logger.warn(
        `[livro-caixa] falha ao lançar SAÍDA automática da obrigação ${obligation.id}: ${String((err as Error)?.message || err)}`,
      );
    }
  }

  private async valorPrevistoDaObrigacao(competencia: string, tipo: string): Promise<number> {
    if (!/^\d{4}-\d{2}$/.test(competencia)) return 0;
    const row = await (this.prisma as any).fiscalRevenueMonth.findUnique({ where: { competencia } });
    if (!row) return 0;
    if (tipo === 'DAS') return Math.max(0, Number(row.dasPrevistoCents ?? 0));
    if (tipo === 'DARF_INSS') return Math.max(0, Number(row.inssPrevistoCents ?? 0));
    return 0;
  }

  // -------------------------------------------------------------------------
  // CRUD manual
  // -------------------------------------------------------------------------

  async criarLancamentoManual(dto: CriarLancamentoManualDto) {
    const tipo = String(dto.tipo || '').toUpperCase();
    if (tipo !== 'ENTRADA' && tipo !== 'SAIDA') {
      throw new BadRequestException(`tipo inválido: '${dto.tipo}' (esperado ENTRADA ou SAIDA)`);
    }
    const categoria = String(dto.categoria || '').toUpperCase();
    if (!CATEGORIAS_MANUAIS.has(categoria)) {
      throw new BadRequestException(
        `categoria inválida p/ lançamento manual: '${dto.categoria}' (esperado uma de ${Array.from(CATEGORIAS_MANUAIS).join(', ')})`,
      );
    }
    const data = new Date(dto.data);
    if (Number.isNaN(data.getTime())) throw new BadRequestException(`data inválida: '${dto.data}'`);
    const competencia = this.competenciaDe(data);

    await this.assertCompetenciaAberta(competencia);

    const valorCents = Math.trunc(dto.valorCents);
    if (!(valorCents > 0)) throw new BadRequestException('valorCents deve ser positivo (o tipo já define ENTRADA/SAIDA)');

    const created = await (this.prisma as any).fiscalLedgerEntry.create({
      data: {
        data,
        competencia,
        tipo,
        categoria,
        descricao: dto.descricao.trim(),
        valorCents,
        origem: 'MANUAL',
        refId: null,
      },
    });
    return this.serialize(created);
  }

  /**
   * Corrige um lançamento (automático ou manual) via lançamento de ESTORNO
   * novo — NUNCA edita/apaga o original (trilha limpa). O estorno lança o
   * valor OPOSTO (SAIDA vira ENTRADA e vice-versa) na categoria ESTORNO, com
   * `estornaId` apontando pro original e `motivo` obrigatório.
   */
  async estornarLancamento(id: string, dto: EstornarLancamentoDto) {
    const original = await (this.prisma as any).fiscalLedgerEntry.findUnique({ where: { id } });
    if (!original) throw new NotFoundException(`lançamento '${id}' não encontrado`);
    if (!dto?.motivo || dto.motivo.trim().length < 3) {
      throw new BadRequestException('motivo do estorno é obrigatório');
    }
    // Não permite estornar um estorno (evita cadeia infinita/confusão contábil) —
    // correção de um estorno errado é um NOVO lançamento manual, não um re-estorno.
    if (original.categoria === 'ESTORNO') {
      throw new BadRequestException('não é possível estornar um lançamento que já é um estorno');
    }
    const jaEstornado = await (this.prisma as any).fiscalLedgerEntry.findFirst({
      where: { estornaId: original.id },
    });
    if (jaEstornado) throw new BadRequestException('este lançamento já foi estornado');

    const tipoOposto = original.tipo === 'ENTRADA' ? 'SAIDA' : 'ENTRADA';
    const dataEstorno = new Date();
    const competenciaEstorno = this.competenciaDe(dataEstorno);

    const created = await (this.prisma as any).fiscalLedgerEntry.create({
      data: {
        data: dataEstorno,
        competencia: competenciaEstorno,
        tipo: tipoOposto,
        categoria: 'ESTORNO',
        descricao: `Estorno de "${original.descricao}" — ${dto.motivo.trim()}`,
        valorCents: original.valorCents,
        origem: 'MANUAL',
        refId: null,
        motivo: dto.motivo.trim(),
        estornaId: original.id,
      },
    });
    return this.serialize(created);
  }

  private async assertCompetenciaAberta(competencia: string) {
    const [ano] = competencia.split('-');
    const fechado = await (this.prisma as any).fiscalLedgerEntry.findFirst({
      where: { competencia: { startsWith: `${ano}-` }, anoFechado: true },
    });
    if (fechado) {
      throw new BadRequestException(
        `ano ${ano} do Livro Caixa está fechado — lançamento novo nesta competência precisa ser feito via estorno/ano corrente`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // LEITURA — tabela mensal, filtros, saldo acumulado
  // -------------------------------------------------------------------------

  /** Lista lançamentos com filtro opcional por competência/categoria/tipo, ordenados por data. */
  async listar(filtro: { competencia?: string; ano?: string; categoria?: string; tipo?: string }) {
    const where: Record<string, unknown> = {};
    if (filtro.competencia) {
      this.assertCompetencia(filtro.competencia);
      where.competencia = filtro.competencia;
    } else if (filtro.ano) {
      if (!/^\d{4}$/.test(filtro.ano)) throw new BadRequestException(`ano inválido: '${filtro.ano}'`);
      where.competencia = { startsWith: `${filtro.ano}-` };
    }
    if (filtro.categoria) where.categoria = filtro.categoria.toUpperCase();
    if (filtro.tipo) where.tipo = filtro.tipo.toUpperCase();

    const rows = await (this.prisma as any).fiscalLedgerEntry.findMany({
      where,
      orderBy: [{ data: 'asc' }, { createdAt: 'asc' }],
    });
    return this.comSaldoAcumulado(rows);
  }

  private comSaldoAcumulado(rows: any[]) {
    let saldo = 0;
    return rows.map((r) => {
      saldo += r.tipo === 'ENTRADA' ? r.valorCents : -r.valorCents;
      return { ...this.serialize(r), saldoAcumuladoCents: saldo };
    });
  }

  /** Resumo do ano: total entradas, total saídas, saldo. */
  async resumoAno(ano: string) {
    if (!/^\d{4}$/.test(ano)) throw new BadRequestException(`ano inválido: '${ano}'`);
    const rows = await (this.prisma as any).fiscalLedgerEntry.findMany({
      where: { competencia: { startsWith: `${ano}-` } },
    });
    const entradasCents = rows.filter((r: any) => r.tipo === 'ENTRADA').reduce((s: number, r: any) => s + r.valorCents, 0);
    const saidasCents = rows.filter((r: any) => r.tipo === 'SAIDA').reduce((s: number, r: any) => s + r.valorCents, 0);
    return { ano, entradasCents, saidasCents, saldoCents: entradasCents - saidasCents, lancamentos: rows.length };
  }

  // -------------------------------------------------------------------------
  // PAINEL DE LUCRO ISENTO — usa o motor S1 (lucroIsentoDisponivel)
  // -------------------------------------------------------------------------

  /**
   * Lucro isento disponível no ANO: 32% × receita bruta acumulada (ENTRADA
   * RECEITA_ASSINATURA do ano) − DAS pago acumulado (SAIDA categoria DAS do
   * ano) − já distribuído (SAIDA categoria DISTRIBUICAO_LUCRO do ano).
   * Delega o CÁLCULO ao FiscalEngineService.lucroIsentoDisponivel — este
   * método só AGREGA os cents do ano e chama o motor (Lei nº2: motor é a
   * única autoridade de cálculo).
   */
  async lucroIsentoDisponivelDoAno(ano: string) {
    if (!/^\d{4}$/.test(ano)) throw new BadRequestException(`ano inválido: '${ano}'`);
    const rows = await (this.prisma as any).fiscalLedgerEntry.findMany({
      where: { competencia: { startsWith: `${ano}-` } },
    });
    const receitaAcumuladaCents = rows
      .filter((r: any) => r.tipo === 'ENTRADA' && r.categoria === 'RECEITA_ASSINATURA')
      .reduce((s: number, r: any) => s + r.valorCents, 0);
    const dasPagoAcumuladoCents = rows
      .filter((r: any) => r.tipo === 'SAIDA' && r.categoria === 'DAS')
      .reduce((s: number, r: any) => s + r.valorCents, 0);
    const jaDistribuidoCents = rows
      .filter((r: any) => r.tipo === 'SAIDA' && r.categoria === 'DISTRIBUICAO_LUCRO')
      .reduce((s: number, r: any) => s + r.valorCents, 0);

    const competenciaRef = `${ano}-12`;
    const disponivelCents = this.engine.lucroIsentoDisponivel(
      receitaAcumuladaCents,
      dasPagoAcumuladoCents,
      jaDistribuidoCents,
      competenciaRef,
    );

    return {
      ano,
      receitaAcumuladaCents,
      dasPagoAcumuladoCents,
      jaDistribuidoCents,
      disponivelCents,
    };
  }

  /**
   * Retirada de lucro do MÊS corrente (soma de SAIDA/DISTRIBUICAO_LUCRO na
   * competência) — usado só pro aviso de retenção Lei 15.270/2025 (>R$50.000/mês
   * p/ mesmo CPF). O Livro Caixa não guarda CPF por lançamento (fora do escopo
   * do sprint — sócio único); o aviso é textual/educativo, não bloqueante.
   */
  async distribuidoNoMes(competencia: string): Promise<number> {
    this.assertCompetencia(competencia);
    const rows = await (this.prisma as any).fiscalLedgerEntry.findMany({
      where: { competencia, tipo: 'SAIDA', categoria: 'DISTRIBUICAO_LUCRO' },
    });
    return rows.reduce((s: number, r: any) => s + r.valorCents, 0);
  }

  // -------------------------------------------------------------------------
  // FECHAMENTO ANUAL
  // -------------------------------------------------------------------------

  /** Congela todos os lançamentos do ano (anoFechado=true). Idempotente. */
  async fecharAno(ano: string, _dto: FecharAnoDto) {
    if (!/^\d{4}$/.test(ano)) throw new BadRequestException(`ano inválido: '${ano}'`);
    const result = await (this.prisma as any).fiscalLedgerEntry.updateMany({
      where: { competencia: { startsWith: `${ano}-` }, anoFechado: false },
      data: { anoFechado: true },
    });
    this.logger.log(`[livro-caixa] ano ${ano} fechado — ${result.count} lançamento(s) congelado(s)`);
    return { ano, congelados: result.count };
  }

  // -------------------------------------------------------------------------
  // EXPORT CSV — streaming, BOM UTF-8 (padrão do export do :3107)
  // -------------------------------------------------------------------------

  /** Export CSV streaming: data;histórico;entrada;saída;saldo. Filtro por competência OU ano. */
  async exportarCsv(
    res: import('express').Response,
    filtro: { competencia?: string; ano?: string },
  ): Promise<void> {
    const escapeCsv = (value: unknown): string => {
      if (value == null) return '';
      const str = String(value);
      if (/[";\n\r]/.test(str)) return '"' + str.replace(/\r?\n/g, ' ').replace(/"/g, '""') + '"';
      return str;
    };
    const fmtData = (d: Date) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    const fmtValor = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

    const rows = await this.listar(filtro);

    const stamp = new Date().toISOString().slice(0, 10);
    const nome = filtro.competencia ? filtro.competencia : filtro.ano ? `${filtro.ano}-anual` : 'todos';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="livro-caixa-${nome}-${stamp}.csv"`);
    res.setHeader('Cache-Control', 'no-store');

    try {
      // BOM UTF-8 pro Excel abrir acentos certo.
      res.write('﻿' + ['data', 'histórico', 'entrada', 'saída', 'saldo'].join(';') + '\r\n');
      for (const r of rows) {
        const entrada = r.tipo === 'ENTRADA' ? fmtValor(r.valorCents) : '';
        const saida = r.tipo === 'SAIDA' ? fmtValor(r.valorCents) : '';
        const linha = [
          fmtData(r.data),
          escapeCsv(r.descricao),
          entrada,
          saida,
          fmtValor(r.saldoAcumuladoCents),
        ].join(';');
        res.write(linha + '\r\n');
      }
      res.end();
    } catch (err) {
      this.logger.warn(`[livro-caixa] falha no export CSV: ${String((err as Error)?.message || err)}`);
      if (!res.writableEnded) { try { res.end(); } catch { /* noop */ } }
    }
  }

  private serialize(row: any) {
    return {
      id: row.id,
      data: row.data,
      competencia: row.competencia,
      tipo: row.tipo,
      categoria: row.categoria,
      descricao: row.descricao,
      valorCents: row.valorCents,
      origem: row.origem,
      refId: row.refId,
      motivo: row.motivo ?? null,
      estornaId: row.estornaId ?? null,
      anoFechado: row.anoFechado,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
