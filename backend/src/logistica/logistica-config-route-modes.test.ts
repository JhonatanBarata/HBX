import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';

import { UpdateLogisticaConfigDto } from './dto/logistica.dto';
import { LogisticaConfigService } from './logistica-config.service';
import { isLogisticaTrackingEnabled } from './logistica-tracking.flags';

const OWNER = { role: 'ADMIN', isSystemMaster: false, canViewBilling: true };
const MANAGER = { role: 'ADMIN', isSystemMaster: false, canViewBilling: false };
const DRIVER = { role: 'USER', isSystemMaster: false, canViewBilling: false };

function row(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 7,
    avisoWhatsEnabled: true,
    templateAviso: null,
    raioChegadaM: 60,
    velocidadeMediaKmH: 25,
    tempoParadaMin: 5,
    cobrancaNaEntrega: true,
    moduloFinanceiroAtivo: true,
    moduloRecoveryAtivo: true,
    gerarDiaAutomatico: false,
    diasTrabalho: '1,2,3,4,5',
    pixChave: 'financeiro@example.com',
    pixNome: 'EMPRESA TESTE',
    pixCidade: 'SAO PAULO',
    avisoChegandoEnabled: false,
    avisoChegandoTemplate: null,
    avisoChegandoDistanciaM: 500,
    cobrancaWhatsAtiva: true,
    resumoDiarioAtivo: true,
    resumoDiarioHora: 7,
    pedidoPublicoAtivo: true,
    pedidoPublicoToken: 'token-publico',
    comprovanteFotoObrigatoria: false,
    comprovanteAssinaturaObrigatoria: false,
    comprovanteCodigoObrigatorio: false,
    trackingAtivo: true,
    modoRotaPadrao: 'TRACKED',
    ...overrides,
  };
}

