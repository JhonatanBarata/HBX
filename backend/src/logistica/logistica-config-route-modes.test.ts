import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { UpdateLogisticaConfigDto, UpdateLogisticaRouteModeDto } from './dto/logistica.dto';
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
  // S7 (PR22072026-APP-SOUNDS) — stub do CreditWalletService: saldo positivo
  // fixo, só pra satisfazer o construtor (o booleano creditosEsgotados tem
  // teste PRÓPRIO em logistica-config-creditos-esgotados.test.ts).
  const wallet: any = { getBalance: async () => 100 };
  return {
    service: new LogisticaConfigService(prisma, wallet),
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
  // PR27072026 F1 — TRACKED também exige nível FULL agora; logisticaNivel:
  // 'FULL' aqui isola o teste no que ele testa de verdade (flag + toggle +
  // preferência), sem o 4º gate (nível) interferir no resultado esperado.
  const tracked = setup(row({ trackingAtivo: true, modoRotaPadrao: 'TRACKED', logisticaNivel: 'FULL' })).service;
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
    'cobrancaNaEntrega', 'moduloRecoveryAtivo',
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
      // PR18072026 W-A — moduloFinanceiroAtivo virou OPERACIONAL (o app do
      // entregador usa pra escolher o nível da folha de chegada mesmo sem ser
      // billing owner). É o TOGGLE, não valor financeiro — presente pra todos.
      assert.equal(Object.prototype.hasOwnProperty.call(config, 'moduloFinanceiroAtivo'), true, 'moduloFinanceiroAtivo deve estar presente (operacional)');
      assert.equal(config.moduloFinanceiroAtivo, true);
    }
  });
});

test('PATCH comercial é company-scoped e preserva a preferência mesmo com flag OFF', async () => {
  // PR27072026 F1 — logisticaNivel: 'FULL' isola este teste no que ele testa
  // (a preferência sobrevive com a flag global OFF), sem o gate de nível barrar.
  const { service, upsertCalls } = setup(row({ trackingAtivo: false, modoRotaPadrao: 'ESSENTIAL', logisticaNivel: 'FULL' }));
  await withTrackingFlag(undefined, async () => {
    const config = await service.updateRouteMode(7, { trackingAtivo: true, modoRotaPadrao: 'TRACKED' }, OWNER);
    assert.deepEqual(upsertCalls[0].where, { companyId: 7 });
    assert.deepEqual(upsertCalls[0].update, { trackingAtivo: true, modoRotaPadrao: 'TRACKED' });
    assert.equal(config.trackingAtivo, true);
    assert.equal(config.modoRotaPadrao, 'TRACKED');
  });
  await withTrackingFlag('true', async () => assert.equal(await service.resolveRouteMode(7), 'TRACKED'));
});

// ── 26/07 — LOGÍSTICA SIMPLES É O PADRÃO DE TODO MUNDO (ordem do dono) ────────
// A Rastreada continua existindo inteira, mas dormente: empresa nova nasce
// Simples e a ativação é ato explícito do administrador NO PC. Estes 3 testes
// são o freio pra ninguém reverter isso "sem querer" num refactor futuro.

test('empresa NOVA nasce em Logística Simples mesmo com a flag global LIGADA', async () => {
  // ensureRow cria a linha só com o companyId → vale o default do schema
  // (modoRotaPadrao='ESSENTIAL', trackingAtivo=false).
  let current: any = null;
  const prisma: any = {
    logisticaConfig: {
      findUnique: async () => current,
      create: async ({ data }: any) => {
        // espelha o default do schema.prisma pra linha recém-criada
        current = { ...data, trackingAtivo: false, modoRotaPadrao: 'ESSENTIAL' };
        return current;
      },
      upsert: async () => current,
    },
  };
  const service = new LogisticaConfigService(prisma, { getBalance: async () => 100 } as any);
  await withTrackingFlag('true', async () => {
    assert.equal(await service.resolveRouteMode(99), 'ESSENTIAL');
    const config = await service.getConfig(99, OWNER);
    assert.equal(config.trackingAtivo, false);
    assert.equal(config.modoRotaPadrao, 'ESSENTIAL');
  });
});

