import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarCnpjPublicSourceService } from './radar-cnpj-public-source.service';

/**
 * LOTE 2 do PR17082026 (17/08) — a fonte da Receita deixou de fazer UMA consulta e passou a virar
 * PÁGINAS até secar. Este arquivo guarda os freios dessa drenagem, que são o que separa "entregar
 * tudo" de "prender a tela do dono":
 *  - teto de páginas por lote (a cena de aceite exige "a tela não fica 10 min buscando");
 *  - o disjuntor de páginas zeradas (a porta da Receita rejeita muito; sem ele, uma cidade
 *    incompatível faria varrer 28M de linhas de 500 em 500 sem entregar um card);
 *  - o cursor andando de página em página sem repetir empresa;
 *  - o discovery web só DEPOIS da seca (senão dispararia busca web em toda página — o lixo que o
 *    Lote 3 foi matar).
 */

function normalizadoBase() {
  return {
    city: 'Valinhos',
    state: 'SP',
    segment: 'distribuidora de agua',
    quantity: 100,
    engine: 'hbx',
    targetType: 'pj',
    normalizedCity: 'valinhos',
    normalizedSegment: 'distribuidora de agua',
    filters: {},
    preferredChannels: [],
    requiredChannels: [],
    channelMatchMode: 'prefer',
    freshness: 'live',
  } as any;
}

/** Dataset falso: base de `total` linhas servida em páginas de `porPagina`. */
function datasetFake(total: number, porPagina: number) {
  const cursoresRecebidos: any[] = [];
  let chamadas = 0;
  return {
    chamadas: () => chamadas,
    cursoresRecebidos,
    fetchRecordsPage: async (input: any) => {
      chamadas += 1;
      cursoresRecebidos.push(input?.cursor ?? null);
      const inicio = Number(input?.cursor?.cnpj || 0);
      const fim = Math.min(total, inicio + porPagina);
      const records = [];
      for (let i = inicio; i < fim; i += 1) {
        records.push({ cnpj: String(i), nomeFantasia: `AGUA ${i}`, razaoSocial: `AGUA ${i} LTDA` });
      }
      const secou = fim >= total;
      return {
        records,
        rawCount: records.length,
        phase: 'with_contact',
        nextCursor: secou ? null : { phase: 'with_contact', cnpj: String(fim) },
        exhausted: secou,
      };
    },
  } as any;
}

/** Dataset falso que NUNCA seca (base gigante) — serve pra medir os freios. */
function datasetInfinito(porPagina: number) {
  let chamadas = 0;
  return {
    chamadas: () => chamadas,
    fetchRecordsPage: async () => {
      chamadas += 1;
      const records = Array.from({ length: porPagina }, (_, i) => ({
        cnpj: `${chamadas}-${i}`,
        nomeFantasia: `EMPRESA ${chamadas}-${i}`,
      }));
      return {
        records,
        rawCount: porPagina,
        phase: 'with_contact',
        nextCursor: { phase: 'with_contact', cnpj: `pagina-${chamadas}` },
        exhausted: false,
      };
    },
  } as any;
}

/**
 * Dataset falso FIEL ao `fetchRecordsPage` de verdade: duas fases, âncora no `cnpj` da última
 * linha CRUA da página, e a fase só fecha quando a página veio CURTA (`rawCount < porPagina`).
 * É este detalhe que fabrica a cena de Valinhos: 86 empresas com telefone cabem numa página de
 * 500, então a fase `with_contact` "fecharia" na primeira leitura.
 */
