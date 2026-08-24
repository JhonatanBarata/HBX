// PROSPECTOR CNPJ + MÓDULOS DO APP (PR07082026-PROSPECTOR-CNPJ, 07/08).
//
// 24/08/2026 (decisão do dono) — PROSPECTOR ABERTO A TODOS: morreram a env
// global HBX_PROSPECTOR_ENABLED, o `prospectorEquipe`, o `prospectorDisponivel`
// e a automação cobrada (prospectorAutomacao* + endpoints Master). O contrato
// novo: `prospectorAtivo` (toggle da empresa) + réguas template/raio/maxDia +
// `prospectorCiente` (carimbo POR USUÁRIO, espelho do tutorial obrigatório).
//
// O que este arquivo prova, e por que cada prova existe:
//  1) CLAMP do raio (50..500) e do teto/dia (1..8) — régua fora da faixa nunca
//     chega no banco (o mesmo desenho do avisoChegandoDistanciaM).
//  2) 🔴 "rota" NUNCA entra em appModulosDesativados — LEI DURA: app de entrega
//     sem rota não é app. E chave inválida é DESCARTADA em silêncio (allowlist).
//  3) O MOTORISTA LÊ prospectorAtivo/appModulosDesativados — sem isso o app não
//     tem como decidir o que mostrar (é o motivo de serem operacionais).
//  4) CIENTE: carimbo por usuário, idempotente, devolvido no GET /config do ator.
//
// Molde: logistica-config-devedor-na-rota.test.ts (prisma fake em memória,
// node:test) — arquivo isolado de propósito, sem tocar nos testes vizinhos.
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

import { EVENTO_PROSPECTOR_CIENTE, LogisticaConfigService } from './logistica-config.service';

const GERENTE = { role: 'ADMIN', isSystemMaster: false, canViewBilling: false };
const OWNER = { role: 'ADMIN', isSystemMaster: false, canViewBilling: true };
const MOTORISTA = { role: 'USER', isSystemMaster: false, canViewBilling: false };

function row(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 7,
    avisoWhatsEnabled: true,
    templateAviso: null,
    raioChegadaM: 60,
    velocidadeMediaKmH: 25,
    tempoParadaMin: 5,
    cobrancaNaEntrega: false,
    moduloRecoveryAtivo: false,
    diasTrabalho: null,
    pixChave: null,
    pixNome: null,
    pixCidade: null,
    avisoChegandoEnabled: false,
    avisoChegandoTemplate: null,
    avisoChegandoDistanciaM: 500,
    cobrancaWhatsAtiva: false,
    cobrancaWhatsTemplate: null,
    cobrancaAutomatica: false,
    resumoDiarioAtivo: false,
    resumoDiarioHora: 7,
    pedidoPublicoAtivo: false,
    pedidoPublicoToken: null,
    comprovanteFotoObrigatoria: false,
    comprovanteAssinaturaObrigatoria: false,
    comprovanteCodigoObrigatorio: false,
    logisticaNivel: 'ADVANCED',
    devedorNaRota: 'COBRANCA',
    prospectorAtivo: false,
    prospectorTemplate: null,
    prospectorRaioM: 150,
    prospectorMaxDia: 4,
    appModulosDesativados: null,
    ...overrides,
  };
}

/** UsersService fake com o MESMO contrato do carimbo de onboarding (em memória). */
function fakeUsers() {
  const porUsuario = new Map<number, Record<string, string>>();
  return {
    findById: async (id: number) => ({
      id,
      onboardingStateJson: JSON.stringify({ events: porUsuario.get(id) ?? {} }),
    }),
    getOnboardingEvents: (user: any) => {
      try {
        const parsed = JSON.parse(String(user?.onboardingStateJson || '{}'));
        return parsed?.events && typeof parsed.events === 'object' ? parsed.events : {};
      } catch {
        return {};
      }
    },
    stampOnboardingEvent: async (userId: number, event: string, at: Date = new Date()) => {
      const events = { ...(porUsuario.get(userId) ?? {}) };
      if (events[event]) return { firstTime: false, events };
      events[event] = at.toISOString();
      porUsuario.set(userId, events);
      return { firstTime: true, events };
    },
  };
}