function setup(initial = row()) {
  let current = initial;
  const findUniqueCalls: any[] = [];
  const upsertCalls: any[] = [];
  const prisma: any = {
    logisticaConfig: {
      findUnique: async (args: any) => {
        findUniqueCalls.push(args);
        return current;
      },
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
  return {
    service: new LogisticaConfigService(prisma),
    findUniqueCalls,
    upsertCalls,
  };
}

async function withTrackingFlag<T>(value: string | undefined, run: () => T | Promise<T>): Promise<T> {
  const previous = process.env.HBX_LOGISTICA_TRACKING_ENABLED;
  if (value === undefined) delete process.env.HBX_LOGISTICA_TRACKING_ENABLED;
  else process.env.HBX_LOGISTICA_TRACKING_ENABLED = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.HBX_LOGISTICA_TRACKING_ENABLED;
    else process.env.HBX_LOGISTICA_TRACKING_ENABLED = previous;
  }
}

test('HBX_LOGISTICA_TRACKING_ENABLED nasce OFF e aceita somente valores booleanos explícitos', async () => {
  await withTrackingFlag(undefined, () => assert.equal(isLogisticaTrackingEnabled(), false));
  await withTrackingFlag('', () => assert.equal(isLogisticaTrackingEnabled(), false));
  await withTrackingFlag('false', () => assert.equal(isLogisticaTrackingEnabled(), false));
  await withTrackingFlag('TRUE', () => assert.equal(isLogisticaTrackingEnabled(), true));
  await withTrackingFlag(' 1 ', () => assert.equal(isLogisticaTrackingEnabled(), true));
  await withTrackingFlag('yes', () => assert.equal(isLogisticaTrackingEnabled(), true));
  await withTrackingFlag('on', () => assert.equal(isLogisticaTrackingEnabled(), true));
});

test('resolveRouteMode exige flag global, toggle do tenant e preferência TRACKED', async () => {
  const tracked = setup(row({ trackingAtivo: true, modoRotaPadrao: 'TRACKED' })).service;
  await withTrackingFlag(undefined, async () => assert.equal(await tracked.resolveRouteMode(7), 'ESSENTIAL'));
  await withTrackingFlag('true', async () => assert.equal(await tracked.resolveRouteMode(7), 'TRACKED'));

  const tenantOff = setup(row({ trackingAtivo: false, modoRotaPadrao: 'TRACKED' })).service;
  await withTrackingFlag('true', async () => assert.equal(await tenantOff.resolveRouteMode(7), 'ESSENTIAL'));

  const essential = setup(row({ trackingAtivo: true, modoRotaPadrao: 'ESSENTIAL' })).service;
  await withTrackingFlag('true', async () => assert.equal(await essential.resolveRouteMode(7), 'ESSENTIAL'));
});

test('GET do dono recebe a preferência salva sem confundir com o modo efetivo', async () => {
  const { service } = setup();
  await withTrackingFlag(undefined, async () => {
    const config = await service.getConfig(7, OWNER);
    assert.equal(config.trackingAtivo, true);
    assert.equal(config.trackingDisponivel, false);
    assert.equal(config.modoRotaPadrao, 'TRACKED');
    assert.equal(config.pixChave, 'financeiro@example.com');
  });
  await withTrackingFlag('true', async () => {
    const config = await service.getConfig(7, OWNER);
    assert.equal(config.trackingDisponivel, true);
    assert.equal(config.modoRotaPadrao, 'TRACKED');
  });
});

test('GET não-billing preserva operação e omite chaves administrativas/financeiras', async () => {
  const commercialKeys = [
    'trackingAtivo', 'trackingDisponivel', 'modoRotaPadrao',
    'cobrancaNaEntrega', 'moduloFinanceiroAtivo', 'moduloRecoveryAtivo',
    'pixChave', 'pixNome', 'pixCidade',
    'cobrancaWhatsAtiva', 'cobrancaWhatsDisponivel',
    'resumoDiarioAtivo', 'resumoDiarioHora', 'resumoDiarioDisponivel',
    'pedidoPublicoAtivo', 'pedidoPublicoToken', 'pedidoPublicoDisponivel',
  ];
  const { service } = setup();
  await withTrackingFlag('true', async () => {
    for (const actor of [MANAGER, DRIVER, undefined]) {
      const config = await service.getConfig(7, actor);
      assert.equal(config.raioChegadaM, 60);
      assert.equal(config.velocidadeMediaKmH, 25);
      assert.equal(config.comprovanteFotoObrigatoria, false);
      for (const key of commercialKeys) {
        assert.equal(Object.prototype.hasOwnProperty.call(config, key), false, `${key} deve estar ausente`);
      }
    }
  });
});

test('PATCH comercial é company-scoped e preserva a preferência mesmo com flag OFF', async () => {
  const { service, upsertCalls } = setup(row({ trackingAtivo: false, modoRotaPadrao: 'ESSENTIAL' }));
  await withTrackingFlag(undefined, async () => {
    const config = await service.updateConfig(7, { trackingAtivo: true, modoRotaPadrao: 'TRACKED' }, OWNER);
    assert.deepEqual(upsertCalls[0].where, { companyId: 7 });
    assert.deepEqual(upsertCalls[0].update, { trackingAtivo: true, modoRotaPadrao: 'TRACKED' });
    assert.equal(config.trackingAtivo, true);
    assert.equal(config.modoRotaPadrao, 'TRACKED');
  });
  await withTrackingFlag('true', async () => assert.equal(await service.resolveRouteMode(7), 'TRACKED'));
});

test('gerente não altera modo nem configuração financeira', async () => {
  const { service, upsertCalls } = setup();
  await assert.rejects(
    () => service.updateConfig(7, { modoRotaPadrao: 'TRACKED' }, MANAGER),
    /Somente o responsável financeiro/,
  );
  await assert.rejects(
    () => service.updateConfig(7, { pixChave: 'outra@example.com' }, MANAGER),
    /Somente o responsável financeiro/,
  );
  assert.equal(upsertCalls.length, 0);
});

test('serviço rejeita modo desconhecido antes de gravar', async () => {
  const { service, upsertCalls } = setup();
  await assert.rejects(
    () => service.updateConfig(7, { modoRotaPadrao: 'INVALID' as any }, OWNER),
    /Modo de rota inválido/,
  );
  assert.equal(upsertCalls.length, 0);
});

test('DTO aceita apenas ESSENTIAL ou TRACKED', async () => {
  const valid = Object.assign(new UpdateLogisticaConfigDto(), { modoRotaPadrao: 'TRACKED', trackingAtivo: true });
  assert.equal((await validate(valid)).length, 0);

  const invalid = Object.assign(new UpdateLogisticaConfigDto(), { modoRotaPadrao: 'LIVE' });
  const errors = await validate(invalid);
  assert.equal(errors.some((error) => error.property === 'modoRotaPadrao'), true);
});
