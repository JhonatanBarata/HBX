import test from 'node:test';
import assert from 'node:assert/strict';
import { ContabilCloseService } from './contabil-close.service';
import { FiscalEngineService } from './fiscal-engine.service';
import { RevenueSyncService } from './revenue-sync.service';
import { LivroCaixaService } from './livro-caixa.service';

// ===========================================================================
// ACEITE — CONTABIL S5 (contabil-close.service). Sem banco real (Postgres local
// pode estar down): fake in-memory que implementa a superfície de
// FiscalRevenueMonth / FiscalObligation / FiscalLedgerEntry / FiscalComprovante
// / FiscalMonthlyReport usada pelo wizard + $queryRaw controlável (JOIN MP ×
// FinanceiroCharge, mesmo contrato do S4). MasterAlert fake registra os zaps.
// ===========================================================================

let idSeq = 0;

class FakePrisma {
  revenues: any[] = [];
  obligations: any[] = [];
  ledger: any[] = [];
  comprovantes: any[] = [];
  reports: any[] = [];
  mpRows: any[] = []; // fonte simulada do $queryRaw (JOIN MP × FinanceiroCharge)

  async $executeRawUnsafe() { return 0; }

  async $queryRaw(query: any) {
    const sql: string = Array.isArray(query?.strings) ? query.strings.join(' ') : String(query ?? '');
    if (/SUM\(/i.test(sql)) {
      const cents = this.mpRows.reduce((s, r) => {
        const bruto = Math.round(Number(r.amount || 0) * 100);
        const refund = Math.round(Number(r.refundAmountReais || 0) * 100);
        return s + Math.max(0, bruto - refund);
      }, 0);
      return [{ cents }] as any;
    }
    return this.mpRows as any;
  }

  fiscalRevenueMonth = {
    findUnique: async ({ where }: any) => this.revenues.find((r) => r.competencia === where.competencia) ?? null,
    upsert: async ({ where, create, update }: any) => {
      const existing = this.revenues.find((r) => r.competencia === where.competencia);
      if (existing) { Object.assign(existing, update); return existing; }
      const row = { id: `rev_${++idSeq}`, ajusteManualCents: 0, folhaMesCents: 0, receitaNotasCents: 0, fechadoEm: null, ...create };
      this.revenues.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.revenues.find((r) => r.competencia === where.competencia);
      if (!row) throw new Error(`revenue ${where.competencia} not found`);
      Object.assign(row, data);
      return row;
    },
  };

  fiscalObligation = {
    findUnique: async ({ where }: any) => this.obligations.find((o) => o.id === where.id) ?? null,
    findMany: async ({ where }: any = {}) => {
      let rows = this.obligations.slice();
      if (where?.competencia !== undefined) rows = rows.filter((o) => o.competencia === where.competencia);
      return rows.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    },
    update: async ({ where, data }: any) => {
      const row = this.obligations.find((o) => o.id === where.id);
      if (!row) throw new Error(`obligation ${where.id} not found`);
      Object.assign(row, data);
      return row;
    },
  };

  fiscalLedgerEntry = {
    findUnique: async ({ where }: any) => {
      if (where.origem_refId) {
        const { origem, refId } = where.origem_refId;
        return this.ledger.find((r) => r.origem === origem && r.refId === refId) ?? null;
      }
      if (where.id) return this.ledger.find((r) => r.id === where.id) ?? null;
      return null;
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
      const row = { id: `led_${++idSeq}`, refId: null, motivo: null, estornaId: null, anoFechado: false, createdAt: new Date(), updatedAt: new Date(), ...data };
      this.ledger.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.ledger.find((r) => r.id === where.id);
      Object.assign(row, data);
      return row;
    },
  };

  fiscalComprovante = {
    findMany: async ({ where }: any = {}) => {
      let rows = this.comprovantes.slice();
      if (where?.competencia !== undefined) rows = rows.filter((r) => r.competencia === where.competencia);
      if (where?.status?.not !== undefined) rows = rows.filter((r) => r.status !== where.status.not);
      return rows;
    },
  };

  fiscalMonthlyReport = {
    findUnique: async ({ where }: any) => this.reports.find((r) => r.competencia === where.competencia) ?? null,
    upsert: async ({ where, create, update }: any) => {
      const existing = this.reports.find((r) => r.competencia === where.competencia);
      if (existing) { Object.assign(existing, update); return existing; }
      const row = { id: `rep_${++idSeq}`, ...create };
      this.reports.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.reports.find((r) => r.competencia === where.competencia);
      if (row) Object.assign(row, data);
      return row;
    },
  };
}

class FakeMasterAlert {
  calls: any[] = [];
  async fiscalObligationAlert(input: any) {
    this.calls.push(input);
    return { email: true, whatsapp: input.permitirWhatsapp !== false };
  }
}

function makeService() {
  const prisma = new FakePrisma();
  const engine = new FiscalEngineService();
  const revenueSync = new RevenueSyncService(prisma as any, engine);
  const livroCaixa = new LivroCaixaService(prisma as any, engine, revenueSync);
  const alert = new FakeMasterAlert();
  const svc = new ContabilCloseService(prisma as any, engine, revenueSync, livroCaixa, alert as any);
  return { svc, prisma, engine, revenueSync, livroCaixa, alert };
}

// ---------------------------------------------------------------------------
// PRÉ-FECHAMENTO — dossiê tem os números do motor + reconciliação + Fase 0.
// ---------------------------------------------------------------------------

test('preClose — monta dossiê com receita do MP, tributos do motor e reconciliação batendo', async () => {
  const { svc, prisma } = makeService();
  // R$ 5.000 de receita no mês (via ledger MP).
  prisma.mpRows = [
    { id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05T12:00:00Z'), amount: 5000, status: 'APPROVED', referenceLabel: 'Assinaturas', refundAmountReais: 0 },
  ];

  const d = await svc.preClose('2026-07');
  assert.equal(d.competencia, '2026-07');
  assert.equal(d.receita.receitaMesCents, 5_000_00);
  assert.equal(d.fase0, false);
  assert.ok(d.tributos.dasPrevistoCents > 0, 'DAS previsto do motor deve ser > 0');
  assert.equal(d.reconciliacao.bate, true, 'DAS base × Livro Caixa batem');
  assert.equal(d.reconciliacao.dasBaseCents, 5_000_00);
  assert.equal(d.reconciliacao.livroCaixaCents, 5_000_00);
  // Lucro isento do mês vem do motor (32% × receita − DAS), nunca calculado no front.
  assert.equal(d.lucroIsentoMesCents, Math.max(0, Math.round(5_000_00 * 0.32) - d.tributos.dasPrevistoCents));
});

// ---------------------------------------------------------------------------
// VALIDADOR DE DIVERGÊNCIA — o disjuntor do copiloto.
// ---------------------------------------------------------------------------

test('validarDivergenciaDas — governo igual ao nosso (±R$1) NÃO diverge', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2026-07', receitaCaixaCents: 5_000_00, receitaNotasCents: 0, ajusteManualCents: 0, folhaMesCents: 0, rbt12Cents: 5_000_00, folha12mCents: 0, dasPrevistoCents: 300_00, inssPrevistoCents: 0, irrfPrevistoCents: 0 });

  const ok = await svc.validarDivergenciaDas('2026-07', 300_50); // 50 centavos de diferença
  assert.equal(ok.diverge, false);
  assert.equal(ok.nossoDasCents, 300_00);
});

test('validarDivergenciaDas — governo diferente > R$1 DIVERGE (trava o passo)', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2026-07', receitaCaixaCents: 5_000_00, receitaNotasCents: 0, ajusteManualCents: 0, folhaMesCents: 0, rbt12Cents: 5_000_00, folha12mCents: 0, dasPrevistoCents: 300_00, inssPrevistoCents: 0, irrfPrevistoCents: 0 });

  const div = await svc.validarDivergenciaDas('2026-07', 450_00); // R$ 1,50 acima do limiar
  assert.equal(div.diverge, true, 'diferença > R$1 tem que travar');
  assert.equal(div.diffCents, 150_00);
});

