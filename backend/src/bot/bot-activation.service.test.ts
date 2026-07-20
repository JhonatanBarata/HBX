import assert from 'node:assert/strict';
import test from 'node:test';
import { BotActivationService } from './bot-activation.service';

function serviceWith(options: { durableStage?: boolean; mainMenu?: boolean }) {
  let durableStageWhere: any = null;
  const prisma = {
    hbxRecoveryFlowStage: {
      findFirst: async (query: any) => {
        durableStageWhere = query?.where;
        return options.durableStage ? { id: 'stage-1' } : null;
      },
    },
  };
  const store = {
    get: async () => ({
      startTemplates: [],
      mainMenuButtons: options.mainMenu === false
        ? []
        : [{ buttonId: 'pay', actionId: 'show_value', title: 'Ver valor' }],
    }),
  };
  return {
    service: new BotActivationService(prisma as any, store as any),
    durableStageWhere: () => durableStageWhere,
  };
}

test('Recovery aceita etapa durável habilitada quando não há template Meta', async () => {
  const fixture = serviceWith({ durableStage: true });
  const service = fixture.service;
  const complete = await (service as any).resolveConfigCompleta(5, 'recovery');
  assert.equal(complete, true);
  assert.ok(fixture.durableStageWhere()?.channel?.notIn?.includes('__ATENDIMENTO_BOT_CONFIG__'));
  assert.ok(fixture.durableStageWhere()?.channel?.notIn?.includes('__BOT_TESTED_META__'));
});

test('Recovery continua bloqueado sem template e sem etapa durável', async () => {
  const service = serviceWith({ durableStage: false }).service;
  const complete = await (service as any).resolveConfigCompleta(5, 'recovery');
  assert.equal(complete, false);
});

test('Recovery continua exigindo menu mesmo com etapa durável', async () => {
  const service = serviceWith({ durableStage: true, mainMenu: false }).service;
  const complete = await (service as any).resolveConfigCompleta(5, 'recovery');
  assert.equal(complete, false);
});

// ── chave geral (setMasterSwitch) — PR20072026-CHIP Bloco E ─────────────────
// Incidente 20/07: ligar a chave geral religava os 3 motores sozinha (a
// prospecção parada desde 17/07 disparou 1 msg em 29s). Fix: LIGAR só levanta
// o bloqueio; cada motor volta a ligar pelo próprio toggle de /bot.

const MASTER_SWITCH_ADMIN = { id: 7, companyId: 5, role: 'ADMIN' };

function masterSwitchFixture() {
  const companyUpdates: any[] = [];
  const storeSaves: any[] = [];
  const prisma = {
    company: {
      update: async (query: any) => {
        companyUpdates.push(query);
        return {};
      },
      findUnique: async () => ({ botArmedAt: new Date() }),
    },
  };
  const store = {
    get: async (_companyId: number, domain: string) =>
      domain === 'atendimento_bot' ? { routingRules: { globalBotEnabled: false } } : null,
    save: async (companyId: number, domain: string, payload: any, userId: any) => {
      storeSaves.push({ companyId, domain, payload, userId });
    },
  };
  return {
    service: new BotActivationService(prisma as any, store as any),
    companyUpdates,
    storeSaves,
  };
}

test('Chave geral LIGAR só levanta o bloqueio — não arma nenhum motor sozinho', async () => {
  const { service, companyUpdates, storeSaves } = masterSwitchFixture();
  const result = await (service as any).setMasterSwitch(MASTER_SWITCH_ADMIN, true);

  assert.deepEqual(result, { ok: true, on: true });
  // só a intenção (bot_master_switch off:false) é gravada — nenhum outro domínio
  assert.equal(storeSaves.length, 1);
  assert.equal(storeSaves[0].domain, 'bot_master_switch');
  assert.equal(storeSaves[0].payload.off, false);
  // nenhum *LiveAt setado: ligar a chave geral não dá partida na frota
  assert.equal(companyUpdates.length, 0);
});

test('Chave geral DESLIGAR continua derrubando os 3 tipos (freio real intacto)', async () => {
  const { service, companyUpdates, storeSaves } = masterSwitchFixture();
  const result = await (service as any).setMasterSwitch(MASTER_SWITCH_ADMIN, false);

  assert.deepEqual(result, { ok: true, on: false });
  const masterSave = storeSaves.find((c) => c.domain === 'bot_master_switch');
  assert.equal(masterSave?.payload.off, true);
  const atendSave = storeSaves.find((c) => c.domain === 'atendimento_bot');
  assert.equal(atendSave?.payload.routingRules.globalBotEnabled, false);
  assert.equal(companyUpdates.length, 1);
  assert.deepEqual(companyUpdates[0].data, {
    recoveryBotLiveAt: null,
    recoveryBotLiveByUserId: null,
    prospectingBotLiveAt: null,
    prospectingBotLiveByUserId: null,
  });
});
