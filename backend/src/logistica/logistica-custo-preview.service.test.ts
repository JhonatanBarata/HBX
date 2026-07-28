import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaRouteBillingService } from './logistica-route-billing.service';
import { LogisticaCustoPreviewService } from './logistica-custo-preview.service';

/**
 * Harness PRÓPRIO — duplicado (não importado) do `makeHarness` de
 * logistica-route-billing.service.test.ts de propósito: mesmo motivo já
 * documentado em LogisticaConferenciaService/LogisticaCustoPreviewService
 * (reusar exigiria exportar um helper de teste de um arquivo que o dono edita
 * em paralelo nesta mesma frente). Roda o SERVIÇO REAL de billing
 * (`prepareRoute`) e o preview NA MESMA base fake — é o que prova a
 * invariante do S6 ("preview nunca diverge do débito real"): os dois leem
 * exatamente as mesmas linhas de rota/stop/claim/ledger.
 */
function makeHarness(mode: 'ESSENTIAL' | 'TRACKED' = 'ESSENTIAL') {
  const routes: any[] = [];
  const stops: any[] = [];
  const claims: any[] = [];
  const ledger: any[] = [];
  const debitCalls: any[] = [];
  const entregas = new Map<string, { id: string; companyId: number; entregadorId: number; status: string; scheduledAt: null }>();
  let available = 100;
  let seq = 0;
  const p2002 = () => Object.assign(new Error('unique'), { code: 'P2002' });

  const match = (row: any, where: any): boolean => Object.entries(where || {}).every(([key, value]: any) => {
    if (key === 'OR' && Array.isArray(value)) return value.some((part: any) => match(row, part));
    if (key === 'delivery') {
      const entrega = entregas.get(row.deliveryId);
      const status = entrega?.status || 'agendada';
      const notValue = (value as any)?.status?.not;
      if (notValue !== undefined) return status !== notValue;
      return true;
    }
    if (key === 'status' && value?.in) return value.in.includes(row.status);
    if (key === 'id' && value?.in) return value.in.includes(row.id);
    if (key === 'deliveryId' && value?.in) return value.in.includes(row.deliveryId);
    if (value && typeof value === 'object' && 'lte' in value) return row[key] <= value.lte;
    return row[key] === value;
  });

  const prisma: any = {
    user: {
      findFirst: async ({ where }: any) => (
        (where.id === 9 || where.id === 10) && where.companyId === 7 ? { id: where.id } : null
      ),
    },
    entrega: {
      findMany: async ({ where }: any) => {
        let rows = Array.from(entregas.values()).filter((e) => e.companyId === where.companyId);
        if (where.id?.in) rows = rows.filter((e) => where.id.in.includes(e.id));
        if (where.entregadorId !== undefined) rows = rows.filter((e) => e.entregadorId === where.entregadorId);
        if (where.status?.in) rows = rows.filter((e) => where.status.in.includes(e.status));
        if (where.OR) {
          rows = rows.filter((e) => where.OR.some((part: any) => (part.scheduledAt === null ? e.scheduledAt === null : true)));
        }
        return rows.map((e) => ({ ...e }));
      },
      findFirst: async ({ where }: any) => {
        const rows = Array.from(entregas.values()).filter(
          (e) => e.companyId === where.companyId && (where.id === undefined || e.id === where.id),
        );
        return rows[0] ? { ...rows[0] } : null;
      },
    },
    logisticaRoute: {
      findUnique: async ({ where }: any) => {
        const key = where.companyId_entregadorId_routeDate;
        return routes.find((r) => r.companyId === key.companyId && r.entregadorId === key.entregadorId && r.routeDate === key.routeDate) || null;
      },
      create: async ({ data }: any) => {
        if (routes.some((r) => r.companyId === data.companyId && r.entregadorId === data.entregadorId && r.routeDate === data.routeDate)) throw p2002();
        const row = { id: `route-${++seq}`, initializationToken: null, initializationLeaseUntil: null, billingRevision: 0, updatedAt: new Date(), ...data };
        routes.push(row);
        return row;
      },
      findFirst: async ({ where }: any) => routes.filter((r) => match(r, where))[0] || null,
      findMany: async ({ where }: any) => {
        if (!where.OR) return routes.filter((r) => match(r, where));
        return routes.filter((route) => {
          if (route.companyId !== where.companyId || route.mode !== where.mode) return false;
          return where.OR.some((part: any) => {
            if (!match(route, Object.fromEntries(Object.entries(part).filter(([key]) => key !== 'essentialClaims')))) return false;
            const statuses = (part as any).essentialClaims?.some?.status?.in;
            return !statuses || claims.some((claim) => claim.routeId === route.id && statuses.includes(claim.status));
          });
        });
      },
      updateMany: async ({ where, data }: any) => {
        const selected = routes.filter((r) => match(r, where));
        selected.forEach((row) => {
          const next = { ...data };
          if (data.billingRevision?.increment) next.billingRevision = row.billingRevision + data.billingRevision.increment;
          Object.assign(row, next);
        });
        return { count: selected.length };
      },
    },
    logisticaRouteStop: {
      count: async ({ where }: any) => stops.filter((r) => match(r, where)).length,
      findMany: async ({ where }: any) => stops.filter((r) => match(r, where)),
      findFirst: async ({ where, include }: any) => {
        const row = stops.find((r) => match(r, where));
        if (!row) return null;
        return include?.route ? { ...row, route: routes.find((r) => r.id === row.routeId) || null } : row;
      },
      aggregate: async ({ where }: any) => ({
        _max: { snapshotOrder: Math.max(-1, ...stops.filter((r) => match(r, where)).map((r) => r.snapshotOrder)) },
      }),
      create: async ({ data }: any) => {
        if (stops.some((r) => r.deliveryId === data.deliveryId || (r.routeId === data.routeId && r.snapshotOrder === data.snapshotOrder))) throw p2002();
        const row = { id: `stop-${++seq}`, billingExempt: false, ...data };
        stops.push(row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const selected = stops.filter((r) => match(r, where));
        selected.forEach((row) => Object.assign(row, data));
        return { count: selected.length };
      },
    },
    logisticaEssentialCreditClaim: {
      count: async ({ where }: any) => claims.filter((r) => match(r, where)).length,
      findUnique: async ({ where }: any) => {
        const key = where.companyId_entregadorId_routeDate_blockIndex;
        return claims.find((r) => r.companyId === key.companyId && r.entregadorId === key.entregadorId && r.routeDate === key.routeDate && r.blockIndex === key.blockIndex) || null;
      },
      findFirst: async ({ where }: any) => claims.find((r) => match(r, where)) || null,
      findMany: async ({ where }: any) => claims.filter((r) => match(r, where)),
      create: async ({ data }: any) => {
        if (claims.some((r) => r.companyId === data.companyId && r.entregadorId === data.entregadorId && r.routeDate === data.routeDate && r.blockIndex === data.blockIndex)) throw p2002();
        const row = {
          id: `claim-${++seq}`, status: 'PENDING', billingRevision: 0, billingAttempt: 0, debitUsageKey: null,
          processingToken: null, leaseUntil: null, ...data,
        };
        claims.push(row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const selected = claims.filter((r) => match(r, where));
        selected.forEach((row) => Object.assign(row, data));
        return { count: selected.length };
      },
    },
    creditLedgerEntry: {
      findMany: async ({ where }: any) => ledger.filter((row) => {
        if (row.companyId !== where.companyId) return false;
        if (where.usageKey?.in && !where.usageKey.in.includes(row.usageKey)) return false;
        if (where.kind?.in && !where.kind.in.includes(row.kind)) return false;
        return true;
      }),
    },
  };
  prisma.$executeRawUnsafe = async () => 0;
  prisma.$transaction = async (callback: any) => callback(prisma);

  const wallet: any = {
    getBalance: async () => available,
    debit: async (companyId: number, amount: number, opts: any) => {
      debitCalls.push({ companyId, amount, ...opts });
      const previous = ledger.filter((r) => r.kind === 'debit' && r.usageKey === opts.usageKey);
      // Replay idempotente devolve o que JÁ foi debitado (como o wallet real).
      if (previous.length) {
        const debited = previous.reduce((sum, r) => sum + r.amount, 0);
        return { debited, requested: amount, partial: debited < amount, balanceAfter: available };
      }
      if (available < amount) return { debited: 0, requested: amount, partial: true, balanceAfter: available };
      available -= amount;
      ledger.push({ companyId, kind: 'debit', amount, usageKey: opts.usageKey });
      return { debited: amount, requested: amount, partial: false, balanceAfter: available };
    },
    refund: async (companyId: number, opts: any) => {
      const debit = ledger.find((r) => r.kind === 'debit' && r.usageKey === opts.usageKey);
      if (debit && !ledger.some((r) => r.kind === 'refund' && r.usageKey === `refund:${opts.usageKey}`)) {
        available += debit.amount;
        ledger.push({ companyId, kind: 'refund', amount: debit.amount, usageKey: `refund:${opts.usageKey}` });
      }
      return { refunded: debit?.amount || 0, balanceAfter: available, alreadyProcessed: false };
    },
  };
  const config: any = { resolveRouteMode: async () => mode };
  // 💰 27/07 — billing e preview leem o MESMO catálogo (resolveEffective); o
  // stub nasce no contrato base (debit/1) pra bateria antiga valer byte a byte.
  const essentialAction = { mode: 'debit' as 'debit' | 'free', cost: 0.4 };
  const actionConfig: any = {
    resolveEffective: async () => ({ key: 'logistica_essential_block', label: 'Rota Essencial', mode: essentialAction.mode, cost: essentialAction.cost }),
  };
  // PR28072026 HÍBRIDO — sem franquia: preserva as asserções de custo já existentes.
  const nivelPlanoStub: any = {
    franquiaDoMes: async () => ({ paradasInclusas: 0, paradasUsadas: 0, paradasRestantes: 0, blocosRestantes: 0 }),
    cobreParadaRastreada: async () => false,
  };
  const billing = new LogisticaRouteBillingService(prisma, wallet, config, actionConfig, nivelPlanoStub);
  const preview = new LogisticaCustoPreviewService(prisma, wallet, config, actionConfig);

  return {
    billing, preview, routes, stops, claims, ledger, debitCalls,
    setEssentialAction: (m: 'debit' | 'free', cost: number) => { essentialAction.mode = m; essentialAction.cost = cost; },
    setAvailable: (n: number) => { available = n; },
    seedEntrega: (id: string, overrides: Partial<{ companyId: number; entregadorId: number; status: string }> = {}) => {
      entregas.set(id, { id, companyId: 7, entregadorId: 9, status: 'agendada', scheduledAt: null, ...overrides });
    },
    setStatus: (id: string, status: string) => {
      const e = entregas.get(id);
      if (e) e.status = status;
    },
    seedForeignStop: (deliveryId: string, routeId = 'route-estrangeira') => {
      stops.push({ id: `stop-estrangeiro-${deliveryId}`, companyId: 7, routeId, deliveryId, snapshotOrder: 0, billingExempt: false });
    },
  };
}

const BASE = { companyId: 7, entregadorId: 9, routeDate: '2026-07-25' };

// 28/07 (dono) — a unidade virou a PARADA: 6 entregas são 6 unidades de 0,4,
// não 2 blocos de 2. O invariante que importa continua o mesmo: o que o motorista
// LÊ em "Iniciar Debitará" é exatamente o que sai da carteira no START.
test('preview == débito real: 6 entregas viram 6 paradas e o START debita exatamente isso', async () => {
  const h = makeHarness();
  const ids = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  ids.forEach((id) => h.seedEntrega(id));

  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ids }, 9);
  assert.equal(preview.blocosTotais, 6, '1 unidade por parada');
  assert.equal(preview.blocosJaDebitados, 0);
  assert.equal(preview.creditosAIniciar, 2.4, '6 × 0,4');
  assert.equal(preview.saldoAtual, 100);
  assert.equal(preview.saldoCobre, true);

  await h.billing.prepareRoute({ ...BASE, deliveryIds: ids, chargeEssential: true });
  const debitado = Math.round(h.debitCalls.reduce((s: number, c: any) => s + c.amount, 0) * 1000) / 1000;
  assert.equal(debitado, preview.creditosAIniciar, 'preview previu exatamente o que foi debitado');
});

