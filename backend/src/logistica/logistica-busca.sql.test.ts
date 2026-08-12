import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  coordDaQuery,
  escaparLike,
  escolherPortaDaBusca,
  normalizarBuscaCliente,
  normalizarBuscaTexto,
  parGpsValido,
  sqlBuscaClientes,
  sqlBuscaComerciosFuzzy,
  sqlBuscaComerciosLike,
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

test('sqlBuscaComercios: escopo por cidade+UF SEMPRE, nos DOIS caminhos', () => {
  const argumentos = { cityNorm: 'rio claro', uf: 'SP', q: 'Bar do Zé', lat: null, lng: null };
  for (const p of [sqlBuscaComerciosLike(argumentos), sqlBuscaComerciosFuzzy(argumentos)]) {
    assert.match(p.sql, /"normalizedCity" = \$1/);
    // UF entra LITERAL (o índice parcial não casa com parâmetro) e VALIDADA.
    assert.match(p.sql, /"state" = 'SP'/);
    assert.match(p.sql, /situacao" = 'ativa'/);
    assert.equal(p.params[1], 'bar do ze');
    // As fases: candidatos por nome LIMITADOS antes de voltar ao heap/geo.
    assert.match(p.sql, /LIMIT 40/);
  }
  // Rápido = substring; fuzzy = `<%` (word_similarity que USA o GIN da RFB).
  assert.match(sqlBuscaComerciosLike(argumentos).sql, /"searchText" LIKE \$3/);
  assert.match(sqlBuscaComerciosFuzzy(argumentos).sql, /\$2 <% c\."searchText"/);
});

test('sqlBuscaComercios: UF torta NÃO vira SQL (o literal é validado)', () => {
  assert.throws(() => sqlBuscaComerciosLike({ cityNorm: 'x', uf: "SP' OR 1=1 --", q: 'bar', lat: null, lng: null }));
  assert.throws(() => sqlBuscaComerciosLike({ cityNorm: 'x', uf: '', q: 'bar', lat: null, lng: null }));
  // minúscula é normalizada, não recusada (vem do nosso cnefe_mun_map).
  assert.match(sqlBuscaComerciosLike({ cityNorm: 'x', uf: 'sp', q: 'bar', lat: null, lng: null }).sql, /"state" = 'SP'/);
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

/* 🔴 A TRAVA DO SCORE MENTIROSO (fiscal, 12/08).
   O defeito real que passou VERDE por uma prova que só olhava o SQL: a lista de
   comércios vinha ORDENADA pelo score composto (nome × distância) e ETIQUETADA
   com a similaridade crua (`r.sim`) — número que o app ia mostrar/usar como
   ranking. Ordem certa, campo mentiroso; nenhum teste percebia.
   Esta trava cobra as DUAS pontas, porque cada uma sozinha mente:
     (1) todo builder que o serviço ranqueia PRECISA expor a coluna `score`
         (sem ela, `r.score` viraria 0 calado);
     (2) todo `score:` do serviço lê `r.score` — nunca `r.sim`.
   É portão de TEXTO de propósito: o mapeamento mora no serviço, que só roda com
   banco. Texto pega o regressor, e o custo é zero. */
test('score do serviço é o do SQL — nem sim cru, nem coluna ausente', () => {
  const comLike = sqlBuscaComerciosLike({ cityNorm: 'rio claro', uf: 'SP', q: 'bar do ze', lat: -22.4, lng: -47.5 });
  const comFuzzy = sqlBuscaComerciosFuzzy({ cityNorm: 'rio claro', uf: 'SP', q: 'bar do ze', lat: -22.4, lng: -47.5 });
  const cli = sqlBuscaClientes({ companyId: 41, q: 'marcia', lat: -22.4, lng: -47.5 });
  for (const [nome, p] of [['comercios/like', comLike], ['comercios/fuzzy', comFuzzy], ['clientes', cli]] as const) {
    assert.match(p.sql, /AS score\b/, `${nome}: o SQL precisa expor a coluna score`);
    assert.match(p.sql, /ORDER BY\s+score DESC/, `${nome}: a ordem é a do score composto`);
  }

  // O teste roda COMPILADO (dist/logistica/), então o fonte mora dois andares
  // acima, em src/ — mas aceita rodar de src também (ts-node), sem adivinhar.
  const moradias = [
    join(__dirname, '..', '..', 'src', 'logistica', 'logistica-busca.service.ts'),
    join(__dirname, 'logistica-busca.service.ts'),
  ];
  const caminho = moradias.find((c) => existsSync(c));
  assert.ok(caminho, `fonte do serviço não encontrado (procurei em: ${moradias.join(' | ')})`);
  const fonte = readFileSync(caminho as string, 'utf8');
  // Só as linhas de MAPEAMENTO — a declaração de tipo (`score: number;`) casa
  // com o mesmo começo e não mapeia nada (a régua reprovou nela no 1º run).
  const mapeamentos = (fonte.match(/^\s*score: .*$/gm) ?? [])
    .filter((l) => !/^\s*score: (number|string)\s*[;,]?\s*$/.test(l));
  assert.ok(mapeamentos.length >= 2, 'o serviço deve mapear score em clientes e comércios');
  for (const linha of mapeamentos) {
    assert.match(linha, /r\.score\b/, `mapeamento de score fora do SQL: ${linha.trim()}`);
    assert.ok(!/r\.sim\b/.test(linha), `score mapeado de sim cru (o defeito de 12/08): ${linha.trim()}`);
  }
});

/* 🔴 SEM GPS ≠ SEM PINO (fiscal, 12/08). O defeito que a RUA mostrou e a
   bancada não: cliente sem pino subia ao topo porque "distância nula" caía no
   mesmo galho de "request sem GPS" e ganhava fator 1.0 — o de quem está NA
   PORTA. Os dois grupos que ranqueiam por distância têm que ler as duas
   situações separadas, sempre; um grupo curado e o outro não é como a lista
   volta a se contradizer. */
test('distância nula: sem GPS é neutro, sem pino é penalizado — nos DOIS grupos', () => {
  const comGps = { lat: -22.4, lng: -47.5 };
  const cli = sqlBuscaClientes({ companyId: 41, q: 'marcia', ...comGps });
  const com = sqlBuscaComerciosLike({ cityNorm: 'rio claro', uf: 'SP', q: 'bar', ...comGps });
  for (const [nome, p] of [['clientes', cli], ['comercios', com]] as const) {
    // O galho do "sem GPS" (param de latitude nulo) é neutro: 1.0.
    assert.match(p.sql, /WHEN \$\d::float8 IS NULL THEN 1\.0/, `${nome}: sem GPS tem que ser neutro`);
    // E o galho do "tem GPS, não tem pino" existe e NÃO vale 1.0.
    assert.match(
      p.sql,
      /WHEN (geo\.)?dist_m IS NULL THEN 0\.55/,
      `${nome}: sem pino tem que valer PROX_SEM_PINO, nunca o fator de quem está na porta`,
    );
    assert.ok(
      !/WHEN (geo\.)?dist_m IS NULL THEN 1\.0/.test(p.sql),
      `${nome}: "não sei onde é" voltou a valer o mesmo que "está na porta"`,
    );
  }
});
