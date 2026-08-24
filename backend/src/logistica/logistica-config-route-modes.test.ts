import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { UpdateLogisticaConfigDto } from './dto/logistica.dto';
import { LogisticaConfigService } from './logistica-config.service';

// ── 24/08/2026 — ESTE ARQUIVO ENCOLHEU DE PROPÓSITO (decisão do dono) ─────────
// A ESCOLHA de modo morreu: não existe mais flag global, toggle do tenant,
// preferência salva nem PATCH /config/modo-rota — toda rota nasce TRACKED.
// O que sobrou aqui é o que continua sendo contrato:
//   1. resolveRouteMode devolve TRACKED SEMPRE (até pra empresa sem config);
//   2. o serialize do billing owner carrega `admin: true` + a lápide de compat
//      `modoRotaPadrao: 'TRACKED'` (o APK 359 deduz "sou admin" por PRESENÇA
//      desse campo — sumir com ele apagaria a tela Avançado em silêncio);
//   3. o GET não-billing continua omitindo o bloco comercial inteiro;
//   4. permissão: gerente não altera configuração financeira;
//   5. o ValidationPipe global devolve 400 pra QUALQUER campo morto
//      (trackingAtivo/modoRotaPadrao/moduloFinanceiroAtivo/etc.).

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
    moduloRecoveryAtivo: true,
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
  // PROSPECTOR CIENTE (24/08) — stub mínimo do UsersService; os atores destes
  // testes não têm `id`, então o carimbo nem é consultado (ciente=false).
  const users: any = {
    findById: async () => ({ onboardingStateJson: null }),
    getOnboardingEvents: () => ({}),
    stampOnboardingEvent: async () => ({ firstTime: true, events: {} }),
  };
  return {
    service: new LogisticaConfigService(prisma, wallet, users),
    findUniqueCalls,
    upsertCalls,
  };
}

// ── 1. O MODO É HARD-ON ───────────────────────────────────────────────────────

test('rota nasce TRACKED SEM config nenhuma (resolveRouteMode não depende de linha no banco)', async () => {
  // Empresa 99 nunca teve LogisticaConfig: findUnique devolve null e NADA é
  // criado — o modo não depende mais de config, flag ou nível.
  const prisma: any = {
    logisticaConfig: {
      findUnique: async () => null,
      create: async () => {
        throw new Error('resolveRouteMode não deve criar linha nenhuma');
      },
      upsert: async () => {
        throw new Error('resolveRouteMode não deve gravar nada');
      },
    },
  };
  const service = new LogisticaConfigService(prisma, { getBalance: async () => 100 } as any, {} as any);
  assert.equal(await service.resolveRouteMode(99), 'TRACKED');
});

test('resolveRouteMode devolve TRACKED mesmo com linha antiga "ESSENTIAL" sobrando no banco', async () => {
  // Linha gravada antes do drop das colunas (trackingAtivo=false etc.): o valor
  // sujo não pode ressuscitar a escolha — o modo efetivo é sempre TRACKED.
  const { service } = setup(row({ trackingAtivo: false, modoRotaPadrao: 'ESSENTIAL' } as any));
  assert.equal(await service.resolveRouteMode(7), 'TRACKED');
});

// ── 2. SERIALIZE: admin explícito + lápide de compat do APK 359 ───────────────

test('GET do dono carrega admin:true e a lápide modoRotaPadrao=TRACKED (ehAdmin por presença, APK 359)', async () => {
  const { service } = setup();
  const config = await service.getConfig(7, OWNER);
  assert.equal((config as any).admin, true);
  // 🪦 compat: o APK 359 em campo deduz "sou admin" por hasOwnProperty deste
  // campo. Remover só no 361 — este assert é o freio.
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'modoRotaPadrao'), true);
  assert.equal(config.modoRotaPadrao, 'TRACKED');
  // Os campos mortos NÃO voltam nem pro dono.
  for (const morto of ['trackingAtivo', 'trackingDisponivel', 'moduloFinanceiroAtivo', 'cobrancaSimples', 'precoPorClienteAtivo']) {
    assert.equal(Object.prototype.hasOwnProperty.call(config, morto), false, `${morto} deve estar morto`);
  }
  assert.equal(config.pixChave, 'financeiro@example.com');
});

test('GET não-billing preserva operação e omite chaves administrativas/financeiras', async () => {
  const commercialKeys = [
    'admin', 'modoRotaPadrao',
    'cobrancaNaEntrega', 'moduloRecoveryAtivo',
    'pixChave', 'pixNome', 'pixCidade',
    'cobrancaWhatsAtiva', 'cobrancaWhatsDisponivel',
    'resumoDiarioAtivo', 'resumoDiarioHora', 'resumoDiarioDisponivel',
    'pedidoPublicoAtivo', 'pedidoPublicoToken', 'pedidoPublicoDisponivel',
  ];
  const { service } = setup();
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

// ── 3. PERMISSÃO: gerente não mexe em configuração financeira ────────────────

test('gerente não altera configuração financeira', async () => {
  const { service, upsertCalls } = setup();
  await assert.rejects(
    () => service.updateConfig(7, { pixChave: 'outra@example.com' }, MANAGER),
    /Somente o responsável financeiro/,
  );
  assert.equal(upsertCalls.length, 0);
});

// ── 4. CAMPO MORTO NO PATCH = 400 (borda HTTP) ───────────────────────────────
// O serviço não tem mais guarda própria (as colunas morreram); quem fecha a
// porta é o ValidationPipe global (whitelist + forbidNonWhitelisted) — o mesmo
// desenho que já barrava o APK velho desde 26/07.

test('ValidationPipe devolve 400 pra QUALQUER campo morto no PATCH da config', async () => {
  // MESMA configuração do main.ts (whitelist + forbidNonWhitelisted + transform).
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const meta = { type: 'body' as const, metatype: UpdateLogisticaConfigDto };

  const mortos: Record<string, unknown>[] = [
    { trackingAtivo: true },
    { modoRotaPadrao: 'TRACKED' },
    { moduloFinanceiroAtivo: false },
    { cobrancaSimples: true },
    { precoPorClienteAtivo: false },
    { prospectorEquipe: true },
    { prospectorAutomacaoAtiva: true },
  ];
  for (const payload of mortos) {
    const recusa = await pipe.transform(payload, meta).then(() => null, (e: any) => e);
    assert.ok(recusa instanceof BadRequestException, `payload morto ${JSON.stringify(payload)} tem que ser 400`);
    assert.match(JSON.stringify((recusa as any).getResponse()), new RegExp(Object.keys(payload)[0]));
  }

  // o resto da config continua passando normalmente (nada vivo foi fechado).
  const ok: any = await pipe.transform({ raioChegadaM: 80, prospectorAtivo: true }, meta);
  assert.equal(ok.raioChegadaM, 80);
  assert.equal(ok.prospectorAtivo, true);
});
