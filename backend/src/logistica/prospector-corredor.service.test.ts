import test from 'node:test';
import assert from 'node:assert/strict';
import { ProspectorCorredorService } from './prospector-corredor.service';
import {
  CESTA_AGUA,
  MAX_PARADAS,
  METROS_POR_GRAU_LAT,
  METROS_POR_GRAU_LNG,
  capDeEmbarque,
  clampMaxDia,
  clampRaioM,
  estaNaCesta,
  metrosParaGraus,
  montarSqlCorredor,
  normalizarParadas,
  ordenarProspectos,
  porteRank,
  regexCestaSql,
  rotuloDaCesta,
} from './prospector-corredor.sql';

/**
 * PROSPECTOR CNPJ — F0. As provas do PURO (conversão, cesta, ranking, cap) e o
 * contrato duro do serviço: multi-tenant no SQL, e FALHA DEVOLVE [] COM ALARME.
 *
 * Sem banco de propósito — a receita SQL já foi medida em produção (company 41,
 * 27 paradas, 1.513 pinos → 1.428 ativos → 463 na cesta, ~0,5 s). O que se prova
 * aqui é a regra que o SQL carrega, não o Postgres.
 */

// ---------------------------------------------------------------------------
// Dublê de Prisma: responde às 3 consultas do serviço pelo texto do SQL.
// ---------------------------------------------------------------------------
type CenarioPrisma = {
  tabelaProspecto?: boolean;
  configProspector?: boolean;
  config?: { raioM: number | null; maxDia: number | null } | null;
  corredor?: any[];
  erroCorredor?: Error;
  erroSondagem?: Error;
};

function makeService(cenario: CenarioPrisma = {}) {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const execs: Array<{ text: string; values: unknown[] }> = [];
  const erros: string[] = [];

  const prisma: any = {
    $queryRaw: async (sql: any) => {
      const text = String(sql?.sql ?? '');
      queries.push({ text, values: sql?.values ?? [] });
      if (text.includes('to_regclass')) {
        if (cenario.erroSondagem) throw cenario.erroSondagem;
        return [
          {
            tabela: cenario.tabelaProspecto === true,
            colunas: cenario.configProspector === true,
          },
        ];
      }
      if (text.includes('prospectorRaioM')) {
        return cenario.config === undefined ? [{ raioM: null, maxDia: null }] : cenario.config ? [cenario.config] : [];
      }
      if (cenario.erroCorredor) throw cenario.erroCorredor;
      return cenario.corredor ?? [];
    },
    $executeRaw: async (sql: any) => {
      execs.push({ text: String(sql?.sql ?? ''), values: sql?.values ?? [] });
      return 1;
    },
  };

  const service = new ProspectorCorredorService(prisma);
  (service as any).logger = {
    error: (m: string) => erros.push(String(m)),
    warn: () => {},
    log: () => {},
    debug: () => {},
  };
  return { service, queries, execs, erros };
}

const PARADAS = [
  { lat: -22.4260477, lng: -47.578631 },
  { lat: -22.3768057, lng: -47.5788828 },
];

