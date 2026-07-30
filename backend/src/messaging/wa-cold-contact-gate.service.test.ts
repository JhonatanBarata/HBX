import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WaColdContactGateService,
  normalizeColdText,
  coldTextSimilarity,
  brPhoneDigitCandidates,
  businessDayStartUtc,
} from './wa-cold-contact-gate.service';

/**
 * Aceite da BLINDAGEM DO DISPARO FRIO (incidente 30/07/2026 — chip expulso por
 * device_removed 2s após o 3º disparo). O juiz principal é o caso REAL: as duas
 * copies usadas no incidente TÊM que ser travadas pela régua de similaridade;
 * espaçamento de 2 minutos entre frios TEM que reagendar. Se estes testes
 * passassem no código de 30/07 de manhã, o chip não tinha caído.
 */

// As duas aberturas REAIS de 30/07 (08:55 e 08:57) — "variação" cosmética.
const INCIDENT_COPY_A =
  'Bom dia, tudo bem? Me chamo Jhonatan. Trabalho com um sistema de gestão para distribuidoras de água aqui da região de Campinas. Posso te mostrar como funciona?';
const INCIDENT_COPY_B =
  'Bom dia! Tudo bem? Aqui é o Jhonatan. Eu trabalho com um sistema de gestão para distribuidoras de água na região de Campinas. Posso te mostrar como funciona?';
// Uma variação DE VERDADE (estrutura e oferta reescritas).
const REAL_VARIANT =
  'Opa, falo com o responsável? Vi o caminhão de vocês no bairro e queria entender como vocês controlam as entregas hoje — a gente monta rota e cobrança automática pra distribuidora.';

function resetEnv() {
  delete process.env.HBX_WA_COLD_GATE_ENABLED;
  delete process.env.HBX_WA_COLD_MAX_PER_DAY;
  delete process.env.HBX_WA_COLD_MIN_SPACING_MINUTES;
  delete process.env.HBX_WA_COLD_SIMILARITY_PCT;
  delete process.env.HBX_WA_COLD_SIMILARITY_WINDOW_HOURS;
  delete process.env.HBX_WA_COLD_SIMILARITY_MIN_LEN;
}

type PrismaScript = {
  priorInConversation?: any;
  siblingConversations?: any[];
  priorElsewhere?: any;
  coldSentToday?: number;
  lastColdAt?: Date | null;
  recentColdMetadatas?: string[];
  failAll?: boolean;
};

function makePrisma(script: PrismaScript = {}) {
  const calls: Record<string, any[]> = { create: [] };
  const prisma = {
    companyMessage: {
      async findFirst(args: any) {
        if (script.failAll) throw new Error('db down');
        const wantsConversation = Boolean(args?.where?.conversationId && !args?.where?.conversationId?.in);
        if (wantsConversation) return script.priorInConversation ?? null;
        return script.priorElsewhere ?? null;
      },
    },
    companyConversation: {
      async findMany() {
        if (script.failAll) throw new Error('db down');
        return script.siblingConversations ?? [];
      },
    },
    whatsAppAuditLog: {
      async count() {
        if (script.failAll) throw new Error('db down');
        return script.coldSentToday ?? 0;
      },
      async findFirst(args: any) {
        if (script.failAll) throw new Error('db down');
        if (args?.where?.event === 'cold_contact_sent') {
          return script.lastColdAt ? { createdAt: script.lastColdAt } : null;
        }
        return null;
      },
      async findMany() {
        if (script.failAll) throw new Error('db down');
        return (script.recentColdMetadatas ?? []).map((textNorm) => ({
          metadata: JSON.stringify({ extra: { textNorm } }),
        }));
      },
      async create(args: any) {
        calls.create.push(args);
        return { id: 1 };
      },
    },
  } as any;
  return { prisma, calls };
}

const COLD_INPUT = {
  companyId: 5,
  conversationId: 77,
  to: '5519989431379',
  sourceModule: 'vendas_human',
  senderType: 'human',
  body: INCIDENT_COPY_A,
};

// ── Funções puras ────────────────────────────────────────────────────────────

test('normalizeColdText: minúsculas, sem acento, sem dígito/pontuação', () => {
  assert.equal(normalizeColdText('Olá, JOÃO! 123 tudo bem?'), 'ola joao tudo bem');
});

