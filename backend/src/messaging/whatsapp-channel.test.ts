import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStructuredWhatsAppLog,
  buildWhatsAppPhoneCandidates,
  extractInboundTextFromPayload,
  normalizeMetaProviderError,
  normalizeWhatsAppMessageType,
  normalizeWhatsAppPhone,
} from './whatsapp-channel';

test('normalizeWhatsAppPhone pads with plus and keeps brazilian digits', () => {
  assert.equal(normalizeWhatsAppPhone('(19) 99887-7766'), '+19998877766');
  assert.equal(normalizeWhatsAppPhone('+55 19 99887-7766'), '+5519998877766');
  assert.equal(normalizeWhatsAppPhone(''), '');
});

test('buildWhatsAppPhoneCandidates includes country and local variants', () => {
  assert.deepEqual(buildWhatsAppPhoneCandidates('+55 19 99887-7766').sort(), [
    '+19998877766',
    '+5519998877766',
    '19998877766',
    '5519998877766',
  ]);
});

test('buildWhatsAppPhoneCandidates adds brazilian country variants for local DDD phones', () => {
  assert.deepEqual(buildWhatsAppPhoneCandidates('(19) 99887-7766').sort(), [
    '+19998877766',
    '+5519998877766',
    '19998877766',
    '5519998877766',
  ]);
});

test('normalizeWhatsAppMessageType supports text button interactive and media', () => {
  assert.equal(normalizeWhatsAppMessageType('text'), 'text');
  assert.equal(normalizeWhatsAppMessageType('button'), 'button');
  assert.equal(normalizeWhatsAppMessageType('interactive'), 'interactive');
  assert.equal(normalizeWhatsAppMessageType('image'), 'image');
  assert.equal(normalizeWhatsAppMessageType('document'), 'document');
  assert.equal(normalizeWhatsAppMessageType('audio'), 'audio');
  assert.equal(normalizeWhatsAppMessageType('unknown'), 'text');
});

test('extractInboundTextFromPayload keeps semantic content for button interactive and media', () => {
  assert.equal(extractInboundTextFromPayload({ type: 'text', text: { body: 'ola' } }), 'ola');
  assert.equal(
    extractInboundTextFromPayload({ type: 'button', button: { text: 'Quero negociar', payload: 'negociar' } }),
    'Quero negociar',
  );
  assert.equal(
    extractInboundTextFromPayload({
      type: 'interactive',
      interactive: { list_reply: { title: 'Parcelado', id: 'parcelado_6x' } },
    }),
    'Parcelado',
  );
  assert.equal(
    extractInboundTextFromPayload({ type: 'image', image: { caption: 'boleto em anexo' } }),
    'boleto em anexo',
  );
  assert.equal(
    extractInboundTextFromPayload({ type: 'document', document: { filename: 'fatura.pdf' } }),
    'fatura.pdf',
  );
  assert.equal(extractInboundTextFromPayload({ type: 'audio', audio: {} }), '[audio recebido]');
});

test('normalizeMetaProviderError maps provider response to pt-BR operational message', () => {
  assert.equal(
    normalizeMetaProviderError(
      { response: { status: 401, data: { error: { message: 'token expired' } } } },
      'falha generica',
    ),
    'token expired',
  );
  assert.equal(
    normalizeMetaProviderError({ response: { status: 404, data: null } }, 'falha generica'),
    'Destino ou recurso do WhatsApp nao encontrado na Meta.',
  );
});

test('buildStructuredWhatsAppLog normalizes phone and preserves metadata', () => {
  assert.deepEqual(
    buildStructuredWhatsAppLog({
      companyId: 7,
      conversationId: 99,
      phone: '(19) 99887-7766',
      messageType: 'interactive',
      result: 'received',
      extra: { providerMessageId: 'wamid.123' },
    }),
    {
      companyId: 7,
      customerId: null,
      conversationId: 99,
      phoneNormalized: '+19998877766',
      templateName: null,
      messageType: 'interactive',
      provider: 'WHATSAPP_CLOUD',
      flowStep: null,
      result: 'received',
      reason: null,
      providerMessageId: 'wamid.123',
    },
  );
});
