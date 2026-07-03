import test from 'node:test';
import assert from 'node:assert/strict';
import { SerproIntegraClient, type SerproCredential, type PgdasdPayload } from './serpro-integra.client';

// ===========================================================================
// ACEITE — CONTABIL S7 (serpro-integra.client). SEM rede: transporte FAKE
// injetado (captura o que SERIA enviado + devolve respostas programadas).
// Exercita: OAuth monta o Basic e cacheia o token; declararPgdasd envia o
// payload do motor no envelope do Integra Contador (SEM segredo); parse do
// recibo + DAS apurado; gerarDas devolve PDF base64; consultarDeclaracao lê o
// gravado; PA 'YYYY-MM'→'AAAAMM'; flag/env gates. NENHUMA chamada externa.
// ===========================================================================

class FakeTransport {
  tokenCalls: any[] = [];
  chamadas: any[] = [];
  tokenResp = { httpStatus: 200, accessToken: 'tok-123', expiresInSec: 3600, erro: null as string | null };
  // fila de respostas por chamada (na ordem); default = 200 vazio.
  respostas: any[] = [];

  async obterToken(input: any) {
    this.tokenCalls.push(input);
    return this.tokenResp;
  }
  async chamar(input: any) {
    this.chamadas.push(input);
    const r = this.respostas.shift();
    return r ?? { httpStatus: 200, ok: true, body: {} };
  }
}

const CRED: SerproCredential = {
  consumerKey: 'CK-SECRET',
  consumerSecret: 'CS-SECRET',
  contratanteCnpj: '12.345.678/0001-90',
  contribuinteCnpj: '12.345.678/0001-90',
};

const PAYLOAD: PgdasdPayload = {
  competencia: '2026-07',
  periodoApuracao: '202607',
  receitaBrutaMesCents: 5_000_00,
  rbt12Cents: 60_000_00,
  folha12mCents: 18_000_00,
  anexoAplicado: 'III',
  aliquotaEfetiva: 0.06,
  dasPrevistoCents: 300_00,
};

function makeClient(over: { transport?: FakeTransport } = {}) {
  const transport = over.transport ?? new FakeTransport();
  const client = new SerproIntegraClient(transport as any);
  return { client, transport };
}

test('ambiente/flag — default demo e OFF; liga por env', () => {
  delete process.env.HBX_CONTABIL_SERPRO_ENABLED;
  delete process.env.HBX_CONTABIL_SERPRO_ENV;
  assert.equal(SerproIntegraClient.isEnabled(), false, 'default OFF (deploy inerte)');
  assert.equal(SerproIntegraClient.ambiente(), 'demo', 'default demo');
  process.env.HBX_CONTABIL_SERPRO_ENABLED = '1';
  process.env.HBX_CONTABIL_SERPRO_ENV = 'producao';
  assert.equal(SerproIntegraClient.isEnabled(), true);
  assert.equal(SerproIntegraClient.ambiente(), 'producao');
  delete process.env.HBX_CONTABIL_SERPRO_ENABLED;
  delete process.env.HBX_CONTABIL_SERPRO_ENV;
});

test('periodoApuracao — YYYY-MM vira AAAAMM (e recusa formato inválido)', () => {
  const { client } = makeClient();
  assert.equal(client.periodoApuracao('2026-07'), '202607');
  assert.throws(() => client.periodoApuracao('2026/07'));
});

test('OAuth — pede token com a credencial e cacheia (2 chamadas = 1 token)', async () => {
  const { client, transport } = makeClient();
  transport.respostas = [
    { httpStatus: 200, ok: true, body: { dados: JSON.stringify({ numeroReciboDeclaracao: 'REC1', valorTotalDevido: '300.00' }) } },
    { httpStatus: 200, ok: true, body: { dados: JSON.stringify({ pdf: 'JVBERi0=', numeroDocumento: 'DOC1', valorTotalDocumento: '300.00' }) } },
  ];
  await client.declararPgdasd(CRED, PAYLOAD);
  await client.gerarDas(CRED, '2026-07');
  assert.equal(transport.tokenCalls.length, 1, 'token pedido 1x e reusado do cache');
  assert.equal(transport.tokenCalls[0].consumerKey, 'CK-SECRET');
  assert.equal(transport.tokenCalls[0].consumerSecret, 'CS-SECRET');
});