function setup(initial = row()) {
  let current: any = initial;
  const upsertCalls: any[] = [];
  const prisma: any = {
    logisticaConfig: {
      findUnique: async () => current,
      create: async ({ data }: any) => { current = row(data); return current; },
      upsert: async (args: any) => {
        upsertCalls.push(args);
        current = { ...current, ...args.create, ...args.update };
        return current;
      },
    },
  };
  const wallet: any = { getBalance: async () => 100 };
  const users = fakeUsers();
  return { service: new LogisticaConfigService(prisma, wallet, users as any), upsertCalls, users };
}

/** O que REALMENTE foi mandado pro banco na última gravação. */
function gravado(upsertCalls: any[]): Record<string, unknown> {
  return upsertCalls[upsertCalls.length - 1]?.update ?? {};
}

// ── CLAMP DO RAIO (50..500) ──────────────────────────────────────────────────
test('raio: 49 vira 50 e 501 vira 500 (clamp nas duas bordas)', async () => {
  const abaixo = setup();
  const cfgAbaixo = await abaixo.service.updateConfig(7, { prospectorRaioM: 49 }, GERENTE);
  assert.equal(gravado(abaixo.upsertCalls).prospectorRaioM, 50);
  assert.equal(cfgAbaixo.prospectorRaioM, 50);

  const acima = setup();
  const cfgAcima = await acima.service.updateConfig(7, { prospectorRaioM: 501 }, GERENTE);
  assert.equal(gravado(acima.upsertCalls).prospectorRaioM, 500);
  assert.equal(cfgAcima.prospectorRaioM, 500);
});

test('raio: valor dentro da faixa passa intacto; lixo cai no default 150', async () => {
  const ok = setup();
  await ok.service.updateConfig(7, { prospectorRaioM: 300 }, GERENTE);
  assert.equal(gravado(ok.upsertCalls).prospectorRaioM, 300);

  const lixo = setup();
  await lixo.service.updateConfig(7, { prospectorRaioM: 'abc' as any }, GERENTE);
  assert.equal(gravado(lixo.upsertCalls).prospectorRaioM, 150);
});

// ── CLAMP DO MAXDIA (1..8) ───────────────────────────────────────────────────
test('maxDia: 0 vira 1 e 9 vira 8 (o "3 a 5 vezes no dia" do dono, com folga)', async () => {
  const abaixo = setup();
  const cfgAbaixo = await abaixo.service.updateConfig(7, { prospectorMaxDia: 0 }, GERENTE);
  assert.equal(gravado(abaixo.upsertCalls).prospectorMaxDia, 1);
  assert.equal(cfgAbaixo.prospectorMaxDia, 1);

  const acima = setup();
  const cfgAcima = await acima.service.updateConfig(7, { prospectorMaxDia: 9 }, GERENTE);
  assert.equal(gravado(acima.upsertCalls).prospectorMaxDia, 8);
  assert.equal(cfgAcima.prospectorMaxDia, 8);
});

test('maxDia: negativo vira 1; texto sem número cai no default 4', async () => {
  const neg = setup();
  await neg.service.updateConfig(7, { prospectorMaxDia: -3 }, GERENTE);
  assert.equal(gravado(neg.upsertCalls).prospectorMaxDia, 1);

  const lixo = setup();
  await lixo.service.updateConfig(7, { prospectorMaxDia: 'abc' as any }, GERENTE);
  assert.equal(gravado(lixo.upsertCalls).prospectorMaxDia, 4);
});

/**
 * Contrato do `clampInt` que JÁ vale pra todo campo numérico deste arquivo (raio
 * de chegada, velocidade, sentinelas): o default só entra quando o valor não é
 * número NENHUM (NaN). `null` vira 0 no `Number()` e portanto CLAMPA no piso —
 * não cai no default. Fixado aqui de propósito pra ninguém "consertar" o clamp
 * achando que é bug e mudar o comportamento dos outros 8 campos junto.
 */