function datasetFielDeDuasFases(cnpjs: string[], porPagina: number) {
  const cursoresRecebidos: any[] = [];
  return {
    cursoresRecebidos,
    fetchRecordsPage: async (input: any) => {
      const fase = input?.cursor?.phase === 'without_contact' ? 'without_contact' : 'with_contact';
      cursoresRecebidos.push(input?.cursor ?? null);
      // A base do teste é toda COM contato — a fase 2 nasce vazia, igual à cena real.
      const universo = fase === 'with_contact' ? cnpjs : [];
      const ancora = input?.cursor?.cnpj ? String(input.cursor.cnpj) : null;
      const inicio = ancora ? universo.indexOf(ancora) + 1 : 0;
      const linhas = universo.slice(inicio, inicio + porPagina);
      const rawCount = linhas.length;
      const ultimo = rawCount ? linhas[rawCount - 1] : null;
      const records = linhas.map((cnpj) => ({
        cnpj,
        nomeFantasia: `AGUA ${cnpj}`,
        razaoSocial: `AGUA ${cnpj} LTDA`,
        phone: '1999990000',
      }));
      if (rawCount >= porPagina && ultimo) {
        return { records, rawCount, phase: fase, nextCursor: { phase: fase, cnpj: ultimo }, exhausted: false };
      }
      if (fase === 'with_contact') {
        return { records, rawCount, phase: fase, nextCursor: { phase: 'without_contact', cnpj: null }, exhausted: false };
      }
      return { records, rawCount, phase: fase, nextCursor: null, exhausted: true };
    },
  } as any;
}

/**
 * Provider falso que modela a PORTA da Receita: percorre a página INTEIRA e só
 * `aceitosPorPagina` passam — o resto é rejeitado de verdade (DV, situação, cidade, exclusão de
 * segmento). Por isso `consumedCount` é a página toda: não sobrou linha por olhar, e só nesse
 * caso o cursor pode virar a página.
 */
function providerDaPortaQueRejeita(aceitosPorPagina: number) {
  return {
    search: async (input: any) => {
      const records = input.records || [];
      const aceitos = records.slice(0, Math.min(aceitosPorPagina, Number(input.limit) || aceitosPorPagina));
      return {
        status: 'completed',
        retryable: false,
        reason: 'records_normalizados',
        foundCount: records.length,
        acceptedCount: aceitos.length,
        rejectedCount: records.length - aceitos.length,
        consumedCount: records.length,
        results: aceitos.map((registro: any) => ({ cnpj: registro.cnpj, name: registro.nomeFantasia, source: 'cnpj_public' })),
      };
    },
  } as any;
}

/**
 * Provider falso igual ao de verdade no ponto do defeito: aceita o que chega e PARA no `limit`
 * (`accepted.length >= limit` → break), deixando o rabo da página SEM AVALIAR. `consumedCount` é
 * o índice onde parou — a única medida que diz até onde o cursor pode andar sem descartar linha.
 */
function providerQueParaNoLimite() {
  return {
    search: async (input: any) => {
      const records = input.records || [];
      const limite = Math.max(1, Math.min(100, Number(input.limit) || 20));
      const aceitos: any[] = [];
      let percorridos = 0;
      for (const registro of records) {
        percorridos += 1;
        aceitos.push(registro);
        if (aceitos.length >= limite) break;
      }
      return {
        status: 'completed',
        retryable: false,
        reason: 'records_normalizados',
        foundCount: records.length,
        acceptedCount: aceitos.length,
        // Nada foi rejeitado: o que ficou depois do corte nem chegou a ser olhado.
        rejectedCount: 0,
        consumedCount: percorridos,
        results: aceitos.map((registro: any) => ({ cnpj: registro.cnpj, name: registro.nomeFantasia, source: 'cnpj_public' })),
      };
    },
  } as any;
}

