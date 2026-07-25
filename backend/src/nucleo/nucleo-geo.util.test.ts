import test from 'node:test';
import assert from 'node:assert/strict';

import { escolherCandidatoConfiavel, normalizeVia, viasCompativeis, resolveServerGeo } from './nucleo-geo.util';

// FREIO DO GEOCODE (25/07) — casos REAIS do incidente da empresa 41 ("Terra Hydra Mary",
// Rua 12, 752 - Jardim Consolação, Rio Claro/SP). As respostas abaixo são as que o
// Nominatim devolveu de verdade em 25/07 pras 3 variações da mesma consulta.

const CIDADE_UF = { cidade: 'Rio Claro', uf: 'SP' };

/** Candidato jsonv2 enxuto (só o que a validação lê). */
function cand(lat: number, lon: number, address: Record<string, string>) {
  return { lat: String(lat), lon: String(lon), address: { 'ISO3166-2-lvl4': 'BR-SP', ...address } };
}

const RUA_DOZE_JD_OLINDA = cand(-22.3903167, -47.5773556, {
  road: 'Rua Doze',
  quarter: 'Jardim Olinda',
  suburb: 'Jardim  Bela Vista',
  city: 'Rio Claro',
});
const RUA_12_CIDADE_CLARET = cand(-22.412027, -47.5684111, {
  road: 'Rua 12',
  quarter: 'Cidade Claret',
  suburb: 'Dona Angela',
  city: 'Rio Claro',
});
const RUA_12_JD_CONSOLACAO = cand(-22.4154357, -47.5670313, {
  road: 'Rua 12',
  suburb: 'Jardim Consolação',
  city: 'Rio Claro',
});

test('o pino que jogou o cliente a 3 km é REJEITADO: "Rua Doze" não é "Rua 12"', () => {
  const escolhido = escolherCandidatoConfiavel([RUA_DOZE_JD_OLINDA], {
    endereco: 'Rua 12',
    numero: '752',
    bairro: 'Jardim Consolação',
    ...CIDADE_UF,
  });
  assert.equal(escolhido, null);
});

test('rua CERTA mas bairro ERRADO e sem número na resposta → rejeita (era o palpite antigo)', () => {
  const escolhido = escolherCandidatoConfiavel([RUA_12_CIDADE_CLARET], {
    endereco: 'Rua 12',
    numero: '752',
    bairro: 'Jardim Consolação',
    ...CIDADE_UF,
  });
  assert.equal(escolhido, null);
});

test('aceita quando o BAIRRO bate — e escolhe o candidato certo mesmo vindo depois do errado', () => {
  const escolhido = escolherCandidatoConfiavel(
    [RUA_DOZE_JD_OLINDA, RUA_12_CIDADE_CLARET, RUA_12_JD_CONSOLACAO],
    { endereco: 'Rua 12', numero: '752', bairro: 'Jardim Consolação', ...CIDADE_UF },
  );
  assert.deepEqual(escolhido, { lat: -22.4154357, lng: -47.5670313 });
});

test('aceita quando o NÚMERO DA CASA bate, mesmo sem bairro no pedido', () => {
  const comNumero = cand(-22.41, -47.56, {
    road: 'Rua 12',
    house_number: '752',
    suburb: 'Bairro Qualquer',
    city: 'Rio Claro',
  });
  const escolhido = escolherCandidatoConfiavel([comNumero], { endereco: 'Rua 12', numero: '752', ...CIDADE_UF });
  assert.deepEqual(escolhido, { lat: -22.41, lng: -47.56 });
});

test('sem bairro no pedido e sem número na resposta → rejeita (via inteira = loteria)', () => {
  const escolhido = escolherCandidatoConfiavel([RUA_12_CIDADE_CLARET], {
    endereco: 'Rua 12',
    numero: '752',
    ...CIDADE_UF,
  });
  assert.equal(escolhido, null);
});

