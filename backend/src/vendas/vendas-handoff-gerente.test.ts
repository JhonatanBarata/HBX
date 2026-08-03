import test from 'node:test';
import assert from 'node:assert/strict';

import { MessagingService } from '../messaging/messaging.service';

/**
 * 🔴 ROTEIRO DE PASSAGEM PRO GERENTE (03/08/2026)
 *
 * A cena que o dono cravou: o lead diz que tem interesse e o robô NÃO tenta
 * vender. Ele comemora, entrega nome e telefone de quem assume, e alguns
 * segundos depois manda o arremate. Enquanto ele não confiar o fechamento ao
 * bot, é ISSO que sai — não a pergunta esperta que a IA geraria.
 *
 * O que estes testes trancam:
 *  1. roteiro escrito = o texto DELE é o que sai (a IA nem é chamada);
 *  2. a 2ª mensagem é AGENDADA de verdade (`at` no futuro, outbox durável) —
 *     não um timer de processo que o `npm run publish` mataria calado;
 *  3. roteiro vazio = nada muda (o caminho de hoje, intacto);
 *  4. quem pergunta "o que é?" NÃO é passado — ainda é hora de explicar;
 *  5. o texto sai renderizado com os {{tokens}} de sempre, e o nome/telefone
 *     vêm do tenant que escreveu — nunca cravados no código (o pitch padrão com
 *     "Jhonatan" literal vazando pra todo mundo já custou um fix em 30/07).
 */

const COMPANY = 5;

// A copy LITERAL que o dono ditou. Fica no filtersJson da campanha DELE.
const ROTEIRO_1 =
  'fico muito feliz que tenha interesse, vc não vai se arrepender! daqui pra frente meu gerente vai entrar em contato, o telefone dele é 19 997024884, nome dele é Jhonatan';
const ROTEIRO_2 = 'se tiver alguma dúvida, qualquer coisa só chamar!';

function buildService(filtersJson: Record<string, unknown> | null) {
  const queueCalls: Array<{ companyId: number; payload: any }> = [];
  const prisma: any = {
    hasTable: async () => false,
    hasColumn: async () => false,
    company: { findUnique: async () => ({ id: COMPANY, name: 'HBX Solutions' }) },
    user: { findFirst: async () => ({ id: 6, name: 'Jhonatan' }) },
    vendasComercialConfig: { findUnique: async () => null },
    $transaction: async (fn: any) => fn(txMock),
  };
  const txMock: any = {
    vendasAutomationJob: { updateMany: async () => ({ count: 1 }) },
    vendasLead: { updateMany: async () => ({ count: 1 }) },
    vendasLeadTimelineEvent: { createMany: async () => ({ count: 1 }) },
  };
  const conversations: any = {
    queueOutboundForCompany: async (companyId: number, payload: any) => {
      queueCalls.push({ companyId, payload });
      return { outboundMessageId: queueCalls.length, conversationId: payload.conversationId };
    },
  };
  const service = new MessagingService(
    prisma,
    {} as any, {} as any, {} as any,
    conversations,
    { log: async () => undefined } as any,
    {} as any, {} as any, {} as any,
    { sendText: async () => undefined } as any,
    { publish: () => undefined, subscribe: () => () => undefined } as any,
    {} as any,
    { evaluate: async () => ({ allow: true, reason: 'disabled' }), getStats: () => ({}) } as any,
    undefined as any,
    undefined as any,
  );
  const job = {
    id: 'job-1',
    companyId: COMPANY,
    campaignId: 'camp-1',
    leadId: 'lead-1',
    campaign: {
      id: 'camp-1',
      companyId: COMPANY,
      createdByUserId: 6,
      filtersJson: filtersJson ? JSON.stringify(filtersJson) : null,
    },
    lead: { id: 'lead-1', name: 'Distribuidora Boa Água', city: 'Rio Claro', state: 'SP' },
  };
  return { service: service as any, job, queueCalls };
}

const COM_ROTEIRO = {
  handoffGerenteVariants: [ROTEIRO_1],
  handoffGerenteFollowUpVariants: [ROTEIRO_2],
};

// ── 1. O CÉREBRO: quando passa e quando não passa ───────────────────────────
test('🔴 roteiro escrito: a passagem é o texto do dono, com o arremate junto', async () => {
  const { service, job } = buildService(COM_ROTEIRO);

  const roteiro = await service.buildVendasHandoffGerente(job, 'positive');

  assert.equal(roteiro.primeira, ROTEIRO_1, 'texto que o dono cravou é literal');
  assert.equal(roteiro.segunda, ROTEIRO_2);
});

test('roteiro vazio: desarmado — o caminho de hoje segue inteiro', async () => {
  const { service, job } = buildService({ positiveReplyVariants: ['Boa! Posso te ligar rapidinho?'] });

  assert.equal(await service.buildVendasHandoffGerente(job, 'positive'), null);
});

test('campanha sem filtersJson nenhum também fica desarmada', async () => {
  const { service, job } = buildService(null);

  assert.equal(await service.buildVendasHandoffGerente(job, 'positive'), null);
});

test('quem pergunta "o que é?" NÃO é passado pro gerente — é hora de explicar', async () => {
  const { service, job } = buildService(COM_ROTEIRO);

  assert.equal(await service.buildVendasHandoffGerente(job, 'what_is_it'), null);
  assert.notEqual(await service.buildVendasHandoffGerente(job, 'positive'), null);
});

