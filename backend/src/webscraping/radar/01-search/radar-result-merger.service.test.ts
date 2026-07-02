import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarResultMergerService } from './radar-result-merger.service';
import type { WebscrapingContactResult } from '../shared/radar-core-shared';

// ─── Helper: candidato mínimo (lead informal, sem CNPJ) ─────────────────────────────────────────

function makeContact(overrides: Partial<WebscrapingContactResult> & Record<string, any> = {}): WebscrapingContactResult {
  return {
    placeId: '',
    name: 'Salão da Maria',
    phone: '',
    phoneDigits: '',
    rating: null,
    reviews: null,
    address: null,
    website: null,
    ...overrides,
  } as WebscrapingContactResult;
}

function svc() {
  return new RadarResultMergerService();
}

// ─── 1. Duplicata por MESMO FONE (sem CNPJ) ──────────────────────────────────────────────────────

test('funde dois candidatos sem CNPJ com o mesmo phoneDigits (fonte web x fonte web)', () => {
  const merger = svc();
  const a = makeContact({ name: 'Salão da Maria', phoneDigits: '5588912345678' });
  const b = makeContact({ name: 'Salao Maria Cabelo', phoneDigits: '5588912345678' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1, 'deveria fundir em 1 card só (mesmo fone)');
});

test('funde fone com e SEM o 9º dígito (mesmo número, formatos diferentes)', () => {
  const merger = svc();
  // 55 88 9 1234-5678 (com 9) vs 55 88 1234-5678 (sem 9) — mesmo celular, captura divergente
  const a = makeContact({ name: 'Barbearia Central', phoneDigits: '5588912345678' });
  const b = makeContact({ name: 'Barbearia Central', phoneDigits: '558812345678' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1, 'deveria reconhecer 5588912345678 ≡ 558812345678 e fundir');
});

// ─── 2. Duplicata por MESMO SITE (sem CNPJ) ──────────────────────────────────────────────────────

test('funde dois candidatos sem CNPJ com o mesmo domínio de site (variação www/https/path)', () => {
  const merger = svc();
  const a = makeContact({ name: 'Pizzaria do Zé', website: 'https://www.pizzariadoze.com.br/' });
  const b = makeContact({ name: 'Pizzaria Ze', website: 'pizzariadoze.com.br/cardapio' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1, 'deveria fundir pelo domínio (website key já difere por causa do path)');
});

// ─── 3. Duplicata por MESMO NOME+CIDADE (sem CNPJ, sem fone, sem site) ───────────────────────────

test('funde dois candidatos sem CNPJ/fone/site com nome+cidade normalizados iguais', () => {
  const merger = svc();
  const a = makeContact({ name: 'Doceria Sabor Mineiro', city: 'Fortaleza' });
  const b = makeContact({ name: 'DOCERIA SABOR MINEIRO', city: 'fortaleza' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1, 'nome+cidade normalizados iguais deveria fundir mesmo sem CNPJ/fone/site');
});

// ─── 4. CNPJ é chave ABSOLUTA — funde mesmo com nome/fone diferentes ─────────────────────────────

test('CNPJ igual funde mesmo com nome e fone diferentes entre as fontes', () => {
  const merger = svc();
  const a = makeContact({ name: 'Mercadinho Bom Preço', phoneDigits: '558811112222', cnpj: '12345678000199' });
  const b = makeContact({ name: 'Bom Preco Supermercados LTDA', phoneDigits: '558833334444', cnpj: '12.345.678/0001-99' });
  const { results } = merger.mergeSources([
    { source: 'cnpj_public', results: [a] },
    { source: 'hbx_engine', results: [b] },
  ]);
  assert.equal(results.length, 1, 'CNPJ normalizado igual (com/sem máscara) é chave absoluta — funde sempre');
});

test('CNPJs diferentes NÃO fundem mesmo com nome parecido', () => {
  const merger = svc();
  const a = makeContact({ name: 'Mercadinho Bom Preço', cnpj: '12345678000199' });
  const b = makeContact({ name: 'Mercadinho Bom Preço', cnpj: '98765432000188' });
  const { results } = merger.mergeSources([
    { source: 'cnpj_public', results: [a] },
    { source: 'cnpj_public', results: [b] },
  ]);
  assert.equal(results.length, 2, 'CNPJs distintos são empresas distintas — nunca fundir por nome parecido');
});

// ─── 5. Guarda anti-falso-positivo: fone genérico/compartilhado ──────────────────────────────────

test('NÃO funde mesmo fone quando nomes normalizados são muito diferentes (fone de galeria/shopping)', () => {
  const merger = svc();
  const a = makeContact({ name: 'Studio Unhas Fernanda', phoneDigits: '558533334444' });
  const b = makeContact({ name: 'Otica Visao Clara', phoneDigits: '558533334444' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 2, 'fone compartilhado (galeria) com nomes sem relação NÃO deveria fundir cegamente');
});

test('funde mesmo fone quando a primeira palavra do nome bate (desempate barato)', () => {
  const merger = svc();
  const a = makeContact({ name: 'Fernanda Nails Studio', phoneDigits: '558533334444' });
  const b = makeContact({ name: 'Fernanda Unhas e Estetica', phoneDigits: '558533334444' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1, 'mesma primeira palavra do nome + mesmo fone é sinal suficiente de fusão');
});

// ─── 6. Fusão preserva o melhor de cada fonte (não perde campo preenchido) ───────────────────────

test('ao fundir por CNPJ, preserva website de uma fonte e email de outra (não perde nenhum campo)', () => {
  const merger = svc();
  const a = makeContact({ name: 'Padaria Pão Quente', cnpj: '11222333000144', website: 'padariapaoquente.com.br' });
  const b = makeContact({ name: 'Padaria Pao Quente Ltda', cnpj: '11.222.333/0001-44', email: 'contato@padariapaoquente.com.br' });
  const { results } = merger.mergeSources([
    { source: 'website_crawl_light', results: [a] },
    { source: 'cnpj_public', results: [b] },
  ]);
  assert.equal(results.length, 1);
  const merged = results[0] as any;
  assert.equal(merged.website, 'padariapaoquente.com.br', 'website da fonte A deveria sobreviver');
  assert.equal(merged.email, 'contato@padariapaoquente.com.br', 'email da fonte B deveria sobreviver');
});

test('sourceEngines concatena as origens ao fundir por chave secundária (sem CNPJ)', () => {
  const merger = svc();
  const a = makeContact({ name: 'Salão da Maria', phoneDigits: '5588912345678' });
  const b = makeContact({ name: 'Salao Maria Cabelo', phoneDigits: '558812345678' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1);
  const merged = results[0] as any;
  assert.ok(merged.sourceEngines.includes('hbx_engine'));
  assert.ok(merged.sourceEngines.includes('website_crawl_light'));
});

// ─── 7. Histórico negativo nunca é apagado (regra de ouro) — merger não mexe em status negativo ──

test('fundir não apaga rejectReasons/qualityReason já registrados no candidato existente', () => {
  const merger = svc();
  const a = makeContact({
    name: 'Salão da Maria',
    phoneDigits: '5588912345678',
    rejectReasons: ['invalid_phone_previous_attempt'],
    qualityReason: 'baixa_qualidade_anterior',
  });
  const b = makeContact({ name: 'Salao Maria Cabelo', phoneDigits: '558812345678' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1);
  const merged = results[0] as any;
  assert.deepEqual(merged.rejectReasons, ['invalid_phone_previous_attempt'], 'histórico negativo não pode ser apagado pela fusão');
});
