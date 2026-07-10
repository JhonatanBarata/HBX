import test from 'node:test';
import assert from 'node:assert/strict';

import { MasterCockpitService } from './master-cockpit.service';

// COCKPIT-MASTER Sprint 2 — cobre o que o aceite pedia ao vivo (2 abas → 1
// rebuild; motor desligado → health.whatsapp null) em forma de unidade:
// cache TTL 30 s + single-flight do overview() e a sonda de chips com cache
// próprio de 60 s. O service é 100% defensivo, então um mock de Prisma quase
// vazio basta — cada builder engole o erro e devolve vazio/null.

type PrismaMock = {
  prisma: any;
  rosterCalls: () => number;
  releaseRoster: (() => void) | null;
};

// Mock mínimo: só company.findMany (usado pelo buildRoster e resolveCompanyNames)
// conta como "rebuild"; todo o resto do client não existe e é engolido pelos
// catches do service. `deferred: true` segura o build em voo (single-flight).
function buildPrismaMock(opts: { deferred?: boolean } = {}): PrismaMock {
  let rosterCalls = 0;
  const holder: PrismaMock = { prisma: null, rosterCalls: () => rosterCalls, releaseRoster: null };

  holder.prisma = {
    company: {
      findMany: async () => {
        rosterCalls += 1;
        if (opts.deferred) {
          await new Promise<void>((resolve) => {
            holder.releaseRoster = resolve;
          });
        }
        return [];
      },
    },
  };

  return holder;
}

// S5: constructor ganhou CreditsService/CreditWalletService (REUSO via DI). Stubs
// neutros por default — com HBX_CREDITS_ENABLED OFF (garantido no beforeEach) os
// builders de crédito devolvem null antes de encostar em qualquer dependência.
function buildService(
  prisma: any,
  webwhats: any = { listMotorInstances: async () => null },
  credits: any = {
    getMasterOverview: async () => ({ revenueRecharge30d: 0, revenueRecharge30dCount: 0, creditsInCirculation: 0 }),
  },
  creditWallet: any = { getBalancesByCompanyIds: async () => new Map<number, number>() },
) {
  return new MasterCockpitService(prisma as any, webwhats as any, credits as any, creditWallet as any);
}

// Flag de créditos SEMPRE conhecida por teste (o ambiente do dev não pode vazar).
test.beforeEach(() => {
  delete process.env.HBX_CREDITS_ENABLED;
});

test('overview: payload antigo íntegro + blocos novos events/health (motor desligado → whatsapp null)', async () => {
  const mock = buildPrismaMock();
  const service = buildService(mock.prisma);

  const payload = await service.overview();

  // Campos EXISTENTES do contrato — inalterados (regra dura do Sprint 2).
  assert.equal(typeof payload.generatedAt, 'string');
  assert.deepEqual(payload.feed, { sales: [], commissions: [] });
  assert.equal(typeof payload.metrics.mrrTotal, 'number');
  assert.equal(typeof payload.funnel.companiesTotal, 'number');
  assert.ok(Array.isArray(payload.roster));
  assert.ok(Array.isArray(payload.sellers));

  // Adições do Sprint 2.
  assert.ok(Array.isArray(payload.events));
  assert.deepEqual(payload.health, { whatsapp: null, billing: null, factory: null });

  // Adições do S5 — flag de créditos OFF → blocos nulos (front mostra "—").
  assert.equal(payload.credits, null);
  assert.equal(payload.activationFunnel, null);
});

test('overview: 2ª chamada dentro do TTL devolve o MESMO snapshot sem rebuild', async () => {
  const mock = buildPrismaMock();
  const service = buildService(mock.prisma);

  const first = await service.overview();
  const second = await service.overview();

  assert.equal(mock.rosterCalls(), 1); // 1 rebuild na janela
  assert.equal(second, first); // snapshot idêntico (mesma referência)
});

test('overview: cache expirado → novo rebuild (payload novo)', async () => {
  const mock = buildPrismaMock();
  const service = buildService(mock.prisma);

  const first = await service.overview();
  // Simula a passagem dos 30 s sem esperar de verdade.
  (service as any).overviewCache.at = Date.now() - 31_000;
  const second = await service.overview();

  assert.equal(mock.rosterCalls(), 2);
  assert.notEqual(second, first);
});

test('overview: requests concorrentes aguardam a MESMA promise (single-flight, 1 rebuild)', async () => {
  const mock = buildPrismaMock({ deferred: true });
  const service = buildService(mock.prisma);

  const p1 = service.overview();
  const p2 = service.overview(); // "2ª aba" enquanto o rebuild está em voo

  // Espera o build ficar pendurado no mock e solta.
  while (!mock.releaseRoster) await new Promise((r) => setTimeout(r, 5));
  mock.releaseRoster();

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(mock.rosterCalls(), 1); // um único rebuild para as duas abas
  assert.equal(r2, r1);
});

