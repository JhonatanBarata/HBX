import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coordDaQuery,
  escaparLike,
  escolherPortaDaBusca,
  normalizarBuscaCliente,
  normalizarBuscaTexto,
  parGpsValido,
  sqlBuscaClientes,
  sqlBuscaComercios,
  sqlBuscaVias,
  viaCanonDaBusca,
  PortaRow,
} from './logistica-busca.sql';

/**
 * BUSCA DA PARADA AVULSA — a peça pura sob teste (PR12082026 F1).
 *
 * O que estes testes travam: as normalizações que fazem o texto digitado CASAR
 * com a forma gravada em cada fonte (searchName / via_canon / searchText), e as
 * leis fail-closed da porta. Se alguém mexer numa régua sem mexer na outra
 * ponta, isto fica vermelho antes de virar "busca que não acha nada, calada".
 */

test('viaCanonDaBusca: o digitado vira a forma via_canon do banco cnefe', () => {
  // A cena do plano: "av 84" ↔ "Avenida Oitenta e Quatro" — os DOIS lados caem
  // na mesma forma canônica ("av 84"), que é como o agregado grava.
  assert.equal(viaCanonDaBusca('Avenida Oitenta e Quatro'), 'av 84');
  assert.equal(viaCanonDaBusca('Av. 84'), 'av 84');
  assert.equal(viaCanonDaBusca('rua 8'), 'rua 8');
  assert.equal(viaCanonDaBusca('Rua Oito'), 'rua 8');
  // Zero à esquerda cai (canon_via do banco faz o mesmo): "rua 08" = "rua 8".
  assert.equal(viaCanonDaBusca('Rua 08'), 'rua 8');
  // R. abreviado é rua; travessa abreviada idem.
  assert.equal(viaCanonDaBusca('R. São João'), 'rua sao joao');
  assert.equal(viaCanonDaBusca('Tv. Duque'), 'travessa duque');
  // Token colado letra+dígito separa ("M55" → "m 55") — herda da régua do resolver.
  assert.equal(viaCanonDaBusca('Av. M55'), 'av m 55');
});

test('normalizações casam com a escrita de cada fonte', () => {
  // searchName é gravado por normalizeSearch (sem acento, minúsculo).
  assert.equal(normalizarBuscaCliente('  Márcia  '), 'marcia');
  assert.equal(normalizarBuscaCliente('JOÃO  DA SILVA'), 'joao da silva');
  // searchText/normalizedCity da RFB: espelho do normalizeText do import.
  assert.equal(normalizarBuscaTexto('São Paulo'), 'sao paulo');
  assert.equal(normalizarBuscaTexto('  BAR  DO  ZÉ '), 'bar do ze');
});

test('escaparLike: texto do usuário nunca entra cru num padrão', () => {
  assert.equal(escaparLike('50%'), '50\\%');
  assert.equal(escaparLike('a_b\\c'), 'a\\_b\\\\c');
});

test('sqlBuscaClientes: multi-tenant no CTE de recência E no WHERE do cliente', () => {
  const p = sqlBuscaClientes({ companyId: 41, q: 'Mracia', lat: -22.4, lng: -47.5 });
  // A régua da última entrega (a MESMA de logistica-ultima-entrega.util.ts):
  assert.match(p.sql, /"status" = 'entregue'/);
  assert.match(p.sql, /"deliveredAt" IS NOT NULL/);
  assert.match(p.sql, /MAX\(e\."deliveredAt"\)/);
  // companyId escopa as DUAS tabelas (nada atravessa empresa):
  assert.match(p.sql, /e\."companyId" = \$1/);
  assert.match(p.sql, /cp\."companyId" = \$1/);
  // O q normalizado viaja nos params, nunca interpolado no texto:
  assert.equal(p.params[0], 41);
  assert.equal(p.params[1], 'mracia');
  assert.ok(!p.sql.includes('mracia'), 'q vazou pro texto do SQL');
});

test('sqlBuscaComercios: escopo por cidade+UF SEMPRE, e fuzzy pelo operador indexado', () => {
  const p = sqlBuscaComercios({ cityNorm: 'rio claro', uf: 'SP', q: 'Bar do Zé', lat: null, lng: null });
  assert.match(p.sql, /"normalizedCity" = \$1/);
  assert.match(p.sql, /"state" = \$2/);
  assert.match(p.sql, /situacao" = 'ativa'/);
  // `<%` é o word_similarity que USA o GIN trgm de 4 GB da RFB:
  assert.match(p.sql, /\$3 <% c\."searchText"/);
  assert.equal(p.params[2], 'bar do ze');
});

test('sqlBuscaVias: escopo por município e as duas grafias de casamento', () => {
  const p = sqlBuscaVias({ codMunicipio: '3543907', q: 'Rua Oito', lat: null, lng: null });
  assert.match(p.sql, /cod_municipio = \$1/);
  assert.equal(p.params[1], 'rua 8'); // canônico pro `=`/similarity
  assert.equal(p.params[2], 'rua 8'); // escapado pro LIKE
});

test('escolherPortaDaBusca: porta exata só com dispersão provada', () => {
  const porta = (extra: Partial<PortaRow>): PortaRow => ({
    numero: 100, lat: -22.4, lng: -47.5, cep: '13500000', n: 3, spread_m: 40, cnefe_nivel: 1, ...extra,
  });
  // Porta boa → 'porta'.
  const ok = escolherPortaDaBusca([porta({})], [], 100);
  assert.equal(ok?.precisao, 'porta');
  assert.equal(ok?.cep, '13500000');
  // Dispersão acima do teto (cidade de via única) → NÃO vira porta.
  const espalhada = escolherPortaDaBusca([porta({ spread_m: 900 })], [], 100);
  assert.equal(espalhada, null);
  // (0,0) é lixo de cadastro, nunca pino.
  assert.equal(escolherPortaDaBusca([porta({ lat: 0, lng: 0 })], [], 100), null);
});

test('escolherPortaDaBusca: vizinho só na mesma altura da rua', () => {
  const viz = (numero: number, spread = 60): PortaRow => ({
    numero, lat: -22.4, lng: -47.5, cep: '13500000', n: 2, spread_m: spread, cnefe_nivel: 1,
  });
  // 864 pedido, 880 existe → 'rua' (vizinho a 16 de numeração).
  const r = escolherPortaDaBusca([], [viz(880)], 864);
  assert.equal(r?.precisao, 'rua');
  assert.equal(r?.numero, 880);
  // Vizinho a 300 números de distância NÃO é a mesma altura → null.
  assert.equal(escolherPortaDaBusca([], [viz(1200)], 864), null);
});

test('coordDaQuery/parGpsValido: NaN e (0,0) nunca entram', () => {
  assert.equal(coordDaQuery('abc'), null);
  assert.equal(coordDaQuery(''), null);
  assert.equal(coordDaQuery('-22.4'), -22.4);
  assert.equal(parGpsValido(0, 0), false);
  assert.equal(parGpsValido(-22.4, -47.5), true);
  assert.equal(parGpsValido(-22.4, null), false);
});