test('clampInt: null é 0 (clampa no piso), não é lixo — mesmo contrato dos campos vizinhos', async () => {
  const maxDia = setup();
  await maxDia.service.updateConfig(7, { prospectorMaxDia: null as any }, GERENTE);
  assert.equal(gravado(maxDia.upsertCalls).prospectorMaxDia, 1);

  const raio = setup();
  await raio.service.updateConfig(7, { prospectorRaioM: null as any }, GERENTE);
  assert.equal(gravado(raio.upsertCalls).prospectorRaioM, 50);
});

// ── 🔴 LEI DURA: "rota" NUNCA é desativada ───────────────────────────────────
test('"rota" NUNCA entra em appModulosDesativados — sozinha vira null', async () => {
  const { service, upsertCalls } = setup();
  const cfg = await service.updateConfig(7, { appModulosDesativados: 'rota' }, GERENTE);
  assert.equal(gravado(upsertCalls).appModulosDesativados, null);
  assert.equal(cfg.appModulosDesativados, null);
});

test('"rota" é descartada mas as chaves válidas da mesma lista continuam valendo', async () => {
  const { service, upsertCalls } = setup();
  const cfg = await service.updateConfig(7, { appModulosDesativados: 'chat,rota,produtos' }, GERENTE);
  const salvo = String(gravado(upsertCalls).appModulosDesativados);
  assert.equal(salvo, 'chat,produtos');
  assert.ok(!salvo.includes('rota'), 'a chave rota jamais pode ser gravada');
  assert.equal(cfg.appModulosDesativados, 'chat,produtos');
});

test('"ROTA"/" Rota " (caixa e espaço) também são descartadas', async () => {
  const { service, upsertCalls } = setup();
  await service.updateConfig(7, { appModulosDesativados: ' ROTA , Rota ,chat' }, GERENTE);
  assert.equal(gravado(upsertCalls).appModulosDesativados, 'chat');
});

// ── ALLOWLIST: chave inválida é DESCARTADA em silêncio ───────────────────────
test('chave inválida é descartada (allowlist), sem erro e sem sujar o banco', async () => {
  const { service, upsertCalls } = setup();
  const cfg = await service.updateConfig(
    7,
    { appModulosDesativados: 'fechamento,financeiro,xpto,clientes' },
    GERENTE,
  );
  assert.equal(gravado(upsertCalls).appModulosDesativados, 'clientes,fechamento');
  assert.equal(cfg.appModulosDesativados, 'clientes,fechamento');
});

// 🔴 A CHAVE VELHA DO BANCO (vacina de 09/08). 'caderneta' foi renomeada pra
// 'fechamento'; sem a tradução ela cairia no filtro de lixo e o módulo que o
// admin desligou VOLTARIA sozinho no celular do motorista.
test("chave renomeada: 'caderneta' gravada antes de 09/08 vale como 'fechamento'", async () => {
  const { service, upsertCalls } = setup();
  const cfg = await service.updateConfig(7, { appModulosDesativados: 'caderneta,clientes' }, GERENTE);
  assert.equal(gravado(upsertCalls).appModulosDesativados, 'clientes,fechamento');
  assert.equal(cfg.appModulosDesativados, 'clientes,fechamento');
});

test('dedupe + sort + vazio→null (mesma receita do diasTrabalho)', async () => {
  const dup = setup();
  await dup.service.updateConfig(7, { appModulosDesativados: 'produtos,chat,produtos,ajustes' }, GERENTE);
  assert.equal(gravado(dup.upsertCalls).appModulosDesativados, 'ajustes,chat,produtos');

  const vazio = setup();
  await vazio.service.updateConfig(7, { appModulosDesativados: '' }, GERENTE);
  assert.equal(gravado(vazio.upsertCalls).appModulosDesativados, null);

  const soLixo = setup();
  await soLixo.service.updateConfig(7, { appModulosDesativados: 'rota,,   ,nada' }, GERENTE);
  assert.equal(gravado(soLixo.upsertCalls).appModulosDesativados, null);
});

