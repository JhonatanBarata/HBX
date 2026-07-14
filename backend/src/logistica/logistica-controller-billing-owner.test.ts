import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';

import { LogisticaController } from './logistica.controller';

const owner = { id: 10, companyId: 1, role: 'ADMIN', canViewBilling: true };
const manager = { id: 11, companyId: 1, role: 'ADMIN', canViewBilling: false };
const seller = { id: 12, companyId: 1, role: 'USER', canViewBilling: false };

function controllerWith(service: any = {}, recorrencia: any = {}, config: any = {}) {
  return new LogisticaController(
    service,
    recorrencia,
    {} as any,
    config,
    {} as any,
    {} as any,
  );
}

test('logística: gerente e vendedor não acessam endpoints financeiros de billing owner', async () => {
  let serviceCalls = 0;
  const blocked = async () => {
    serviceCalls += 1;
    return {};
  };
  const service: any = {
    fecharMes: blocked,
    extratoCliente: blocked,
    scoreFiadoCliente: blocked,
    historicoEntregasCliente: blocked,
    quitarCharge: blocked,
    saldosFinanceiro: blocked,
    resumoDia: blocked,
    updateFinanceiroCliente: blocked,
  };
  const controller = controllerWith(service);
  const previousFlag = process.env.HBX_SCORE_FIADO_ENABLED;
  process.env.HBX_SCORE_FIADO_ENABLED = 'true';

  try {
    for (const actor of [manager, seller]) {
      const req = { user: actor };
      const calls: Array<() => unknown> = [
        () => controller.fecharMes(req, {} as any),
        () => controller.extrato(req, 'cliente-1'),
        () => controller.scoreCliente(req, 'cliente-1'),
        () => controller.historicoEntregas(req, 'cliente-1'),
        () => controller.quitarCharge(req, 'charge-1'),
        () => controller.saldosFinanceiro(req),
        () => controller.resumoDia(req),
        () => controller.updateFinanceiroCliente(req, 'cliente-1', {} as any),
      ];

      for (const call of calls) {
        await assert.rejects(
          async () => call(),
          (error: any) =>
            error instanceof ForbiddenException &&
            error.getStatus() === 403 &&
            error.message === 'Acesso não autorizado',
        );
      }
    }
    assert.equal(serviceCalls, 0);
  } finally {
    if (previousFlag === undefined) delete process.env.HBX_SCORE_FIADO_ENABLED;
    else process.env.HBX_SCORE_FIADO_ENABLED = previousFlag;
  }
});

test('logística: gerente não cria, edita nem remove vínculo comercial de produto', async () => {
  let recurrenceCalls = 0;
  const blocked = async () => {
    recurrenceCalls += 1;
    return {};
  };
  const controller = controllerWith({}, {
    create: blocked,
    update: blocked,
    remove: blocked,
  });
  const req = { user: manager };

  await assert.rejects(async () => controller.createClienteProduto(req, {} as any), ForbiddenException);
  await assert.rejects(async () => controller.updateClienteProduto(req, 'link-1', {} as any), ForbiddenException);
  await assert.rejects(async () => controller.deleteClienteProduto(req, 'link-1'), ForbiddenException);
  assert.equal(recurrenceCalls, 0);
});

test('logística: controller propaga o ator para leituras redigidas e configuração', async () => {
  const received: unknown[] = [];
  const recorrencia: any = {
    listByCliente: async (_companyId: number, _customerProfileId: string, actor: unknown) => {
      received.push(actor);
      return [];
    },
    getDiaPreview: async (_companyId: number, _date: string | undefined, actor: unknown) => {
      received.push(actor);
      return { clientes: [] };
    },
  };
  const config: any = {
    getConfig: async (_companyId: number, actor: unknown) => {
      received.push(actor);
      return {};
    },
    updateConfig: async (_companyId: number, _dto: unknown, actor: unknown) => {
      received.push(actor);
      return {};
    },
  };
  const controller = controllerWith({}, recorrencia, config);
  const req = { user: owner };

  await controller.listClienteProdutos(req, 'cliente-1');
  await controller.diaPreview(req, '2026-07-13');
  await controller.getConfig(req);
  await controller.updateConfig(req, {} as any);

  assert.deepEqual(received, [owner, owner, owner, owner]);
});

test('logística: dono continua autorizado no endpoint financeiro', async () => {
  let receivedCompanyId: number | null = null;
  const controller = controllerWith({
    saldosFinanceiro: async (companyId: number) => {
      receivedCompanyId = companyId;
      return [];
    },
  });

  assert.deepEqual(await controller.saldosFinanceiro({ user: owner }), []);
  assert.equal(receivedCompanyId, 1);
});
