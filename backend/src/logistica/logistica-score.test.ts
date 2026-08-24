import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';

import { LogisticaService } from './logistica.service';
import { LogisticaController } from './logistica.controller';
import { isScoreFiadoEnabled } from './logistica-score.flags';

// S4 SCORE-DE-FIADO (11/07) — prova o DORMENTE + a fórmula v1 (S4-score-de-fiado.md):
//   (1) flag OFF (default) → endpoint 404 SEM tocar o serviço (zero query nova);
//   (2) menos de 3 charges fechadas → score null (historico_insuficiente);
//   (3) cliente pontual → score alto; (4) atrasos graves derrubam;
//   (5) vencida EM ABERTO pesa mais que atraso grave pago (−20 > −15);
//   + fail-closed moduloFinanceiroAtivo (M4) e escopo logistica_* (assinatura
//   HBX fora). O mock NÃO tem a tabela `entrega` de propósito: se o score
//   encostasse em entregas aguardando_fechamento (que ainda não viraram charge),
//   o teste quebrava — mensal pendente NÃO é atraso.

const FLAG = 'HBX_SCORE_FIADO_ENABLED';

function comFlag(valor: string | undefined, fn: () => Promise<void>): Promise<void> {
  const prev = process.env[FLAG];
  if (valor === undefined) delete process.env[FLAG];
  else process.env[FLAG] = valor;
  return fn().finally(() => {
    if (prev === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prev;
  });
}

// Datas em meio-dia LOCAL (longe da virada do dia) — a conta de atraso é por
// dia de CALENDÁRIO, então ancorar às 12:00 evita flake de fuso/madrugada.
function diasAtras(dias: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - dias);
  return d;
}

// Charge PAGA com N dias de atraso de calendário (0 = em dia; vencimento 30d atrás).
function paga(atrasoDias: number) {
  const dueDate = diasAtras(30);
  const paidAt = diasAtras(30 - atrasoDias);
  return { status: 'approved', lifecycle: 'paid', dueDate, paidAt };
}

// Charge 'pending' vencida há N dias (N≥1 = vencida em aberto; 0 = vence hoje).
function vencidaHa(dias: number) {
  return { status: 'pending', lifecycle: 'in_progress', dueDate: diasAtras(dias), paidAt: null };
}

// Prisma mock mínimo: SÓ o que scoreFiadoCliente toca (customerProfile +
// logisticaConfig + financeiroCharge). Sem tabela `entrega` (ver cabeçalho).
function buildPrisma(opts: { cliente?: any; moduloFinanceiroAtivo?: boolean; charges?: any[] } = {}) {
  const chamadas: string[] = [];
  let chargesWhere: any = null;
  const prisma: any = {
    customerProfile: {
      findFirst: async () => {
        chamadas.push('customerProfile.findFirst');
        return opts.cliente === undefined ? { id: 'cliente-1' } : opts.cliente;
      },
    },
    logisticaConfig: {
      findUnique: async () => {
        chamadas.push('logisticaConfig.findUnique');
        return { moduloFinanceiroAtivo: opts.moduloFinanceiroAtivo ?? true };
      },
    },
    financeiroCharge: {
      findMany: async (args: any) => {
        chamadas.push('financeiroCharge.findMany');
        chargesWhere = args?.where ?? null;
        return opts.charges ?? [];
      },
    },
  };
  return { prisma, chamadas, getChargesWhere: () => chargesWhere };
}

function buildService(prisma: any): LogisticaService {
  // conversations/rota/config não são tocados pelo score — stubs vazios bastam.
  return new LogisticaService(prisma, {} as any, {} as any, {} as any);
}

// ── flag (formato credits.flags.ts) ───────────────────────────────────────────

test('S4: flag default OFF; liga só com true/1/yes/on', async () => {
  await comFlag(undefined, async () => assert.equal(isScoreFiadoEnabled(), false));
  await comFlag('', async () => assert.equal(isScoreFiadoEnabled(), false));
  await comFlag('false', async () => assert.equal(isScoreFiadoEnabled(), false));
  await comFlag('banana', async () => assert.equal(isScoreFiadoEnabled(), false));
  await comFlag('1', async () => assert.equal(isScoreFiadoEnabled(), true));
  await comFlag('true', async () => assert.equal(isScoreFiadoEnabled(), true));
  await comFlag(' ON ', async () => assert.equal(isScoreFiadoEnabled(), true));
});