test('fecharMes — RECUSA fechar se o DAS do governo passado ainda diverge', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2026-07', receitaCaixaCents: 5_000_00, receitaNotasCents: 0, ajusteManualCents: 0, folhaMesCents: 0, rbt12Cents: 5_000_00, folha12mCents: 0, dasPrevistoCents: 300_00, inssPrevistoCents: 0, irrfPrevistoCents: 0 });
  prisma.mpRows = [{ id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05'), amount: 5000, status: 'APPROVED', referenceLabel: 'x', refundAmountReais: 0 }];

  await assert.rejects(() => svc.fecharMes('2026-07', { dasGovernoCents: 900_00 }), /divergência/i);
  // Não gravou fechamento.
  const rev = prisma.revenues.find((r) => r.competencia === '2026-07');
  assert.equal(rev.fechadoEm ?? null, null, 'não fecha o mês com divergência');
});

// ---------------------------------------------------------------------------
// FECHAMENTO PONTA A PONTA — obrigações CONFERIDO + fechadoEm + relatório + zap.
// ---------------------------------------------------------------------------

test('fecharMes — ponta a ponta: obrigações viram CONFERIDO, grava fechadoEm, gera relatório e dispara zap', async () => {
  const { svc, prisma, alert } = makeService();
  prisma.mpRows = [{ id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05'), amount: 5000, status: 'APPROVED', referenceLabel: 'Assinaturas', refundAmountReais: 0 }];
  // Obrigações do mês: 1 aplicável pendente + 1 naoAplicavel (não deve mexer).
  prisma.obligations.push(
    { id: 'ob_das', competencia: '2026-07', tipo: 'DAS', dueDate: new Date('2026-08-20'), estado: 'PAGO', naoAplicavel: false, resultJson: null },
    { id: 'ob_esocial', competencia: '2026-07', tipo: 'ESOCIAL_S1200', dueDate: new Date('2026-08-15'), estado: 'CONFERIDO', naoAplicavel: true, resultJson: null },
  );

  const r = await svc.fecharMes('2026-07', {});
  assert.ok(r.fechadoEm, 'fechadoEm gravado');
  assert.equal(r.obrigacoesConferidas, 1, 'só a obrigação aplicável pendente vira CONFERIDO');
  assert.equal(prisma.obligations.find((o) => o.id === 'ob_das').estado, 'CONFERIDO');
  assert.equal(prisma.obligations.find((o) => o.id === 'ob_esocial').estado, 'CONFERIDO'); // já era

  // Mês fechado no banco.
  const rev = prisma.revenues.find((rr) => rr.competencia === '2026-07');
  assert.ok(rev.fechadoEm, 'fechadoEm persistido em FiscalRevenueMonth');

  // Relatório gerado + guardado no histórico + disparo no zap.
  assert.ok(r.relatorio.texto.includes('Fechamento de julho/2026'));
  assert.ok(r.relatorio.texto.includes('Receita'));
  assert.equal(r.enviadoZap, true, 'disparou 1 zap best-effort');
  const relatorioNoZap = alert.calls.find((c) => c.tipo === 'RELATORIO_MENSAL');
  assert.ok(relatorioNoZap, 'MasterAlertService recebeu o relatório');
  assert.equal(prisma.reports.length, 1, 'relatório guardado no histórico');
  assert.equal(prisma.reports[0].enviadoZap, true);
});

test('fecharMes — relatório NÃO passa pela IA por padrão (flag OFF): geradoViaIa false', async () => {
  const { svc, prisma } = makeService();
  delete process.env.HBX_CONTABIL_REPORT_AI_ENABLED;
  prisma.mpRows = [{ id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05'), amount: 3000, status: 'APPROVED', referenceLabel: 'x', refundAmountReais: 0 }];

  await svc.fecharMes('2026-07', {});
  assert.equal(prisma.reports[0].geradoViaIa, false, 'sem IA por padrão');
});

// ---------------------------------------------------------------------------
// MODO FASE 0 — receita 0 e pró-labore 0 → relatório curto "sem apuração".
// ---------------------------------------------------------------------------

test('preClose — Fase 0: receita 0 e folha 0 → fase0=true', async () => {
  const { svc } = makeService();
  const d = await svc.preClose('2026-07'); // sem mpRows, sem revenue: tudo zero
  assert.equal(d.fase0, true);
  assert.equal(d.receita.receitaMesCents, 0);
  assert.equal(d.folhaMesCents, 0);
});

test('fecharMes — Fase 0: fecha em 2 passos, relatório curto "sem apuração"', async () => {
  const { svc, prisma } = makeService();
  prisma.obligations.push(
    { id: 'ob_pgdasd', competencia: '2026-07', tipo: 'PGDASD', dueDate: new Date('2026-08-20'), estado: 'TRANSMITIDO', naoAplicavel: false, resultJson: null },
  );

  const r = await svc.fecharMes('2026-07', {});
  assert.ok(r.relatorio.texto.includes('Fase 0'));
  assert.ok(r.relatorio.texto.toLowerCase().includes('sem apuração'));
  assert.equal(r.obrigacoesConferidas, 1);
  assert.equal(prisma.obligations[0].estado, 'CONFERIDO');
});

// ---------------------------------------------------------------------------
// IMPACTO DO PRÓ-LABORE (passo 2) + DEFINIR PRÓ-LABORE recomputa a cadeia.
// ---------------------------------------------------------------------------

test('impactoProlabore — pró-labore alto derruba o Fator R p/ Anexo III (números do motor)', async () => {
  const { svc, prisma } = makeService();
  // Mês com RBT12 de 100k e folha 12m só do mês.
  prisma.revenues.push({ competencia: '2026-07', receitaCaixaCents: 10_000_00, receitaNotasCents: 0, ajusteManualCents: 0, folhaMesCents: 0, rbt12Cents: 100_000_00, folha12mCents: 0, dasPrevistoCents: 0, inssPrevistoCents: 0, irrfPrevistoCents: 0 });

  // Pró-labore de 28k → Fator R 0,28 → Anexo III.
  const alto = await svc.impactoProlabore('2026-07', 28_000_00);
  assert.equal(alto.anexoAplicado, 'III', 'pró-labore >= 28% do RBT12 mantém Anexo III');
  // Pró-labore baixo → Fator R < 0,28 → Anexo V.
  const baixo = await svc.impactoProlabore('2026-07', 1_000_00);
  assert.equal(baixo.anexoAplicado, 'V');
  assert.ok(baixo.dasCents >= alto.dasCents, 'Anexo V paga DAS >= Anexo III na mesma receita');
});

test('definirProlabore — grava folhaMesCents e recomputa INSS/IRRF do motor', async () => {
  const { svc, prisma } = makeService();
  prisma.mpRows = [{ id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05'), amount: 10000, status: 'APPROVED', referenceLabel: 'x', refundAmountReais: 0 }];

  const saved = await svc.definirProlabore('2026-07', 6_000_00);
  assert.equal(saved.folhaMesCents, 6_000_00);
  assert.ok(saved.inssPrevistoCents > 0, 'INSS recomputado pelo motor');
  const rev = prisma.revenues.find((r) => r.competencia === '2026-07');
  assert.equal(rev.folhaMesCents, 6_000_00);
});

// ---------------------------------------------------------------------------
// RELATÓRIO — avisos determinísticos (Fator R folgou; RBT12 perto da 2ª faixa).
// ---------------------------------------------------------------------------

test('relatório — avisa quando o Fator R folgou (dá pra baixar pró-labore)', async () => {
  const { svc, prisma } = makeService();
  // Receita R$10k/mês (só o mês corrente com dados → RBT12 proporcionalizado = 120k),
  // folha do mês R$40k → folha12m proporcionalizado = 480k → Fator R = 4,0 (folgado).
  // Recomendado = ceil(0,28×120k) = 33.600 → folga = 40k − 33.6k > 0 → avisa.
  prisma.mpRows = [{ id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05'), amount: 10000, status: 'APPROVED', referenceLabel: 'x', refundAmountReais: 0 }];
  prisma.revenues.push({ competencia: '2026-07', receitaCaixaCents: 0, receitaNotasCents: 0, ajusteManualCents: 0, folhaMesCents: 40_000_00 });

  const rel = await svc.gerarRelatorioNarrativo('2026-07');
  const temAvisoFolga = rel.avisos.some((a) => /folgou/i.test(a) && /baixar o pró-labore/i.test(a));
  assert.ok(temAvisoFolga, `deveria avisar folga do Fator R; avisos=${JSON.stringify(rel.avisos)}`);
});

test('relatório — avisa quando o RBT12 se aproxima da 2ª faixa do Simples (180k)', async () => {
  const { svc, prisma } = makeService();
  // 12 meses anteriores + o mês corrente com ~R$13.400/mês (13 meses ativos →
  // sem proporcionalização) → RBT12 ≈ 174.200 (>= 90% de 180k e <= 180k).
  const meses = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
  for (const m of meses) {
    prisma.revenues.push({ competencia: m, receitaCaixaCents: 13_400_00, receitaNotasCents: 0, ajusteManualCents: 0, folhaMesCents: 5_000_00 });
  }
  prisma.mpRows = [{ id: 'mp_1', competence: '2026-07', paidAt: new Date('2026-07-05'), amount: 13400, status: 'APPROVED', referenceLabel: 'x', refundAmountReais: 0 }];
  prisma.revenues.push({ competencia: '2026-07', receitaCaixaCents: 0, receitaNotasCents: 0, ajusteManualCents: 0, folhaMesCents: 5_000_00 });

  const d = await svc.preClose('2026-07');
  assert.ok(d.cadeia.rbt12Cents >= 162_000_00 && d.cadeia.rbt12Cents <= 180_000_00, `RBT12 fora da faixa do teste: ${d.cadeia.rbt12Cents}`);

  const rel = await svc.gerarRelatorioNarrativo('2026-07');
  const temAvisoFaixa = rel.avisos.some((a) => /2ª faixa/i.test(a) && /180\.000/.test(a));
  assert.ok(temAvisoFaixa, `deveria avisar aproximação da 2ª faixa; avisos=${JSON.stringify(rel.avisos)}`);
});
