// PR27072026 F1 (27/07) — ROTA 3 NÍVEIS: testes do nível do plano de logística
// (Basic/Advanced/Full) em LogisticaConfigService. Mesmo molde de
// logistica-config-route-modes.test.ts (prisma fake em memória, node:test).
//
// Cobre exatamente o que o dono pediu:
//  1) preset aplica a matriz certa por nível (setNivel);
//  2) BASIC não liga financeiro real (nem cobrança por WhatsApp) pelo caminho
//     do tenant — updateConfig recusa; Master passa por cima;
//  3) TRACKED recusado fora do FULL — updateRouteMode recusa a ESCRITA e
//     resolveRouteMode recusa a LEITURA (cinto-e-suspensório), fora do FULL;
//  4) grandfathering — config existente sem `logisticaNivel` (linha pré-
//     migration) é tratada como ADVANCED, nada desliga.
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
  return { service: new LogisticaConfigService(prisma, wallet), upsertCalls, getCurrent: () => current };
}

// ── 1) PRESET DA MATRIZ ───────────────────────────────────────────────────────

test('setNivel BASIC: financeiro, cobrança automática e tracking OFF', async () => {
  const { service, upsertCalls } = setup(row({ logisticaNivel: 'FULL', moduloFinanceiroAtivo: true, cobrancaWhatsAtiva: true, cobrancaAutomatica: true, trackingAtivo: true, modoRotaPadrao: 'TRACKED' }));
  const cfg = await service.setNivel(7, 'basic', MASTER);
  assert.deepEqual(upsertCalls[0].update, {
    logisticaNivel: 'BASIC',
    moduloFinanceiroAtivo: false,
    cobrancaWhatsAtiva: false,
    cobrancaAutomatica: false,
    trackingAtivo: false,
    modoRotaPadrao: 'ESSENTIAL',
  });
  assert.equal(cfg.logisticaNivel, 'BASIC');
  assert.equal(cfg.moduloFinanceiroAtivo, false);
});

test('setNivel ADVANCED: liga financeiro real; tracking segue exclusivo do Full', async () => {
  const { service, upsertCalls } = setup(row({ logisticaNivel: 'BASIC' }));
  const cfg = await service.setNivel(7, 'ADVANCED', MASTER);
  assert.deepEqual(upsertCalls[0].update, {
    logisticaNivel: 'ADVANCED',
    moduloFinanceiroAtivo: true,
    trackingAtivo: false,
    modoRotaPadrao: 'ESSENTIAL',
  });
  assert.equal(cfg.logisticaNivel, 'ADVANCED');
  assert.equal(cfg.moduloFinanceiroAtivo, true);
});

test('setNivel FULL: tudo ligado, incluindo TRACKED por padrão de rota', async () => {
  const { service, upsertCalls } = setup(row({ logisticaNivel: 'BASIC' }));
  const cfg = await service.setNivel(7, 'full', MASTER);
  assert.deepEqual(upsertCalls[0].update, {
    logisticaNivel: 'FULL',
    moduloFinanceiroAtivo: true,
    cobrancaWhatsAtiva: true,
    cobrancaAutomatica: true,
    trackingAtivo: true,
    modoRotaPadrao: 'TRACKED',
  });
  assert.equal(cfg.logisticaNivel, 'FULL');
  assert.equal(cfg.trackingAtivo, true);
  assert.equal(cfg.modoRotaPadrao, 'TRACKED');
});

test('setNivel rejeita valor desconhecido antes de gravar', async () => {
  const { service, upsertCalls } = setup();
  await assert.rejects(() => service.setNivel(7, 'PRO', MASTER), /Nível inválido/);
  assert.equal(upsertCalls.length, 0);
});

test('getNivel devolve o nível gravado', async () => {
  const { service } = setup(row({ logisticaNivel: 'FULL' }));
  assert.deepEqual(await service.getNivel(7), { nivel: 'FULL' });
});

// ── 2) TETO DE USO: financeiro real e cobrança automática são Advanced+ ──────

test('BASIC não liga financeiro real pelo caminho do tenant (updateConfig)', async () => {
  const { service, upsertCalls } = setup(row({ logisticaNivel: 'BASIC' }));
  await assert.rejects(
    () => service.updateConfig(7, { moduloFinanceiroAtivo: true }, OWNER),
    /Financeiro completo é do plano Advanced/,
  );
  assert.equal(upsertCalls.length, 0);
});

test('BASIC não liga cobrança automática por WhatsApp pelo caminho do tenant', async () => {
  const { service, upsertCalls } = setup(row({ logisticaNivel: 'BASIC' }));
  await assert.rejects(
    () => service.updateConfig(7, { cobrancaWhatsAtiva: true }, OWNER),
    /Cobrança automática por WhatsApp é do plano Advanced/,
  );
  assert.equal(upsertCalls.length, 0);
});

test('BASIC ainda pode DESLIGAR financeiro/cobrança (só ligar é que é barrado)', async () => {
  const { service, upsertCalls } = setup(row({ logisticaNivel: 'BASIC', moduloFinanceiroAtivo: true, cobrancaWhatsAtiva: true }));
  const cfg = await service.updateConfig(7, { moduloFinanceiroAtivo: false, cobrancaWhatsAtiva: false }, OWNER);
  assert.equal(cfg.moduloFinanceiroAtivo, false);
  assert.equal(cfg.cobrancaWhatsAtiva, false);
  assert.equal(upsertCalls.length, 1);
});

