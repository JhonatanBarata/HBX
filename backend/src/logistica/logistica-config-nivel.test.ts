// PR27072026 F1 (27/07) — ROTA NÍVEIS: testes do nível do plano de logística em
// LogisticaConfigService. Mesmo molde de logistica-config-route-modes.test.ts
// (prisma fake em memória, node:test).
//
// 24/08/2026 (decisão do dono) — PLANO DIFERE SÓ POR Nº DE ASSENTOS: os gates
// de recurso por nível (financeiro Advanced+, cobrança Whats Advanced+, TRACKED
// só no Full) e o preset de toggles do setNivel MORRERAM. O que este arquivo
// cobre agora:
//  1) setNivel grava SÓ nível (+ assentos quando enviados) — nenhum toggle
//     comercial pega carona;
//  2) BASIC liga qualquer recurso normalmente (o teto por nível não existe);
//  3) grandfathering — linha sem `logisticaNivel`/valor sujo cai em ADVANCED;
//  4) o GET operacional continua carregando nível + assentos (o front mostra o
//     plano; não gateia nada).
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaConfigService } from './logistica-config.service';

const OWNER = { role: 'ADMIN', isSystemMaster: false, canViewBilling: true };
const MASTER = { role: 'ADMIN', isSystemMaster: true, canViewBilling: true };

function row(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 7,
    avisoWhatsEnabled: true,
    templateAviso: null,
    raioChegadaM: 60,
    velocidadeMediaKmH: 25,
    tempoParadaMin: 5,
    cobrancaNaEntrega: false,
    moduloRecoveryAtivo: false,
    diasTrabalho: null,
    pixChave: null,
    pixNome: null,
    pixCidade: null,
    avisoChegandoEnabled: false,
    avisoChegandoTemplate: null,
    avisoChegandoDistanciaM: 500,
    cobrancaWhatsAtiva: false,
    cobrancaAutomatica: false,
    resumoDiarioAtivo: false,
    resumoDiarioHora: 7,
    pedidoPublicoAtivo: false,
    pedidoPublicoToken: null,
    comprovanteFotoObrigatoria: false,
    comprovanteAssinaturaObrigatoria: false,
    comprovanteCodigoObrigatorio: false,
    logisticaNivel: 'ADVANCED',
    ...overrides,
  };
}

function setup(initial = row()) {
  let current: any = initial;
  const upsertCalls: any[] = [];
  const prisma: any = {
    logisticaConfig: {
      findUnique: async () => current,
      create: async ({ data }: any) => {
        current = row(data);
        return current;
      },
      upsert: async (args: any) => {
        upsertCalls.push(args);
        current = { ...current, ...args.create, ...args.update };
        return current;
      },
    },
  };
  const wallet: any = { getBalance: async () => 100 };
  const users: any = {
    findById: async () => ({ onboardingStateJson: null }),
    getOnboardingEvents: () => ({}),
    stampOnboardingEvent: async () => ({ firstTime: true, events: {} }),
  };
  return { service: new LogisticaConfigService(prisma, wallet, users), upsertCalls, getCurrent: () => current };
}

// ── 1) setNivel grava SÓ nível (+ assentos) ──────────────────────────────────

test('setNivel grava só o nível — nenhum toggle comercial pega carona (o preset morreu)', async () => {
  const { service, upsertCalls } = setup(row({ logisticaNivel: 'FULL', cobrancaWhatsAtiva: true, cobrancaAutomatica: true }));
  const cfg = await service.setNivel(7, 'basic', MASTER);
  assert.deepEqual(upsertCalls[0].update, { logisticaNivel: 'BASIC' });
  assert.equal(cfg.logisticaNivel, 'BASIC');
  // O que a empresa já tinha ligado continua ligado — trocar de nível não mexe.
  assert.equal(cfg.cobrancaWhatsAtiva, true);
  assert.equal(cfg.cobrancaAutomatica, true);
});

test('setNivel com assentos grava nível + override de assentos na mesma ficha (ROTA v2 F2c)', async () => {
  const { service, upsertCalls } = setup(row({ logisticaNivel: 'BASIC' }));
  const cfg = await service.setNivel(7, 'FULL', MASTER, 5);
  assert.deepEqual(upsertCalls[0].update, { logisticaNivel: 'FULL', logisticaAssentos: 5 });
  assert.equal(cfg.logisticaNivel, 'FULL');
  assert.equal(cfg.logisticaAssentos, 5);
});

test('setNivel rejeita valor desconhecido antes de gravar', async () => {
  const { service, upsertCalls } = setup();
  await assert.rejects(() => service.setNivel(7, 'PRO', MASTER), /Nível inválido/);
  assert.equal(upsertCalls.length, 0);
});

test('getNivel devolve o nível gravado', async () => {
  const { service } = setup(row({ logisticaNivel: 'FULL' }));
  // `logisticaAssentos` viaja junto (ROTA v2): a PRESENÇA da chave é o sinal
  // pro /master de que esta ficha aceita o override de assentos.
  assert.deepEqual(await service.getNivel(7), { nivel: 'FULL', logisticaAssentos: null });
});

// ── 2) SEM TETO POR NÍVEL: BASIC liga tudo ───────────────────────────────────

test('BASIC liga cobrança automática por WhatsApp normalmente (o gate Advanced+ morreu)', async () => {
  const { service } = setup(row({ logisticaNivel: 'BASIC' }));
  const cfg = await service.updateConfig(7, { cobrancaWhatsAtiva: true }, OWNER);
  assert.equal(cfg.cobrancaWhatsAtiva, true);
});

test('BASIC grava devedorNaRota COBRANCA/EXCLUIR normalmente (o gate de nível morreu)', async () => {
  for (const modo of ['COBRANCA', 'EXCLUIR'] as const) {
    const { service } = setup(row({ logisticaNivel: 'BASIC' }));
    const cfg = await service.updateConfig(7, { devedorNaRota: modo }, OWNER);
    assert.equal(cfg.devedorNaRota, modo, `modo ${modo} deveria gravar no BASIC`);
  }
});

// ── 3) GRANDFATHERING ─────────────────────────────────────────────────────────

test('config existente SEM logisticaNivel (linha pré-migration) é tratada como ADVANCED', async () => {
  const semNivel = row();
  delete (semNivel as any).logisticaNivel;
  const { service } = setup(semNivel);
  assert.deepEqual(await service.getNivel(7), { nivel: 'ADVANCED', logisticaAssentos: null });
});

test('grandfathering: valor sujo no banco (não é BASIC/ADVANCED/FULL/CREDITO) cai em ADVANCED', async () => {
  const { service } = setup(row({ logisticaNivel: 'legacy-lixo' }));
  assert.deepEqual(await service.getNivel(7), { nivel: 'ADVANCED', logisticaAssentos: null });
});

// ── 4) GET operacional carrega nível + assentos ──────────────────────────────

test('config operacional (GET consumido por qualquer ator) inclui logisticaNivel e assentos', async () => {
  const { service } = setup(row({ logisticaNivel: 'FULL', logisticaAssentos: 3 }));
  const driver = { role: 'USER', isSystemMaster: false, canViewBilling: false };
  const config = await service.getConfig(7, driver);
  assert.equal(config.logisticaNivel, 'FULL');
  assert.equal(config.logisticaAssentos, 3);
});