test('desligar o rastreamento DESARMA a preferência TRACKED (não fica armada no banco)', async () => {
  const { service, upsertCalls } = setup(row({ trackingAtivo: true, modoRotaPadrao: 'TRACKED' }));
  await withTrackingFlag('true', async () => {
    const config = await service.updateRouteMode(7, { trackingAtivo: false }, OWNER);
    assert.deepEqual(upsertCalls[0].update, { trackingAtivo: false, modoRotaPadrao: 'ESSENTIAL' });
    assert.equal(config.modoRotaPadrao, 'ESSENTIAL');
    assert.equal(await service.resolveRouteMode(7), 'ESSENTIAL');
  });
});

test('PATCH contraditório (tracking OFF + modo TRACKED) resolve em Simples', async () => {
  const { service, upsertCalls } = setup(row({ trackingAtivo: true, modoRotaPadrao: 'TRACKED' }));
  await withTrackingFlag('true', async () => {
    const config = await service.updateRouteMode(7, { trackingAtivo: false, modoRotaPadrao: 'TRACKED' }, OWNER);
    assert.equal(upsertCalls[0].update.modoRotaPadrao, 'ESSENTIAL');
    assert.equal(config.modoRotaPadrao, 'ESSENTIAL');
  });
});

test('gerente não altera modo nem configuração financeira', async () => {
  const { service, upsertCalls } = setup();
  await assert.rejects(
    () => service.updateRouteMode(7, { modoRotaPadrao: 'TRACKED' }, MANAGER),
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
    () => service.updateRouteMode(7, { modoRotaPadrao: 'INVALID' as any }, OWNER),
    /Modo de rota inválido/,
  );
  assert.equal(upsertCalls.length, 0);
});

test('DTO do modo aceita apenas ESSENTIAL ou TRACKED', async () => {
  const valid = Object.assign(new UpdateLogisticaRouteModeDto(), { modoRotaPadrao: 'TRACKED', trackingAtivo: true });
  assert.equal((await validate(valid)).length, 0);

  const invalid = Object.assign(new UpdateLogisticaRouteModeDto(), { modoRotaPadrao: 'LIVE' });
  const errors = await validate(invalid);
  assert.equal(errors.some((error) => error.property === 'modoRotaPadrao'), true);
});

// ── 26/07 — A PORTA DOS FUNDOS DO APK VELHO ─────────────────────────────────
// O bundle antigo em campo mandava `trackingAtivo`/`modoRotaPadrao` no PATCH
// genérico da config e passava quando o logado era o dono da conta. Agora os
// dois campos moram só no endpoint próprio: o PATCH genérico recusa (e, na
// borda HTTP, o ValidationPipe global já devolve 400 antes disso, porque o DTO
// não declara mais esses campos e `forbidNonWhitelisted` está ligado).

test('PATCH genérico da config RECUSA o modo da rota, mesmo vindo do dono', async () => {
  const { service, upsertCalls } = setup();
  await assert.rejects(
    () => service.updateConfig(7, { modoRotaPadrao: 'TRACKED' } as any, OWNER),
    /painel do administrador/,
  );
  await assert.rejects(
    () => service.updateConfig(7, { trackingAtivo: true } as any, OWNER),
    /painel do administrador/,
  );
  assert.equal(upsertCalls.length, 0);
});

test('ValidationPipe barra o payload do APK velho no PATCH genérico da config', async () => {
  // MESMA configuração do main.ts (whitelist + forbidNonWhitelisted + transform).
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const meta = { type: 'body' as const, metatype: UpdateLogisticaConfigDto };

  const recusa = await pipe
    .transform({ trackingAtivo: true, modoRotaPadrao: 'TRACKED' }, meta)
    .then(() => null, (e: any) => e);
  assert.ok(recusa instanceof BadRequestException, 'payload do APK velho tem que ser recusado');
  const detalhe = JSON.stringify((recusa as any).getResponse());
  assert.match(detalhe, /modoRotaPadrao/);
  assert.match(detalhe, /trackingAtivo/);
  // o resto da config continua passando normalmente (nada mais foi fechado).
  const ok: any = await pipe.transform({ raioChegadaM: 80 }, meta);
  assert.equal(ok.raioChegadaM, 80);

  // e o endpoint próprio aceita exatamente os dois campos.
  const modo: any = await pipe.transform(
    { trackingAtivo: true, modoRotaPadrao: 'TRACKED' },
    { type: 'body' as const, metatype: UpdateLogisticaRouteModeDto },
  );
  assert.equal(modo.modoRotaPadrao, 'TRACKED');
});
