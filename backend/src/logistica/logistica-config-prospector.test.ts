// PROSPECTOR CNPJ + MÓDULOS DO APP (PR07082026-PROSPECTOR-CNPJ, 07/08).
//
// O que este arquivo prova, e por que cada prova existe:
//  1) CLAMP do raio (50..500) e do teto/dia (1..8) — régua fora da faixa nunca
//     chega no banco (o mesmo desenho do avisoChegandoDistanciaM).
//  2) 🔴 "rota" NUNCA entra em appModulosDesativados — LEI DURA: app de entrega
//     sem rota não é app. E chave inválida é DESCARTADA em silêncio (allowlist).
//  3) A automação COBRADA (decisão nº8 do dono) não entra pelo PATCH do tenant
//     e o serviço do Master recusa ator que não é Master.
//  4) O MOTORISTA LÊ prospectorAtivo/appModulosDesativados — sem isso o app não
//     tem como decidir o que mostrar (é o motivo de serem operacionais).
//
// Molde: logistica-config-devedor-na-rota.test.ts (prisma fake em memória,
// node:test) — arquivo isolado de propósito, sem tocar nos testes vizinhos.
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaConfigService } from './logistica-config.service';

const GERENTE = { role: 'ADMIN', isSystemMaster: false, canViewBilling: false };
const OWNER = { role: 'ADMIN', isSystemMaster: false, canViewBilling: true };
const MASTER = { role: 'ADMIN', isSystemMaster: true, canViewBilling: true };
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
    moduloFinanceiroAtivo: false,
    moduloRecoveryAtivo: false,
    gerarDiaAutomatico: false,
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
    trackingAtivo: false,
    modoRotaPadrao: 'ESSENTIAL',
    logisticaNivel: 'ADVANCED',
    devedorNaRota: 'COBRANCA',
    prospectorAtivo: false,
    prospectorTemplate: null,
    prospectorRaioM: 150,
    prospectorMaxDia: 4,
    prospectorEquipe: false,
    prospectorAutomacaoAtiva: false,
    prospectorAutomacaoMaxDia: 0,
    appModulosDesativados: null,
    ...overrides,
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
  return { service: new LogisticaConfigService(prisma, wallet), upsertCalls };
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
    { appModulosDesativados: 'caderneta,financeiro,xpto,clientes' },
    GERENTE,
  );
  assert.equal(gravado(upsertCalls).appModulosDesativados, 'caderneta,clientes');
  assert.equal(cfg.appModulosDesativados, 'caderneta,clientes');
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
    { appModulosDesativados: 'ajustes,caderneta,chat,clientes,produtos' },
    GERENTE,
  );
  assert.equal(gravado(upsertCalls).appModulosDesativados, 'ajustes,caderneta,chat,clientes,produtos');
});

// ── AUTOMAÇÃO COBRADA: só o Master grava (decisão nº8) ───────────────────────
test('ator não-Master NÃO grava prospectorAutomacaoAtiva pelo PATCH do tenant (403, nada no banco)', async () => {
  for (const ator of [OWNER, GERENTE, MOTORISTA]) {
    const { service, upsertCalls } = setup();
    await assert.rejects(
      () => service.updateConfig(7, { prospectorAutomacaoAtiva: true } as any, ator),
      /liberado pela HBX/,
      `ator ${ator.role}/${ator.canViewBilling} não deveria ligar a automação`,
    );
    assert.equal(upsertCalls.length, 0, 'nada pode ser gravado quando o caminho é recusado');
  }
});

test('nem o MASTER liga a automação pelo PATCH genérico — a porta é o endereço próprio', async () => {
  const { service, upsertCalls } = setup();
  await assert.rejects(
    () => service.updateConfig(7, { prospectorAutomacaoMaxDia: 10 } as any, MASTER),
    /liberado pela HBX/,
  );
  assert.equal(upsertCalls.length, 0);
});

test('setProspectorAutomacao recusa ator que não é Master (cinto-e-suspensório do MasterGuard)', async () => {
  for (const ator of [OWNER, GERENTE, MOTORISTA]) {
    const { service, upsertCalls } = setup();
    await assert.rejects(
      () => service.setProspectorAutomacao(7, { prospectorAutomacaoAtiva: true }, ator),
      /liberado pela HBX/,
    );
    assert.equal(upsertCalls.length, 0);
  }
});

test('Master liga a automação pelo endereço próprio, com clamp do teto (0..50)', async () => {
  const { service, upsertCalls } = setup();
  const cfg = await service.setProspectorAutomacao(
    7,
    { prospectorAutomacaoAtiva: true, prospectorAutomacaoMaxDia: 999 },
    MASTER,
  );
  assert.equal(gravado(upsertCalls).prospectorAutomacaoAtiva, true);
  assert.equal(gravado(upsertCalls).prospectorAutomacaoMaxDia, 50);
  assert.equal(cfg.prospectorAutomacaoAtiva, true);
  assert.equal(cfg.prospectorAutomacaoMaxDia, 50);

  const neg = setup();
  await neg.service.setProspectorAutomacao(7, { prospectorAutomacaoMaxDia: -1 }, MASTER);
  assert.equal(gravado(neg.upsertCalls).prospectorAutomacaoMaxDia, 0);
});

