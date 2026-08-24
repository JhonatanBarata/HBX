import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaConfigService } from './logistica-config.service';

// S7 (PR22072026-APP-SOUNDS) — o BURACO do sprint era: só o admin sabia que
// tinha acabado o crédito (extrato é `@Admin()`, o motorista leva 403). A
// solução vira um BOOLEANO dentro de `/logistica/config` — que o app do
// entregador já lê SEM ser billing owner — nunca o saldo.
//
// Este teste prova o contrato: (1) o campo aparece pra TODO ator, admin e
// motorista; (2) ele nunca carrega o número, só true/false; (3) falha na
// consulta de saldo é FAIL-OPEN (nunca trava por bug de leitura).

const OWNER = { role: 'ADMIN', isSystemMaster: false, canViewBilling: true };
const DRIVER = { role: 'USER', isSystemMaster: false, canViewBilling: false };

function row(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 7,
    avisoWhatsEnabled: true,
    templateAviso: null,
    raioChegadaM: 60,
    velocidadeMediaKmH: 25,
    tempoParadaMin: 5,
    diasTrabalho: null,
    avisoChegandoEnabled: false,
    avisoChegandoTemplate: null,
    avisoChegandoDistanciaM: 500,
    comprovanteFotoObrigatoria: false,
    comprovanteAssinaturaObrigatoria: false,
    comprovanteCodigoObrigatorio: false,
    ...overrides,
  };
}

function setup(balance: number | (() => Promise<number>)) {
  const prisma: any = {
    logisticaConfig: {
      findUnique: async () => row(),
      upsert: async ({ update, create }: any) => ({ ...row(), ...create, ...update }),
    },
  };
  const wallet: any = {
    getBalance: typeof balance === 'function' ? balance : async () => balance,
  };
  // 24/08 — stub mínimo do UsersService (o carimbo do prospectorCiente tem
  // teste próprio em logistica-config-prospector.test.ts).
  const users: any = { findById: async () => ({}), getOnboardingEvents: () => ({}), stampOnboardingEvent: async () => ({ firstTime: true, events: {} }) };
  return new LogisticaConfigService(prisma, wallet, users);
}

test('creditosEsgotados: saldo <= 0 vira true, pra admin E motorista', async () => {
  const service = setup(0);
  const admin = await service.getConfig(7, OWNER);
  const driver = await service.getConfig(7, DRIVER);
  assert.equal(admin.creditosEsgotados, true);
  assert.equal(driver.creditosEsgotados, true);
});

test('creditosEsgotados: saldo negativo também tranca', async () => {
  const service = setup(-3);
  const driver = await service.getConfig(7, DRIVER);
  assert.equal(driver.creditosEsgotados, true);
});

test('creditosEsgotados: saldo positivo libera', async () => {
  const service = setup(12);
  const admin = await service.getConfig(7, OWNER);
  const driver = await service.getConfig(7, DRIVER);
  assert.equal(admin.creditosEsgotados, false);
  assert.equal(driver.creditosEsgotados, false);
});

test('creditosEsgotados: NUNCA vaza o saldo — só o booleano, pro motorista', async () => {
  const service = setup(12345);
  const driver = await service.getConfig(7, DRIVER);
  assert.equal(Object.prototype.hasOwnProperty.call(driver, 'balanceCredits'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(driver, 'saldo'), false);
  assert.equal(typeof driver.creditosEsgotados, 'boolean');
});

test('creditosEsgotados: falha na consulta de saldo é FAIL-OPEN (nunca tranca)', async () => {
  const service = setup(async () => { throw new Error('timeout simulado'); });
  const driver = await service.getConfig(7, DRIVER);
  const admin = await service.getConfig(7, OWNER);
  assert.equal(driver.creditosEsgotados, false);
  assert.equal(admin.creditosEsgotados, false);
});
