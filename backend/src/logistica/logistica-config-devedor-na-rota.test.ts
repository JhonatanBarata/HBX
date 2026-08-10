// PR27072026 F2 (27/07) — devedorNaRota em LogisticaConfigService: OPERACIONAL
// (todo ator lê, não exige billing owner pra gravar — mesmo padrão de
// cobrancaAutomatica) + gate de nível ADVANCED+ só pra
// COBRANCA/EXCLUIR. Mesmo molde de logistica-config-nivel.test.ts (prisma fake
// em memória, node:test) — arquivo isolado de propósito.
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaConfigService } from './logistica-config.service';

const GERENTE = { role: 'ADMIN', isSystemMaster: false, canViewBilling: false };
const OWNER = { role: 'ADMIN', isSystemMaster: false, canViewBilling: true };
const MASTER = { role: 'ADMIN', isSystemMaster: true, canViewBilling: true };
const MOTORISTA = { role: 'USER', isSystemMaster: false, canViewBilling: false };

function row(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 7,
    avisoWhatsEnabled: true,
    templateAviso: null,
    raioChegadaM: 60,
    velocidadeMediaKmH: 25,
    tempoParadaMin: 5,
    cobrancaNaEntrega: false,
    moduloFinanceiroAtivo: false,
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
    trackingAtivo: false,
    modoRotaPadrao: 'ESSENTIAL',
    logisticaNivel: 'ADVANCED',
    devedorNaRota: 'COBRANCA',
    ...overrides,
  };
}

function setup(initial = row()) {
  let current: any = initial;
  const upsertCalls: any[] = [];
  const prisma: any = {
    logisticaConfig: {
      findUnique: async () => current,
      create: async ({ data }: any) => { current = row(data); return current; },
      upsert: async (args: any) => {
        upsertCalls.push(args);
        current = { ...current, ...args.create, ...args.update };
        return current;
      },
    },
  };
  const wallet: any = { getBalance: async () => 100 };
  return { service: new LogisticaConfigService(prisma, wallet), upsertCalls };
}

test('operacional: gerente/motorista (não billing owner) LEEM devedorNaRota no GET', async () => {
  const { service } = setup(row({ devedorNaRota: 'EXCLUIR' }));
  const gerente = await service.getConfig(7, GERENTE);
  const motorista = await service.getConfig(7, MOTORISTA);
  assert.equal(gerente.devedorNaRota, 'EXCLUIR');
  assert.equal(motorista.devedorNaRota, 'EXCLUIR');
});

test('default COBRANCA quando a linha ainda não tem o campo (config pré-migration)', async () => {
  const semCampo = row();
  delete (semCampo as any).devedorNaRota;
  const { service } = setup(semCampo);
  const cfg = await service.getConfig(7, OWNER);
  assert.equal(cfg.devedorNaRota, 'COBRANCA');
});

test('gerente (Admin, NÃO billing owner) GRAVA devedorNaRota sem 403 — é operacional, não comercial', async () => {
  const { service, upsertCalls } = setup(row({ logisticaNivel: 'ADVANCED' }));
  const cfg = await service.updateConfig(7, { devedorNaRota: 'EXCLUIR' }, GERENTE);
  assert.equal(cfg.devedorNaRota, 'EXCLUIR');
  assert.equal(upsertCalls.length, 1);
});

test('valor inválido é rejeitado antes de gravar', async () => {
  const { service, upsertCalls } = setup();
  await assert.rejects(
    () => service.updateConfig(7, { devedorNaRota: 'LIXO' as any }, OWNER),
    /Modo de devedor na rota inválido/,
  );
  assert.equal(upsertCalls.length, 0);
});

test('BASIC recusa COBRANCA/EXCLUIR pelo caminho do tenant (gate de nível)', async () => {
  for (const modo of ['COBRANCA', 'EXCLUIR']) {
    const { service, upsertCalls } = setup(row({ logisticaNivel: 'BASIC' }));
    await assert.rejects(
      () => service.updateConfig(7, { devedorNaRota: modo as any }, OWNER),
      /Advanced/,
      `modo ${modo} deveria recusar no BASIC`,
    );
    assert.equal(upsertCalls.length, 0);
  }
});

test('BASIC aceita NORMAL (equivale a "desligado")', async () => {
  const { service } = setup(row({ logisticaNivel: 'BASIC', devedorNaRota: 'COBRANCA' }));
  const cfg = await service.updateConfig(7, { devedorNaRota: 'NORMAL' }, OWNER);
  assert.equal(cfg.devedorNaRota, 'NORMAL');
});

test('Master passa por cima do teto do nível (BASIC liga EXCLUIR se o Master mandar)', async () => {
  const { service } = setup(row({ logisticaNivel: 'BASIC' }));
  const cfg = await service.updateConfig(7, { devedorNaRota: 'EXCLUIR' }, MASTER);
  assert.equal(cfg.devedorNaRota, 'EXCLUIR');
});

test('ADVANCED e FULL aceitam COBRANCA/EXCLUIR normalmente', async () => {
  for (const nivel of ['ADVANCED', 'FULL']) {
    const { service } = setup(row({ logisticaNivel: nivel }));
    const cfg = await service.updateConfig(7, { devedorNaRota: 'EXCLUIR' }, OWNER);
    assert.equal(cfg.devedorNaRota, 'EXCLUIR', `nível ${nivel} deveria permitir`);
  }
});
