import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaCustoPreviewService } from './logistica-custo-preview.service';
import { diaDeRotaUsageKey, passeDoDiaUsageKey } from './logistica-rota-cobranca.service';

/**
 * ROTA v2 (10/08, "PICAR A PONTE") — reescrito de raiz: o bloco por parada
 * morreu junto com `logistica-route-billing.service.ts`. O preview agora
 * espelha o modelo por NÍVEL (mesma régua de `LogisticaRotaCobrancaService`,
 * em modo 100% LEITURA — Lei nº3, "preview nunca debita"):
 *   - CREDITO: 1 débito por EMPRESA+DATA (`logistica_dia_de_rota`).
 *   - BASIC/ADVANCED/FULL (rota ILIMITADA): só o ASSENTO custa — motorista
 *     além do teto sem passe pago vira `logistica_passe_motorista_dia`.
 *
 * Harness PRÓPRIO, duplicado de propósito (mesmo padrão dos vizinhos:
 * LogisticaConferenciaService também duplica os helpers privados).
 */
function makeHarness(opts: {
  nivel?: string;
  logisticaAssentos?: number | null;
  diaCost?: number;
  diaMode?: 'debit' | 'free';
  passeCost?: number;
  passeMode?: 'debit' | 'free';
  available?: number;
} = {}) {
  const nivel = opts.nivel ?? 'CREDITO';
  const diaMode = opts.diaMode ?? 'debit';
  const diaCost = opts.diaCost ?? 6;
  const passeMode = opts.passeMode ?? 'debit';
  const passeCost = opts.passeCost ?? 8;
  let available = opts.available ?? 100;

  const entregas = new Map<string, { id: string; companyId: number; entregadorId: number | null; status: string; scheduledAt: null }>();
  const ledger: Array<{ companyId: number; usageKey: string; kind: string }> = [];

  const prisma: any = {
    entrega: {
      findMany: async ({ where }: any) => {
        let rows = Array.from(entregas.values()).filter((e) => e.companyId === where.companyId);
        if (where.id?.in) rows = rows.filter((e) => where.id.in.includes(e.id));
        if (typeof where.entregadorId === 'number') rows = rows.filter((e) => e.entregadorId === where.entregadorId);
        if (where.entregadorId && typeof where.entregadorId === 'object' && where.entregadorId.not === null) {
          rows = rows.filter((e) => e.entregadorId != null);
        }
        if (where.status?.in) rows = rows.filter((e) => where.status.in.includes(e.status));
        if (where.status?.not) rows = rows.filter((e) => e.status !== where.status.not);
        return rows.map((e) => ({ ...e }));
      },
    },
    logisticaConfig: {
      findUnique: async () => ({ logisticaNivel: nivel, logisticaAssentos: opts.logisticaAssentos ?? null }),
    },
    creditLedgerEntry: {
      findFirst: async ({ where }: any) =>
        ledger.find((row) => row.companyId === where.companyId && row.usageKey === where.usageKey && row.kind === where.kind) || null,
    },
  };

  const wallet: any = {
    getBalance: async () => available,
    debit: async () => { throw new Error('LEI Nº3 VIOLADA: preview nunca debita'); },
  };
  const config: any = {};
  const actionConfig: any = {
    resolveEffective: async (key: string) => {
      if (key === 'logistica_dia_de_rota') return { key, label: 'Dia de rota', mode: diaMode, cost: diaCost };
      if (key === 'logistica_passe_motorista_dia') return { key, label: 'Passe do dia', mode: passeMode, cost: passeCost };
      return null;
    },
  };

  const preview = new LogisticaCustoPreviewService(prisma, wallet, config, actionConfig);

  return {
    preview,
    ledger,
    setAvailable: (n: number) => { available = n; },
    seedEntrega: (id: string, overrides: Partial<{ companyId: number; entregadorId: number | null; status: string }> = {}) => {
      entregas.set(id, { id, companyId: 7, entregadorId: 9, status: 'agendada', scheduledAt: null, ...overrides });
    },
    marcarDiaPago: (companyId: number, routeDate: string) => {
      ledger.push({ companyId, usageKey: diaDeRotaUsageKey(companyId, routeDate), kind: 'debit' });
    },
    marcarPassePago: (companyId: number, driverUserId: number, dateISO: string) => {
      ledger.push({ companyId, usageKey: passeDoDiaUsageKey(companyId, driverUserId, dateISO), kind: 'debit' });
    },
  };
}

const BASE = { companyId: 7, entregadorId: 9, routeDate: '2026-07-25' };

// ── CREDITO ───────────────────────────────────────────────────────────────
test('CREDITO: dia ainda não pago custa o preço do catálogo (logistica_dia_de_rota)', async () => {
  const h = makeHarness({ nivel: 'CREDITO', diaCost: 6 });
  h.seedEntrega('d1');
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.blocosTotais, 1);
  assert.equal(preview.blocosJaDebitados, 0);
  assert.equal(preview.creditosAIniciar, 6);
  assert.equal(preview.saldoAtual, 100);
  assert.equal(preview.saldoCobre, true);
});

test('CREDITO: dia JÁ pago (remontar/outro motorista) não cobra de novo', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  h.seedEntrega('d1');
  h.marcarDiaPago(BASE.companyId, BASE.routeDate);
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.blocosJaDebitados, 1);
  assert.equal(preview.creditosAIniciar, 0, 'já foi pago — reabrir a conferência não pede de novo');
});

