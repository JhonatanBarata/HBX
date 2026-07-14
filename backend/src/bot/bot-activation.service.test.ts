import assert from 'node:assert/strict';
import test from 'node:test';
import { BotActivationService } from './bot-activation.service';

function serviceWith(options: { durableStage?: boolean; mainMenu?: boolean }) {
  const prisma = {
    hbxRecoveryFlowStage: {
      findFirst: async () => (options.durableStage ? { id: 'stage-1' } : null),
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
  return new BotActivationService(prisma as any, store as any);
}

test('Recovery aceita etapa durável habilitada quando não há template Meta', async () => {
  const service = serviceWith({ durableStage: true });
  const complete = await (service as any).resolveConfigCompleta(5, 'recovery');
  assert.equal(complete, true);
});

test('Recovery continua bloqueado sem template e sem etapa durável', async () => {
  const service = serviceWith({ durableStage: false });
  const complete = await (service as any).resolveConfigCompleta(5, 'recovery');
  assert.equal(complete, false);
});

test('Recovery continua exigindo menu mesmo com etapa durável', async () => {
  const service = serviceWith({ durableStage: true, mainMenu: false });
  const complete = await (service as any).resolveConfigCompleta(5, 'recovery');
  assert.equal(complete, false);
});