test('cidade ou UF diferente → rejeita (nunca cruza município)', () => {
  const outraCidade = cand(-22.7, -44.14, { road: 'Rua 12', suburb: 'Jardim Consolação', city: 'Rio Claro' });
  outraCidade.address['ISO3166-2-lvl4'] = 'BR-RJ';
  assert.equal(
    escolherCandidatoConfiavel([outraCidade], { endereco: 'Rua 12', bairro: 'Jardim Consolação', ...CIDADE_UF }),
    null,
  );
  const cidadeErrada = cand(-22.5, -47.4, { road: 'Rua 12', suburb: 'Jardim Consolação', city: 'Piracicaba' });
  assert.equal(
    escolherCandidatoConfiavel([cidadeErrada], { endereco: 'Rua 12', bairro: 'Jardim Consolação', ...CIDADE_UF }),
    null,
  );
});

test('pedido sem cidade/UF → rejeita tudo (não há como validar)', () => {
  assert.equal(escolherCandidatoConfiavel([RUA_12_JD_CONSOLACAO], { endereco: 'Rua 12', bairro: 'Jardim Consolação' }), null);
});

test('abreviação de via: "Av. 84" casa com "Avenida 84" (é a grafia das fichas)', () => {
  const avenida = cand(-22.379, -47.586, { road: 'Avenida 84', suburb: 'Jardim Boa Vista', city: 'Rio Claro' });
  const escolhido = escolherCandidatoConfiavel([avenida], {
    endereco: 'Av. 84',
    numero: '193',
    bairro: 'Jardim Boa Vista',
    ...CIDADE_UF,
  });
  assert.deepEqual(escolhido, { lat: -22.379, lng: -47.586 });
});

test('rua numerada não casa com prefixo: "Rua 1" ≠ "Rua 12"', () => {
  assert.equal(viasCompativeis('Rua 1', 'Rua 12'), false);
  assert.equal(viasCompativeis('Rua 12', 'Rua Doze'), false);
  assert.equal(viasCompativeis('Av 84', 'Avenida 84 Sul'), true);
  assert.equal(normalizeVia('AVENIDA 84'), 'av 84');
});

test('candidato sem coordenada numérica é ignorado sem derrubar a escolha', () => {
  const quebrado = { lat: 'x', lon: undefined, address: { road: 'Rua 12', suburb: 'Jardim Consolação', city: 'Rio Claro', 'ISO3166-2-lvl4': 'BR-SP' } };
  const escolhido = escolherCandidatoConfiavel([quebrado as any, RUA_12_JD_CONSOLACAO], {
    endereco: 'Rua 12',
    bairro: 'Jardim Consolação',
    ...CIDADE_UF,
  });
  assert.deepEqual(escolhido, { lat: -22.4154357, lng: -47.5670313 });
});

test('kill-switch de rede OFF (default) → resolveServerGeo devolve null SEM fetch', async () => {
  const antes = process.env.HBX_GEO_SERVER_ENABLED;
  delete process.env.HBX_GEO_SERVER_ENABLED;
  const originalFetch = global.fetch;
  let chamou = false;
  (global as any).fetch = async () => {
    chamou = true;
    throw new Error('não deveria chamar rede');
  };
  try {
    const r = await resolveServerGeo({ endereco: 'Rua 12', numero: '752', bairro: 'Jardim Consolação', ...CIDADE_UF });
    assert.equal(r, null);
    assert.equal(chamou, false);
  } finally {
    (global as any).fetch = originalFetch;
    if (antes !== undefined) process.env.HBX_GEO_SERVER_ENABLED = antes;
  }
});

test('fallback "centro da cidade" MORREU: cidade conhecida não vira mais pino', async () => {
  // Era o que empilhava 45 clientes da empresa 41 no mesmo ponto (-22.3984,-47.5546).
  const antes = process.env.HBX_GEO_SERVER_ENABLED;
  delete process.env.HBX_GEO_SERVER_ENABLED;
  try {
    const r = await resolveServerGeo({ cidade: 'Rio Claro', uf: 'SP' });
    assert.equal(r, null);
  } finally {
    if (antes !== undefined) process.env.HBX_GEO_SERVER_ENABLED = antes;
  }
});
