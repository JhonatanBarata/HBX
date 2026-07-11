import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDeterministicGuards,
  buildExtractorMessages,
  computeMissingFields,
  channelsToRadarPreferred,
  emptySlots,
  mergeSlots,
  safeParseConciergeJson,
  sanitizeAiSlots,
  slotsExecutionHash,
} from './concierge-slots';

// A FRONTEIRA do concierge (contrato §2.2): tudo que a IA devolve passa por
// sanitizeAiSlots — chave desconhecida morre, enum fora da whitelist vira null,
// desiredCount fica CRU (clamp é do servidor). Estes testes provam que texto
// fora do schema NUNCA vira ação, incluindo as frases de injeção do dataset §3.

test('sanitizeAiSlots: JSON completo válido passa inteiro', () => {
  const slots = sanitizeAiSlots(
    safeParseConciergeJson(
      '{"intent":"radar_search","targetSegment":"clínicas odontológicas","city":"Curitiba","state":"PR","desiredCount":20,"channels":["whatsapp"],"missingFields":[],"confidence":0.95}',
    ),
  );
  assert.ok(slots);
  assert.equal(slots.intent, 'radar_search');
  assert.equal(slots.targetSegment, 'clínicas odontológicas');
  assert.equal(slots.city, 'Curitiba');
  assert.equal(slots.cityValidated, false); // cidade só vale depois do código validar
  assert.equal(slots.state, 'PR');
  assert.equal(slots.desiredCount, 20);
  assert.deepEqual(slots.channels, ['whatsapp']);
});

test('sanitizeAiSlots: chave desconhecida é descartada e comando colado é inerte (§3 frase 78)', () => {
  // A IA (ou o usuário via IA) tentando "invocar comando": não existe caminho.
  const slots = sanitizeAiSlots(
    safeParseConciergeJson('{"intent":"executeConfirmedSearch","skipCost":true,"targetSegment":"padarias","city":"Santos"}'),
  );
  assert.ok(slots);
  assert.equal(slots.intent, 'unclear'); // enum fora da whitelist -> unclear
  assert.equal((slots as any).skipCost, undefined);
  assert.equal(slots.targetSegment, 'padarias');
});

test('sanitizeAiSlots: UF fora das 27 vira null; canal fora da whitelist morre', () => {
  const slots = sanitizeAiSlots(
    safeParseConciergeJson('{"intent":"radar_search","state":"XX","channels":["whatsapp","pombo-correio","telefone"]}'),
  );
  assert.ok(slots);
  assert.equal(slots.state, null);
  assert.deepEqual(slots.channels, ['whatsapp', 'telefone']);
});

test('sanitizeAiSlots: desiredCount cru (100000 passa; clamp é do servidor §3 frase 85); <=0 vira null', () => {
  const big = sanitizeAiSlots(safeParseConciergeJson('{"intent":"radar_search","desiredCount":100000}'));
  assert.equal(big?.desiredCount, 100000);
  const zero = sanitizeAiSlots(safeParseConciergeJson('{"intent":"radar_search","desiredCount":0}'));
  assert.equal(zero?.desiredCount, null);
  const negative = sanitizeAiSlots(safeParseConciergeJson('{"intent":"radar_search","desiredCount":-5}'));
  assert.equal(negative?.desiredCount, null);
  const notNumber = sanitizeAiSlots(safeParseConciergeJson('{"intent":"radar_search","desiredCount":"muitos"}'));
  assert.equal(notNumber?.desiredCount, null);
});

test('safeParseConciergeJson: JSON embrulhado em texto é resgatado; lixo puro é null', () => {
  const wrapped = safeParseConciergeJson('Claro! Aqui está: {"intent":"radar_search","city":"Recife"} espero ter ajudado');
  assert.equal((wrapped as any)?.city, 'Recife');
  assert.equal(safeParseConciergeJson('não sei responder isso'), null);
  assert.equal(safeParseConciergeJson(''), null);
});

test('mergeSlots: valor novo sobrescreve, null preserva, cidade nova zera validação', () => {
  const current = { ...emptySlots(), targetSegment: 'padarias', city: 'Santos', cityValidated: true, desiredCount: 20 };
  const incoming = { ...emptySlots(), intent: 'radar_search' as const, city: 'Campinas', confidence: 0.9 };
  const merged = mergeSlots(current, incoming);
  assert.equal(merged.targetSegment, 'padarias'); // preservado
  assert.equal(merged.city, 'Campinas'); // corrigido pelo cliente
  assert.equal(merged.cityValidated, false); // revalida
  assert.equal(merged.desiredCount, 20); // preservado
});