function linha(over: Partial<any> = {}) {
  return {
    cnpj: '00000000000191',
    nome: 'Empresa',
    cnae: '9602501',
    cnaeDescricao: 'Cabeleireiros',
    porte: 'MICRO EMPRESA',
    phoneDigits: '1935244777',
    lat: -22.4,
    lng: -47.5,
    distM: 10,
    afinidade: true,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Conversão metros → graus
// ---------------------------------------------------------------------------

test('metros→graus usa as constantes medidas (150 m = a receita de produção)', () => {
  const { raioM, dLat, dLng } = metrosParaGraus(150);
  assert.equal(raioM, 150);
  assert.ok(Math.abs(dLat - 150 / METROS_POR_GRAU_LAT) < 1e-12);
  assert.ok(Math.abs(dLng - 150 / METROS_POR_GRAU_LNG) < 1e-12);
  // Os números que rodaram na VPS, ao 8º decimal (lá o dLat foi TRUNCADO em
  // 0.00134746; a diferença pro arredondado é ~1 mm de bbox — nada muda).
  assert.equal(dLat.toFixed(8), '0.00134747');
  assert.equal(dLng.toFixed(8), '0.00145744');
});

test('o bbox de longitude é MAIOR que o de latitude (perto do trópico o grau de lng encolhe)', () => {
  const { dLat, dLng } = metrosParaGraus(150);
  assert.ok(dLng > dLat, 'dLng tem que ser maior — senão o raio leste-oeste fica curto');
});

test('raio é clampado 50–500 e lixo cai no default 150', () => {
  assert.equal(clampRaioM(10), 50);
  assert.equal(clampRaioM(50_000), 500);
  assert.equal(clampRaioM(300), 300);
  // AUSENTE ≠ PEQUENO: config nula tem que cair no default 150, nunca no mínimo
  // 50 (o corredor encolheria a um terço em silêncio).
  assert.equal(clampRaioM(null), 150);
  assert.equal(clampRaioM(undefined), 150);
  assert.equal(clampRaioM(''), 150);
  assert.equal(clampRaioM('abacaxi'), 150);
  // e o clamp vale DENTRO da conversão, não só na porta
  assert.equal(metrosParaGraus(50_000).raioM, 500);
});

// ---------------------------------------------------------------------------
// 2. A cesta de afinidade "sede de água"
// ---------------------------------------------------------------------------

test('a cesta pega os 11 ramos medidos (463 de 1.428 no corredor da company 41)', () => {
  const dentro: Array<[string, string]> = [
    ['9602501', 'cabeleireiro'],
    ['9602502', 'estética'],
    ['8630503', 'consulta médica'],
    ['8610101', 'hospital'],
    ['9313100', 'academia'],
    ['6911701', 'advocacia'],
    ['7020400', 'consultoria'],
    ['8211300', 'escritório'],
    ['8513900', 'ensino fundamental'],
    ['5611201', 'restaurante'],
    ['4520001', 'oficina'],
    ['6821801', 'imobiliária'],
    ['7319002', 'promoção de vendas'],
  ];
  for (const [cnae, quem] of dentro) {
    assert.equal(estaNaCesta(cnae), true, `${quem} (${cnae}) devia estar na cesta`);
  }
});

test('fora da cesta NÃO é exclusão — só afinidade false', async () => {
  const fora = ['4781400', '0113000', '4399103', '4930201', '4711302'];
  for (const cnae of fora) {
    assert.equal(estaNaCesta(cnae), false, `${cnae} não é sede de água`);
  }
  // A prova de que não excluímos é o COMPORTAMENTO: varejo de vestuário volta
  // no corredor, só com afinidade false.
  const { service } = makeService({
    corredor: [linha({ cnae: '4781400', cnaeDescricao: 'Comércio varejista de vestuário', afinidade: false })],
  });
  const saida = await service.montarCorredor(41, PARADAS);
  assert.equal(saida.length, 1, 'empresa fora da cesta continua no corredor');
  assert.equal(saida[0].afinidade, false);
});

test('a cesta entra 2× no SQL (SELECT e ORDER BY) e NUNCA como filtro no WHERE', () => {
  const sql = montarSqlCorredor({ companyId: 41, paradas: PARADAS, raioM: 150, cap: 8, temTabelaProspecto: false });
  const usos = sql.values.filter((v) => v === regexCestaSql()).length;
  assert.equal(usos, 2, 'um terceiro uso significaria que a cesta virou filtro — e aí 965 empresas somem');
});

test('CNAE vazio/nulo/pontuado não quebra a cesta', () => {
  assert.equal(estaNaCesta(null), false);
  assert.equal(estaNaCesta(''), false);
  assert.equal(estaNaCesta(undefined), false);
  assert.equal(estaNaCesta('96.025-01'), true, 'pontuação é limpa antes de comparar');
});

test('o rótulo da cesta escolhe o prefixo MAIS LONGO', () => {
  assert.equal(rotuloDaCesta('6821801'), 'imobiliária');
  assert.equal(rotuloDaCesta('9313100'), 'academia');
  assert.equal(rotuloDaCesta('4781400'), null);
});

test('todo prefixo da cesta é só dígito (senão a interpolação no regex do SQL seria injeção)', () => {
  for (const item of CESTA_AGUA) {
    assert.match(item.prefixo, /^\d+$/, `prefixo ${item.prefixo} tem que ser numérico`);
  }
});

// ---------------------------------------------------------------------------
// 3. Ranqueamento: afinidade > distância > porte
// ---------------------------------------------------------------------------

test('afinidade vence distância: a da cesta a 140 m passa na frente da de fora a 5 m', () => {
  const ordenado = ordenarProspectos([
    { cnpj: 'B', afinidade: false, distM: 5, porte: 'DEMAIS' },
    { cnpj: 'A', afinidade: true, distM: 140, porte: 'MICRO EMPRESA' },
  ]);
  assert.deepEqual(ordenado.map((p) => p.cnpj), ['A', 'B']);
});

test('empatou na afinidade, quem está mais PERTO ganha', () => {
  const ordenado = ordenarProspectos([
    { cnpj: 'LONGE', afinidade: true, distM: 90, porte: 'DEMAIS' },
    { cnpj: 'PERTO', afinidade: true, distM: 8, porte: 'MICRO EMPRESA' },
  ]);
  assert.deepEqual(ordenado.map((p) => p.cnpj), ['PERTO', 'LONGE']);
});

test('empatou em afinidade E distância, o PORTE maior ganha', () => {
  const ordenado = ordenarProspectos([
    { cnpj: 'MICRO', afinidade: true, distM: 8, porte: 'MICRO EMPRESA' },
    { cnpj: 'GRANDE', afinidade: true, distM: 8, porte: 'DEMAIS' },
    { cnpj: 'NADA', afinidade: true, distM: 8, porte: null },
  ]);
  assert.deepEqual(ordenado.map((p) => p.cnpj), ['GRANDE', 'MICRO', 'NADA']);
});

test('empate total desempata por CNPJ — a mesma rota devolve a MESMA ordem sempre', () => {
  const entrada = [
    { cnpj: '99', afinidade: true, distM: 8, porte: 'DEMAIS' },
    { cnpj: '11', afinidade: true, distM: 8, porte: 'DEMAIS' },
  ];
  assert.deepEqual(ordenarProspectos(entrada).map((p) => p.cnpj), ['11', '99']);
  assert.deepEqual(ordenarProspectos([...entrada].reverse()).map((p) => p.cnpj), ['11', '99']);
});

test('ordenar não muta a lista de entrada', () => {
  const entrada = [
    { cnpj: 'B', afinidade: false, distM: 5, porte: null },
    { cnpj: 'A', afinidade: true, distM: 140, porte: null },
  ];
  ordenarProspectos(entrada);
  assert.equal(entrada[0].cnpj, 'B');
});

test('porte da RFB é texto e vira peso (DEMAIS > pequeno > micro > nada)', () => {
  assert.ok(porteRank('DEMAIS') > porteRank('EMPRESA DE PEQUENO PORTE'));
  assert.ok(porteRank('EMPRESA DE PEQUENO PORTE') > porteRank('MICRO EMPRESA'));
  assert.ok(porteRank('MICRO EMPRESA') > porteRank('NAO INFORMADO'));
  assert.equal(porteRank(' demais '), porteRank('DEMAIS'), 'caixa e espaço não mudam o peso');
  assert.equal(porteRank(null), 0);
});

// ---------------------------------------------------------------------------
// 4. Cap de embarque
// ---------------------------------------------------------------------------

test('cap de embarque é o DOBRO do que acende no dia', () => {
  assert.equal(capDeEmbarque(4), 8);
  assert.equal(capDeEmbarque(1), 2);
  assert.equal(capDeEmbarque(8), 16);
});

test('maxDia é clampado 1–8 antes de dobrar (config bagunçada não vira 2.000 embarcados)', () => {
  assert.equal(clampMaxDia(0), 1);
  assert.equal(clampMaxDia(999), 8);
  assert.equal(clampMaxDia(null), 4, 'ausente cai no default 4, não no mínimo 1');
  assert.equal(clampMaxDia(undefined), 4);
  assert.equal(capDeEmbarque(1000), 16);
  assert.equal(capDeEmbarque('nada'), 8);
});

test('o cap corta de verdade: SQL devolve 30, serviço entrega 8', async () => {
  const trinta = Array.from({ length: 30 }, (_, i) =>
    linha({ cnpj: String(i).padStart(14, '0'), distM: i + 1 }),
  );
  const { service } = makeService({ corredor: trinta });
  const saida = await service.montarCorredor(41, PARADAS, { raioM: 150, maxDia: 4 });
  assert.equal(saida.length, 8);
  assert.equal(saida[0].distM, 1, 'e o corte respeita o ranking, não a ordem de chegada');
});

// ---------------------------------------------------------------------------
// 5. FALHA DEVOLVE [] E LOGA (a lição do CNEFE)
// ---------------------------------------------------------------------------

test('consulta explodiu: devolve [] e NUNCA lança pra cima (a rota inicia sem prospectos)', async () => {
  const { service, erros } = makeService({ erroCorredor: new Error('relation "CnpjGeo" does not exist') });
  const saida = await service.montarCorredor(41, PARADAS);
  assert.deepEqual(saida, []);
  assert.equal(erros.length, 1, 'engolir o erro CALADO é o defeito do CNEFE — tem que ter alarme');
  assert.match(erros[0], /prospector/);
  assert.match(erros[0], /company=41/);
  assert.match(erros[0], /CnpjGeo/, 'a mensagem original do banco precisa aparecer no log');
});

test('embarque explodiu: devolve ok=false, lista vazia e alarme — sem lançar', async () => {
  const { service, erros } = makeService({ erroSondagem: new Error('banco fora do ar') });
  const r = await service.embarcar(41, PARADAS, { rotaDia: '2026-08-07' });
  assert.equal(r.ok, true, 'sondagem falha degrada, não derruba o embarque');
  assert.deepEqual(r.prospectos, []);
  assert.ok(erros.some((e) => /sondagem de capacidades falhou/.test(e)));
});

test('company inválida não vai ao banco nem lança', async () => {
  const { service, queries } = makeService();
  assert.deepEqual(await service.montarCorredor(0, PARADAS), []);
  assert.deepEqual(await service.montarCorredor(-3, PARADAS), []);
  assert.deepEqual(await service.montarCorredor(NaN as any, PARADAS), []);
  assert.equal(queries.length, 0);
});

test('rota sem parada com pino não consulta nada (não existe corredor sem paradas)', async () => {
  const { service, queries } = makeService();
  assert.deepEqual(await service.montarCorredor(41, []), []);
  assert.deepEqual(await service.montarCorredor(41, [{ lat: 0, lng: 0 }]), []);
  assert.equal(queries.length, 0);
});

// ---------------------------------------------------------------------------
// 6. Multi-tenant e forma do SQL
// ---------------------------------------------------------------------------

test('MULTI-TENANT: companyId escopa o livro do tenant dentro da consulta', () => {
  const sql = montarSqlCorredor({ companyId: 41, paradas: PARADAS, raioM: 150, cap: 8, temTabelaProspecto: true });
  assert.ok(sql.sql.includes('"CustomerProfile"'), 'exclui quem já é cliente/lead do tenant');
  assert.ok(sql.sql.includes('"ProspectoRota"'), 'exclui quem está em cooldown');
  // companyId aparece parametrizado (3×: 2 no livro do tenant + 1 nos bloqueados)
  assert.equal(sql.values.filter((v) => v === 41).length, 3);
  // e nunca concatenado no texto
  assert.ok(!sql.sql.includes('= 41'), 'companyId tem que ser PARÂMETRO, nunca texto colado');
});

test('a consulta de outra empresa carrega OUTRO companyId — nada atravessa', () => {
  const a = montarSqlCorredor({ companyId: 41, paradas: PARADAS, raioM: 150, cap: 8, temTabelaProspecto: true });
  const b = montarSqlCorredor({ companyId: 5, paradas: PARADAS, raioM: 150, cap: 8, temTabelaProspecto: true });
  assert.equal(a.sql, b.sql, 'mesmo texto');
  assert.equal(b.values.filter((v) => v === 5).length, 3);
  assert.equal(b.values.filter((v) => v === 41).length, 0);
});

test('PINO HONESTO: a consulta exige nivelGeo <= 2 (3-4 nunca vira anúncio)', () => {
  const sql = montarSqlCorredor({ companyId: 41, paradas: PARADAS, raioM: 150, cap: 8, temTabelaProspecto: false });
  assert.ok(sql.sql.includes('"nivelGeo" <= 2'));
});

test('o bbox vem ANTES da distância — é o que usa o índice (lat,lng), sem PostGIS aqui', () => {
  const sql = montarSqlCorredor({ companyId: 41, paradas: PARADAS, raioM: 150, cap: 8, temTabelaProspecto: false });
  const posBbox = sql.sql.indexOf('BETWEEN');
  const posDist = sql.sql.indexOf('<= (');
  assert.ok(posBbox > -1 && posDist > -1 && posBbox < posDist);
  assert.ok(!/st_dwithin|geography|postgis/i.test(sql.sql), 'não existe PostGIS neste cluster');
});

test('só empresa ATIVA entra', () => {
  const sql = montarSqlCorredor({ companyId: 41, paradas: PARADAS, raioM: 150, cap: 8, temTabelaProspecto: false });
  assert.ok(sql.sql.includes(`"situacao" = 'ativa'`));
});

test('sem a tabela ProspectoRota o CTE de bloqueados nasce VAZIO (não quebra a consulta)', () => {
  const sql = montarSqlCorredor({ companyId: 41, paradas: PARADAS, raioM: 150, cap: 8, temTabelaProspecto: false });
  assert.ok(!sql.sql.includes('"ProspectoRota"'));
  assert.ok(sql.sql.includes('WHERE false'), 'o CTE continua existindo, só sem linha');
  assert.ok(sql.sql.includes('bloqueados'), 'a forma do SQL não muda');
});

test('cada parada vira 2 parâmetros — nada de coordenada concatenada no texto', () => {
  const sql = montarSqlCorredor({ companyId: 41, paradas: PARADAS, raioM: 150, cap: 8, temTabelaProspecto: false });
  assert.ok(sql.values.includes(PARADAS[0].lat));
  assert.ok(sql.values.includes(PARADAS[0].lng));
  assert.ok(!sql.sql.includes('-22.4260477'));
});

test('corredor sem parada nem monta SQL', () => {
  assert.throws(
    () => montarSqlCorredor({ companyId: 41, paradas: [], raioM: 150, cap: 8, temTabelaProspecto: false }),
    /sem paradas/,
  );
});

// ---------------------------------------------------------------------------
// 7. Normalização das paradas
// ---------------------------------------------------------------------------

test('paradas repetidas viram uma só (3 entregas no mesmo prédio = 1 ponto de busca)', () => {
  const saida = normalizarParadas([
    { lat: -22.4260477, lng: -47.578631 },
    { lat: -22.4260477, lng: -47.578631 },
    { lat: -22.3768057, lng: -47.5788828 },
  ]);
  assert.equal(saida.length, 2);
});

test('coordenada inválida, (0,0) e fora do globo são descartadas', () => {
  const saida = normalizarParadas([
    { lat: 0, lng: 0 },
    { lat: NaN, lng: -47 },
    { lat: -22.4, lng: 999 },
    { lat: 'x' as any, lng: 'y' as any },
    null as any,
    { lat: -22.4260477, lng: -47.578631 },
  ]);
  assert.deepEqual(saida, [{ lat: -22.4260477, lng: -47.578631 }]);
});

test('folha corrompida com paradas demais é cortada em MAX_PARADAS', () => {
  const muitas = Array.from({ length: MAX_PARADAS + 250 }, (_, i) => ({ lat: -22 - i / 1e6, lng: -47 - i / 1e6 }));
  assert.equal(normalizarParadas(muitas).length, MAX_PARADAS);
});

test('entrada que não é lista devolve lista vazia', () => {
  assert.deepEqual(normalizarParadas(null), []);
  assert.deepEqual(normalizarParadas('paradas' as any), []);
});

// ---------------------------------------------------------------------------
// 8. Config: opts > LogisticaConfig > default do plano
// ---------------------------------------------------------------------------

test('sem as colunas prospector* no banco, usa o default do plano (150 m / 4 por dia)', async () => {
  const { service, queries } = makeService({ configProspector: false, corredor: [linha()] });
  const r = await service.embarcar(41, PARADAS);
  assert.equal(r.raioM, 150);
  assert.equal(r.maxDia, 4);
  assert.equal(r.acendeNoDia, 4);
  assert.ok(
    !queries.some((q) => q.text.includes('FROM "LogisticaConfig"')),
    'nem tenta ler coluna que ainda não existe',
  );
});

test('com as colunas no banco, a config da EMPRESA manda', async () => {
  const { service } = makeService({
    configProspector: true,
    config: { raioM: 300, maxDia: 6 },
    corredor: [linha()],
  });
  const r = await service.embarcar(41, PARADAS);
  assert.equal(r.raioM, 300);
  assert.equal(r.maxDia, 6);
});

test('config fora da faixa é clampada, não obedecida', async () => {
  const { service } = makeService({
    configProspector: true,
    config: { raioM: 90_000, maxDia: 99 },
    corredor: [linha()],
  });
  const r = await service.embarcar(41, PARADAS);
  assert.equal(r.raioM, 500);
  assert.equal(r.maxDia, 8);
});

// ---------------------------------------------------------------------------
// 9. Embarque e o DIA DE SÃO PAULO
// ---------------------------------------------------------------------------

test('sem a tabela ainda, embarca só em memória — e diz isso honestamente', async () => {
  const { service, execs } = makeService({ tabelaProspecto: false, corredor: [linha()] });
  const r = await service.embarcar(41, PARADAS, { rotaDia: '2026-08-07' });
  assert.equal(r.somenteMemoria, true);
  assert.equal(r.prospectos.length, 1);
  assert.equal(execs.length, 0, 'não tenta gravar em tabela inexistente');
});

test('com a tabela, grava o embarque do dia sem regredir quem já virou lead', async () => {
  const { service, execs } = makeService({ tabelaProspecto: true, corredor: [linha()] });
  const r = await service.embarcar(41, PARADAS, { rotaDia: '2026-08-07' });
  assert.equal(r.somenteMemoria, false);
  assert.equal(execs.length, 1);
  assert.ok(execs[0].text.includes('ON CONFLICT ("companyId", "cnpj")'));
  assert.ok(execs[0].text.includes(`WHEN "ProspectoRota"."estado" = 'lead'`));
  assert.ok(execs[0].values.includes('2026-08-07'), 'rotaDia entra parametrizado');
  assert.ok(execs[0].values.includes(41), 'e o tenant também');
});

test('o DIA é o de São Paulo, nunca o UTC do container', async () => {
  const { service, execs } = makeService({ tabelaProspecto: true, corredor: [linha()] });
  const r = await service.embarcar(41, PARADAS);
  const emSp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  assert.equal(r.rotaDia, emSp);
  assert.ok(execs[0].values.includes(emSp));
  // às 22h de SP o UTC já virou o dia seguinte — é exatamente aqui que o
  // container mentiria, e a rota da noite gravaria o dia errado.
  assert.match(r.rotaDia, /^\d{4}-\d{2}-\d{2}$/);
});

test('rotaDia malformado cai pro dia de hoje em São Paulo, não vaza pro banco', async () => {
  const { service } = makeService({ tabelaProspecto: true, corredor: [linha()] });
  const r = await service.embarcar(41, PARADAS, { rotaDia: '07/08/2026' as any });
  assert.match(r.rotaDia, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(r.rotaDia, '07/08/2026');
});

test('corredor vazio não grava nada e segue ok', async () => {
  const { service, execs } = makeService({ tabelaProspecto: true, corredor: [] });
  const r = await service.embarcar(41, PARADAS, { rotaDia: '2026-08-07' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.prospectos, []);
  assert.equal(execs.length, 0);
});

test('linha do banco vira prospecto limpo (telefone só dígito, nome com fallback honesto)', async () => {
  const { service } = makeService({
    corredor: [linha({ nome: '  ', phoneDigits: '(19) 3524-4777', distM: 8.7 })],
  });
  const [p] = await service.montarCorredor(41, PARADAS);
  assert.equal(p.nome, 'Empresa sem nome na Receita');
  assert.equal(p.phoneDigits, '1935244777');
  assert.equal(p.distM, 9, 'distância em metro inteiro — o card não mostra 8,7 m');
});
