import test from 'node:test';
import assert from 'node:assert/strict';

import { CadenciaGatilhoService } from './cadencia-gatilho.service';

function makeService(opts: { gatilhos: any[]; lead: any | null }) {
  const svc = Object.create(CadenciaGatilhoService.prototype) as any;
  const statusUpdates: any[] = [];
  const atividadeCalls: any[] = [];
  const timelineCalls: any[] = [];
  const realtimeCalls: any[] = [];

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
        timelineCalls.push(data);
        return {};
      },
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