test('as 5 chaves válidas passam todas juntas', async () => {
  const { service, upsertCalls } = setup();
  await service.updateConfig(
    7,
    { appModulosDesativados: 'ajustes,fechamento,chat,clientes,produtos' },
    GERENTE,
  );
  assert.equal(gravado(upsertCalls).appModulosDesativados, 'ajustes,chat,clientes,fechamento,produtos');
});

// ── LEITURA: quem vê o quê ───────────────────────────────────────────────────
test('MOTORISTA lê prospectorAtivo e appModulosDesativados no serialize (é o que o app usa)', async () => {
  const { service } = setup(
    row({
      prospectorAtivo: true,
      prospectorTemplate: 'Oi {empresa}, tudo bem?',
      prospectorRaioM: 200,
      prospectorMaxDia: 5,
      appModulosDesativados: 'chat,produtos',
    }),
  );
  const cfg = await service.getConfig(7, MOTORISTA);
  assert.equal(cfg.prospectorAtivo, true);
  assert.equal(cfg.prospectorTemplate, 'Oi {empresa}, tudo bem?');
  assert.equal(cfg.prospectorRaioM, 200);
  assert.equal(cfg.prospectorMaxDia, 5);
  assert.equal(cfg.appModulosDesativados, 'chat,produtos');
  // 24/08/2026 — os gates mortos NÃO voltam no serialize.
  for (const morto of ['prospectorEquipe', 'prospectorDisponivel', 'prospectorAutomacaoAtiva', 'prospectorAutomacaoMaxDia']) {
    assert.equal(Object.prototype.hasOwnProperty.call(cfg, morto), false, `${morto} deve estar morto`);
  }
  // ... e o Ciente é parte do contrato operacional (todo ator lê o SEU).
  assert.equal(typeof cfg.prospectorCiente, 'boolean');
});

test('linha antiga (pré-migration, sem os campos) lê os defaults e não quebra', async () => {
  const antiga = row();
  for (const k of [
    'prospectorAtivo',
    'prospectorTemplate',
    'prospectorRaioM',
    'prospectorMaxDia',
    'appModulosDesativados',
    'cobrancaWhatsTemplate',
  ]) delete (antiga as any)[k];
  const { service } = setup(antiga);
  const cfg = await service.getConfig(7, OWNER);
  assert.equal(cfg.prospectorAtivo, false);
  assert.equal(cfg.prospectorTemplate, null);
  assert.equal(cfg.prospectorRaioM, 150);
  assert.equal(cfg.prospectorMaxDia, 4);
  assert.equal(cfg.appModulosDesativados, null);
  assert.equal(cfg.cobrancaWhatsTemplate, null);
});

// ── OPERACIONAL: admin grava sem ser billing owner ───────────────────────────
test('GERENTE (Admin sem cobrança) grava os campos operacionais do prospector sem 403', async () => {
  const { service, upsertCalls } = setup();
  const cfg = await service.updateConfig(
    7,
    { prospectorAtivo: true, prospectorTemplate: '  Olá {empresa}  ' },
    GERENTE,
  );
  assert.equal(cfg.prospectorAtivo, true);
  // trim aplicado, igual ao avisoChegandoTemplate.
  assert.equal(gravado(upsertCalls).prospectorTemplate, 'Olá {empresa}');
});

test('template do prospector: vazio → null; texto gigante é cortado em 1000', async () => {
  const vazio = setup();
  await vazio.service.updateConfig(7, { prospectorTemplate: '   ' }, GERENTE);
  assert.equal(gravado(vazio.upsertCalls).prospectorTemplate, null);

  const gigante = setup();
  await gigante.service.updateConfig(7, { prospectorTemplate: 'x'.repeat(1500) }, GERENTE);
  assert.equal(String(gravado(gigante.upsertCalls).prospectorTemplate).length, 1000);
});

