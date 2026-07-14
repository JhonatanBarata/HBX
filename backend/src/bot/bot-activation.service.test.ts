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
