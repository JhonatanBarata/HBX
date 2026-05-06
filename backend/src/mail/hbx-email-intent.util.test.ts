import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HBX_PRESENTATION_EMAIL_INTENT,
  addBusinessHours,
  detectHbxPresentationEmailIntent,
  extractHbxEmails,
  isValidHbxEmail,
} from './hbx-email-intent.util';

test('detects HBX presentation email intent and extracts a valid email', () => {
  const result = detectHbxPresentationEmailIntent('Pode mandar no meu email financeiro@empresa.com.br');

  assert.equal(result.intent, HBX_PRESENTATION_EMAIL_INTENT);
  assert.equal(result.extractedEmail, 'financeiro@empresa.com.br');
  assert.equal(result.confidence, 0.92);
  assert.equal(result.needsEmail, false);
});

test('detects email intent without an email and asks for one', () => {
  const result = detectHbxPresentationEmailIntent('Pode mandar por email?');

  assert.equal(result.intent, HBX_PRESENTATION_EMAIL_INTENT);
  assert.equal(result.extractedEmail, null);
  assert.equal(result.needsEmail, true);
});

test('flags invalid email candidates without accepting them', () => {
  const result = detectHbxPresentationEmailIntent('email: contato@empresa');

  assert.equal(result.intent, HBX_PRESENTATION_EMAIL_INTENT);
  assert.equal(result.extractedEmail, null);
  assert.deepEqual(result.invalidEmailCandidates, ['contato@empresa']);
  assert.equal(isValidHbxEmail('contato@empresa'), false);
});

test('extracts multiple valid emails and keeps the first recipient available', () => {
  const result = detectHbxPresentationEmailIntent('manda no financeiro@x.com e copia comercial@x.com.br');

  assert.equal(result.extractedEmail, 'financeiro@x.com');
  assert.deepEqual(result.extractedEmails, ['financeiro@x.com', 'comercial@x.com.br']);
  assert.deepEqual(extractHbxEmails('financeiro@x.com.'), ['financeiro@x.com']);
});

test('does not classify ambiguous follow-up without email signal', () => {
  const result = detectHbxPresentationEmailIntent('manda pra mim depois');

  assert.equal(result.intent, null);
  assert.equal(result.confidence, 0);
});

test('addBusinessHours respects weekdays and Sao Paulo business hours', () => {
  const result = addBusinessHours(new Date('2026-05-08T19:00:00.000Z'), 48);

  assert.equal(result.toISOString(), '2026-05-18T13:00:00.000Z');
});
