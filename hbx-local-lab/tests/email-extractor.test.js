'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractEmailsFromText,
  isBlockedEmail,
  normalizeEmail,
} = require('../extractors/email.extractor');

test('email extractor normaliza mailto e texto ofuscado', () => {
  const emails = extractEmailsFromText(
    '<a href="mailto:Contato@ClinicaReal.com.br">Email</a> comercial at clinicareal dot com dot br',
    {
      sourceUrl: 'https://clinicareal.com.br/contato',
      website: 'https://clinicareal.com.br',
      companyName: 'Clinica Real',
      provider: 'site_crawl',
    },
  );

  assert.equal(normalizeEmail('Contato@ClinicaReal.com.br'), 'contato@clinicareal.com.br');
  assert.equal(emails.length, 2);
  const contato = emails.find((email) => email.email === 'contato@clinicareal.com.br');
  const comercial = emails.find((email) => email.email === 'comercial@clinicareal.com.br');
  assert.equal(contato.status, 'public_found');
  assert.equal(comercial.status, 'public_found');
  assert.equal(contato.sourceMode, 'local_lab');
});

test('email extractor bloqueia dominio ruim', () => {
  assert.equal(isBlockedEmail('loja@instagram.com'), true);
  assert.equal(normalizeEmail('loja@instagram.com'), '');
});