test('similaridade: as DUAS copies do incidente 30/07 batem acima de 85%', () => {
  const sim = coldTextSimilarity(normalizeColdText(INCIDENT_COPY_A), normalizeColdText(INCIDENT_COPY_B));
  assert.ok(sim >= 0.85, `similaridade ${sim} deveria ser >= 0.85 — o carimbo do incidente TEM que ser pego`);
});

test('similaridade: variação de verdade passa por baixo da régua', () => {
  const sim = coldTextSimilarity(normalizeColdText(INCIDENT_COPY_A), normalizeColdText(REAL_VARIANT));
  assert.ok(sim < 0.85, `similaridade ${sim} deveria ser < 0.85 para copy reescrita`);
});

test('telefone BR: variantes com/sem o 9º dígito', () => {
  assert.deepEqual(brPhoneDigitCandidates('5519997024884'), ['5519997024884', '551997024884']);
  assert.deepEqual(brPhoneDigitCandidates('551997024884'), ['551997024884', '5519997024884']);
});

test('dia-negócio: fronteira no fuso do dono (-03), não no UTC', () => {
  // 30/07 02:59 UTC ainda é 29/07 23:59 em SP → dia-negócio começa 29/07 03:00 UTC.
  assert.equal(
    businessDayStartUtc(new Date('2026-07-30T02:59:00Z')).toISOString(),
    '2026-07-29T03:00:00.000Z',
  );
  // 30/07 03:01 UTC é 30/07 00:01 em SP → dia novo.
  assert.equal(
    businessDayStartUtc(new Date('2026-07-30T03:01:00Z')).toISOString(),
    '2026-07-30T03:00:00.000Z',
  );
});

// ── evaluate ─────────────────────────────────────────────────────────────────

test('fonte fora do escopo comercial: passa sem consultar nada', async () => {
  resetEnv();
  const { prisma, calls } = makePrisma();
  const svc = new WaColdContactGateService(prisma);
  const decision = await svc.evaluate({ ...COLD_INPUT, sourceModule: 'logistica_entrega' });
  assert.deepEqual(decision, { allow: true, cold: false });
  assert.equal(calls.create.length, 0);
});

test('kill-switch explícito desliga o gate', async () => {
  resetEnv();
  process.env.HBX_WA_COLD_GATE_ENABLED = 'false';
  const { prisma } = makePrisma();
  const svc = new WaColdContactGateService(prisma);
  const decision = await svc.evaluate(COLD_INPUT);
  assert.deepEqual(decision, { allow: true, cold: false });
});

test('contato CONHECIDO (inbound na conversa): nunca é frio, não consome cota', async () => {
  resetEnv();
  const { prisma, calls } = makePrisma({ priorInConversation: { id: 1 } });
  const svc = new WaColdContactGateService(prisma);
  const decision = await svc.evaluate(COLD_INPUT);
  assert.deepEqual(decision, { allow: true, cold: false });
  assert.equal(calls.create.length, 0);
});

test('contato conhecido em OUTRA conversa do mesmo número: não é frio', async () => {
  resetEnv();
  const { prisma } = makePrisma({
    siblingConversations: [{ id: 12 }],
    priorElsewhere: { id: 2 },
  });
  const svc = new WaColdContactGateService(prisma);
  const decision = await svc.evaluate(COLD_INPUT);
  assert.deepEqual(decision, { allow: true, cold: false });
});

test('frio liberado: consome cota persistente (cold_contact_sent no audit log)', async () => {
  resetEnv();
  const { prisma, calls } = makePrisma();
  const svc = new WaColdContactGateService(prisma);
  const decision = await svc.evaluate(COLD_INPUT);
  assert.deepEqual(decision, { allow: true, cold: true });
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0]?.data?.event, 'cold_contact_sent');
  const metadata = JSON.parse(calls.create[0]?.data?.metadata || '{}');
  assert.ok(String(metadata?.extra?.textNorm || '').includes('bom dia tudo bem'));
});

