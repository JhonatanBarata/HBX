// VACINA da trava de horário do disparo automático (ordem do dono 31/07/2026):
// "clientes também devem ser barrados, pela lei de disparos fora de horário".
//
// A cena que não pode voltar: 03:20 da madrugada, uma mensagem comercial automática
// sai porque nenhum freio do caminho de envio olhava o relógio. Se alguém apagar a
// chamada do gate no despacho, ou inverter o sinal da comparação, estes testes gritam.
//
// Todas as datas são construídas em UTC de propósito: o teste tem que passar igual no
// container (UTC) e na máquina do dono (-03) — lei [[teste-verde-no-meu-fuso-nao-vale]].
// Referência: 31/07/2026 é SEXTA-feira; 01/08 sábado; 03/08 segunda.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decidirJanelaComercial,
  JANELA_PADRAO,
  WaJanelaComercialGateService,
  janelaGateEnabledFromEnv,
  type WaJanelaDecision,
} from './wa-janela-comercial.gate';
import { getBusinessDateParts } from '../vendas/business-hours.util';

const JANELA = { ...JANELA_PADRAO }; // 08:00–18:00

// Instantes fixos, escritos como UTC (America/Sao_Paulo = UTC-3 o ano todo).
const SEX_0320 = new Date('2026-07-31T06:20:00Z'); // sexta 31/07, 03:20 -03
const SEX_1000 = new Date('2026-07-31T13:00:00Z'); // sexta 31/07, 10:00 -03
const SEX_1900 = new Date('2026-07-31T22:00:00Z'); // sexta 31/07, 19:00 -03
const SAB_1000 = new Date('2026-08-01T13:00:00Z'); // sábado 01/08, 10:00 -03

// Cobra "foi segurado" e devolve a decisão já estreitada — sem depender de como a
// versão do TS do container estreita união discriminada dentro do teste.
function segurado(d: WaJanelaDecision) {
  assert.equal(d.allow, false, 'esperava disparo SEGURADO e ele passou');
  return d as Extract<WaJanelaDecision, { allow: false }>;
}

function horaBr(date: Date) {
  const p = getBusinessDateParts(date);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

// ── A decisão pura ────────────────────────────────────────────────────────────

test('madrugada: disparo automático NÃO sai — vai pra abertura do mesmo dia', () => {
  const d = segurado(decidirJanelaComercial({ now: SEX_0320, janela: JANELA, automatico: true }));
  assert.equal(d.action, 'reschedule');
  assert.equal(d.reason, 'fora_da_janela');
  assert.equal(horaBr(d.proximaAberturaAt), '31/07 08:00');
  // 03:20 -> 08:00 = 4h40min de espera; nunca "tenta de novo já".
  assert.ok(d.retryAfterMs > 4 * 60 * 60 * 1000);
});

test('dentro da janela: passa', () => {
  assert.equal(decidirJanelaComercial({ now: SEX_1000, janela: JANELA, automatico: true }).allow, true);
});

test('depois das 18h de sexta: cai na segunda de manhã, não no sábado', () => {
  const d = segurado(decidirJanelaComercial({ now: SEX_1900, janela: JANELA, automatico: true }));
  assert.equal(horaBr(d.proximaAberturaAt), '03/08 08:00');
});

test('fim de semana: sábado 10h é fora do expediente', () => {
  const d = segurado(decidirJanelaComercial({ now: SAB_1000, janela: JANELA, automatico: true }));
  assert.equal(horaBr(d.proximaAberturaAt), '03/08 08:00');
});

test('gente não é barrada: humano manda às 03:20 se quiser', () => {
  assert.equal(decidirJanelaComercial({ now: SEX_0320, janela: JANELA, automatico: false }).allow, true);
});

test('janela do cliente manda — 09:00 às 17:30 barra 08:30 e barra 17:45', () => {
  const janela = { workingHoursStart: '09:00', workingHoursEnd: '17:30' };
  const cedo = segurado(decidirJanelaComercial({ now: new Date('2026-07-31T11:30:00Z'), janela, automatico: true })); // 08:30 -03
  assert.equal(horaBr(cedo.proximaAberturaAt), '31/07 09:00');

  const tarde = segurado(decidirJanelaComercial({ now: new Date('2026-07-31T20:45:00Z'), janela, automatico: true })); // 17:45 -03
  assert.equal(horaBr(tarde.proximaAberturaAt), '03/08 09:00');
});

// ── O serviço (escopo, fonte da janela, falha de banco) ───────────────────────

function servico(prisma: any) {
  return new WaJanelaComercialGateService(prisma);
}

const PRISMA_SEM_CONFIG = {
  vendasComercialConfig: { findUnique: async () => null },
  vendasAutomationCampaign: { findFirst: async () => null },
};

test('módulo comercial automático de madrugada é segurado', async () => {
  const d = await servico(PRISMA_SEM_CONFIG).evaluate({
    companyId: 5,
    sourceModule: 'vendas_prospeccao_bot',
    senderType: 'bot',
    now: SEX_0320,
  });
  assert.equal(d.allow, false);
});

test('módulo NÃO comercial passa (logística manda transacional pra cliente conhecido)', async () => {
  const d = await servico(PRISMA_SEM_CONFIG).evaluate({
    companyId: 5,
    sourceModule: 'logistica',
    senderType: 'bot',
    now: SEX_0320,
  });
  assert.equal(d.allow, true);
});

test('janela vem da VendasComercialConfig da empresa', async () => {
  const prisma = {
    vendasComercialConfig: { findUnique: async () => ({ workingHoursStart: '10:00', workingHoursEnd: '16:00' }) },
    vendasAutomationCampaign: { findFirst: async () => ({ workingHoursStart: '00:00', workingHoursEnd: '23:59' }) },
  };
  const janela = await servico(prisma).janelaDaEmpresa(5);
  assert.deepEqual(janela, { workingHoursStart: '10:00', workingHoursEnd: '16:00' });
});

test('tenant legado sem config comercial: janela cai na campanha', async () => {
  const prisma = {
    vendasComercialConfig: { findUnique: async () => null },
    vendasAutomationCampaign: { findFirst: async () => ({ workingHoursStart: '09:00', workingHoursEnd: '17:30' }) },
  };
  const janela = await servico(prisma).janelaDaEmpresa(5);
  assert.deepEqual(janela, { workingHoursStart: '09:00', workingHoursEnd: '17:30' });
});

test('banco fora NÃO libera madrugada — cai no padrão restritivo e segura', async () => {
  const prisma = {
    vendasComercialConfig: {
      findUnique: async () => {
        throw new Error('banco fora');
      },
    },
  };
  const svc = servico(prisma);
  assert.deepEqual(await svc.janelaDaEmpresa(5), JANELA_PADRAO);
  const d = await svc.evaluate({ companyId: 5, sourceModule: 'cadencia_bot', senderType: 'bot', now: SEX_0320 });
  assert.equal(d.allow, false);
});

test('a trava nasce LIGADA (sem env nenhuma)', () => {
  const antes = process.env.HBX_WA_JANELA_GATE_ENABLED;
  delete process.env.HBX_WA_JANELA_GATE_ENABLED;
  assert.equal(janelaGateEnabledFromEnv(), true);
  process.env.HBX_WA_JANELA_GATE_ENABLED = '0';
  assert.equal(janelaGateEnabledFromEnv(), false);
  if (antes === undefined) delete process.env.HBX_WA_JANELA_GATE_ENABLED;
  else process.env.HBX_WA_JANELA_GATE_ENABLED = antes;
});
