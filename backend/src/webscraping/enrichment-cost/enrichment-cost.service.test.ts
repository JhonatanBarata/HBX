import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { COMMERCIAL_PLAN_KEYS } from '../../commercial-plans/commercial-plan-catalog';
import { EnrichmentCostService } from './enrichment-cost.service';
import { ExternalDisabledEmailEnrichmentProvider } from './external-disabled-email-enrichment.provider';

function createPrismaMock() {
  const ledger: any[] = [];
  let nextId = 1;

  return {
    ledger,
    hasTable: async (tableName: string) => tableName === 'EnrichmentCostLedger',
    enrichmentCostLedger: {
      create: async ({ data }: any) => {
        const row = {
          id: `ledger-${nextId++}`,
          createdAt: new Date(),
          ...data,
        };
        ledger.push(row);
        return row;
      },
      findMany: async ({ where }: any) => {
        return ledger.filter((row) => {
          if (where?.companyId != null && row.companyId !== where.companyId) return false;
          if (where?.provider != null && row.provider !== where.provider) return false;
          if (where?.createdAt?.gte && new Date(row.createdAt).getTime() < new Date(where.createdAt.gte).getTime()) return false;
          return true;
        });
      },
    },
  };
}

function basePaidContext(overrides: Record<string, any> = {}) {
  return {
    companyId: 10,
    leadId: 'lead-1',
    provider: 'google' as const,
    sku: 'google_places_details',
    planKey: COMMERCIAL_PLAN_KEYS.PADRAO,
    triggeredBy: 'auto' as const,
    leadScore: 82,
    hasCriticalMissingData: true,
    hasCompanyName: true,
    hasCity: true,
    estimatedCostUsd: 0.01,
    estimatedCostBrl: 0.05,
    metadata: {
      source: 'test',
      apiKey: 'must-not-leak',
    },
    ...overrides,
  };
}

test('HBX List bloqueia fallback pago automatico', () => {
  const service = new EnrichmentCostService(createPrismaMock() as any);
  const decision = service.evaluatePaidFallback(basePaidContext({
    planKey: COMMERCIAL_PLAN_KEYS.LITE,
    budget: {
      paidApiBudgetBrlPerMonth: 10,
      paidGoogleFallbacksPerDay: 1,
    },
  }));

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'plan_disallows_paid_auto');
  assert.equal(decision.ledgerRequired, false);
});

test('Lead Plus permite lead bom com dado critico ausente e grava ledger antes do provider', async () => {
  const prisma = createPrismaMock();
  const service = new EnrichmentCostService(prisma as any);
  const reservation = await service.reservePaidFallback(basePaidContext());

  assert.equal(reservation.allowed, true);
  assert.equal(reservation.ledgerCreated, true);
  assert.equal(reservation.ledgerRequired, true);
  assert.equal(prisma.ledger.length, 1);
  assert.equal(prisma.ledger[0].provider, 'google');
  assert.equal(prisma.ledger[0].estimatedCostBrl, 0.05);
  assert.match(prisma.ledger[0].metadataJson, /redacted/);
  assert.doesNotMatch(prisma.ledger[0].metadataJson, /must-not-leak/);
});

test('cache hit nao consome cota paga nem custo no resumo', async () => {
  const prisma = createPrismaMock();
  const service = new EnrichmentCostService(prisma as any);
  const reservation = await service.reservePaidFallback(basePaidContext({
    cacheHit: true,
    estimatedCostBrl: 2,
    estimatedCostUsd: 1,
  }));

  const summary = await service.getCompanyCostSummary(10, { planKey: COMMERCIAL_PLAN_KEYS.PADRAO });

  assert.equal(reservation.allowed, true);
  assert.equal(reservation.consumesPaidQuota, false);
  assert.equal(prisma.ledger[0].cacheHit, true);
  assert.equal(prisma.ledger[0].estimatedCostBrl, 0);
  assert.equal(summary.cacheHitCount, 1);
  assert.equal(summary.paidLedgerCount, 0);
  assert.equal(summary.estimatedCostBrl, 0);
});

test('90 por cento do budget bloqueia automatico e permite manual', () => {
  const service = new EnrichmentCostService(createPrismaMock() as any);
  const autoDecision = service.evaluatePaidFallback(basePaidContext({
    currentMonthCostBrl: 90,
    estimatedCostBrl: 1,
    budget: { paidApiBudgetBrlPerMonth: 100 },
  }));
  const manualDecision = service.evaluatePaidFallback(basePaidContext({
    triggeredBy: 'manual',
    currentMonthCostBrl: 90,
    estimatedCostBrl: 1,
    budget: { paidApiBudgetBrlPerMonth: 100 },
  }));

  assert.equal(autoDecision.allowed, false);
  assert.equal(autoDecision.code, 'paid_budget_manual_only');
  assert.equal(manualDecision.allowed, true);
  assert.equal(manualDecision.stage, 'manual_only');
});

test('ledger ausente bloqueia reserva paga antes de qualquer chamada externa', async () => {
  const service = new EnrichmentCostService({
    hasTable: async () => false,
    enrichmentCostLedger: {
      create: async () => ({ id: 'never' }),
      findMany: async () => [],
    },
  } as any);

  await assert.rejects(
    () => service.reservePaidFallback(basePaidContext()),
    ServiceUnavailableException,
  );
});

test('provider externo de email fica desativado e nao faz chamada paga', async () => {
  const provider = new ExternalDisabledEmailEnrichmentProvider();
  const result = await provider.verify('contato@empresa.com.br');
  const domainResults = await provider.findByCompanyDomain('Empresa', 'empresa.com.br');

  assert.equal(result.status, 'disabled');
  assert.equal(result.provider, 'external_disabled');
  assert.equal(result.costLedgerId, undefined);
  assert.equal(domainResults[0].status, 'disabled');
});