test('teto diário cheio + envio HUMANO: cancela com motivo legível', async () => {
  resetEnv();
  process.env.HBX_WA_COLD_MAX_PER_DAY = '10';
  const { prisma, calls } = makePrisma({ coldSentToday: 10 });
  const svc = new WaColdContactGateService(prisma);
  const decision = await svc.evaluate(COLD_INPUT);
  assert.equal(decision.allow, false);
  assert.ok(decision.allow === false && decision.action === 'cancel');
  assert.ok(decision.allow === false && decision.reason === 'cold_daily_cap');
  assert.equal(calls.create.length, 0);
});

test('teto diário cheio + BOT: reagenda para o dia seguinte (nunca descarta)', async () => {
  resetEnv();
  process.env.HBX_WA_COLD_MAX_PER_DAY = '10';
  const { prisma } = makePrisma({ coldSentToday: 10 });
  const svc = new WaColdContactGateService(prisma);
  const decision = await svc.evaluate({ ...COLD_INPUT, sourceModule: 'vendas_prospeccao_bot', senderType: 'bot' });
  assert.equal(decision.allow, false);
  assert.ok(decision.allow === false && decision.action === 'reschedule');
  assert.ok(decision.allow === false && decision.reason === 'cold_daily_cap');
  assert.ok(decision.allow === false && decision.retryAfterMs >= 60_000);
});

test('espaçamento: 2 minutos após o último frio (como no incidente) REAGENDA', async () => {
  resetEnv();
  process.env.HBX_WA_COLD_MIN_SPACING_MINUTES = '10';
  const { prisma } = makePrisma({ lastColdAt: new Date(Date.now() - 2 * 60 * 1000) });
  const svc = new WaColdContactGateService(prisma);
  const decision = await svc.evaluate(COLD_INPUT);
  assert.equal(decision.allow, false);
  assert.ok(decision.allow === false && decision.action === 'reschedule');
  assert.ok(decision.allow === false && decision.reason === 'cold_spacing');
  // falta ~8 min: reagendamento tem que cobrir o resto da janela.
  assert.ok(decision.allow === false && decision.retryAfterMs >= 7 * 60 * 1000);
});

test('copy do incidente: 2ª abertura quase igual à 1ª é CANCELADA (esperar não resolve)', async () => {
  resetEnv();
  const { prisma, calls } = makePrisma({
    lastColdAt: new Date(Date.now() - 60 * 60 * 1000),
    recentColdMetadatas: [normalizeColdText(INCIDENT_COPY_A)],
  });
  const svc = new WaColdContactGateService(prisma);
  const decision = await svc.evaluate({ ...COLD_INPUT, body: INCIDENT_COPY_B });
  assert.equal(decision.allow, false);
  assert.ok(decision.allow === false && decision.action === 'cancel');
  assert.ok(decision.allow === false && decision.reason === 'cold_copy_similar');
  assert.equal(calls.create.length, 0);
});

test('copy reescrita de verdade passa (espaçamento ok, teto ok)', async () => {
  resetEnv();
  const { prisma, calls } = makePrisma({
    lastColdAt: new Date(Date.now() - 60 * 60 * 1000),
    recentColdMetadatas: [normalizeColdText(INCIDENT_COPY_A)],
  });
  const svc = new WaColdContactGateService(prisma);
  const decision = await svc.evaluate({ ...COLD_INPUT, body: REAL_VARIANT });
  assert.deepEqual(decision, { allow: true, cold: true });
  assert.equal(calls.create.length, 1);
});

test('texto curto (pré-mensagem "oi, tudo bem?") não passa pela régua de similaridade', async () => {
  resetEnv();
  const { prisma } = makePrisma({
    lastColdAt: new Date(Date.now() - 60 * 60 * 1000),
    recentColdMetadatas: [normalizeColdText('Oi, tudo bem?')],
  });
  const svc = new WaColdContactGateService(prisma);
  const decision = await svc.evaluate({ ...COLD_INPUT, body: 'Oi, tudo bem?' });
  assert.deepEqual(decision, { allow: true, cold: true });
});

test('fail-open: banco fora do ar NUNCA derruba o caminho de envio', async () => {
  resetEnv();
  const { prisma } = makePrisma({ failAll: true });
  const svc = new WaColdContactGateService(prisma);
  const decision = await svc.evaluate(COLD_INPUT);
  assert.deepEqual(decision, { allow: true, cold: false });
});
