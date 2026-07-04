import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaService } from './logistica.service';

// NÚCLEO-CRM N6 — prova o FREIO de segurança do módulo Logística:
//   Com HBX_LOGISTICA_ENABLED OFF (default), confirmar entrega SÓ muda status/GPS
//   e NÃO chama o disparo de WhatsApp (queueOutboundForCompany) NEM cria cobrança.
//   Com a flag ON, confirmar chama o WhatsApp blindado + lança a cobrança.
// Isso trava o incidente do dono: nenhum toque em chip sem a flag explícita.

function buildEntrega(overrides: Record<string, any> = {}) {
  return {
    id: 'entrega-1',
    status: 'em_rota',
    customerProfileId: 'conta-1',
    contatoId: null,
    valor: 20,
    cobrancaStatus: 'pendente',
    ...overrides,
  };
}

// Prisma mock mínimo: só o que confirmarEntrega/lancarCobranca tocam.
function buildPrismaMock(entrega: any, conta: any) {
  const chargesCreated: any[] = [];
  const entregaUpdates: any[] = [];
  return {
    chargesCreated,
    entregaUpdates,
    prisma: {
      entrega: {
        findFirst: async () => entrega,
        update: async (args: any) => {
          entregaUpdates.push(args.data);
          return { id: entrega.id, ...args.data };
        },
      },
      customerProfile: {
        findFirst: async () => conta,
      },
      contato: {
        findFirst: async () => null,
      },
      financeiroCharge: {
        create: async (args: any) => {
          chargesCreated.push(args.data);
          return { id: 'charge-1', ...args.data };
        },
      },
    } as any,
  };
}

// ConversationsService mock: conta as chamadas do caminho blindado.
function buildConversationsMock() {
  const calls: any[] = [];
  return {
    calls,
    conversations: {
      queueOutboundForCompany: async (companyId: number, payload: any) => {
        calls.push({ companyId, payload });
        return { queued: true };
      },
    } as any,
  };
}

test('confirmarEntrega: flag OFF → NÃO chama WhatsApp e NÃO cria cobrança (só status/GPS)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  delete process.env.HBX_LOGISTICA_ENABLED; // default OFF

  const { prisma, chargesCreated, entregaUpdates } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', modeloCobranca: 'avulso' },
  );
  const { conversations, calls } = buildConversationsMock();

  const service = new LogisticaService(prisma, conversations);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(res?.status, 'entregue');
  assert.equal(res?.effectsEnabled, false);
  assert.equal(res?.whatsappSent, false);
  assert.equal(res?.cobrancaLancada, false);
  // O disparo de WhatsApp NÃO foi chamado.
  assert.equal(calls.length, 0, 'queueOutboundForCompany não deve ser chamado com a flag OFF');
  // Nenhuma cobrança criada.
  assert.equal(chargesCreated.length, 0, 'nenhum FinanceiroCharge deve ser criado com a flag OFF');
  // O status/GPS FORAM gravados (o efeito seguro sempre roda).
  const statusUpdate = entregaUpdates.find((u) => u.status === 'entregue');
  assert.ok(statusUpdate, 'o status entregue deve ser gravado mesmo com a flag OFF');
  assert.equal(statusUpdate.deliveredLat, -4.9);
  assert.equal(statusUpdate.deliveredLng, -38.3);

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('confirmarEntrega: flag ON → chama WhatsApp blindado 1x e lança a cobrança', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, chargesCreated } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', modeloCobranca: 'avulso' },
  );
  const { conversations, calls } = buildConversationsMock();

  const service = new LogisticaService(prisma, conversations);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(res?.effectsEnabled, true);
  // Exatamente UMA chamada ao caminho blindado (nada de loop).
  assert.equal(calls.length, 1, 'deve chamar queueOutboundForCompany exatamente 1 vez');
  assert.equal(calls[0].companyId, 1);
  assert.equal(calls[0].payload.sourceModule, 'logistica_entrega');
  assert.equal(res?.whatsappSent, true);
  // Cobrança lançada (modelo avulso, valor > 0).
  assert.equal(chargesCreated.length, 1, 'deve lançar 1 FinanceiroCharge');
  assert.equal(chargesCreated[0].paymentMethod, 'MANUAL');
  assert.equal(chargesCreated[0].status, 'pending');
  assert.equal(res?.cobrancaLancada, true);

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});
