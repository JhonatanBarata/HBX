import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __setCnefeQueryForTests,
  escolherPinoPorta,
  escolherPinoRua,
  extrairNumeroPorta,
  normalizarViaNumeral,
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

// 27/07 (incidente company 48) — MUDANÇA DE CONTRATO consciente: no CNEFE, "Rua 12"
// CASA "RUA DOZE" — a identidade é provada pelo (CEP, número), e "RUA DOZE" é só a
// grafia oficial IBGE da mesma rua daquele CEP. A lição Terra Hydra ("Rua Doze" do
// Nominatim era OUTRA rua, achada por busca de NOME ambígua) continua valendo onde
// ela nasceu: no freio do Nominatim (nucleo-geo.util, intocado).
test('porta: "Rua 12" casa "RUA DOZE" no CNEFE (grafia oficial da MESMA rua do CEP)', () => {
  const rows = [row({ logradouro: 'Rua Doze' })];
  assert.ok(escolherPinoPorta(rows, { cep: '13500000', numero: 752, endereco: 'Rua 12' }));
});

test('porta: via realmente DIFERENTE segue vetada ("Rua 12" ≠ "Rua Treze"; "Av. Brasil" ≠ "Rua 12")', () => {
  assert.equal(escolherPinoPorta([row({ logradouro: 'Rua Treze' })], { cep: '13500000', numero: 752, endereco: 'Rua 12' }), null);
  assert.equal(escolherPinoPorta([row({ logradouro: 'Rua 12' })], { cep: '13500000', numero: 752, endereco: 'Av. Brasil' }), null);
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

// ── numerais por extenso (27/07, incidente company 48 — casos REAIS de prod) ──────
// O IBGE grava "RUA OITO"/"AVENIDA OITENTA E QUATRO"; o cadastro grava "Rua 8"/
// "Av. 84". O veto de via reprovava Rio Claro INTEIRA (0 curas com 50 elegíveis).

test('normalizarViaNumeral: extenso vira dígito, composto soma, hífen vira espaço', () => {
  assert.equal(normalizarViaNumeral('RUA OITO'), 'rua 8');
  assert.equal(normalizarViaNumeral('AVENIDA OITENTA E QUATRO'), 'avenida 84');
  assert.equal(normalizarViaNumeral('AVENIDA SETENTA E OITO BV'), 'avenida 78 bv');
  assert.equal(normalizarViaNumeral('AVENIDA M QUARENTA E SETE'), 'avenida m 47');
  assert.equal(normalizarViaNumeral('Av. M-47'), 'av m 47');
  assert.equal(normalizarViaNumeral('Rua Cento e Vinte e Dois'), 'rua 122');
  // "e" fora de grupo numeral fica intacto; nome próprio não numeral idem.
  assert.equal(normalizarViaNumeral('Rua Sete de Setembro'), 'rua 7 de setembro');
});

test('porta REAL de prod: "Rua 8, 3604" casa "RUA OITO" (cep 13504188) → pino de porta', () => {
  const rows = [row({ logradouro: 'RUA OITO', numero: 3604, lat: -22.389907, lng: -47.573457 })];
  const pino = escolherPinoPorta(rows, { cep: '13504188', numero: 3604, endereco: 'Rua 8, 3604 - Alto do Santana' });
  assert.ok(pino, 'o incidente de 27/07: via por extenso não pode mais vetar');
  assert.equal(pino!.precisao, 'porta');
});

test('porta REAL de prod: "Av. 84" casa "AVENIDA OITENTA E QUATRO"; "Av. 78" casa "...SETENTA E OITO BV"', () => {
  assert.ok(escolherPinoPorta([row({ logradouro: 'AVENIDA OITENTA E QUATRO', numero: 398 })], { cep: '13504731', numero: 398, endereco: 'Jd. Santa Maria, Av. 84, nº 398' }));
  assert.ok(escolherPinoPorta([row({ logradouro: 'AVENIDA SETENTA E OITO BV', numero: 70 })], { cep: '13504680', numero: 70, endereco: 'Jd. Boa Vista, Av. 78, nº 70' }));
});

test('a régua de palavra inteira SEGUE de pé: "Rua 8" ≠ "RUA OITENTA" e "Rua 1" ≠ "RUA DOZE"', () => {
  assert.equal(escolherPinoPorta([row({ logradouro: 'RUA OITENTA' })], { cep: '13500000', numero: 752, endereco: 'Rua 8' }), null);
  assert.equal(escolherPinoPorta([row({ logradouro: 'RUA DOZE' })], { cep: '13500000', numero: 752, endereco: 'Rua 1' }), null);
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