test('setProspectorAutomacao sem nada pra mudar devolve 400 (não grava upsert vazio)', async () => {
  const { service, upsertCalls } = setup();
  await assert.rejects(() => service.setProspectorAutomacao(7, {}, MASTER), /Nada para alterar/);
  assert.equal(upsertCalls.length, 0);
});

// ── LEITURA: quem vê o quê ───────────────────────────────────────────────────
test('MOTORISTA lê prospectorAtivo e appModulosDesativados no serialize (é o que o app usa)', async () => {
  const { service } = setup(
    row({
      prospectorAtivo: true,
      prospectorEquipe: true,
      prospectorTemplate: 'Oi {empresa}, tudo bem?',
      prospectorRaioM: 200,
      prospectorMaxDia: 5,
      appModulosDesativados: 'chat,produtos',
    }),
  );
  const cfg = await service.getConfig(7, MOTORISTA);
  assert.equal(cfg.prospectorAtivo, true);
  assert.equal(cfg.prospectorEquipe, true);
  assert.equal(cfg.prospectorTemplate, 'Oi {empresa}, tudo bem?');
  assert.equal(cfg.prospectorRaioM, 200);
  assert.equal(cfg.prospectorMaxDia, 5);
  assert.equal(cfg.appModulosDesativados, 'chat,produtos');
  assert.equal(typeof cfg.prospectorDisponivel, 'boolean');
});

test('MOTORISTA/GERENTE não veem a automação cobrada; billing owner vê', async () => {
  const { service } = setup(row({ prospectorAutomacaoAtiva: true, prospectorAutomacaoMaxDia: 12 }));
  const motorista = await service.getConfig(7, MOTORISTA);
  const gerente = await service.getConfig(7, GERENTE);
  const dono = await service.getConfig(7, OWNER);
  assert.equal(motorista.prospectorAutomacaoAtiva, undefined);
  assert.equal(gerente.prospectorAutomacaoAtiva, undefined);
  assert.equal(dono.prospectorAutomacaoAtiva, true);
  assert.equal(dono.prospectorAutomacaoMaxDia, 12);
});

test('linha antiga (pré-migration, sem os campos) lê os defaults e não quebra', async () => {
  const antiga = row();
  for (const k of [
    'prospectorAtivo',
    'prospectorTemplate',
    'prospectorRaioM',
    'prospectorMaxDia',
    'prospectorEquipe',
    'prospectorAutomacaoAtiva',
    'prospectorAutomacaoMaxDia',
    'appModulosDesativados',
    'cobrancaWhatsTemplate',
  ]) delete (antiga as any)[k];
  const { service } = setup(antiga);
  const cfg = await service.getConfig(7, OWNER);
  assert.equal(cfg.prospectorAtivo, false);
  assert.equal(cfg.prospectorTemplate, null);
  assert.equal(cfg.prospectorRaioM, 150);
  assert.equal(cfg.prospectorMaxDia, 4);
  assert.equal(cfg.prospectorEquipe, false);
  assert.equal(cfg.appModulosDesativados, null);
  assert.equal(cfg.prospectorAutomacaoAtiva, false);
  assert.equal(cfg.prospectorAutomacaoMaxDia, 0);
  assert.equal(cfg.cobrancaWhatsTemplate, null);
});

// ── OPERACIONAL: admin grava sem ser billing owner ───────────────────────────
test('GERENTE (Admin sem cobrança) grava os campos operacionais do prospector sem 403', async () => {
  const { service, upsertCalls } = setup();
  const cfg = await service.updateConfig(
    7,
    { prospectorAtivo: true, prospectorEquipe: true, prospectorTemplate: '  Olá {empresa}  ' },
    GERENTE,
  );
  assert.equal(cfg.prospectorAtivo, true);
  assert.equal(cfg.prospectorEquipe, true);
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

// ── GATE GLOBAL POR ENV ──────────────────────────────────────────────────────
test('prospectorDisponivel segue HBX_PROSPECTOR_ENABLED (default OFF)', async () => {
  const antes = process.env.HBX_PROSPECTOR_ENABLED;
  try {
    delete process.env.HBX_PROSPECTOR_ENABLED;
    const off = setup();
    assert.equal((await off.service.getConfig(7, MOTORISTA)).prospectorDisponivel, false);

    process.env.HBX_PROSPECTOR_ENABLED = 'true';
    const on = setup();
    assert.equal((await on.service.getConfig(7, MOTORISTA)).prospectorDisponivel, true);

    process.env.HBX_PROSPECTOR_ENABLED = 'talvez';
    const lixo = setup();
    assert.equal((await lixo.service.getConfig(7, MOTORISTA)).prospectorDisponivel, false);
  } finally {
    if (antes === undefined) delete process.env.HBX_PROSPECTOR_ENABLED;
    else process.env.HBX_PROSPECTOR_ENABLED = antes;
  }
});
