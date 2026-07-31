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

// ── desligarTudo (substituiu a chave geral, 31/07/2026) ─────────────────────
// A chave geral morreu SEM legado: não existe mais estado "off" persistente.
// O que sobrou é a AÇÃO de pânico: derrubar os 3 tipos num gesto. Religar é
// pelo toggle de cada tipo, com pré-voo (anti-"frota em 1 clique", 20/07).

const DESLIGAR_ADMIN = { id: 7, companyId: 5, role: 'ADMIN' };

function desligarTudoFixture() {
  const companyUpdates: any[] = [];
  const storeSaves: any[] = [];
  const prisma = {
    company: {
      update: async (query: any) => {
        companyUpdates.push(query);
        return {};
      },
      findUnique: async () => null,
    },
  };
  const store = {
    get: async (_companyId: number, domain: string) =>
      domain === 'atendimento_bot' ? { routingRules: { globalBotEnabled: true } } : null,
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

test('desligarTudo derruba os 3 tipos num gesto (freio real intacto)', async () => {
  const { service, companyUpdates, storeSaves } = desligarTudoFixture();
  const result = await (service as any).desligarTudo(DESLIGAR_ADMIN);

  assert.deepEqual(result, { ok: true });
  // atendimento: globalBotEnabled=false gravado na config canônica
  const atendSave = storeSaves.find((c) => c.domain === 'atendimento_bot');
  assert.equal(atendSave?.payload.routingRules.globalBotEnabled, false);
  // nenhuma escrita de bot_master_switch: o domínio morreu com a chave geral
  assert.equal(storeSaves.some((c) => c.domain === 'bot_master_switch'), false);
  assert.equal(companyUpdates.length, 1);
  assert.deepEqual(companyUpdates[0].data, {
    recoveryBotLiveAt: null,
    recoveryBotLiveByUserId: null,
    prospectingBotLiveAt: null,
    prospectingBotLiveByUserId: null,
  });
});

test('desligarTudo exige admin', async () => {
  const { service } = desligarTudoFixture();
  await assert.rejects(
    () => (service as any).desligarTudo({ id: 9, companyId: 5, role: 'USER' }),
    /administradores/,
  );
});
