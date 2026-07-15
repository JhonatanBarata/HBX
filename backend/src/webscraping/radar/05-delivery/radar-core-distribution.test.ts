import test from 'node:test';
import assert from 'node:assert/strict';
import { WebscrapingService } from '../../webscraping.service';

// VENDAS-REFAB S2 — Leis de distribuição (backend).
//
// Cobre os 3 gaps do plano em `docs/PLANEJAMENTOS/VENDAS-REFAB/PLANO.md`:
//   1) A distribuição automática priorizava o segmento ÚNICO da regra da
//      empresa, ignorando o segmento preferido de cada vendedor
//      (`User.preferredSegmentsJson`).
//   2) Cada vendedor deve receber dentro da SUA cerca (território + segmento
//      preferido), não um segmento global.
//   3) O teto por vendedor (SELLER_ACTIVE_CARD_LIMIT via
//      getSellerActiveCardQuotaSnapshot) é a cerca de baixas do admin — um
//      vendedor cheio para de receber SEM travar os outros nem o admin.
//
// Estes testes exercitam `executeRadarAutoDistributionRule` via o entrypoint
// público `runRadarAutoDistributionForUser`, no mesmo estilo de
// `webscraping.service.test.ts` (instancia o serviço real com prisma mockado
// e sobrescreve só os métodos-folha: queryRadarRowsForCompany,
// importRadarLeadToVendasForUser, listActiveDistributionSellers etc.).

function createPrisma(overrides: Record<string, any> = {}) {
  return {
    hasTable: async () => true,
    hasColumn: async () => true,
    // getDailyDistributionSnapshot/incrementDailyDistributionDelivery/
    // recordDailyDistributionSkip chamam $queryRaw/$executeRaw como tagged
    // template direto (`this.prisma.$queryRaw\`...\`.catch(...)`) — precisa
    // existir como função chamável, senão o TypeError é síncrono e o
    // `.catch()` nunca roda.
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
    vendasLead: {
      count: async () => 0,
    },
    radarAutoDistributionRule: {
      update: async (args: any) => ({ id: args?.where?.id, ...args?.data }),
    },
    ...overrides,
  } as any;
}

function buildAdminUser(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    companyId: 7,
    name: 'Dono',
    role: 'ADMIN',
    isSystemMaster: false,
    company: { slug: 'hbx' },
    masterContext: { active: false },
    ...overrides,
  };
}

function buildRule(overrides: Record<string, any> = {}) {
  return {
    id: 'rule-1',
    companyId: 7,
    status: 'active',
    includeAdmin: false,
    adminTargetStock: 0,
    targetStockPerSeller: 30,
    dailyLimitPerSeller: 20,
    preferredState: 'SP',
    preferredCity: 'Campinas',
    segment: 'barbearias',
    radiusKm: null,
    targetUserIdsJson: null,
    filtersJson: null,
    ...overrides,
  };
}

function buildSeller(id: number, overrides: Record<string, any> = {}) {
  return {
    id,
    name: `Vendedor ${id}`,
    email: `vendedor${id}@hbx.test`,
    username: `vendedor${id}`,
    phone: null,
    commissionPercent: 0,
    sellerDistributionMode: 'normal',
    sellerDistributionPausedUntil: null,
    sellerDistributionDailyLimitOverride: null,
    sellerDistributionNote: null,
    preferredSegmentsJson: null,
    teamPolicy: null,
    ...overrides,
  };
}

function radarRow(id: string, segment: string, overrides: Record<string, any> = {}) {
  return {
    id,
    placeId: `place-${id}`,
    name: `Empresa ${id}`,
    phone: '(19) 99999-0000',
    phoneDigits: '19999990000',
    city: 'Campinas',
    state: 'SP',
    segment,
    normalizedSegment: segment,
    opportunityScore: 80,
    status: 'clean',
    ...overrides,
  };
}

// Monta um service pronto pra executar a distribuição automática, com os
// métodos-folha de infraestrutura (persistência do Radar, motor externo,
// cota comercial) stubados — só o que o teste quer observar fica "vivo".
function buildDistributionService(options: {
  prisma?: any;
  rule?: any;
  sellers?: any[];
  rows?: any[];
  activeQuotaByUserId?: Record<number, any>;
} = {}) {
  const prisma = options.prisma || createPrisma();
  const service = new WebscrapingService(prisma) as any;

  service.supportsRadarPersistence = async () => true;
  service.assertTeamPolicyAccessAnyRole = async () => true;
  // executeRadarAutoDistributionRule exige o serviço de Vendas injetado
  // (guard de disponibilidade) — só a existência importa aqui, nenhum método
  // dele é chamado no caminho testado.
  service.vendasService = service.vendasService || {};
  service.extractHbxErrorMessage = (error: any) => String(error?.message || error || 'erro');
  service.replenishRadarStockForUser = async () => ({ ran: false });

  const rule = options.rule || buildRule();
  service.prisma.radarAutoDistributionRule = {
    ...(service.prisma.radarAutoDistributionRule || {}),
    findUnique: async () => rule,
    update: async (args: any) => ({ id: args?.where?.id, ...args?.data }),
  };

  const sellers = options.sellers || [];
  service.listActiveDistributionSellers = async () => sellers;

  service.countRadarAutoDistributionOpenStock = async () => 0;

  const rows = options.rows || [];
  service.queryRadarRowsForCompany = async () => rows.slice();

  const importedIds: Array<{ radarLeadId: string; assignedUserId: number | null }> = [];
  service.importRadarLeadToVendasForUser = async (_user: any, radarLeadId: string, opts: any) => {
    importedIds.push({ radarLeadId, assignedUserId: opts?.assignedUserId ?? null });
    return { vendasLeadId: `vendas-${radarLeadId}` };
  };

  const activeQuotaByUserId = options.activeQuotaByUserId || {};
  service.commercialUsageLimits = {
    getSellerActiveCardQuotaSnapshot: async (_companyId: number, userId: number) => {
      const quota = activeQuotaByUserId[userId];
      if (quota) return quota;
      return { seller: true, paused: false, activeCount: 0, availableSlots: 999999, code: null };
    },
  };

  return { service, rule, importedIds };
}