// ── (1) DORMENTE: flag OFF → endpoint 404 e o serviço NEM é chamado ───────────

test('S4: flag OFF → GET clientes/:id/score responde 404 SEM tocar o serviço (no-op)', async () => {
  await comFlag(undefined, async () => {
    let serviceChamado = 0;
    const serviceStub: any = {
      scoreFiadoCliente: async () => {
        serviceChamado++;
        return { score: 100 };
      },
    };
    const controller = new LogisticaController(serviceStub, {} as any, {} as any, {} as any, {} as any);
    await assert.rejects(
      () => controller.scoreCliente({ user: { companyId: 1 } }, 'cliente-1'),
      (e: any) => e instanceof NotFoundException && e.getStatus() === 404,
    );
    assert.equal(serviceChamado, 0); // zero query nova: nada além do 404 acontece
  });
});

test('S4: flag ON → endpoint repassa pro serviço e devolve o resultado', async () => {
  await comFlag('1', async () => {
    const esperado = { clienteId: 'cliente-1', score: 91, motivo: null, insumos: null };
    const serviceStub: any = { scoreFiadoCliente: async () => esperado };
    const controller = new LogisticaController(serviceStub, {} as any, {} as any, {} as any, {} as any);
    const res = await controller.scoreCliente(
      { user: { companyId: 1, role: 'ADMIN', canViewBilling: true } },
      'cliente-1',
    );
    assert.deepEqual(res, esperado);
  });
});

test('S4: flag ON + cliente de outra empresa (null do serviço) → 404', async () => {
  await comFlag('1', async () => {
    const serviceStub: any = { scoreFiadoCliente: async () => null };
    const controller = new LogisticaController(serviceStub, {} as any, {} as any, {} as any, {} as any);
    await assert.rejects(
      () => controller.scoreCliente(
        { user: { companyId: 1, role: 'ADMIN', canViewBilling: true } },
        'de-outra-empresa',
      ),
      (e: any) => e instanceof NotFoundException && e.getStatus() === 404,
    );
  });
});

// ── 24/08/2026 — o gate moduloFinanceiroAtivo MORREU (financeiro sempre ligado)

test('S4: o score é computado direto, SEM consultar a config do tenant (o gate morreu)', async () => {
  const { prisma, chamadas } = buildPrisma({ charges: [paga(0), paga(0), paga(0)] });
  const res = await buildService(prisma).scoreFiadoCliente(1, 'cliente-1');
  assert.equal(typeof res?.score, 'number');
  assert.equal(res?.motivo, null);
  assert.equal(chamadas.includes('logisticaConfig.findUnique'), false, 'a config nem é lida');
  assert.equal(Object.prototype.hasOwnProperty.call(res, 'moduloFinanceiroAtivo'), false, 'o flag saiu do contrato');
});

// ── (2) histórico insuficiente (<3 fechadas) → null ───────────────────────────

test('S4: menos de 3 charges fechadas → score null com historico_insuficiente', async () => {
  // 2 pagas + 1 vencida em aberto: vencida NÃO conta como fechada → 2 < 3.
  const { prisma } = buildPrisma({ charges: [paga(0), paga(2), vencidaHa(5)] });
  const res = await buildService(prisma).scoreFiadoCliente(1, 'cliente-1');
  assert.equal(res?.score, null);
  assert.equal(res?.motivo, 'historico_insuficiente');
  assert.equal(res?.insumos?.fechadas, 2);
  assert.equal(res?.insumos?.vencidasEmAberto, 1);
});

// ── (3) cliente pontual → score alto ──────────────────────────────────────────