test('declararPgdasd — envia o payload do MOTOR no envelope, sem segredo, e parseia recibo + DAS apurado', async () => {
  const { client, transport } = makeClient();
  transport.respostas = [
    { httpStatus: 200, ok: true, body: { dados: JSON.stringify({ numeroReciboDeclaracao: 'REC-42', numeroDeclaracao: 'DECL-9', valorTotalDevido: '300.00' }) } },
  ];
  const r = await client.declararPgdasd(CRED, PAYLOAD);
  assert.equal(r.ok, true);
  assert.equal(r.numeroRecibo, 'REC-42');
  assert.equal(r.dasApuradoCents, 300_00, 'DAS apurado do governo parseado p/ cents');

  // O corpo enviado carrega os números do motor e NENHUM segredo.
  const enviado = transport.chamadas[0];
  assert.equal(enviado.path, '/Declarar');
  assert.equal(enviado.method, 'POST');
  assert.equal(enviado.accessToken, 'tok-123');
  const body = JSON.parse(enviado.bodyJson);
  assert.equal(body.contribuinte.numero, '12345678000190', 'CNPJ só dígitos');
  const dados = JSON.parse(body.pedidoDados.dados);
  assert.equal(dados.pa, '202607');
  assert.equal(dados.receitaPaCompetenciaInterna, 5000, 'receita em reais (motor)');
  assert.equal(dados.anexo, 'III');
  assert.ok(!enviado.bodyJson.includes('CK-SECRET') && !enviado.bodyJson.includes('CS-SECRET'), 'nenhum segredo no corpo');
  assert.ok(!enviado.bodyJson.includes('tok-123'), 'token não vai no corpo (vai no header)');
});

test('gerarDas — devolve PDF base64 + nº documento + valor', async () => {
  const { client, transport } = makeClient();
  transport.respostas = [
    { httpStatus: 200, ok: true, body: { dados: JSON.stringify({ pdf: 'JVBERi0xLjQ=', numeroDocumento: 'DAS-77', valorTotalDocumento: '300.00', dataVencimento: '2026-08-20' }) } },
  ];
  const r = await client.gerarDas(CRED, '2026-07');
  assert.equal(r.ok, true);
  assert.equal(r.pdfBase64, 'JVBERi0xLjQ=');
  assert.equal(r.numeroDocumento, 'DAS-77');
  assert.equal(r.valorTotalCents, 300_00);
  assert.equal(transport.chamadas[0].path, '/Emitir');
});

test('consultarDeclaracao — leitura: encontra recibo + DAS gravado no governo', async () => {
  const { client, transport } = makeClient();
  transport.respostas = [
    { httpStatus: 200, ok: true, body: { dados: JSON.stringify({ numeroReciboDeclaracao: 'REC-42', receitaPaCompetenciaInterna: '5000.00', valorTotalDevido: '300.00' }) } },
  ];
  const r = await client.consultarDeclaracao(CRED, '2026-07');
  assert.equal(r.ok, true);
  assert.equal(r.encontrada, true);
  assert.equal(r.numeroRecibo, 'REC-42');
  assert.equal(r.dasApuradoCents, 300_00);
  assert.equal(transport.chamadas[0].path, '/Consultar');
});

test('declararPgdasd — HTTP não-2xx devolve ok:false (não lança; wizard trata fallback)', async () => {
  const { client, transport } = makeClient();
  transport.respostas = [{ httpStatus: 500, ok: false, erro: 'HTTP 500' }];
  const r = await client.declararPgdasd(CRED, PAYLOAD);
  assert.equal(r.ok, false);
  assert.equal(r.httpStatus, 500);
});

test('OAuth — falha de autenticação lança (credencial inválida)', async () => {
  const transport = new FakeTransport();
  transport.tokenResp = { httpStatus: 401, accessToken: null, expiresInSec: 0, erro: 'HTTP 401' };
  const { client } = makeClient({ transport });
  await assert.rejects(() => client.declararPgdasd(CRED, PAYLOAD), /OAuth Serpro falhou/);
});