test('CREDITO: modo Grátis (master desligou) zera o preview antes de qualquer débito', async () => {
  const h = makeHarness({ nivel: 'CREDITO', diaMode: 'free' });
  h.seedEntrega('d1');
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.creditosAIniciar, 0);
});

test('CREDITO: saldoCobre vira false quando o saldo não cobre o dia', async () => {
  const h = makeHarness({ nivel: 'CREDITO', diaCost: 6 });
  h.setAvailable(1);
  h.seedEntrega('d1');
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.creditosAIniciar, 6);
  assert.equal(preview.saldoAtual, 1);
  assert.equal(preview.saldoCobre, false);
});

// ── PLANO (BASIC/ADVANCED/FULL) — rota ILIMITADA, só o ASSENTO custa ───────
test('ADVANCED: motorista JÁ ocupante do dia nunca custa (mesmo sem sobrar assento)', async () => {
  const h = makeHarness({ nivel: 'ADVANCED' }); // assentosInclusos ADVANCED = 2
  h.seedEntrega('d1', { entregadorId: 9 });
  h.seedEntrega('d2', { entregadorId: 11 });
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.creditosAIniciar, 0);
  assert.equal(preview.blocosJaDebitados, 1);
});

test('BASIC: motorista NOVO dentro do teto de assentos entra de graça', async () => {
  const h = makeHarness({ nivel: 'BASIC' }); // assentosInclusos BASIC = 1
  h.seedEntrega('d1', { entregadorId: 9 });
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.creditosAIniciar, 0, 'único motorista do dia — cabe no assento');
});

test('BASIC: 2º motorista estourando o teto de 1 assento custa o Passe do dia', async () => {
  const h = makeHarness({ nivel: 'BASIC', passeCost: 8 });
  h.seedEntrega('d1', { entregadorId: 11 }); // já ocupa o único assento
  // d2 ainda NÃO é do motorista 9 (cenário: admin prevendo ANTES de atribuir)
  // — se já fosse, o motorista já seria ocupante por definição (autoinclusão).
  h.seedEntrega('d2', { entregadorId: null });
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d2'] }, 9);
  assert.equal(preview.creditosAIniciar, 8, 'estourou o teto — precisa do passe');
  assert.equal(preview.blocosJaDebitados, 0);
});

test('BASIC: passe JÁ pago pra este motorista+dia libera sem cobrar de novo', async () => {
  const h = makeHarness({ nivel: 'BASIC' });
  h.seedEntrega('d1', { entregadorId: 11 });
  h.seedEntrega('d2', { entregadorId: null });
  h.marcarPassePago(BASE.companyId, 9, BASE.routeDate);
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d2'] }, 9);
  assert.equal(preview.creditosAIniciar, 0);
  assert.equal(preview.blocosJaDebitados, 1);
});

test('override de logisticaAssentos da empresa vence o default do nível', async () => {
  const h = makeHarness({ nivel: 'BASIC', logisticaAssentos: 5 }); // BASIC default seria 1
  h.seedEntrega('d1', { entregadorId: 11 });
  h.seedEntrega('d2', { entregadorId: 9 });
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d2'] }, 9);
  assert.equal(preview.creditosAIniciar, 0, 'override abriu 5 assentos — o 2º motorista cabe de graça');
});

// ── invariantes gerais ───────────────────────────────────────────────────
test('preview nunca escreve: zero débito real, mesmo passando pelos dois modelos', async () => {
  for (const nivel of ['CREDITO', 'ADVANCED']) {
    const h = makeHarness({ nivel });
    h.seedEntrega('d1');
    // wallet.debit lança se for chamado (ver makeHarness) — chegar até aqui
    // sem exceção já é a prova.
    await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
    assert.equal(h.ledger.length, 0);
  }
});

test('dia sem nenhuma parada: preview zerado sem consultar nível nem ledger', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: [] }, 9);
  assert.deepEqual(preview, { blocosTotais: 0, blocosJaDebitados: 0, creditosAIniciar: 0, saldoAtual: 100, saldoCobre: true });
});

test('ator ADMIN sem entregadorId explícito resolve o motorista único do dia', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  h.seedEntrega('d1');
  h.seedEntrega('d2');
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1', 'd2'] });
  assert.equal(preview.blocosTotais, 1);
});

test('ator ADMIN não consegue prever quando o dia tem mais de um motorista nas entregas', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  h.seedEntrega('d1', { entregadorId: 9 });
  h.seedEntrega('d2', { entregadorId: 10 });
  // PR29072026 — o BLOQUEIO é o mesmo; a frase é que passou a dizer QUAL dos 4
  // estados é (ver logistica-motorista-unico.util.ts).
  await assert.rejects(
    h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1', 'd2'] }),
    /divididas entre 2 motoristas/,
  );
});

test('sem deliveryIds explícitos, usa todas as entregas abertas do motorista no dia', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  ['d1', 'd2', 'd3'].forEach((id) => h.seedEntrega(id));
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate }, 9);
  assert.equal(preview.blocosTotais, 1, 'dia CREDITO com paradas = 1 cobrança pendente (o dia)');
});