test('preview segue o catálogo: custo por parada manda no "Iniciar Debitará"; free zera antes de qualquer débito', async () => {
  const caro = makeHarness();
  const ids = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  ids.forEach((id) => caro.seedEntrega(id));
  caro.setEssentialAction('debit', 2);
  const preview = await caro.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ids }, 9);
  assert.equal(preview.blocosTotais, 6);
  assert.equal(preview.creditosAIniciar, 12, '6 paradas × custo 2 do catálogo');
  await caro.billing.prepareRoute({ ...BASE, deliveryIds: ids, chargeEssential: true });
  assert.equal(caro.debitCalls.length, 6);
  assert.ok(caro.debitCalls.every((c: any) => c.amount === 2), 'o débito real usa o MESMO custo que o preview prometeu');

  const gratis = makeHarness();
  ['d1', 'd2', 'd3'].forEach((id) => gratis.seedEntrega(id));
  gratis.setEssentialAction('free', 0);
  const zero = await gratis.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1', 'd2', 'd3'] }, 9);
  assert.equal(zero.blocosTotais, 3, 'as paradas existem — só não custam nada');
  assert.equal(zero.creditosAIniciar, 0, 'modo free = iniciar não vai debitar');
  await gratis.billing.prepareRoute({ ...BASE, deliveryIds: ['d1', 'd2', 'd3'], chargeEssential: true });
  assert.equal(gratis.debitCalls.length, 0, 'e o START de fato não debitou');
});

