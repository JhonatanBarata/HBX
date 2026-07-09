import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStructuredWhatsAppLog,
  buildWhatsAppPhoneCandidates,
  extractInboundTextFromPayload,
  normalizeBrPhoneDigits,
  normalizeBrPhoneE164,
  normalizeMetaProviderError,
  normalizeWhatsAppMessageType,
  normalizeWhatsAppPhone,
} from './whatsapp-channel';

test('normalizeWhatsAppPhone pads with plus and keeps brazilian digits', () => {
  assert.equal(normalizeWhatsAppPhone('(19) 99887-7766'), '+19998877766');
  assert.equal(normalizeWhatsAppPhone('+55 19 99887-7766'), '+5519998877766');
  assert.equal(normalizeWhatsAppPhone(''), '');
});

// BUGFIX (09/07, incidente Josefino) — BUG 2: `normalizeWhatsAppPhone` (acima) NÃO
// garante o DDI 55 — é o comportamento que causou "+19996015804" (sem país) no
// disparo da logística. `normalizeBrPhoneDigits`/`normalizeBrPhoneE164` cobrem
// exatamente os 3 casos do incidente + não-duplicação.
test('normalizeBrPhoneDigits: DDD+numero local (10/11 digitos) sem 55 ganha o DDI', () => {
  // Caso do incidente: CustomerProfile.phone gravado como dígitos crus, sem país.
  assert.equal(normalizeBrPhoneDigits('19996015804'), '5519996015804');
  // DDD + fixo de 8 dígitos (10 no total) também ganha o 55.
  assert.equal(normalizeBrPhoneDigits('1934567890'), '551934567890');
});

test('normalizeBrPhoneDigits: já com 55 (13 digitos) NÃO duplica o DDI', () => {
  assert.equal(normalizeBrPhoneDigits('5519997024884'), '5519997024884');
});

test('normalizeBrPhoneDigits: limpa mascara/pontuacao antes de decidir', () => {
  assert.equal(normalizeBrPhoneDigits('(19) 99601-5804'), '5519996015804');
  assert.equal(normalizeBrPhoneDigits('+55 19 99702-4884'), '5519997024884');
});

test('normalizeBrPhoneDigits: vazio/lixo sem digitos devolve vazio', () => {
  assert.equal(normalizeBrPhoneDigits(''), '');
  assert.equal(normalizeBrPhoneDigits(null), '');
  assert.equal(normalizeBrPhoneDigits(undefined), '');
});

test('normalizeBrPhoneE164: formato final +55DDDNUMERO (os 3 casos do incidente)', () => {
  // 1) número local sem país → ganha +55 (o bug: saía "+19996015804").
  assert.equal(normalizeBrPhoneE164('19996015804'), '+5519996015804');
  // 2) já com 55 → não duplica (fica igual ao caminho do atendimento).
  assert.equal(normalizeBrPhoneE164('5519997024884'), '+5519997024884');
  // 3) com/sem o 9 (DDD 19, fixo 8 digitos vs celular 9 digitos) — ambos válidos.
  assert.equal(normalizeBrPhoneE164('1934567890'), '+551934567890'); // sem o 9 (fixo)
  assert.equal(normalizeBrPhoneE164('19934567890'), '+5519934567890'); // com o 9 (celular)
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
