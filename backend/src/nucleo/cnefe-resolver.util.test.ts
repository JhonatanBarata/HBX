import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __setCnefeQueryForTests,
  escolherPinoPorta,
  escolherPinoRua,
  extrairNumeroPorta,
  resolverCnefe,
  type CnefeRow,
} from './cnefe-resolver.util';

// R9 (27/07) — o resolver CNEFE segue a MESMA lei do freio do geocode: pino errado é
// PIOR que pino vazio. Os casos abaixo cobrem exatamente os jeitos de errar que a
// base real tem: cidade de CEP único (mesmo CEP na cidade inteira), rua numerada
// ("Rua 12" ≠ "Rua Doze"), vizinho de número longe demais.

function row(partial: Partial<CnefeRow>): CnefeRow {
  return { logradouro: 'Rua 12', numero: 752, lat: -22.4154, lng: -47.567, nivel_geo: 1, municipio: 'Rio Claro', ...partial };
}

// ── extrairNumeroPorta ─────────────────────────────────────────────────────────────

test('número da porta: coluna própria vence; texto legado só com âncora (vírgula/nº)', () => {
  assert.equal(extrairNumeroPorta({ numero: '752' }), 752);
  assert.equal(extrairNumeroPorta({ numero: null, endereco: 'Rua 12, 752 - Jd. Consolação' }), 752);
  assert.equal(extrairNumeroPorta({ numero: '', endereco: 'Av. Brasil, 1000' }), 1000);
  assert.equal(extrairNumeroPorta({ numero: null, endereco: 'Rua Fulano nº 88' }), 88);
});

test('número da porta NUNCA sai do nome da via: "Rua 12" sem âncora → null (não é 12)', () => {
  assert.equal(extrairNumeroPorta({ numero: null, endereco: 'Rua 12' }), null);
  assert.equal(extrairNumeroPorta({ numero: null, endereco: 'Rua 12 752' }), null);
  assert.equal(extrairNumeroPorta({ numero: 's/n', endereco: 'Rua das Flores' }), null);
});

// ── escolherPinoPorta ──────────────────────────────────────────────────────────────

test('porta: (cep, numero) agrupado → pino do medoide, precisão porta', () => {
  const rows = [
    row({ lat: -22.41540, lng: -47.56700 }),
    row({ lat: -22.41542, lng: -47.56702 }),
    row({ lat: -22.41539, lng: -47.56698, nivel_geo: 2 }),
  ];
  const pino = escolherPinoPorta(rows, { cep: '13500000', numero: 752, endereco: 'Rua 12' });
  assert.ok(pino);
  assert.equal(pino!.precisao, 'porta');
  // nivel_geo=1 preferido: o medoide sai do subconjunto preciso.
  assert.ok(Math.abs(pino!.lat + 22.4154) < 0.001);
});

test('porta: cadastro com logradouro e NENHUMA via compatível → null ("Rua 12" ≠ "Rua Doze")', () => {
  const rows = [row({ logradouro: 'Rua Doze' })];
  assert.equal(escolherPinoPorta(rows, { cep: '13500000', numero: 752, endereco: 'Rua 12' }), null);
});

test('porta: cidade de CEP ÚNICO — mesmo número em ruas espalhadas → null (dispersão)', () => {
  // 3 casas "número 100" em bairros diferentes, ~2 km entre elas.
  const rows = [
    row({ logradouro: 'Rua A', numero: 100, lat: -22.400, lng: -47.560 }),
    row({ logradouro: 'Rua B', numero: 100, lat: -22.415, lng: -47.575 }),
    row({ logradouro: 'Rua C', numero: 100, lat: -22.430, lng: -47.590 }),
  ];
  assert.equal(escolherPinoPorta(rows, { cep: '13840000', numero: 100 }), null);
});