test('health.whatsapp: conta chips por estado do MOTOR AO VIVO e cacheia 60 s', async () => {
  const mock = buildPrismaMock();
  let bridgeCalls = 0;
  const webwhats = {
    listMotorInstances: async () => {
      bridgeCalls += 1;
      return [
        { connectionStatus: 'open' }, // formato cru da tabela Instance
        { instance: { state: 'connecting' } }, // formato aninhado antigo
        { connectionStatus: 'close' },
        { connectionStatus: 'OPEN' }, // case-insensitive
        { qualquerCoisa: true }, // estado desconhecido → other
      ];
    },
  };
  const service = buildService(mock.prisma, webwhats);

  const first = await service.overview();
  assert.equal(first.health.whatsapp.total, 5);
  assert.equal(first.health.whatsapp.open, 2);
  assert.equal(first.health.whatsapp.connecting, 1);
  assert.equal(first.health.whatsapp.closed, 1);
  assert.equal(first.health.whatsapp.other, 1);
  assert.equal(typeof first.health.whatsapp.checkedAt, 'string');

  // Rebuild do overview dentro da janela de 60 s da sonda → NÃO martela o motor.
  (service as any).overviewCache.at = Date.now() - 31_000;
  await service.overview();
  assert.equal(bridgeCalls, 1);
});

test('health.whatsapp: bridge que LANÇA não derruba o overview (sub-bloco → null)', async () => {
  const mock = buildPrismaMock();
  const webwhats = {
    listMotorInstances: async () => {
      throw new Error('motor fora do ar');
    },
  };
  const service = buildService(mock.prisma, webwhats);

  const payload = await service.overview();
  assert.equal(payload.health.whatsapp, null);
  assert.equal(typeof payload.generatedAt, 'string');
});

// ── MASTER-REFAB S5 — blocos do modelo crédito ─────────────────────────────────

test('S5 flag ON: bloco credits (recarga 30d via CreditsService, burn 7d, sem-saldo) + funil de ativação + roster com saldo/consumo', async () => {
  process.env.HBX_CREDITS_ENABLED = 'true';
  const now = Date.now();

  // Mock dedicado: distingue as chamadas pelo shape do `where` (roster não tem
  // where; coorte do funil tem createdAt; lista de tenants só companyKind).
  const prisma = {
    company: {
      findMany: async (args: any = {}) => {
        if (args?.where?.createdAt) return [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]; // coorte 30d
        if (args?.where?.companyKind) return [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]; // tenants
        return [
          { id: 1, name: 'Alfa', slug: 'alfa', companyKind: 'tenant', status: 'courtesy', isActive: true, createdAt: new Date(now - 5 * 86400000) },
          { id: 2, name: 'Beta', slug: 'beta', companyKind: 'tenant', status: 'courtesy', isActive: true, createdAt: new Date(now - 5 * 86400000) },
        ];
      },
    },
    creditLedgerEntry: {
      aggregate: async () => ({ _sum: { amount: 7 } }), // burn 7d
      groupBy: async (args: any = {}) =>
        args?.where?.createdAt
          ? [{ companyId: 1, _sum: { amount: 12 } }] // consumo 30d (roster)
          : [{ companyId: 1, _count: { _all: 3 } }, { companyId: 2, _count: { _all: 1 } }], // funil: ativou
    },
    financeiroCharge: {
      groupBy: async () => [{ companyId: 1, _count: { _all: 1 } }], // funil: 1ª recarga aprovada
    },
  };
  const credits = {
    // REUSO via DI: a query mora no CreditsService.getMasterOverview (S2) — aqui só o contrato.
    getMasterOverview: async () => ({ revenueRecharge30d: 97, revenueRecharge30dCount: 1, creditsInCirculation: 42 }),
  };
  const creditWallet = {
    getBalancesByCompanyIds: async () => new Map<number, number>([[1, 10]]), // 2/3/4 sem saldo
  };

  try {
    const service = buildService(prisma, undefined, credits, creditWallet);
    const payload = await service.overview();

    assert.deepEqual(payload.credits, {
      revenueRecharge30d: 97,
      revenueRecharge30dCount: 1,
      creditsInCirculation: 42,
      burn7d: 7,
      companiesNoBalance: 3, // tenants 2/3/4 sem lote aberto (ausente no Map = 0)
    });
    assert.deepEqual(payload.activationFunnel, {
      signups30d: 4,
      activated30d: 2, // 1º consumo = primeiro débito no ledger (fonte documentada)
      recharged30d: 1,
      activationRate: 50,
      rechargeRate: 50,
    });

    const alfa = payload.roster.find((r: any) => r.id === 1);
    const beta = payload.roster.find((r: any) => r.id === 2);
    assert.equal(alfa.creditsBalance, 10);
    assert.equal(alfa.consumption30d, 12);
    assert.equal(beta.creditsBalance, 0); // flag ON sem lote aberto → 0 (não null)
    assert.equal(beta.consumption30d, 0);
  } finally {
    delete process.env.HBX_CREDITS_ENABLED;
  }
});

test('S5: CreditsService que LANÇA não derruba o overview (bloco credits → null, resto íntegro)', async () => {
  process.env.HBX_CREDITS_ENABLED = 'true';
  const mock = buildPrismaMock();
  const credits = {
    getMasterOverview: async () => {
      throw new Error('créditos fora do ar');
    },
  };
  try {
    const service = buildService(mock.prisma, undefined, credits);
    const payload = await service.overview();
    assert.equal(payload.credits, null);
    assert.equal(typeof payload.generatedAt, 'string');
    assert.ok(Array.isArray(payload.roster));
  } finally {
    delete process.env.HBX_CREDITS_ENABLED;
  }
});