// ── BLOCO C — template da cobrança (F4) ──────────────────────────────────────
test('cobrancaWhatsTemplate: billing owner grava com trim/slice; vazio → null (mensagem de sempre)', async () => {
  const { service, upsertCalls } = setup();
  await service.updateConfig(7, { cobrancaWhatsTemplate: '  Oi {cliente}, seu boleto  ' }, OWNER);
  assert.equal(gravado(upsertCalls).cobrancaWhatsTemplate, 'Oi {cliente}, seu boleto');

  const vazio = setup();
  await vazio.service.updateConfig(7, { cobrancaWhatsTemplate: '' }, OWNER);
  assert.equal(gravado(vazio.upsertCalls).cobrancaWhatsTemplate, null);

  const gigante = setup();
  await gigante.service.updateConfig(7, { cobrancaWhatsTemplate: 'y'.repeat(1200) }, OWNER);
  assert.equal(String(gravado(gigante.upsertCalls).cobrancaWhatsTemplate).length, 1000);
});

test('cobrancaWhatsTemplate é COMERCIAL: gerente (não billing owner) leva 403 e nada é gravado', async () => {
  const { service, upsertCalls } = setup();
  await assert.rejects(
    () => service.updateConfig(7, { cobrancaWhatsTemplate: 'texto' }, GERENTE),
    /responsável financeiro/,
  );
  assert.equal(upsertCalls.length, 0);
});

test('cobrancaWhatsTemplate só aparece pro billing owner no serialize', async () => {
  const { service } = setup(row({ cobrancaWhatsTemplate: 'Oi {cliente}' }));
  const motorista = await service.getConfig(7, MOTORISTA);
  const dono = await service.getConfig(7, OWNER);
  assert.equal(motorista.cobrancaWhatsTemplate, undefined);
  assert.equal(dono.cobrancaWhatsTemplate, 'Oi {cliente}');
});

// ── CIENTE (24/08/2026) — carimbo POR USUÁRIO, idempotente ───────────────────
test('prospectorCiente nasce false, vira true depois do carimbo, e é DO USUÁRIO (não da empresa)', async () => {
  const { service } = setup();
  const motorista51 = { ...MOTORISTA, id: 51 };
  const motorista52 = { ...MOTORISTA, id: 52 };

  assert.equal((await service.getConfig(7, motorista51)).prospectorCiente, false);

  const res = await service.marcarProspectorCiente(51);
  assert.equal(res.ok, true);
  assert.equal(res.prospectorCiente, true);
  assert.ok(res.cienteEm, 'o carimbo devolve o instante gravado');

  // O 51 agora lê true; o 52 (mesma empresa) continua false — carimbo é da PESSOA.
  assert.equal((await service.getConfig(7, motorista51)).prospectorCiente, true);
  assert.equal((await service.getConfig(7, motorista52)).prospectorCiente, false);
});

test('marcarProspectorCiente é idempotente: repetir devolve o MESMO carimbo (o primeiro fica)', async () => {
  const { service, users } = setup();
  const primeira = await service.marcarProspectorCiente(51);
  const segunda = await service.marcarProspectorCiente(51);
  assert.equal(segunda.prospectorCiente, true);
  assert.equal(segunda.cienteEm, primeira.cienteEm, 'o primeiro carimbo nunca é sobrescrito');
  const events = users.getOnboardingEvents(await users.findById(51));
  assert.equal(events[EVENTO_PROSPECTOR_CIENTE], primeira.cienteEm);
});

test('marcarProspectorCiente sem usuário identificado devolve 400', async () => {
  const { service } = setup();
  await assert.rejects(() => service.marcarProspectorCiente(0), /Usuário não identificado/);
  await assert.rejects(() => service.marcarProspectorCiente(NaN as any), /Usuário não identificado/);
});

test('ator SEM id (token velho) lê prospectorCiente=false sem quebrar o GET', async () => {
  const { service } = setup();
  const cfg = await service.getConfig(7, MOTORISTA);
  assert.equal(cfg.prospectorCiente, false);
});