test('porta: abreviação de via casa ("Av. 84" = "Avenida 84")', () => {
  const rows = [row({ logradouro: 'Avenida 84', numero: 90 })];
  const pino = escolherPinoPorta(rows, { cep: '13500000', numero: 90, endereco: 'Av. 84' });
  assert.ok(pino);
});

// ── escolherPinoRua ────────────────────────────────────────────────────────────────

test('rua: sem logradouro no cadastro NÃO existe fallback (CEP sozinho não prova rua)', () => {
  const rows = [row({ numero: 748 })];
  assert.equal(escolherPinoRua(rows, 752, { cep: '13500000', numero: 752 }), null);
});

test('rua: vizinho de número próximo e agrupado → pino de rua', () => {
  const rows = [
    row({ numero: 748, lat: -22.41545, lng: -47.56705 }),
    row({ numero: 760, lat: -22.41536, lng: -47.56695 }),
  ];
  const pino = escolherPinoRua(rows, 752, { cep: '13500000', numero: 752, endereco: 'Rua 12' });
  assert.ok(pino);
  assert.equal(pino!.precisao, 'rua');
  assert.equal(pino!.lat, -22.41545); // o vizinho mais próximo em numeração (748)
});

test('rua: vizinho a mais de 200 de numeração NÃO é vizinho → null', () => {
  const rows = [row({ numero: 10 })];
  assert.equal(escolherPinoRua(rows, 752, { cep: '13500000', numero: 752, endereco: 'Rua 12' }), null);
});

// ── resolverCnefe (com query stubada — teste hermético, zero conexão) ─────────────

test('resolverCnefe: UF sem carga → marca pendente em cnefe_uf e devolve null', async () => {
  const executadas: Array<{ sql: string; params: unknown[] }> = [];
  __setCnefeQueryForTests(async (sql, params) => {
    executadas.push({ sql, params });
    if (sql.includes('FROM cnefe_uf')) return []; // UF nunca pedida
    return [];
  });
  try {
    const pino = await resolverCnefe({ cep: '69900000', numero: 100, endereco: 'Rua Acre', uf: 'AC' });
    assert.equal(pino, null);
    const inseriu = executadas.some((q) => q.sql.includes('INSERT INTO cnefe_uf') && q.params[0] === 'AC');
    assert.ok(inseriu, 'devia marcar a UF como pendente pro agendador noturno');
  } finally {
    __setCnefeQueryForTests(null);
  }
});

test('resolverCnefe: UF carregada + porta exata → pino porta; consulta usa (cep, numero)', async () => {
  __setCnefeQueryForTests(async (sql, params) => {
    if (sql.includes('FROM cnefe_uf')) return [{ status: 'carregada' }];
    if (sql.includes('cep = $1 AND numero = $2')) {
      assert.deepEqual(params, ['13500000', 752]);
      return [row({})];
    }
    return [];
  });
  try {
    const pino = await resolverCnefe({ cep: '13.500-000', numero: '752', endereco: 'Rua 12', uf: 'SP' });
    assert.ok(pino);
    assert.equal(pino!.precisao, 'porta');
  } finally {
    __setCnefeQueryForTests(null);
  }
});

test('resolverCnefe: sem CEP de 8 dígitos ou sem número → null SEM consultar nada', async () => {
  let consultou = false;
  __setCnefeQueryForTests(async () => {
    consultou = true;
    return [];
  });
  try {
    assert.equal(await resolverCnefe({ cep: '1350', numero: 752 }), null);
    assert.equal(await resolverCnefe({ cep: '13500000', numero: null }), null);
    assert.equal(consultou, false);
  } finally {
    __setCnefeQueryForTests(null);
  }
});

test('resolverCnefe: banco quebrado NUNCA lança (best-effort → null)', async () => {
  __setCnefeQueryForTests(async () => {
    throw new Error('conexão recusada');
  });
  try {
    assert.equal(await resolverCnefe({ cep: '13500000', numero: 752, uf: 'SP' }), null);
  } finally {
    __setCnefeQueryForTests(null);
  }
});
