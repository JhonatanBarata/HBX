import test from 'node:test';
import assert from 'node:assert/strict';

import { CadenciaGatilhoService } from './cadencia-gatilho.service';
import { EventRuleService } from '../automation/event-rule.service';

// S08 (MOTOR-ÚNICO): handleInbound() deixou de buscar/iterar os gatilhos
// direto — agora delega pro EventRuleService (mesmo prisma mock, "busca
// regras" acontece lá). Por isso o setup abaixo cria um EventRuleService de
// verdade sobre o MESMO `svc.prisma` e chama `svc.onModuleInit()` (que
// registra o handler 'lead_respondeu_whatsapp' nele) antes de exercitar os
// cenários — SEM mudar nenhum cenário/asserção existente.
function makeService(opts: {
  gatilhos: any[];
  lead: any | null;
  cadenciaInscricao?: any | null;
  cadencia?: any | null;
}) {
  const svc = Object.create(CadenciaGatilhoService.prototype) as any;
  const statusUpdates: any[] = [];
  const atividadeCalls: any[] = [];
  const timelineCalls: any[] = [];
  const realtimeCalls: any[] = [];
  const createdIdempotencyKeys = new Set<string>();

  svc.prisma = {
    cadenciaGatilho: {
      findMany: async () => opts.gatilhos,
      update: async () => ({}),
    },
    vendasLead: {
      findMany: async () => (opts.lead ? [opts.lead] : []),
      updateMany: async ({ where, data }: any) => {
        statusUpdates.push({ where, data });
        return { count: 1 };
      },
    },
    vendasLeadTimelineEvent: {
      create: async ({ data }: any) => {
        if (data.idempotencyKey) {
          if (createdIdempotencyKeys.has(data.idempotencyKey)) {
            const err: any = new Error('duplicate');
            err.code = 'P2002';
            throw err;
          }
          createdIdempotencyKeys.add(data.idempotencyKey);
        }
        timelineCalls.push(data);
        return {};
      },
    },
    cadenciaInscricao: {
      findFirst: async () => opts.cadenciaInscricao ?? null,
    },
    cadencia: {
      findUnique: async () => opts.cadencia ?? null,
    },
  };
  svc.atividades = {
    createFromAutomation: async (input: any) => {
      atividadeCalls.push(input);
      return { id: 'at1' };
    },
  };
  svc.conversations = { setCadenciaInboundHook() {} };
  svc.inboxRealtime = {
    publish: (evt: any) => {
      realtimeCalls.push(evt);
    },
  };
  svc.logger = { log() {}, warn() {}, error() {} };
  svc.eventRules = new EventRuleService(svc.prisma as any);
  svc.onModuleInit();

  return { svc, statusUpdates, atividadeCalls, timelineCalls, realtimeCalls };
}

test('gatilho inbound move status, cria atividade (hook WORM-12) e notifica — sem enviar WhatsApp', async () => {
  const { svc, statusUpdates, atividadeCalls, realtimeCalls } = makeService({
    gatilhos: [
      {
        id: 'g1',
        companyId: 7,
        nome: 'Respondeu no WhatsApp',
        evento: 'lead_respondeu_whatsapp',
        ativo: true,
        acoesJson: JSON.stringify([
          { tipo: 'mover_status', status: 'retorno' },
          { tipo: 'criar_atividade', titulo: 'Ligar de volta', atividadeTipo: 'ligacao', diasVencimento: 1 },
          { tipo: 'notificar_vendedor', titulo: 'Lead respondeu', mensagem: 'Fulano respondeu' },
        ]),
      },
    ],
    lead: { id: 'lead1', assignedUserId: 33, status: 'contato' },
  });

  await svc.handleInbound({ companyId: 7, fromPhone: '5511988887777' });

  assert.equal(statusUpdates.length, 1, 'status deve ser movido');
  assert.equal(statusUpdates[0].data.status, 'retorno');
  assert.equal(atividadeCalls.length, 1, 'atividade criada pelo hook WORM-12');
  assert.equal(atividadeCalls[0].origin, 'automacao');
  assert.equal(atividadeCalls[0].responsavelId, 33);
  assert.ok(realtimeCalls.length >= 1, 'notificacao publicada no realtime');
});

test('gatilho nao faz nada quando nenhum lead casa o telefone', async () => {
  const { svc, statusUpdates, atividadeCalls } = makeService({
    gatilhos: [
      { id: 'g1', companyId: 7, nome: 'x', evento: 'lead_respondeu_whatsapp', ativo: true, acoesJson: JSON.stringify([{ tipo: 'mover_status', status: 'retorno' }]) },
    ],
    lead: null,
  });
  await svc.handleInbound({ companyId: 7, fromPhone: '5511999990000' });
  assert.equal(statusUpdates.length, 0);
  assert.equal(atividadeCalls.length, 0);
});