test('VENDAS-REFAB S2: vendedor A CHEIO (teto de baixas atingido) nao impede vendedor B nem o admin de receber', async () => {
  const sellerA = buildSeller(101);
  const sellerB = buildSeller(102);
  const rule = buildRule({ includeAdmin: true, adminTargetStock: 5 });
  const rows = [
    radarRow('lead-1', 'barbearias'),
    radarRow('lead-2', 'barbearias'),
    radarRow('lead-3', 'barbearias'),
  ];
  const { service, importedIds } = buildDistributionService({
    rule,
    sellers: [sellerA, sellerB],
    rows,
    activeQuotaByUserId: {
      // Vendedor A: teto do admin (SELLER_ACTIVE_CARD_LIMIT) já atingido —
      // 0 slots disponíveis. Ele para de receber, mas NADA mais trava.
      101: { seller: true, paused: false, activeCount: 20, availableSlots: 0, code: 'SELLER_CARD_QUOTA_REACHED' },
      // Vendedor B: folga total.
      102: { seller: true, paused: false, activeCount: 0, availableSlots: 999999, code: null },
    },
  });

  const result = await service.runRadarAutoDistributionForUser(buildAdminUser(), { limit: 10 });

  assert.equal(result.ok, true);
  const targetA = result.targets.find((t: any) => t.userId === 101);
  const targetB = result.targets.find((t: any) => t.userId === 102);
  const targetAdmin = result.targets.find((t: any) => t.type === 'admin');

  // Vendedor A: cheio -> zero entregas, motivo explícito, mas SEM exception e
  // sem abortar a rodada inteira.
  assert.equal(targetA.delivered, 0);
  assert.equal(targetA.noDeliveryReason, 'Limite de cards ativos atingido');

  // Vendedor B e o admin seguem recebendo normalmente — o vendedor cheio não
  // trava ninguém (a ÁRVORE: cerca de um não é trava de outro).
  assert.ok(targetB.delivered > 0, 'vendedor B deveria receber cards mesmo com A cheio');
  assert.ok(targetAdmin.delivered > 0, 'admin deveria receber cards mesmo com vendedor A cheio');

  // Nenhum lead foi atribuído ao vendedor A (userId 101) apesar de ele estar
  // na fila de recipients.
  assert.ok(!importedIds.some((item) => item.assignedUserId === 101));
});

test('VENDAS-REFAB S2: vendedor com segmento preferido e priorizado nesse segmento dentro da sua cerca', async () => {
  const sellerBarbearia = buildSeller(201, {
    preferredSegmentsJson: JSON.stringify({ segments: ['barbearia'], cityRegion: null }),
  });
  const rule = buildRule({ segment: 'salao de beleza' });
  const rows = [
    // Pool devolvido pela query já expandida (segmento da regra + preferências
    // da fila) — o card de barbearia deve ir pro vendedor que prefere
    // barbearia, mesmo o segmento "oficial" da regra sendo salão de beleza.
    radarRow('lead-salao-1', 'salao de beleza'),
    radarRow('lead-barbearia-1', 'barbearia'),
  ];
  const { service, importedIds } = buildDistributionService({
    rule,
    sellers: [sellerBarbearia],
    rows,
  });

  const result = await service.runRadarAutoDistributionForUser(buildAdminUser(), { limit: 1 });

  assert.equal(result.ok, true);
  assert.equal(importedIds.length, 1);
  assert.equal(importedIds[0].radarLeadId, 'lead-barbearia-1');
  assert.equal(importedIds[0].assignedUserId, 201);
});

test('VENDAS-REFAB S2: vendedor sem segmento preferido continua recebendo do pool geral (nunca fica sem card)', async () => {
  const sellerSemPreferencia = buildSeller(301);
  const rule = buildRule({ segment: 'barbearias' });
  const rows = [radarRow('lead-1', 'barbearias')];
  const { service, importedIds } = buildDistributionService({
    rule,
    sellers: [sellerSemPreferencia],
    rows,
  });

  const result = await service.runRadarAutoDistributionForUser(buildAdminUser(), { limit: 1 });

  assert.equal(result.ok, true);
  assert.equal(importedIds.length, 1);
  assert.equal(importedIds[0].assignedUserId, 301);
});

test('VENDAS-REFAB S2: territorio fora da cerca continua bloqueando so aquele vendedor (regra pre-existente, nao regrediu)', async () => {
  const sellerForaDoTerritorio = buildSeller(401);
  const rule = buildRule({
    preferredCity: 'Campinas',
    preferredState: 'SP',
    filtersJson: JSON.stringify({
      territories: [
        { userId: 401, cities: [{ city: 'Sorocaba', state: 'SP' }] },
      ],
    }),
  });
  const rows = [radarRow('lead-1', 'barbearias')];
  const { service, importedIds } = buildDistributionService({
    rule,
    sellers: [sellerForaDoTerritorio],
    rows,
  });

  const result = await service.runRadarAutoDistributionForUser(buildAdminUser(), { limit: 1 });

  assert.equal(result.ok, true);
  const target = result.targets.find((t: any) => t.userId === 401);
  assert.equal(target.noDeliveryReason, 'Fora do território desta cidade');
  assert.equal(importedIds.length, 0);
});