test('só a 1ª lista escrita: passa mesmo assim, sem arremate', async () => {
  const { service, job } = buildService({ handoffGerenteVariants: [ROTEIRO_1] });

  const roteiro = await service.buildVendasHandoffGerente(job, 'positive');
  assert.equal(roteiro.primeira, ROTEIRO_1);
  assert.equal(roteiro.segunda, null, 'sem 2ª lista não se inventa 2ª mensagem');
});

test('o roteiro passa pelos {{tokens}} de sempre — nada de marcador vazando', async () => {
  const { service, job } = buildService({
    handoffGerenteVariants: ['Boa, {{cliente}}! O gerente te chama já já.'],
  });

  const roteiro = await service.buildVendasHandoffGerente(job, 'positive');
  assert.equal(roteiro.primeira, 'Boa, Distribuidora Boa Água! O gerente te chama já já.');
  assert.ok(!roteiro.primeira.includes('{{'));
});

// ── 2. A 2ª MENSAGEM É AGENDADA, NÃO É TIMER ────────────────────────────────
test('🔴 a 2ª mensagem vai pra outbox com hora futura (sobrevive a restart)', async () => {
  const { service, job, queueCalls } = buildService(COM_ROTEIRO);
  const antes = Date.now();

  await service.queueVendasHandoffSegundaMensagem(
    { companyId: COMPANY, conversationId: 42, from: '5519998877766' },
    job,
    ROTEIRO_2,
  );

  assert.equal(queueCalls.length, 1);
  const payload = queueCalls[0].payload;
  assert.equal(payload.body, ROTEIRO_2);
  assert.ok(payload.at instanceof Date, 'sem `at` a mensagem sairia junto com a 1ª');
  assert.ok(payload.at.getTime() - antes >= 2000, 'tem que ser DEPOIS, com folga de gente');
  assert.equal(payload.variables.handoffGerente, true);
  assert.equal(
    payload.flowState,
    undefined,
    'não reescreve o estado da conversa — um humano pode ter assumido nesses segundos',
  );
});

test('o intervalo da 2ª mensagem é clampado (nada de 0s nem de 1 hora)', () => {
  const { service } = buildService(COM_ROTEIRO);
  const anterior = process.env.HBX_VENDAS_HANDOFF_SEGUNDA_MSG_MS;
  try {
    delete process.env.HBX_VENDAS_HANDOFF_SEGUNDA_MSG_MS;
    assert.equal(service.vendasHandoffSegundaMsgMs(), 8000);
    process.env.HBX_VENDAS_HANDOFF_SEGUNDA_MSG_MS = '0';
    assert.equal(service.vendasHandoffSegundaMsgMs(), 2000);
    process.env.HBX_VENDAS_HANDOFF_SEGUNDA_MSG_MS = '999999';
    assert.equal(service.vendasHandoffSegundaMsgMs(), 60000);
    process.env.HBX_VENDAS_HANDOFF_SEGUNDA_MSG_MS = 'abacaxi';
    assert.equal(service.vendasHandoffSegundaMsgMs(), 8000);
  } finally {
    if (anterior === undefined) delete process.env.HBX_VENDAS_HANDOFF_SEGUNDA_MSG_MS;
    else process.env.HBX_VENDAS_HANDOFF_SEGUNDA_MSG_MS = anterior;
  }
});

// ── 3. A CENA INTEIRA: o lead responde com interesse ─────────────────────────
test('🔴 CENA: lead diz que tem interesse → saem as DUAS mensagens do dono, nesta ordem', async () => {
  const { service, job, queueCalls } = buildService(COM_ROTEIRO);

  await service.markVendasAutomationInterested(
    {
      companyId: COMPANY,
      conversationId: 42,
      from: '5519998877766',
      text: 'tenho interesse sim',
      replyKind: 'positive',
      metadata: {},
      timestamp: new Date(),
    },
    job,
  );

  assert.equal(queueCalls.length, 2, 'a passagem é DUAS mensagens, não uma');
  assert.equal(queueCalls[0].payload.body, ROTEIRO_1);
  assert.equal(queueCalls[1].payload.body, ROTEIRO_2);
  assert.ok(
    queueCalls[1].payload.at instanceof Date && queueCalls[1].payload.at.getTime() > Date.now(),
    'o arremate é agendado pra depois',
  );
  // O card já foi pra "Respondeu — sua vez" e a próxima ação é de GENTE.
  const estado = queueCalls[0].payload.flowState?.metadata?.vendasAgendaQueue;
  assert.equal(estado?.nextAction, 'Prospecção: passado pro gerente, ligar pro lead');
  assert.equal(estado?.botActive, false, 'depois da passagem o robô cala');
});

test('CENA sem roteiro: continua saindo UMA mensagem, como sempre saiu', async () => {
  const { service, job, queueCalls } = buildService({
    positiveReplyVariants: ['Boa! Posso te ligar rapidinho pra entender a rotina de vocês?'],
  });

  await service.markVendasAutomationInterested(
    {
      companyId: COMPANY,
      conversationId: 42,
      from: '5519998877766',
      text: 'tenho interesse sim',
      replyKind: 'positive',
      metadata: {},
      timestamp: new Date(),
    },
    job,
  );

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].payload.body, 'Boa! Posso te ligar rapidinho pra entender a rotina de vocês?');
  assert.equal(queueCalls[0].payload.at, undefined, 'a resposta de sempre sai na hora');
});