test('re-iniciar não pede crédito de novo: claims já DEBITED zeram o preview', async () => {
  const h = makeHarness();
  const ids = ['d1', 'd2', 'd3', 'd4', 'd5'];
  ids.forEach((id) => h.seedEntrega(id));
  await h.billing.prepareRoute({ ...BASE, deliveryIds: ids, chargeEssential: true });
  assert.equal(h.debitCalls.length, 5, '5 entregas = 5 paradas cobradas no START');

  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ids }, 9);
  assert.equal(preview.blocosTotais, 5);
  assert.equal(preview.blocosJaDebitados, 5);
  assert.equal(preview.creditosAIniciar, 0, 'já foi pago — reabrir a conferência não pede de novo');
  assert.equal(h.debitCalls.length, 5, 'chamar o preview não debita nada');
});

test('entrega cancelada some do preview (mesma régua do billing: canceladas não inflam a conta)', async () => {
  const h = makeHarness();
  const ids = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  ids.forEach((id) => h.seedEntrega(id));
  await h.billing.prepareRoute({ ...BASE, deliveryIds: ids, chargeEssential: true });
  assert.equal(h.debitCalls.length, 6, '6 entregas = 6 paradas cobradas');

  h.setStatus('d6', 'cancelada');
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ids }, 9);
  assert.equal(preview.blocosTotais, 5, 'd6 cancelada não conta mais como parada');
  assert.equal(preview.blocosJaDebitados, 5, 'só as 5 que ainda cabem no total novo (blockIndex<=5)');
  assert.equal(preview.creditosAIniciar, 0, 'já foi pago — total menor nunca fica negativo');
});

