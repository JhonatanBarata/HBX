import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';
import { IndicacaoService } from './indicacao.service';
import { INDICACAO_BONUS_CREDITS } from './indicacao.flags';

// S5 INDICAÇÃO — prova do desenho anti-farm (docs/PLANEJAMENTOS/VISAO-FUTURO/
// S5-indicacao-com-creditos.md): (1) flag OFF = tudo no-op/404; (2) bônus idempotente
// (2 chamadas, 1 bônus por lado); (3) auto-indicação ignorada; (4) 2ª recarga não gera
// bônus de novo; (5) ref inválido nunca lança (signup não quebra).
//
// Fake mínimo: `ledger` único compartilhado entre o fake do Prisma (counts) e o fake da
// wallet (grant com dedup por usageKey — o MESMO contrato do CreditWalletService.grant,
// provado em credit-wallet.service.test.ts; aqui provamos que o serviço passa usageKeys
// ESTÁVEIS pra esse contrato segurar o anti-farm).

type Row = Record<string, any>;

function buildFakes(seed?: { companies?: Row[]; ledger?: Row[] }) {
  const companies: Row[] = (seed?.companies || []).map((c) => ({ ...c }));
  const ledger: Row[] = (seed?.ledger || []).map((l) => ({ ...l }));

  const prisma = {
    company: {
      findUnique: async ({ where }: any) => {
        const row = where?.id != null
          ? companies.find((c) => c.id === where.id)
          : companies.find((c) => c.indicacaoCode === where?.indicacaoCode);
        return row ? { ...row } : null;
      },
      updateMany: async ({ where, data }: any) => {
        const rows = companies.filter(
          (c) => c.id === where.id && (where.indicacaoCode === undefined || (c.indicacaoCode ?? null) === where.indicacaoCode),
        );
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
      count: async ({ where }: any) =>
        companies.filter((c) => c.indicadaPorCompanyId === where.indicadaPorCompanyId).length,
    },
    creditLedgerEntry: {
      count: async ({ where }: any) =>
        ledger.filter((l) => {
          if (where.companyId !== undefined && l.companyId !== where.companyId) return false;
          if (where.kind !== undefined && l.kind !== where.kind) return false;
          if (where.grantType !== undefined && l.grantType !== where.grantType) return false;
          if (where.usageKey?.startsWith !== undefined && !String(l.usageKey || '').startsWith(where.usageKey.startsWith)) return false;
          return true;
        }).length,
    },
  };

  const grantCalls: Array<{ companyId: number; amount: number; opts: Row }> = [];
  const wallet = {
    grant: async (companyId: number, amount: number, opts: Row = {}) => {
      grantCalls.push({ companyId, amount, opts });
      const usageKey = opts.usageKey || null;
      if (usageKey) {
        const existing = ledger.find((l) => l.usageKey === usageKey);
        if (existing) return { entryId: existing.id, amount: existing.amount, alreadyProcessed: true };
      }
      const row = {
        id: `e${ledger.length + 1}`,
        companyId,
        amount,
        kind: opts.kind || 'grant',
        grantType: opts.grantType ?? null,
        usageKey,
        sourceRef: opts.sourceRef ?? null,
      };
      ledger.push(row);
      return { entryId: row.id, amount, alreadyProcessed: false };
    },
  };

  const service = new IndicacaoService(prisma as any, wallet as any);
  return { service, companies, ledger, grantCalls };
}

function promoLots(ledger: Row[]) {
  return ledger.filter((l) => l.kind === 'promo');
}

function withFlag(value: string | undefined, fn: () => Promise<void>) {
  return async () => {
    const before = process.env.HBX_INDICACAO_ENABLED;
    if (value === undefined) delete process.env.HBX_INDICACAO_ENABLED;
    else process.env.HBX_INDICACAO_ENABLED = value;
    try {
      await fn();
    } finally {
      if (before === undefined) delete process.env.HBX_INDICACAO_ENABLED;
      else process.env.HBX_INDICACAO_ENABLED = before;
    }
  };
}

// ── (1) Flag OFF: deploy 100% inerte ────────────────────────────────────────────────────────────

test('flag OFF: onPrimeiraRecargaAprovada é no-op, resolveCode devolve null, painel dá 404', withFlag(undefined, async () => {
  const { service, ledger, grantCalls } = buildFakes({
    companies: [
      { id: 1, indicacaoCode: 'ind_abc123ff', indicadaPorCompanyId: null },
      { id: 10, indicacaoCode: null, indicadaPorCompanyId: 1 },
    ],
    ledger: [{ id: 'r1', companyId: 10, amount: 100, kind: 'recharge', grantType: 'paid', usageKey: 'mp:pay-1' }],
  });

  assert.deepEqual(await service.onPrimeiraRecargaAprovada(10), { granted: false, reason: 'flag_off' });
  assert.equal(grantCalls.length, 0);
  assert.equal(promoLots(ledger).length, 0);

  assert.equal(await service.resolveCode('ind_abc123ff'), null);

  await assert.rejects(service.getMeForCompany(1), (err: any) => err instanceof NotFoundException);
  await assert.rejects(service.getOrCreateCode(1), (err: any) => err instanceof NotFoundException);
}));

// ── (2) Bônus idempotente: 2 chamadas, 1 bônus por lado ─────────────────────────────────────────

test('flag ON: 1ª recarga paga → bônus pros DOIS lados; repetir a chamada NÃO dobra', withFlag('true', async () => {
  const { service, ledger } = buildFakes({
    companies: [
      { id: 1, indicacaoCode: 'ind_abc123ff', indicadaPorCompanyId: null },
      { id: 10, indicacaoCode: null, indicadaPorCompanyId: 1 },
    ],
    ledger: [{ id: 'r1', companyId: 10, amount: 100, kind: 'recharge', grantType: 'paid', usageKey: 'mp:pay-1' }],
  });

  assert.deepEqual(await service.onPrimeiraRecargaAprovada(10), { granted: true, reason: 'ok' });

  const lots = promoLots(ledger);
  assert.equal(lots.length, 2);
  const daIndicada = lots.find((l) => l.usageKey === 'referral:indicada:10');
  const doIndicador = lots.find((l) => l.usageKey === 'referral:indicador:10');
  assert.ok(daIndicada && doIndicador, 'usageKeys exatas do .md');
  assert.equal(daIndicada!.companyId, 10);
  assert.equal(doIndicador!.companyId, 1);
  for (const lot of lots) {
    assert.equal(lot.amount, INDICACAO_BONUS_CREDITS);
    assert.equal(lot.grantType, 'promo');
    assert.equal(lot.sourceRef, 'referral_program');
  }

  // Retry/corrida: mesma chamada de novo → dedup por usageKey segura, nada dobra.
  await service.onPrimeiraRecargaAprovada(10);
  assert.equal(promoLots(ledger).length, 2);
}));

// ── (3) Auto-indicação ignorada ─────────────────────────────────────────────────────────────────

test('flag ON: auto-indicação (indicadaPorCompanyId == própria empresa) nunca paga', withFlag('true', async () => {
  const { service, ledger, grantCalls } = buildFakes({
    companies: [{ id: 10, indicacaoCode: 'ind_deadbeef', indicadaPorCompanyId: 10 }],
    ledger: [{ id: 'r1', companyId: 10, amount: 100, kind: 'recharge', grantType: 'paid', usageKey: 'mp:pay-1' }],
  });

  assert.deepEqual(await service.onPrimeiraRecargaAprovada(10), { granted: false, reason: 'auto_indicacao' });
  assert.equal(grantCalls.length, 0);
  assert.equal(promoLots(ledger).length, 0);
}));

// ── (4) 2ª recarga não gera bônus (nem "atrasado") ──────────────────────────────────────────────

test('flag ON: 2ª recarga paga não gera bônus de novo (nem se a 1ª passou sem o programa)', withFlag('true', async () => {
  const { service, ledger, grantCalls } = buildFakes({
    companies: [
      { id: 1, indicacaoCode: 'ind_abc123ff', indicadaPorCompanyId: null },
      { id: 10, indicacaoCode: null, indicadaPorCompanyId: 1 },
    ],
    ledger: [
      { id: 'r1', companyId: 10, amount: 100, kind: 'recharge', grantType: 'paid', usageKey: 'mp:pay-1' },
      { id: 'r2', companyId: 10, amount: 50, kind: 'recharge', grantType: 'paid', usageKey: 'mp:pay-2' },
    ],
  });

  assert.deepEqual(await service.onPrimeiraRecargaAprovada(10), { granted: false, reason: 'nao_e_primeira_recarga' });
  assert.equal(grantCalls.length, 0);
  assert.equal(promoLots(ledger).length, 0);
}));

test('flag ON: empresa sem indicador é no-op; indicador APAGADO não derruba o bônus da indicada', withFlag('true', async () => {
  const { service, ledger } = buildFakes({
    companies: [
      { id: 20, indicacaoCode: null, indicadaPorCompanyId: null },
      // 30 foi indicada pela 999, que não existe mais.
      { id: 30, indicacaoCode: null, indicadaPorCompanyId: 999 },
    ],
    ledger: [
      { id: 'r1', companyId: 20, amount: 100, kind: 'recharge', grantType: 'paid', usageKey: 'mp:pay-20' },
      { id: 'r2', companyId: 30, amount: 100, kind: 'recharge', grantType: 'paid', usageKey: 'mp:pay-30' },
    ],
  });

  assert.deepEqual(await service.onPrimeiraRecargaAprovada(20), { granted: false, reason: 'sem_indicador' });

  assert.deepEqual(await service.onPrimeiraRecargaAprovada(30), { granted: true, reason: 'ok' });
  const lots = promoLots(ledger);
  assert.equal(lots.length, 1);
  assert.equal(lots[0].usageKey, 'referral:indicada:30');
}));

// ── (5) Ref inválido no signup não quebra ───────────────────────────────────────────────────────

test('resolveCode: inválido/ausente/erro de banco → null, NUNCA lança (signup não quebra)', withFlag('true', async () => {
  const { service } = buildFakes({
    companies: [{ id: 1, indicacaoCode: 'ind_abc123ff', indicadaPorCompanyId: null }],
  });

  assert.equal(await service.resolveCode('ind_abc123ff'), 1); // válido resolve
  assert.equal(await service.resolveCode('ind_inexistente'), null);
  assert.equal(await service.resolveCode(''), null);
  assert.equal(await service.resolveCode('   '), null);
  assert.equal(await service.resolveCode(undefined), null);
  assert.equal(await service.resolveCode(null), null);

  // Banco explodindo no meio do signup: resolveCode engole e devolve null.
  const quebrado = new IndicacaoService(
    { company: { findUnique: async () => { throw new Error('db down'); } } } as any,
    {} as any,
  );
  assert.equal(await quebrado.resolveCode('ind_abc123ff'), null);
}));

// ── Código opaco + painel ───────────────────────────────────────────────────────────────────────

test('getOrCreateCode: gera `ind_` + 8 hex, persiste e é estável entre chamadas', withFlag('true', async () => {
  const { service, companies } = buildFakes({
    companies: [{ id: 1, indicacaoCode: null, indicadaPorCompanyId: null }],
  });

  const code = await service.getOrCreateCode(1);
  assert.match(code, /^ind_[0-9a-f]{8}$/);
  assert.equal(companies[0].indicacaoCode, code);
  assert.equal(await service.getOrCreateCode(1), code); // nunca troca código já distribuído

  await assert.rejects(service.getOrCreateCode(999), (err: any) => err instanceof NotFoundException);
}));

test('getMeForCompany: link montado + contagem de indicadas × convertidas', withFlag('true', async () => {
  const before = process.env.APP_URL;
  process.env.APP_URL = 'https://app.test/';
  try {
    const { service } = buildFakes({
      companies: [
        { id: 1, indicacaoCode: 'ind_abc123ff', indicadaPorCompanyId: null },
        { id: 10, indicacaoCode: null, indicadaPorCompanyId: 1 },
        { id: 11, indicacaoCode: null, indicadaPorCompanyId: 1 },
      ],
      // Só a 10 converteu (bônus do indicador correspondente existe na carteira da 1).
      ledger: [
        { id: 'p1', companyId: 1, amount: 25, kind: 'promo', grantType: 'promo', usageKey: 'referral:indicador:10' },
      ],
    });

    assert.deepEqual(await service.getMeForCompany(1), {
      code: 'ind_abc123ff',
      link: 'https://app.test/?ref=ind_abc123ff',
      bonusCredits: INDICACAO_BONUS_CREDITS,
      indicadas: 2,
      convertidas: 1,
    });
  } finally {
    if (before === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = before;
  }
}));
