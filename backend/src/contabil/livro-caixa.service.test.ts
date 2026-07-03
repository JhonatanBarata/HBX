import test from 'node:test';
import assert from 'node:assert/strict';
import { LivroCaixaService } from './livro-caixa.service';
import { FiscalEngineService } from './fiscal-engine.service';
import { RevenueSyncService } from './revenue-sync.service';

// ===========================================================================
// ACEITE — CONTABIL S4 (livro-caixa.service). Sem banco real (Postgres local
// pode estar down): fake in-memory que implementa só a superfície de
// FiscalLedgerEntry/FiscalRevenueMonth usada pelo service, + `$queryRaw`
// controlável (simula o JOIN MasterBillingLedgerEntry × FinanceiroCharge do
// espelhamento — mesmo contrato do Prisma real).
// ===========================================================================

type LedgerRow = {
  id: string;
  data: Date;
  competencia: string;
  tipo: string;
  categoria: string;
  descricao: string;
  valorCents: number;
  origem: string;
  refId: string | null;
  motivo: string | null;
  estornaId: string | null;
  anoFechado: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type RevenueRow = {
  competencia: string;
  dasPrevistoCents: number | null;
  inssPrevistoCents: number | null;
};

type MpFakeRow = {
  id: string;
  competence: string | null;
  paidAt: Date | null;
  amount: number;
  status: string;
  referenceLabel: string | null;
  refundAmountReais: number | null;
};

let idSeq = 0;

class FakePrisma {
  ledger: LedgerRow[] = [];
  revenues: RevenueRow[] = [];
  mpRows: MpFakeRow[] = []; // fonte simulada do $queryRaw (JOIN MP × FinanceiroCharge)

  // Stub — o schema runtime não existe neste fake, então é no-op (mesma
  // filosofia dos outros testes do módulo: banco local pode estar down).
  async $executeRawUnsafe() { return 0; }

  // $queryRaw recebe um objeto Prisma.Sql (tem .strings). Duas queries usam a
  // MESMA fonte simulada (mpRows = JOIN MP × FinanceiroCharge):
  //  - espelharCompetencia (S4): SELECT das colunas → devolve as LINHAS;
  //  - receitaLiquidaCentsPorCompetencia (S1): SUM(amount − refundAmount)*100
  //    → devolve [{ cents }] agregado (a MESMA definição, provando a igualdade).
  async $queryRaw(query: any, ..._rest: unknown[]) {
    const sql: string = Array.isArray(query?.strings) ? query.strings.join(' ') : String(query ?? '');
    if (/SUM\(/i.test(sql)) {
      // Helper agregado do S1: SUM(GREATEST(round(amount*100) − round(refund*100), 0))
      // — clamp POR LINHA, idêntico ao espelhamento do S4 (reconciliação exata).
      const cents = this.mpRows.reduce((s, r) => {
        const bruto = Math.round(Number(r.amount || 0) * 100);
        const refund = Math.round(Number(r.refundAmountReais || 0) * 100);
        return s + Math.max(0, bruto - refund);
      }, 0);
      return [{ cents }] as any;
    }
    // Query de linhas do espelhamento (S4).
    return this.mpRows as any;
  }

  fiscalLedgerEntry = {
    findUnique: async ({ where }: any) => {
      if (where.id) return this.ledger.find((r) => r.id === where.id) ?? null;
      if (where.origem_refId) {
        const { origem, refId } = where.origem_refId;
        return this.ledger.find((r) => r.origem === origem && r.refId === refId) ?? null;
      }
      return null;
    },
    findFirst: async ({ where }: any) => {
      let rows = this.ledger.slice();
      if (where?.estornaId !== undefined) rows = rows.filter((r) => r.estornaId === where.estornaId);
      if (where?.anoFechado !== undefined) rows = rows.filter((r) => r.anoFechado === where.anoFechado);
      if (where?.competencia?.startsWith !== undefined) {
        rows = rows.filter((r) => r.competencia.startsWith(where.competencia.startsWith));
      }
      return rows[0] ?? null;
    },
    findMany: async ({ where }: any = {}) => {
      let rows = this.ledger.slice();
      if (where?.competencia !== undefined) {
        if (typeof where.competencia === 'string') rows = rows.filter((r) => r.competencia === where.competencia);
        else if (where.competencia.startsWith) rows = rows.filter((r) => r.competencia.startsWith(where.competencia.startsWith));
      }
      if (where?.categoria !== undefined) rows = rows.filter((r) => r.categoria === where.categoria);
      if (where?.tipo !== undefined) rows = rows.filter((r) => r.tipo === where.tipo);
      return rows.sort((a, b) => a.data.getTime() - b.data.getTime());
    },
    create: async ({ data }: any) => {
      const row: LedgerRow = {
        id: `led_${++idSeq}`,
        data: data.data,
        competencia: data.competencia,
        tipo: data.tipo,
        categoria: data.categoria,
        descricao: data.descricao,
        valorCents: data.valorCents,
        origem: data.origem,
        refId: data.refId ?? null,
        motivo: data.motivo ?? null,
        estornaId: data.estornaId ?? null,
        anoFechado: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.ledger.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.ledger.find((r) => r.id === where.id);
      if (!row) throw new Error(`ledger ${where.id} not found`);
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      let rows = this.ledger.slice();
      if (where?.competencia?.startsWith !== undefined) {
        rows = rows.filter((r) => r.competencia.startsWith(where.competencia.startsWith));
      }
      if (where?.anoFechado !== undefined) rows = rows.filter((r) => r.anoFechado === where.anoFechado);
      for (const r of rows) Object.assign(r, data, { updatedAt: new Date() });
      return { count: rows.length };
    },
  };

  fiscalRevenueMonth = {
    findUnique: async ({ where }: any) => this.revenues.find((r) => r.competencia === where.competencia) ?? null,
  };
}

function makeService() {
  const prisma = new FakePrisma();
  const engine = new FiscalEngineService();
  // RevenueSyncService real sobre o MESMO fake prisma — o helper único de
  // receita líquida (fonte de verdade compartilhada S1↔S4) é exercitado de fato.
  const revenueSync = new RevenueSyncService(prisma as any, engine);
  const svc = new LivroCaixaService(prisma as any, engine, revenueSync);
  return { svc, prisma, revenueSync };
}

// ---------------------------------------------------------------------------
// ESPELHAMENTO DE ENTRADAS — idempotência + dedução de estorno
// ---------------------------------------------------------------------------

test('espelhamento — pagamento APPROVED vira ENTRADA/RECEITA_ASSINATURA', async () => {
  const { svc, prisma } = makeService();
  prisma.mpRows = [
    { id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05T12:00:00Z'), amount: 397, status: 'APPROVED', referenceLabel: 'Plano Pro', refundAmountReais: 0 },
  ];

  const r = await svc.espelharCompetencia('2026-07');
  assert.equal(r.processadas, 1);
  assert.equal(r.gravadas, 1);

  const rows = await svc.listar({ competencia: '2026-07' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tipo, 'ENTRADA');
  assert.equal(rows[0].categoria, 'RECEITA_ASSINATURA');
  assert.equal(rows[0].valorCents, 397_00);
  assert.equal(rows[0].origem, 'AUTO_MP');
});

test('espelhamento — re-rodar a MESMA competência não duplica (idempotência)', async () => {
  const { svc, prisma } = makeService();
  prisma.mpRows = [
    { id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05T12:00:00Z'), amount: 397, status: 'APPROVED', referenceLabel: 'Plano Pro', refundAmountReais: 0 },
    { id: 'mp_2', competence: '2026-07', paidAt: new Date('2026-07-10T12:00:00Z'), amount: 197, status: 'APPROVED', referenceLabel: 'Checkout avulso', refundAmountReais: 0 },
  ];

  const r1 = await svc.espelharCompetencia('2026-07');
  assert.equal(r1.gravadas, 2);
  const r2 = await svc.espelharCompetencia('2026-07');
  assert.equal(r2.gravadas, 0, '2ª rodada não deve gravar nada novo — já está em dia');

  const rows = await svc.listar({ competencia: '2026-07' });
  assert.equal(rows.length, 2, 'não duplicou linhas');
});

test('espelhamento — estorno PARCIAL deduz o valor líquido (refundAmount da FinanceiroCharge)', async () => {
  const { svc, prisma } = makeService();
  prisma.mpRows = [
    { id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05T12:00:00Z'), amount: 500, status: 'PARTIALLY_REFUNDED', referenceLabel: 'Plano Pro', refundAmountReais: 150 },
  ];

  await svc.espelharCompetencia('2026-07');
  const rows = await svc.listar({ competencia: '2026-07' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].valorCents, 350_00, '500 − 150 de estorno = 350 líquido');
  assert.match(rows[0].descricao, /líquido de estorno/);
});

test('espelhamento — estorno TOTAL zera o valor líquido (nunca fica negativo)', async () => {
  const { svc, prisma } = makeService();
  prisma.mpRows = [
    { id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05T12:00:00Z'), amount: 500, status: 'REFUNDED', referenceLabel: 'Plano Pro', refundAmountReais: 500 },
  ];

  await svc.espelharCompetencia('2026-07');
  const rows = await svc.listar({ competencia: '2026-07' });
  assert.equal(rows[0].valorCents, 0);
});

test('espelhamento — estorno chega DEPOIS: atualiza o mesmo registro (não duplica)', async () => {
  const { svc, prisma } = makeService();
  prisma.mpRows = [
    { id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05T12:00:00Z'), amount: 500, status: 'APPROVED', referenceLabel: 'Plano Pro', refundAmountReais: 0 },
  ];
  await svc.espelharCompetencia('2026-07');

  // Estorno parcial chega depois (mesma linha MP, status/refund mudaram).
  prisma.mpRows[0].status = 'PARTIALLY_REFUNDED';
  prisma.mpRows[0].refundAmountReais = 200;
  const r2 = await svc.espelharCompetencia('2026-07');
  assert.equal(r2.gravadas, 1, 'atualizou o registro existente (mudou valor)');

  const rows = await svc.listar({ competencia: '2026-07' });
  assert.equal(rows.length, 1, 'ainda é 1 linha só — sem duplicar');
  assert.equal(rows[0].valorCents, 300_00);
});

// ---------------------------------------------------------------------------
// RECONCILIAÇÃO S4↔S1 — a base do DAS (receita líquida-de-estorno do S1) e a
// receita do Livro Caixa (ENTRADAS espelhadas do S4) NÃO podem divergir.
// ---------------------------------------------------------------------------

test('reconciliação — venda PARCIALMENTE estornada: base do DAS == Livro Caixa == 70.000 cents', async () => {
  const { svc, prisma, revenueSync } = makeService();
  // R$ 1.000 com R$ 300 estornado → 700 líquido = 70.000 cents nos DOIS lados.
  prisma.mpRows = [
    { id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05T12:00:00Z'), amount: 1000, status: 'PARTIALLY_REFUNDED', referenceLabel: 'Plano Pro', refundAmountReais: 300 },
  ];

  const rec = await svc.reconciliarReceita('2026-07');
  assert.equal(rec.dasBaseCents, 700_00, 'base do DAS = 700,00 líquido');
  assert.equal(rec.livroCaixaCents, 700_00, 'Livro Caixa = 700,00 líquido');
  assert.equal(rec.bate, true, 'DAS e Livro Caixa batem ao centavo');

  // E o helper único do S1 (base do DAS) sozinho devolve o mesmo número.
  const s1 = await revenueSync.receitaLiquidaCentsPorCompetencia('2026-07');
  assert.equal(s1, 700_00);
});

test('reconciliação — venda 100% estornada contribui 0 nos DOIS lados', async () => {
  const { svc, revenueSync, prisma } = makeService();
  prisma.mpRows = [
    { id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05T12:00:00Z'), amount: 500, status: 'REFUNDED', referenceLabel: 'Plano Pro', refundAmountReais: 500 },
  ];

  const rec = await svc.reconciliarReceita('2026-07');
  assert.equal(rec.dasBaseCents, 0);
  assert.equal(rec.livroCaixaCents, 0);
  assert.equal(rec.bate, true);
  assert.equal(await revenueSync.receitaLiquidaCentsPorCompetencia('2026-07'), 0);
});

test('reconciliação — mix (APPROVED + parcial + total) bate ao centavo', async () => {
  const { svc, prisma } = makeService();
  prisma.mpRows = [
    { id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-03T12:00:00Z'), amount: 397.90, status: 'APPROVED', referenceLabel: 'A', refundAmountReais: 0 },
    { id: 'mp_2', competence: '2026-07', paidAt: new Date('2026-07-06T12:00:00Z'), amount: 1000, status: 'PARTIALLY_REFUNDED', referenceLabel: 'B', refundAmountReais: 250.50 },
    { id: 'mp_3', competence: '2026-07', paidAt: new Date('2026-07-09T12:00:00Z'), amount: 200, status: 'REFUNDED', referenceLabel: 'C', refundAmountReais: 200 },
  ];
  // Esperado: 397,90 + (1000 − 250,50) + 0 = 1147,40 = 114.740 cents.
  const rec = await svc.reconciliarReceita('2026-07');
  assert.equal(rec.dasBaseCents, 114_740);
  assert.equal(rec.livroCaixaCents, 114_740);
  assert.equal(rec.bate, true);
});

// ---------------------------------------------------------------------------
// HOOK DAS/DARF_INSS -> SAÍDA automática (sem duplicar)
// ---------------------------------------------------------------------------

test('hook obrigação PAGA — DAS lança SAÍDA automática com o valor previsto do mês', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2026-07', dasPrevistoCents: 600_00, inssPrevistoCents: 308_00 });

  await svc.lancarSaidaObrigacaoPaga({ id: 'ob_das_1', competencia: '2026-07', tipo: 'DAS', dueDate: new Date('2026-08-20') });

  const rows = await svc.listar({ competencia: '2026-07' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tipo, 'SAIDA');
  assert.equal(rows[0].categoria, 'DAS');
  assert.equal(rows[0].valorCents, 600_00);
  assert.equal(rows[0].origem, 'AUTO_OBRIGACAO');
  assert.equal(rows[0].refId, 'ob_das_1');
});

test('hook obrigação PAGA — DARF_INSS lança SAÍDA com o INSS previsto', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2026-07', dasPrevistoCents: 600_00, inssPrevistoCents: 308_00 });

  await svc.lancarSaidaObrigacaoPaga({ id: 'ob_inss_1', competencia: '2026-07', tipo: 'DARF_INSS', dueDate: new Date('2026-08-20') });

  const rows = await svc.listar({ competencia: '2026-07' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].categoria, 'DARF_INSS');
  assert.equal(rows[0].valorCents, 308_00);
});

test('hook obrigação PAGA — chamar 2x pra MESMA obrigação não duplica (idempotência)', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2026-07', dasPrevistoCents: 600_00, inssPrevistoCents: 308_00 });

  await svc.lancarSaidaObrigacaoPaga({ id: 'ob_das_1', competencia: '2026-07', tipo: 'DAS', dueDate: new Date('2026-08-20') });
  await svc.lancarSaidaObrigacaoPaga({ id: 'ob_das_1', competencia: '2026-07', tipo: 'DAS', dueDate: new Date('2026-08-20') });

  const rows = await svc.listar({ competencia: '2026-07' });
  assert.equal(rows.length, 1, 'segunda chamada não duplicou');
});

test('hook obrigação PAGA — tipo fora de DAS/DARF_INSS é ignorado (ex.: PGDASD)', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2026-07', dasPrevistoCents: 600_00, inssPrevistoCents: 308_00 });

  await svc.lancarSaidaObrigacaoPaga({ id: 'ob_pgdasd_1', competencia: '2026-07', tipo: 'PGDASD', dueDate: new Date('2026-08-20') });

  const rows = await svc.listar({ competencia: '2026-07' });
  assert.equal(rows.length, 0);
});

test('hook obrigação PAGA — sem valor previsto (row ausente) não lança nada', async () => {
  const { svc } = makeService();
  await svc.lancarSaidaObrigacaoPaga({ id: 'ob_das_1', competencia: '2026-07', tipo: 'DAS', dueDate: new Date('2026-08-20') });
  const rows = await svc.listar({ competencia: '2026-07' });
  assert.equal(rows.length, 0);
});

// ---------------------------------------------------------------------------
// CRUD MANUAL + ESTORNO
// ---------------------------------------------------------------------------

test('lançamento manual — cria SAÍDA de pró-labore e aparece no saldo', async () => {
  const { svc } = makeService();
  await svc.criarLancamentoManual({
    data: '2026-07-15',
    tipo: 'SAIDA',
    categoria: 'PROLABORE',
    descricao: 'Pró-labore de julho',
    valorCents: 2_800_00,
  });
  const rows = await svc.listar({ competencia: '2026-07' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].saldoAcumuladoCents, -2_800_00);
});

test('lançamento manual — categoria fora da lista permitida é rejeitada', async () => {
  const { svc } = makeService();
  await assert.rejects(() =>
    svc.criarLancamentoManual({
      data: '2026-07-15',
      tipo: 'SAIDA',
      categoria: 'DAS', // DAS é só automático (AUTO_OBRIGACAO)
      descricao: 'tentativa indevida',
      valorCents: 100,
    }),
  );
});

test('estorno — corrige um lançamento SEM editar o original (trilha limpa)', async () => {
  const { svc } = makeService();
  const original = await svc.criarLancamentoManual({
    data: '2026-07-15',
    tipo: 'SAIDA',
    categoria: 'FERRAMENTA',
    descricao: 'Assinatura errada',
    valorCents: 100_00,
  });

  const estorno = await svc.estornarLancamento(original.id, { motivo: 'Cobrança duplicada' });
  assert.equal(estorno.tipo, 'ENTRADA', 'estorno de SAIDA é ENTRADA (efeito oposto)');
  assert.equal(estorno.categoria, 'ESTORNO');
  assert.equal(estorno.estornaId, original.id);
  assert.equal(estorno.valorCents, 100_00);

  const rows = await svc.listar({});
  assert.equal(rows.length, 2, 'original preservado + estorno novo — nunca edita o original');
  const originalAinda = rows.find((r) => r.id === original.id)!;
  assert.equal(originalAinda.valorCents, 100_00, 'original intacto');
});

test('estorno — não permite estornar um lançamento já estornado 2x', async () => {
  const { svc } = makeService();
  const original = await svc.criarLancamentoManual({
    data: '2026-07-15', tipo: 'SAIDA', categoria: 'OUTRO', descricao: 'x', valorCents: 50_00,
  });
  await svc.estornarLancamento(original.id, { motivo: 'erro 1' });
  await assert.rejects(() => svc.estornarLancamento(original.id, { motivo: 'erro 2' }));
});

// ---------------------------------------------------------------------------
// LUCRO ISENTO — bate o golden test 7 do S1 (32%×120.000 − 7.200 DAS = 31.200)
// ---------------------------------------------------------------------------

test('lucro isento do ano — bate o golden 7 do S1 (120.000 receita, 7.200 DAS → 31.200 disponível)', async () => {
  const { svc, prisma } = makeService();
  // Simula o ano com receita e DAS pago batendo o golden test 7 do fiscal-engine.
  prisma.ledger.push({
    id: 'seed_receita', data: new Date('2026-03-01'), competencia: '2026-03', tipo: 'ENTRADA',
    categoria: 'RECEITA_ASSINATURA', descricao: 'seed', valorCents: 120_000_00, origem: 'AUTO_MP',
    refId: 'seed_mp', motivo: null, estornaId: null, anoFechado: false, createdAt: new Date(), updatedAt: new Date(),
  });
  prisma.ledger.push({
    id: 'seed_das', data: new Date('2026-04-20'), competencia: '2026-04', tipo: 'SAIDA',
    categoria: 'DAS', descricao: 'seed', valorCents: 7_200_00, origem: 'AUTO_OBRIGACAO',
    refId: 'seed_ob', motivo: null, estornaId: null, anoFechado: false, createdAt: new Date(), updatedAt: new Date(),
  });

  const r = await svc.lucroIsentoDisponivelDoAno('2026');
  assert.equal(r.receitaAcumuladaCents, 120_000_00);
  assert.equal(r.dasPagoAcumuladoCents, 7_200_00);
  assert.equal(r.disponivelCents, 31_200_00);
});

test('lucro isento — já distribuído reduz o disponível', async () => {
  const { svc, prisma } = makeService();
  prisma.ledger.push({
    id: 'seed_receita', data: new Date('2026-03-01'), competencia: '2026-03', tipo: 'ENTRADA',
    categoria: 'RECEITA_ASSINATURA', descricao: 'seed', valorCents: 120_000_00, origem: 'AUTO_MP',
    refId: 'seed_mp', motivo: null, estornaId: null, anoFechado: false, createdAt: new Date(), updatedAt: new Date(),
  });
  prisma.ledger.push({
    id: 'seed_das', data: new Date('2026-04-20'), competencia: '2026-04', tipo: 'SAIDA',
    categoria: 'DAS', descricao: 'seed', valorCents: 7_200_00, origem: 'AUTO_OBRIGACAO',
    refId: 'seed_ob', motivo: null, estornaId: null, anoFechado: false, createdAt: new Date(), updatedAt: new Date(),
  });
  prisma.ledger.push({
    id: 'seed_dist', data: new Date('2026-05-10'), competencia: '2026-05', tipo: 'SAIDA',
    categoria: 'DISTRIBUICAO_LUCRO', descricao: 'retirada', valorCents: 10_000_00, origem: 'MANUAL',
    refId: null, motivo: 'retirada de lucro', estornaId: null, anoFechado: false, createdAt: new Date(), updatedAt: new Date(),
  });

  const r = await svc.lucroIsentoDisponivelDoAno('2026');
  assert.equal(r.disponivelCents, 21_200_00, '31.200 − 10.000 já distribuído');
});

// ---------------------------------------------------------------------------
// FECHAMENTO ANUAL — congela lançamentos; novo lançamento manual é recusado
// ---------------------------------------------------------------------------

test('fechamento anual — congela todos os lançamentos do ano (idempotente)', async () => {
  const { svc, prisma } = makeService();
  prisma.ledger.push({
    id: 'led_x', data: new Date('2026-03-01'), competencia: '2026-03', tipo: 'ENTRADA',
    categoria: 'RECEITA_ASSINATURA', descricao: 'seed', valorCents: 100_00, origem: 'AUTO_MP',
    refId: 'x', motivo: null, estornaId: null, anoFechado: false, createdAt: new Date(), updatedAt: new Date(),
  });

  const r1 = await svc.fecharAno('2026', {});
  assert.equal(r1.congelados, 1);
  const r2 = await svc.fecharAno('2026', {});
  assert.equal(r2.congelados, 0, 'idempotente — nada mais pra congelar');
});

test('fechamento anual — lançamento manual novo é recusado em ano fechado', async () => {
  const { svc, prisma } = makeService();
  prisma.ledger.push({
    id: 'led_x', data: new Date('2026-03-01'), competencia: '2026-03', tipo: 'ENTRADA',
    categoria: 'RECEITA_ASSINATURA', descricao: 'seed', valorCents: 100_00, origem: 'AUTO_MP',
    refId: 'x', motivo: null, estornaId: null, anoFechado: false, createdAt: new Date(), updatedAt: new Date(),
  });
  await svc.fecharAno('2026', {});

  await assert.rejects(() =>
    svc.criarLancamentoManual({ data: '2026-06-01', tipo: 'SAIDA', categoria: 'OUTRO', descricao: 'tentativa', valorCents: 10_00 }),
  );
});

// ---------------------------------------------------------------------------
// SALDO ACUMULADO / RESUMO DO ANO
// ---------------------------------------------------------------------------

test('resumo do ano — soma entradas/saídas/saldo corretamente', async () => {
  const { svc, prisma } = makeService();
  prisma.ledger.push(
    { id: 'a', data: new Date('2026-01-05'), competencia: '2026-01', tipo: 'ENTRADA', categoria: 'RECEITA_ASSINATURA', descricao: 'a', valorCents: 1000_00, origem: 'AUTO_MP', refId: 'a', motivo: null, estornaId: null, anoFechado: false, createdAt: new Date(), updatedAt: new Date() },
    { id: 'b', data: new Date('2026-02-05'), competencia: '2026-02', tipo: 'SAIDA', categoria: 'DAS', descricao: 'b', valorCents: 200_00, origem: 'AUTO_OBRIGACAO', refId: 'b', motivo: null, estornaId: null, anoFechado: false, createdAt: new Date(), updatedAt: new Date() },
  );
  const r = await svc.resumoAno('2026');
  assert.equal(r.entradasCents, 1000_00);
  assert.equal(r.saidasCents, 200_00);
  assert.equal(r.saldoCents, 800_00);
  assert.equal(r.lancamentos, 2);
});