// ================================================================
// S4 LEAD-CENTRICO (04-robozinho.md, item 4) — "Te chamou": resposta QUENTE de
// lead com robô ligado (cadência acabou de ser pausada por interruptForInbound,
// lastError='inbound_received') move etapa -> retorno + cria atividade com
// contexto. Sem gatilho configurado nenhum (lista vazia) — é comportamento
// embutido, não depende de CadenciaGatilho.
// ================================================================
test('te chamou: resposta quente com robo ligado move p/ retorno e cria atividade', async () => {
  const { svc, statusUpdates, atividadeCalls, timelineCalls } = makeService({
    gatilhos: [],
    lead: { id: 'lead1', assignedUserId: 33, status: 'contato' },
    cadenciaInscricao: { id: 'insc1', cadenciaId: 'cad1', currentStep: 1, updatedAt: new Date() },
    cadencia: { nome: 'Estratégico (Moderado)' },
  });

  await svc.handleInbound({ companyId: 7, fromPhone: '5511988887777', text: 'Quanto custa isso?' });

  assert.equal(statusUpdates.length, 1, 'status deve mover pra retorno');
  assert.equal(statusUpdates[0].data.status, 'retorno');
  assert.equal(atividadeCalls.length, 1, 'atividade com contexto criada');
  assert.equal(atividadeCalls[0].responsavelId, 33);
  assert.match(atividadeCalls[0].titulo, /Te chamou/);
  assert.equal(timelineCalls.length, 1);
  assert.equal(timelineCalls[0].eventType, 'robo_te_chamou');
  assert.match(timelineCalls[0].description, /Quanto custa isso/);
});

test('te chamou: idempotente — mesmo inbound processado 2x nao duplica', async () => {
  const { svc, statusUpdates, atividadeCalls } = makeService({
    gatilhos: [],
    lead: { id: 'lead1', assignedUserId: 33, status: 'contato' },
    cadenciaInscricao: { id: 'insc1', cadenciaId: 'cad1', currentStep: 1, updatedAt: new Date() },
    cadencia: { nome: 'Estratégico (Moderado)' },
  });

  const evt = { companyId: 7, fromPhone: '5511988887777', text: 'Quanto custa isso?' };
  await svc.handleInbound(evt);
  await svc.handleInbound(evt);

  assert.equal(statusUpdates.length, 1, 'status so muda 1 vez');
  assert.equal(atividadeCalls.length, 1, 'atividade so criada 1 vez');
});

test('te chamou: sem robo ligado (sem inscricao pausada recente) nao faz nada', async () => {
  const { svc, statusUpdates, atividadeCalls } = makeService({
    gatilhos: [],
    lead: { id: 'lead1', assignedUserId: 33, status: 'contato' },
    cadenciaInscricao: null,
  });

  await svc.handleInbound({ companyId: 7, fromPhone: '5511988887777', text: 'Quanto custa isso?' });

  assert.equal(statusUpdates.length, 0);
  assert.equal(atividadeCalls.length, 0);
});

test('te chamou: robo ligado mas resposta neutra (nao quente) nao faz nada', async () => {
  const { svc, statusUpdates, atividadeCalls } = makeService({
    gatilhos: [],
    lead: { id: 'lead1', assignedUserId: 33, status: 'contato' },
    cadenciaInscricao: { id: 'insc1', cadenciaId: 'cad1', currentStep: 1, updatedAt: new Date() },
    cadencia: { nome: 'Estratégico (Moderado)' },
  });

  await svc.handleInbound({ companyId: 7, fromPhone: '5511988887777', text: 'oi, quem é vc?' });

  assert.equal(statusUpdates.length, 0);
  assert.equal(atividadeCalls.length, 0);
});

test('te chamou: nao regride lead ja qualificado/encerrado (so cria atividade, nao mexe status)', async () => {
  const { svc, statusUpdates, atividadeCalls } = makeService({
    gatilhos: [],
    lead: { id: 'lead1', assignedUserId: 33, status: 'qualificado' },
    cadenciaInscricao: { id: 'insc1', cadenciaId: 'cad1', currentStep: 2, updatedAt: new Date() },
    cadencia: { nome: 'Determinado (Agressivo)' },
  });

  await svc.handleInbound({ companyId: 7, fromPhone: '5511988887777', text: 'Quero contratar, quanto custa?' });

  assert.equal(statusUpdates.length, 0, 'nao regride status ja avancado');
  assert.equal(atividadeCalls.length, 1, 'ainda assim surfaceia a atividade');
});