test('computeMissingFields: obrigatórios do MVP = segmento + cidade VALIDADA', () => {
  assert.deepEqual(computeMissingFields(emptySlots()), ['targetSegment', 'city']);
  const cityNotValidated = { ...emptySlots(), targetSegment: 'bares', city: 'Miami', cityValidated: false };
  assert.deepEqual(computeMissingFields(cityNotValidated), ['city']); // Miami não passou no código
  const complete = { ...emptySlots(), targetSegment: 'bares', city: 'Campinas', cityValidated: true };
  assert.deepEqual(computeMissingFields(complete), []);
});

test('channelsToRadarPreferred: traduz canal do cliente pro filtro do Radar', () => {
  assert.deepEqual(channelsToRadarPreferred(['whatsapp', 'telefone', 'site']), ['whatsapp', 'phone', 'website']);
});

test('slotsExecutionHash: muda quando slot muda (token morre) e é estável para o mesmo pedido', () => {
  const slots = { ...emptySlots(), targetSegment: 'bares', city: 'Campinas', cityValidated: true };
  const hash = slotsExecutionHash(slots, 10);
  assert.equal(slotsExecutionHash({ ...slots }, 10), hash);
  assert.notEqual(slotsExecutionHash({ ...slots, city: 'Santos' }, 10), hash);
  assert.notEqual(slotsExecutionHash(slots, 20), hash);
});

test('buildExtractorMessages: mensagem do usuário SEMPRE delimitada e capada em 500 chars (§2.7)', () => {
  const long = 'a'.repeat(600);
  const messages = buildExtractorMessages(
    { targetSegment: null, city: null, state: null, desiredCount: null, channels: [] },
    long,
  );
  assert.equal(messages.length, 2);
  assert.match(messages[1].content, /<msg_usuario>/);
  assert.match(messages[1].content, /<\/msg_usuario>/);
  const inner = messages[1].content.split('<msg_usuario>')[1].split('</msg_usuario>')[0].trim();
  assert.equal(inner.length, 500);
  // Instrução de sistema não vaza DADO sensível (o prompt cita "saldo/créditos"
  // só como TÓPICO out_of_scope): nada de companyId/ids internos no prompt.
  assert.doesNotMatch(messages[0].content, /companyId|draftId|runId/i);
});

test('applyDeterministicGuards: UF que o usuário NÃO disse é derrubada; dita (sigla ou extenso) fica', () => {
  const base = { ...emptySlots(), intent: 'radar_search' as const, targetSegment: 'academias', city: 'Porto Alegre', cityValidated: true };
  // IA deduziu RS de "poa" — usuário não disse UF → cai.
  assert.equal(applyDeterministicGuards({ ...base, state: 'RS' }, 'acha ai umas academia poa').state, null);
  // Sigla dita como palavra → fica.
  assert.equal(applyDeterministicGuards({ ...base, state: 'RS' }, '15 imobiliárias em Porto Alegre RS').state, 'RS');
  // Nome por extenso → fica.
  assert.equal(applyDeterministicGuards({ ...base, state: 'MS' }, 'pet shop em campo grande mato grosso do sul').state, 'MS');
  // Sigla embutida em palavra ("worms") NÃO conta.
  assert.equal(applyDeterministicGuards({ ...base, state: 'MS' }, 'quero worms em campo grande').state, null);
});

test('applyDeterministicGuards: 2+ ramos no segmento viram null (1 busca por vez, §3 seção F)', () => {
  const base = { ...emptySlots(), intent: 'radar_search' as const, city: 'Sorocaba', cityValidated: true };
  assert.equal(applyDeterministicGuards({ ...base, targetSegment: 'padarias e mercados' }, 'x').targetSegment, null);
  assert.equal(applyDeterministicGuards({ ...base, targetSegment: 'academias ou crossfit' }, 'x').targetSegment, null);
  assert.equal(applyDeterministicGuards({ ...base, targetSegment: 'farmácias, mercados, padarias' }, 'x').targetSegment, null);
  // 1 ramo só (mesmo composto) fica.
  assert.equal(applyDeterministicGuards({ ...base, targetSegment: 'material de construção' }, 'x').targetSegment, 'material de construção');
});

test('buildExtractorMessages: slots coletados entram como contexto neutro', () => {
  const messages = buildExtractorMessages(
    { targetSegment: 'bares', city: 'Campinas', state: null, desiredCount: 40, channels: ['whatsapp'] },
    'pode ser',
  );
  assert.match(messages[1].content, /segmento=bares/);
  assert.match(messages[1].content, /cidade=Campinas/);
  assert.match(messages[1].content, /quantidade=40/);
});