test('preview nunca escreve: zero mutação em rota/stop/claim/ledger/débito', async () => {
  const h = makeHarness();
  ['d1', 'd2', 'd3'].forEach((id) => h.seedEntrega(id));
  const before = {
    routes: h.routes.length, stops: h.stops.length, claims: h.claims.length,
    ledger: h.ledger.length, debitCalls: h.debitCalls.length,
  };
  await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1', 'd2', 'd3'] }, 9);
  assert.equal(h.routes.length, before.routes);
  assert.equal(h.stops.length, before.stops);
  assert.equal(h.claims.length, before.claims);
  assert.equal(h.ledger.length, before.ledger);
  assert.equal(h.debitCalls.length, before.debitCalls);
});

test('saldoCobre vira false quando o saldo não cobre os créditos necessários', async () => {
  const h = makeHarness();
  h.setAvailable(1);
  const ids = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  ids.forEach((id) => h.seedEntrega(id));
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ids }, 9);
  assert.equal(preview.blocosTotais, 6);
  assert.equal(preview.creditosAIniciar, 2.4);
  assert.equal(preview.saldoAtual, 1);
  assert.equal(preview.saldoCobre, false, 'saldo 1 não cobre as 6 paradas (2,4)');
});

test('modo TRACKED não usa bloco de crédito: preview sempre zero e saldoCobre true', async () => {
  const h = makeHarness('TRACKED');
  ['d1', 'd2'].forEach((id) => h.seedEntrega(id));
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1', 'd2'] }, 9);
  assert.deepEqual(preview, { blocosTotais: 0, blocosJaDebitados: 0, creditosAIniciar: 0, saldoAtual: 100, saldoCobre: true });
});

test('pendência já stopada em rota estrangeira não soma no preview (migraria de graça ou travaria o Iniciar)', async () => {
  const h = makeHarness();
  h.seedEntrega('d1');
  h.seedEntrega('d2');
  h.seedForeignStop('d1');
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1', 'd2'] }, 9);
  assert.equal(preview.blocosTotais, 1, 'd1 já é stop de outra rota — só d2 é novo billable');
});

test('ator ADMIN sem entregadorId explícito resolve o motorista único do dia', async () => {
  const h = makeHarness();
  h.seedEntrega('d1');
  h.seedEntrega('d2');
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1', 'd2'] });
  assert.equal(preview.blocosTotais, 2);
});

test('ator ADMIN não consegue prever quando o dia tem mais de um motorista nas entregas', async () => {
  const h = makeHarness();
  h.seedEntrega('d1', { entregadorId: 9 });
  h.seedEntrega('d2', { entregadorId: 10 });
  await assert.rejects(
    h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1', 'd2'] }),
    /exatamente um motorista/,
  );
});

test('sem deliveryIds explícitos, usa todas as entregas abertas do motorista no dia', async () => {
  const h = makeHarness();
  ['d1', 'd2', 'd3'].forEach((id) => h.seedEntrega(id));
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate }, 9);
  assert.equal(preview.blocosTotais, 3);
});