function comEnv(valores: Record<string, string | undefined>, fn: () => Promise<void>) {
  const originais: Record<string, string | undefined> = {};
  for (const [chave, valor] of Object.entries(valores)) {
    originais[chave] = process.env[chave];
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  }
  return fn().finally(() => {
    for (const [chave, valor] of Object.entries(originais)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  });
}

test('drenagem acumula as paginas: 86 na base saem no mesmo lote e a fonte marca seca', async () => {
  await comEnv({ HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true', HBX_RADAR_CNPJ_DISCOVERY_ENABLED: 'false' }, async () => {
    const dataset = datasetFake(86, 20);
    const service = new RadarCnpjPublicSourceService(providerDaPortaQueRejeita(20), dataset, undefined);

    const resultado: any = await service.run({ normalized: normalizadoBase(), limit: 100, prisma: {} });

    assert.equal(dataset.chamadas(), 5, '86 linhas em paginas de 20 = 5 paginas');
    assert.equal(resultado.acceptedCount, 86, 'os contadores das paginas se somam, nao se sobrescrevem');
    assert.equal(resultado.results.length, 86);
    assert.equal(resultado.exhausted, true, 'ultima pagina da fase sem contato marca a seca');
    assert.equal(resultado.cursor, null, 'base seca nao tem cursor pra continuar');
    assert.deepEqual(dataset.cursoresRecebidos[0], null);
    assert.deepEqual(dataset.cursoresRecebidos[1], { phase: 'with_contact', cnpj: '20' });
    const cnpjs = new Set(resultado.results.map((linha: any) => linha.cnpj));
    assert.equal(cnpjs.size, 86, 'nenhuma empresa repetida entre paginas');
  });
});

/**
 * O DEFEITO QUE ESTE TESTE MATA (17/08): a promessa do lote é "a Receita entrega TUDO". O
 * provider parava no `limit` (`accepted.length >= limit` → break) e o cursor era ancorado na
 * ÚLTIMA LINHA CRUA da página — quem estava DEPOIS do N-ésimo aceito nunca era avaliado e ainda
 * assim ficava para trás do cursor: inalcançável pelo resto do run. Com página de 500 e meta 20,
 * cada lote podia jogar fora 480 linhas. Pior: página curta (86 < 500) fechava a FASE inteira,
 * então o lote seguinte já começava na fase 2 e as 66 de Valinhos sumiam de vez.
 */
test('pagina de 86 com meta 20: o cursor para no ultimo consumido e as 66 do rabo saem nos lotes seguintes', async () => {
  await comEnv({ HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true', HBX_RADAR_CNPJ_DISCOVERY_ENABLED: 'false' }, async () => {
    // As 86 empresas ativas com telefone medidas na base RFB — todas cabem numa página de 500.
    const cnpjs = Array.from({ length: 86 }, (_, i) => String(10000000000000 + i));
    const dataset = datasetFielDeDuasFases(cnpjs, 500);
    const service = new RadarCnpjPublicSourceService(providerQueParaNoLimite(), dataset, undefined);

    const lote1: any = await service.run({ normalized: normalizadoBase(), limit: 20, prisma: {} });

    assert.equal(lote1.results.length, 20, 'o lote entrega a meta pedida');
    assert.equal(lote1.exhausted, false, 'sobraram 66 na pagina: a Receita NAO secou');
    assert.deepEqual(
      lote1.cursor,
      { phase: 'with_contact', cnpj: cnpjs[19] },
      'o cursor ancora no ULTIMO REGISTRO CONSUMIDO (o 20o), nunca no fim da pagina crua nem na virada de fase',
    );

    // Os lotes seguintes continuam exatamente de onde parou, até a base secar de verdade.
    const entregues: string[] = lote1.results.map((linha: any) => linha.cnpj);
    let cursor = lote1.cursor;
    let secou = lote1.exhausted;
    let lotes = 1;
    while (!secou && lotes < 12) {
      const proximo: any = await service.run({ normalized: normalizadoBase(), limit: 20, prisma: {}, cursor });
      entregues.push(...proximo.results.map((linha: any) => linha.cnpj));
      cursor = proximo.cursor;
      secou = proximo.exhausted;
      lotes += 1;
    }

    assert.equal(secou, true, 'a base seca de verdade no fim (fase 2 vazia)');
    assert.equal(entregues.length, 86, 'as 86 sairam e nenhuma saiu duas vezes');
    assert.deepEqual([...entregues].sort(), [...cnpjs].sort(), 'exatamente as 86 da base — nenhuma linha da pagina foi descartada');
  });
});

/**
 * A VARIANTE PIOR do mesmo defeito, DENTRO de um lote só: o provider clampa o próprio limite em
 * 100 (`Math.min(100, ...)`), então com meta 150 ele para no 100º enquanto o laço da fonte
 * CONTINUA — a fonte virava a página por cima dos 150 que ele não olhou e seguia lendo depois
 * deles. Aqui o laço tem de RETOMAR do 100º e fechar os 150 sem pular ninguém.
 */
test('provider clampado em 100 no meio da pagina: o proprio lote retoma do 100o, sem pular o resto', async () => {
  await comEnv({ HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true', HBX_RADAR_CNPJ_DISCOVERY_ENABLED: 'false' }, async () => {
    const cnpjs = Array.from({ length: 250 }, (_, i) => String(20000000000000 + i));
    const dataset = datasetFielDeDuasFases(cnpjs, 500);
    const service = new RadarCnpjPublicSourceService(providerQueParaNoLimite(), dataset, undefined);

    const resultado: any = await service.run({ normalized: normalizadoBase(), limit: 150, prisma: {} });

    assert.equal(resultado.results.length, 150, 'a meta de 150 sai no mesmo lote, em duas voltas do laco');
    assert.deepEqual(
      resultado.results.map((linha: any) => linha.cnpj),
      cnpjs.slice(0, 150),
      'os 150 sao os 150 PRIMEIROS em ordem — nenhum buraco entre o 100o e o 101o',
    );
    assert.deepEqual(resultado.cursor, { phase: 'with_contact', cnpj: cnpjs[149] }, 'o cursor fica no 150o pra o lote seguinte pegar os 100 que sobraram');
    assert.equal(resultado.exhausted, false, 'ainda sobram 100 na base');
  });
});

test('teto de paginas por lote: a drenagem devolve a vez pro run em vez de varrer a base inteira', async () => {
  await comEnv({
    HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true',
    HBX_RADAR_CNPJ_DISCOVERY_ENABLED: 'false',
    HBX_RADAR_RFB_MAX_PAGES_PER_BATCH: '2',
  }, async () => {
    const dataset = datasetInfinito(20);
    const service = new RadarCnpjPublicSourceService(providerDaPortaQueRejeita(1), dataset, undefined);

    const resultado: any = await service.run({ normalized: normalizadoBase(), limit: 50, prisma: {} });

    assert.equal(dataset.chamadas(), 2, 'o teto do env corta o lote em 2 paginas');
    assert.equal(resultado.acceptedCount, 2);
    assert.equal(resultado.exhausted, false, 'teto de lote NAO e seca — o proximo lote continua');
    // A LEI (defeito corrigido em 17/08): o cursor anda até o último registro que o provider
    // PERCORREU, nunca até o fim da página crua. Aqui ele pode ser o fim da página porque esta
    // porta percorreu as 20 linhas e rejeitou 19 — linha rejeitada É linha avaliada, não some.
    // Quando o provider PARA no meio (teste abaixo, meta atingida), o cursor tem de parar junto.
    assert.deepEqual(resultado.cursor, { phase: 'with_contact', cnpj: 'pagina-2' }, 'pagina percorrida ate o fim: o cursor pode virar a pagina');
  });
});

test('disjuntor de seca: 3 paginas seguidas sem nenhum aceito param a drenagem no lote', async () => {
  await comEnv({
    HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true',
    HBX_RADAR_CNPJ_DISCOVERY_ENABLED: 'false',
    HBX_RADAR_RFB_MAX_PAGES_PER_BATCH: undefined,
  }, async () => {
    const dataset = datasetInfinito(20);
    const service = new RadarCnpjPublicSourceService(providerDaPortaQueRejeita(0), dataset, undefined);

    const resultado: any = await service.run({ normalized: normalizadoBase(), limit: 50, prisma: {} });

    assert.equal(dataset.chamadas(), 3, 'para na 3a pagina zerada, sem esperar o teto de 6');
    assert.equal(resultado.acceptedCount, 0);
    assert.equal(resultado.exhausted, true, 'cidade que so rejeita nao pode prender a web pra sempre');
  });
});

test('discovery so entra DEPOIS da seca: com base ainda cheia, nao ha busca web', async () => {
  await comEnv({
    HBX_RADAR_CNPJ_PUBLIC_ENABLED: 'true',
    HBX_RADAR_CNPJ_DISCOVERY_ENABLED: 'true',
    HBX_RADAR_RFB_MAX_PAGES_PER_BATCH: '2',
  }, async () => {
    let discoveryChamado = 0;
    const discovery = { discover: async () => { discoveryChamado += 1; return []; } } as any;
    const service = new RadarCnpjPublicSourceService(providerDaPortaQueRejeita(1), datasetInfinito(20), discovery);

    const resultado: any = await service.run({ normalized: normalizadoBase(), limit: 50, prisma: {} });

    assert.equal(discoveryChamado, 0, 'base nao secou: perguntar a web quem mais existe e cedo demais');
    assert.equal(resultado.exhausted, false);
  });
});
