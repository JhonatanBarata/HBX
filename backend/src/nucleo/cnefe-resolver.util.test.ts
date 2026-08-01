import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __setCnefeQueryForTests,
  escolherPinoCep,
  escolherPinoPorta,
  escolherPinoRua,
  extrairNumeroPorta,
  normalizarViaNumeral,
  resolverCnefe,
  resolverCnefeCep,
  resolverCnefeLote,
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

// ── escolherPinoCep / resolverCnefeCep — endereço SEM NÚMERO (01/08) ──────────────
//
// O teste de rota ao vivo travou o dono na rua: CEP de lugar SEM número respondia
// "Falta o número da casa". Estes casos provam que o pino de CEP existe, que ele NÃO
// se disfarça de porta (precisao:'cep') e que ele continua fail-closed onde importa.

test('cep: linhas do mesmo trecho (inclusive a de numero NULL) → pino de CEP', () => {
  const rows = [
    row({ numero: null, lat: -22.419214, lng: -47.580903, logradouro: 'AVENIDA APIA' }),
    row({ numero: 101, lat: -22.420044, lng: -47.579545, logradouro: 'AVENIDA APIA' }),
    row({ numero: 164, lat: -22.419127, lng: -47.58226, logradouro: 'AVENIDA APIA' }),
  ];
  const pino = escolherPinoCep(rows, { cep: '13503539', endereco: 'Avenida Ápia' });
  assert.ok(pino, 'endereço sem número TEM que ter pino');
  assert.equal(pino!.precisao, 'cep', 'nunca pode se vender como porta');
});

test('cep: sem logradouro no cadastro ainda resolve (o CEP sozinho já é o trecho)', () => {
  const rows = [row({ numero: null }), row({ numero: 12 })];
  const pino = escolherPinoCep(rows, { cep: '13500000' });
  assert.ok(pino);
  assert.equal(pino!.precisao, 'cep');
});

test('cep: via incompatível segue vetada ("Av. Brasil" não vira pino num CEP de "Rua 12")', () => {
  const rows = [row({ numero: null, logradouro: 'RUA DOZE' })];
  assert.equal(escolherPinoCep(rows, { cep: '13500000', endereco: 'Avenida Brasil' }), null);
});

test('cep: cidade de CEP ÚNICO — linhas espalhadas por km → null (pino errado é pior)', () => {
  const rows = [
    row({ numero: null, lat: -22.4154, lng: -47.5670, logradouro: 'RUA A' }),
    row({ numero: null, lat: -22.4800, lng: -47.6300, logradouro: 'RUA A' }),
    row({ numero: null, lat: -22.3600, lng: -47.5000, logradouro: 'RUA A' }),
  ];
  assert.equal(escolherPinoCep(rows, { cep: '13500000' }), null);
});

test('resolverCnefeCep: consulta o CEP INTEIRO (sem filtro de numero) e devolve precisao cep', async () => {
  let sqlVisto = '';
  __setCnefeQueryForTests(async (sql, params) => {
    if (sql.includes('FROM cnefe_uf')) return [{ status: 'carregada' }];
    sqlVisto = sql;
    assert.deepEqual(params, ['13503539']);
    return [row({ numero: null, logradouro: 'AVENIDA APIA' })];
  });
  try {
    const pino = await resolverCnefeCep({ cep: '13503-539', endereco: 'Avenida Ápia', uf: 'SP' });
    assert.ok(pino);
    assert.equal(pino!.precisao, 'cep');
    assert.ok(!sqlVisto.includes('numero = $2'), 'não pode filtrar por número: aqui não existe número');
  } finally {
    __setCnefeQueryForTests(null);
  }
});

test('resolverCnefeCep: CEP inválido → null SEM consultar; banco quebrado NUNCA lança', async () => {
  let consultou = false;
  __setCnefeQueryForTests(async () => {
    consultou = true;
    throw new Error('conexão recusada');
  });
  try {
    assert.equal(await resolverCnefeCep({ cep: '1350' }), null);
    assert.equal(consultou, false);
    assert.equal(await resolverCnefeCep({ cep: '13500000', uf: 'SP' }), null);
  } finally {
    __setCnefeQueryForTests(null);
  }
});

// ── 🔴 O CAST DO CEP (01/08) — a rede que impede a base de virar inútil de novo ────
//
// `cep` é character(8). Sem `::bpchar` o Postgres converte a COLUNA, perde o índice e
// varre 23M linhas: 18.832 ms medidos em prod contra 0,285 ms com o cast. Como o
// resolver é best-effort (engole o timeout e devolve null CALADO), a regressão não
// aparece em lugar nenhum — só no contador "SEM MAPA" subindo. Por isso o teste olha
// o SQL: toda comparação de `cep` TEM que levar o cast.

test('CAST DO CEP: toda consulta que compara cep usa ::bpchar (senão vira seq scan de 23M)', async () => {
  const sqls: string[] = [];
  __setCnefeQueryForTests(async (sql) => {
    sqls.push(sql);
    if (sql.includes('FROM cnefe_uf')) return [{ status: 'carregada' }];
    return [];
  });
  try {
    await resolverCnefe({ cep: '13500000', numero: 752, endereco: 'Rua 12', uf: 'SP' });
    await resolverCnefeCep({ cep: '13500000', endereco: 'Rua 12', uf: 'SP' });
    await resolverCnefeLote(['13500000', '13500100'], { numero: 752, endereco: 'Rua 12', uf: 'SP' });

    const queComparamCep = sqls.filter((s) => /\bcep\s*(=|IN)\s*/i.test(s) && s.includes('cnefe_endereco'));
    assert.ok(queComparamCep.length >= 3, 'esperava as consultas de porta, rua, cep e lote');
    for (const sql of queComparamCep) {
      assert.ok(
        /cep\s*=\s*\$\d+::bpchar/i.test(sql) || /cep\s+IN\s*\([^)]*::bpchar/i.test(sql),
        `consulta sem cast de cep (vira seq scan de 23M linhas): ${sql}`,
      );
    }
  } finally {
    __setCnefeQueryForTests(null);
  }
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
    if (sql.includes('cep = $1::bpchar AND numero = $2')) {
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
