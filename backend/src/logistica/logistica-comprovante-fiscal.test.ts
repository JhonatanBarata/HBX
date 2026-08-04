// FISCAL F2a — o comprovante SEM VALOR FISCAL pega carona no aviso "entregue"
// SEM abrir segundo caminho de envio: mesma mensagem, mesmo
// queueOutboundForCompany (disjuntor/outbox/1-número=1-conexão). Aqui provamos
// o gancho: fiscal devolve anexo → variables.attachment; fiscal ausente ou
// devolvendo null → mensagem de texto igual à de antes (zero regressão).
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LogisticaService } from './logistica.service';

function makeFakes(opts: { fiscal?: any } = {}) {
  const enviados: any[] = [];
  const prisma = {
    customerProfile: {
      findFirst: async () => ({
        name: 'Dona Maria',
        phone: '19999990000',
        phoneNormalized: '5519999990000',
        avisarEntrega: true,
      }),
    },
    contato: { findFirst: async () => ({ nome: 'Dona Maria', whatsapp: '5519999990000', phone: null }) },
    // montarVarsAviso é best-effort: qualquer consulta que faltar cai no catch
    // interno e a mensagem sai com vars mínimas.
    entrega: { findFirst: async () => null },
  } as any;
  const conversations = {
    queueOutboundForCompany: async (_companyId: number, payload: any) => {
      enviados.push(payload);
      return { id: 1 };
    },
  } as any;
  const config = { resolverAviso: async () => ({ habilitado: true, template: null }) } as any;
  const service = new LogisticaService(
    prisma,
    conversations,
    {} as any,
    config,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    opts.fiscal,
  );
  return { service, enviados };
}

const ENTREGA = { id: 'ent1', customerProfileId: 'cli1', contatoId: 'c1' };

test('fiscal devolve anexo → o MESMO aviso sai com variables.attachment (uma mensagem só)', async () => {
  const anexo = { kind: 'document', url: '/uploads/inbox/fiscal-comprovante-ent1.pdf', fileName: 'comprovante-entrega.pdf', mimeType: 'application/pdf' };
  const fiscal = { anexoParaEntrega: async () => anexo };
  const { service, enviados } = makeFakes({ fiscal });

  const r = await (service as any).dispararWhatsappEntregue(7, ENTREGA);
  assert.equal(r.status, 'enviado');
  assert.equal(enviados.length, 1, 'UMA mensagem — o anexo não abre segundo envio');
  assert.deepEqual(enviados[0].variables.attachment, anexo);
  assert.ok(String(enviados[0].body || '').length > 0, 'texto vira caption, não some');
});

test('fiscal ausente ou devolvendo null → aviso de texto puro igual ao de antes', async () => {
  const semFiscal = makeFakes();
  const r1 = await (semFiscal.service as any).dispararWhatsappEntregue(7, ENTREGA);
  assert.equal(r1.status, 'enviado');
  assert.equal(semFiscal.enviados[0].variables.attachment, undefined);

  const fiscalNull = makeFakes({ fiscal: { anexoParaEntrega: async () => null } });
  const r2 = await (fiscalNull.service as any).dispararWhatsappEntregue(7, ENTREGA);
  assert.equal(r2.status, 'enviado');
  assert.equal(fiscalNull.enviados[0].variables.attachment, undefined);
});

test('comprovante que EXPLODE não derruba o aviso (best-effort com voz)', async () => {
  const fiscal = { anexoParaEntrega: async () => { throw new Error('render caiu'); } };
  const { service, enviados } = makeFakes({ fiscal });
  const r = await (service as any).dispararWhatsappEntregue(7, ENTREGA);
  assert.equal(r.status, 'enviado');
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].variables.attachment, undefined);
});