test('ADVANCED e FULL ligam financeiro real pelo caminho do tenant normalmente', async () => {
  for (const nivel of ['ADVANCED', 'FULL']) {
    const { service } = setup(row({ logisticaNivel: nivel }));
    const cfg = await service.updateConfig(7, { moduloFinanceiroAtivo: true }, OWNER);
    assert.equal(cfg.moduloFinanceiroAtivo, true, `nível ${nivel} deveria permitir`);
  }
});

test('Master passa por cima do teto do nível (BASIC liga financeiro se o Master mandar)', async () => {
  const { service } = setup(row({ logisticaNivel: 'BASIC' }));
  const cfg = await service.updateConfig(7, { moduloFinanceiroAtivo: true }, MASTER);
  assert.equal(cfg.moduloFinanceiroAtivo, true);
});

// ── 3) TRACKED é exclusivo do FULL (escrita E leitura) ────────────────────────

test('updateRouteMode recusa TRACKED fora do FULL (BASIC e ADVANCED)', async () => {
  for (const nivel of ['BASIC', 'ADVANCED']) {
    const { service, upsertCalls } = setup(row({ logisticaNivel: nivel }));
    await assert.rejects(
      () => service.updateRouteMode(7, { modoRotaPadrao: 'TRACKED' }, OWNER),
      /Rastreamento é do plano Full/,
      `nível ${nivel} deveria recusar`,
    );
    assert.equal(upsertCalls.length, 0);
  }
});

test('updateRouteMode aceita TRACKED no FULL', async () => {
  const { service } = setup(row({ logisticaNivel: 'FULL' }));
  const cfg = await service.updateRouteMode(7, { trackingAtivo: true, modoRotaPadrao: 'TRACKED' }, OWNER);
  assert.equal(cfg.modoRotaPadrao, 'TRACKED');
});

test('Master liga TRACKED mesmo em empresa BASIC (bypass do teto)', async () => {
  const { service } = setup(row({ logisticaNivel: 'BASIC' }));
  const cfg = await service.updateRouteMode(7, { trackingAtivo: true, modoRotaPadrao: 'TRACKED' }, MASTER);
  assert.equal(cfg.modoRotaPadrao, 'TRACKED');
});

test('PATCH "contraditório" (trackingAtivo:false + modoRotaPadrao:TRACKED) resolve em ESSENTIAL sem erro fora do FULL', async () => {
  // O gate de nível olha o valor FINAL gravado (depois da desarma de 26/07),
  // não o `mode` bruto do input — a desarma já neutraliza TRACKED quando o
  // mesmo PATCH desliga trackingAtivo, então não sobra nada pra recusar.
  const { service, upsertCalls } = setup(row({ logisticaNivel: 'BASIC', trackingAtivo: true, modoRotaPadrao: 'TRACKED' }));
  const cfg = await service.updateRouteMode(7, { trackingAtivo: false, modoRotaPadrao: 'TRACKED' }, OWNER);
  assert.equal(upsertCalls[0].update.modoRotaPadrao, 'ESSENTIAL');
  assert.equal(cfg.modoRotaPadrao, 'ESSENTIAL');
});

test('resolveRouteMode (iniciar rota) cai em ESSENTIAL fora do FULL mesmo com TRACKED já gravado (cinto-e-suspensório)', async () => {
  const previous = process.env.HBX_LOGISTICA_TRACKING_ENABLED;
  process.env.HBX_LOGISTICA_TRACKING_ENABLED = 'true';
  try {
    // Estado "sujo": trackingAtivo+TRACKED gravados, mas nível caiu pra ADVANCED
    // depois (ex.: Master reaplicou o preset Advanced sem passar por aqui).
    const { service } = setup(row({ logisticaNivel: 'ADVANCED', trackingAtivo: true, modoRotaPadrao: 'TRACKED' }));
    assert.equal(await service.resolveRouteMode(7), 'ESSENTIAL');

    const full = setup(row({ logisticaNivel: 'FULL', trackingAtivo: true, modoRotaPadrao: 'TRACKED' }));
    assert.equal(await full.service.resolveRouteMode(7), 'TRACKED');
  } finally {
    if (previous === undefined) delete process.env.HBX_LOGISTICA_TRACKING_ENABLED;
    else process.env.HBX_LOGISTICA_TRACKING_ENABLED = previous;
  }
});

// ── 4) GRANDFATHERING ─────────────────────────────────────────────────────────

test('config existente SEM logisticaNivel (linha pré-migration) é tratada como ADVANCED', async () => {
  const semNivel = row();
  delete (semNivel as any).logisticaNivel;
  const { service } = setup(semNivel);
  assert.deepEqual(await service.getNivel(7), { nivel: 'ADVANCED' });
});

test('grandfathering: financeiro real JÁ LIGADO sobrevive sem nível gravado (nada desliga)', async () => {
  const semNivel = row({ moduloFinanceiroAtivo: true });
  delete (semNivel as any).logisticaNivel;
  const { service } = setup(semNivel);
  const config = await service.getConfig(7, OWNER);
  assert.equal(config.moduloFinanceiroAtivo, true);
  assert.equal(config.logisticaNivel, 'ADVANCED');
});

test('grandfathering: valor sujo no banco (não é BASIC/ADVANCED/FULL) também cai em ADVANCED', async () => {
  const { service } = setup(row({ logisticaNivel: 'legacy-lixo' }));
  assert.deepEqual(await service.getNivel(7), { nivel: 'ADVANCED' });
});

test('config operacional (GET consumido por qualquer ator) inclui logisticaNivel', async () => {
  const { service } = setup(row({ logisticaNivel: 'FULL' }));
  const driver = { role: 'USER', isSystemMaster: false, canViewBilling: false };
  const config = await service.getConfig(7, driver);
  assert.equal(config.logisticaNivel, 'FULL');
});