test('S4: cliente pontual (5 pagas em dia) → score 100 (teto) + insumos do porquê', async () => {
  const { prisma, getChargesWhere } = buildPrisma({
    charges: [paga(0), paga(0), paga(0), paga(0), paga(0)],
  });
  const res = await buildService(prisma).scoreFiadoCliente(1, 'cliente-1');
  // 100 + 5×(+2) = 110 → teto 100.
  assert.equal(res?.score, 100);
  assert.equal(res?.motivo, null);
  assert.deepEqual(res?.insumos, { fechadas: 5, emDia: 5, atrasoLeve: 0, atrasoGrave: 0, vencidasEmAberto: 0 });
  // Escopo: SÓ charges da logística deste cliente (assinatura HBX fica fora).
  const where = getChargesWhere();
  assert.deepEqual(where?.sourceModule, { in: ['logistica_entrega', 'logistica_fechamento'] });
  assert.equal(where?.customerProfileId, 'cliente-1');
  assert.equal(where?.companyId, 1);
});

test('S4: atraso leve (≤7d) desconta 5; pendente que vence HOJE não é atraso', async () => {
  // 2 em dia + 1 leve (7d, fronteira) + 1 pending vencendo hoje (ignorada):
  // 100 + 2×2 − 5 = 99.
  const { prisma } = buildPrisma({ charges: [paga(0), paga(0), paga(7), vencidaHa(0)] });
  const res = await buildService(prisma).scoreFiadoCliente(1, 'cliente-1');
  assert.equal(res?.score, 99);
  assert.deepEqual(res?.insumos, { fechadas: 3, emDia: 2, atrasoLeve: 1, atrasoGrave: 0, vencidasEmAberto: 0 });
});

// ── (4) atrasos graves derrubam ───────────────────────────────────────────────

test('S4: atrasos graves (>7d) derrubam o score (−15 cada)', async () => {
  // 1 em dia + 2 graves: 100 + 2 − 30 = 72.
  const { prisma } = buildPrisma({ charges: [paga(0), paga(8), paga(30)] });
  const res = await buildService(prisma).scoreFiadoCliente(1, 'cliente-1');
  assert.equal(res?.score, 72);
  assert.deepEqual(res?.insumos, { fechadas: 3, emDia: 1, atrasoLeve: 0, atrasoGrave: 2, vencidasEmAberto: 0 });
});

test('S4: piso 0 — enxurrada de atraso não vira score negativo', async () => {
  const { prisma } = buildPrisma({
    charges: [paga(10), paga(20), paga(30), vencidaHa(10), vencidaHa(20), vencidaHa(40), vencidaHa(60)],
  });
  const res = await buildService(prisma).scoreFiadoCliente(1, 'cliente-1');
  // 100 − 3×15 − 4×20 = −25 → piso 0.
  assert.equal(res?.score, 0);
});

// ── (5) vencida em aberto pesa mais que atraso grave pago ─────────────────────

test('S4: vencida EM ABERTO (−20) pesa mais que atraso grave pago (−15)', async () => {
  const base = [paga(0), paga(0), paga(0)]; // 100 + 6 = 106 antes do teto
  const { prisma: prismaGrave } = buildPrisma({ charges: [...base, paga(10)] });
  const { prisma: prismaAberta } = buildPrisma({ charges: [...base, vencidaHa(10)] });
  const comGrave = await buildService(prismaGrave).scoreFiadoCliente(1, 'cliente-1');
  const comAberta = await buildService(prismaAberta).scoreFiadoCliente(1, 'cliente-1');
  assert.equal(comGrave?.score, 91); // 106 − 15
  assert.equal(comAberta?.score, 86); // 106 − 20
  assert.ok((comAberta?.score ?? 0) < (comGrave?.score ?? 0));
});

// ── company-scoped ────────────────────────────────────────────────────────────

test('S4: cliente inexistente/de outra empresa → null (vira 404 no controller)', async () => {
  const { prisma, chamadas } = buildPrisma({ cliente: null });
  const res = await buildService(prisma).scoreFiadoCliente(1, 'fantasma');
  assert.equal(res, null);
  assert.equal(chamadas.includes('financeiroCharge.findMany'), false);
});
