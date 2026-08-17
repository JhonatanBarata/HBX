import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarCoreSearchLoopMixin } from './radar-core-search-loop.mixin';
import { RadarSearchRunConfigService } from './radar-search-run-config.service';

/**
 * LOTE 2 do PR17082026-FAXINA-DA-BUSCA-RFB-PRIMEIRO (17/08) — portão de prova da encomenda
 * literal do dono: *"o RFB é onde está o ouro, a pesquisa tem q vir depois q a RFB entregou
 * tudo"*.
 *
 * O que cada teste guarda:
 *  - a base fake de 86 (o número real medido em Valinhos e vizinhas) sai INTEIRA antes de o
 *    motor web ser chamado uma única vez;
 *  - enquanto a Receita não secou, `searchHbxEngine` não é chamado;
 *  - erro da Receita LIBERA a web na hora (degrade gracioso) — nos dois lugares onde o erro pode
 *    nascer: dentro da fonte e no `.catch` do call-site;
 *  - o cursor sobrevive entre lotes pelo `metricsJson` (é o que impede a Receita de reentregar a
 *    mesma primeira página a cada lote depois de um restart do publish);
 *  - a frase de desfecho parcial só cita os números novos quando eles existem.
 *
 * O harness monta o run de cliente inteiro (processSearchRun) com prisma e motor falsos: é o
 * único lugar onde a ORDEM rfb→web pode ser medida de verdade.
 */

function normalizadoBase(overrides: any = {}) {
  return {
    city: 'Valinhos',
    state: 'SP',
    segment: 'distribuidora de agua',
    quantity: 100,
    engine: 'hbx',
    targetType: 'pj',
    radiusKm: 0,
    regionalCities: [],
    requiredChannels: [],
    preferredChannels: [],
    channelMatchMode: 'prefer',
    filters: {},
    ...overrides,
  } as any;
}

/** Fonte Receita falsa que devolve `porPagina` empresas por lote e seca ao acabar a base. */
function fonteFakeDaReceita(total: number, porPagina: number) {
  const cursoresRecebidos: any[] = [];
  let chamadas = 0;
  return {
    chamadas: () => chamadas,
    cursoresRecebidos,
    run: async (input: any) => {
      chamadas += 1;
      cursoresRecebidos.push(input?.cursor ?? null);
      const inicio = Number(input?.cursor?.cnpj || 0);
      const fim = Math.min(total, inicio + Math.min(porPagina, Math.max(1, Number(input?.limit) || 1)));
      const results: any[] = [];
      for (let i = inicio; i < fim; i += 1) {
        results.push({
          cnpj: String(i),
          name: `EMPRESA DE AGUA ${i}`,
          phone: '19999990000',
          source: 'cnpj_public',
          city: 'Valinhos',
          state: 'SP',
        });
      }
      const secou = fim >= total;
      return {
        source: 'cnpj_public',
        status: 'completed',
        retryable: false,
        foundCount: results.length,
        acceptedCount: results.length,
        rejectedCount: 0,
        reason: 'records_normalizados',
        results,
        exhausted: secou,
        cursor: secou ? null : { phase: 'with_contact', cnpj: String(fim) },
      };
    },
  };
}

function respostaVaziaDoMotor() {
  return {
    results: [],
    status: 'running',
    message: null,
    httpStatus: null,
    rawErrorMessage: null,
    urlsDiscovered: 1,
    pagesFetched: 1,
    parsedContacts: 0,
    rejectedCount: 0,
    duplicateCount: 0,
  };
}

function montarRunDoLoop(fonte: { run: (input: any) => Promise<any> }, opcoes: any = {}) {
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  const logs: string[] = [];
  const itens: any[] = [];
  const vistos = new Set<string>();
  const chamadasWeb: Array<{ entreguesAntes: number }> = [];
  const run: any = {
    id: 'run-1',
    companyId: 'c1',
    status: 'queued',
    foundCount: 0,
    targetQuantity: 100,
    attemptCount: 0,
    consecutiveEmptyBatchCount: 0,
    consecutiveEngineErrorCount: 0,
    failedBatchCount: 0,
    metricsJson: null,
    startedAt: null,
    finishedAt: null,
    assignedEngineId: null,
    assignedEngineUrl: null,
    assignedEngineIndex: null,
    lastQueryUsed: null,
    lastEngineUrl: null,
    errorMessage: null,
    ...(opcoes.run || {}),
  };

  const aplicarDados = (data: any) => {
    for (const [chave, valor] of Object.entries(data || {})) {
      if (valor && typeof valor === 'object' && Object.prototype.hasOwnProperty.call(valor, 'increment')) {
        run[chave] = Number(run[chave] || 0) + Number((valor as any).increment || 0);
      } else {
        run[chave] = valor;
      }
    }
  };

  instance.logger = { log: (msg: string) => logs.push(String(msg)), warn: () => undefined };
  instance.prisma = {
    webscrapingSearchRun: {
      findFirst: async (args: any = {}) => (args?.include?.items ? { ...run, items: [...itens] } : { ...run }),
      findUnique: async () => ({ ...run }),
      update: async ({ data }: any) => { aplicarDados(data); return { ...run }; },
      updateMany: async ({ data }: any) => { aplicarDados(data); return { count: 1 }; },
    },
    webscrapingSearchRunItem: {
      count: async ({ where }: any = {}) => itens.filter((item) => (
        (!where?.status || item.status === where.status)
        && (!where?.source || item.source === where.source)
      )).length,
    },
  };

  // Espelho fiel do repositório real (radar-run-repository.service.ts:512-516): o patch entra por
  // cima do metricsJson bruto e chave desconhecida (rfbDrain) sobrevive — é o que torna o cursor
  // durável sem migration.
  instance.updateSearchRunMetrics = async (_runId: string, patch: any) => {
    const atual = run.metricsJson ? JSON.parse(run.metricsJson) : {};
    const { increment, ...resto } = patch || {};
    const proximo: any = { ...atual, ...resto };
    for (const [chave, valor] of Object.entries(increment || {})) {
      proximo[chave] = Number(proximo[chave] || 0) + Number(valor || 0);
    }
    run.metricsJson = JSON.stringify(proximo);
    return proximo;
  };

  instance.getRadarCnpjPublicSource = () => fonte;
  instance.searchHbxEngine = async () => {
    chamadasWeb.push({ entreguesAntes: itens.length });
    return opcoes.respostaDoMotor ? opcoes.respostaDoMotor() : respostaVaziaDoMotor();
  };

  instance.saveSearchRunResults = async (_ctx: any, _input: any, _runId: string, results: any[], source: string | null) => {
    let found = 0;
    let duplicate = 0;
    for (const result of results || []) {
      const chave = String(result?.cnpj || result?.placeId || result?.name || '');
      if (vistos.has(chave)) { duplicate += 1; continue; }
      vistos.add(chave);
      itens.push({ status: 'found', source: String(result?.source || source || ''), cnpj: result?.cnpj });
      found += 1;
    }
    run.foundCount = itens.filter((item) => item.status === 'found').length;
    return { found, duplicate, skipped: 0, invalid: 0, savedLeadIds: [], savedWebEnrichmentLeadIds: [] };
  };

  instance.getRadarResultMerger = () => ({
    mergeCanonicalRfbWithWeb: ({ rfbResults, webResults }: any) => ({
      results: [...(rfbResults || []), ...(webResults || [])],
      matchedCount: 0,
      ambiguousCount: 0,
      unmatchedWebCount: (webResults || []).length,
    }),
  });

  instance.resolveContext = () => ({ companyId: 'c1' });
  instance.isTerminalSearchRunStatus = (status: string) => ['completed', 'completed_insufficient_results', 'failed', 'canceled'].includes(String(status));
  instance.hasExplicitRequiredChannels = () => false;
  instance.getHbxRunBatchLimit = () => 10;
  instance.buildHbxBatchQueryTasks = () => [{}];
  instance.getHbxRunMaxAttempts = () => 20;
  instance.getSearchCityTargets = () => ['Valinhos'];
  instance.splitHbxBatchSegments = () => ['distribuidora de agua'];
  instance.getRequiredChannelCandidateWindow = (quantidade: number) => quantidade;
  instance.getHbxRunMaxEmptyBatches = () => 5;
  instance.getHbxRunMaxFailedBatches = () => 6;
  instance.getHbxRunMaxStalledPartialBatches = () => 5;
  instance.buildHbxBatchAttemptTask = (input: any) => ({
    input,
    query: 'distribuidora de agua Valinhos SP',
    searchScope: { currentCity: 'Valinhos', currentSegment: 'distribuidora de agua' },
  });
  instance.getHbxScrapingEngineUrl = () => 'http://motor-fake';
  instance.hasCompletedHbxMinimumCoverage = () => true;
  instance.snapshotSearchRunDedup = async () => ({ phoneDigits: new Set<string>(), websiteKeys: new Set<string>(), placeIds: new Set<string>() });
  instance.hasIntentSensitiveDiscovery = () => false;
  instance.isSocialDiscoveryQuery = () => false;
  instance.getHbxBatchTimeoutMs = () => 1_000;
  instance.getHbxSocialBatchTimeoutMs = () => 1_000;
  instance.enqueueRadarPostSaveEnrichmentForSavedLeads = async () => undefined;
  instance.recalculateSearchRunCounters = async () => ({ foundCount: run.foundCount, duplicateCount: 0, skippedCount: 0 });
  instance.syncRadarSearchRunItemsToPool = async () => undefined;
  instance.isSearchRunPausedByLimit = () => false;
  instance.persistSearchRunHistoryIfPossible = async () => undefined;
  instance.runGoogleEmergencyComplementIfEligible = async () => undefined;
  instance.logHbxBatch = () => undefined;
  instance.scheduleSearchRunPump = () => undefined;
  instance.getEnginePool = () => ({
    markEngineBatchSuccess: async () => undefined,
    markEngineBatchError: async () => undefined,
    releaseEngine: async () => undefined,
  });
  const config = new RadarSearchRunConfigService();
  instance.buildSearchRunProgressMessage = (found: number) => config.buildSearchRunProgressMessage(found);
  instance.buildSearchRunRetryMessage = (msg: string, status: number | null, found: number) => config.buildSearchRunRetryMessage(msg, status, found);
  instance.buildSearchRunFilterReviewMessage = (found: number, alvo: number) => config.buildSearchRunFilterReviewMessage(found, alvo);
  instance.buildSearchRunNoCardsMessage = (tentativas: number, query: string) => config.buildSearchRunNoCardsMessage(tentativas, query);
  instance.buildSearchRunInsufficientMessage = (found: number, tentativas: number, lanes?: any) => config.buildSearchRunInsufficientMessage(found, tentativas, lanes);
  instance.extractHbxHttpStatus = () => null;
  instance.extractHbxErrorMessage = (error: any) => String(error?.message || error);
  instance.isRetryableHbxError = () => false;

  return { instance, run, itens, logs, chamadasWeb };
}

/** Simula o pump: chama o run até o desfecho, com teto de lotes pra nunca girar em falso. */
async function rodarLotes(harness: any, maxLotes: number) {
  for (let i = 0; i < maxLotes; i += 1) {
    if (harness.instance.isTerminalSearchRunStatus(harness.run.status)) break;
    await harness.instance.processSearchRun('run-1', { id: 'u1' }, normalizadoBase());
  }
}

function comFlagDaReceita(valor: string, fn: () => Promise<void>) {
  const original = process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = valor;
  return fn().finally(() => {
    if (original === undefined) delete process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
    else process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = original;
  });
}

test('base de 86 na Receita: a base inteira sai primeiro e o motor web so entra no lote da seca', async () => {
  await comFlagDaReceita('true', async () => {
    const fonte = fonteFakeDaReceita(86, 20);
    const harness = montarRunDoLoop(fonte);

    await rodarLotes(harness, 12);

    const daReceita = harness.itens.filter((item: any) => item.source === 'cnpj_public');
    assert.equal(daReceita.length, 86, 'a Receita tinha 86 na cidade e o run precisa entregar as 86');
    assert.ok(harness.chamadasWeb.length > 0, 'depois da seca a web precisa entrar (ainda falta pra meta 100)');
    // 4 lotes de 20 SÓ Receita; no 5º ela seca, e é só aí que o motor web é chamado pela 1ª vez.
    const lotesSoReceita = harness.logs.filter((linha: string) => linha.includes('ordem=rfb ')).length;
    assert.equal(lotesSoReceita, 4, `logs de ordem=rfb: ${harness.logs.join(' | ')}`);
    assert.equal(
      harness.chamadasWeb[0].entreguesAntes,
      80,
      'as 6 ultimas da Receita viajam NO lote da seca (a fusao canonica rfb↔web precisa das duas '
      + 'lanes no mesmo lote — por isso o deferPersistence): 80 ja persistidas + 6 em voo',
    );
  });
});

test('web so depois da seca: com a Receita ainda cheia, searchHbxEngine NAO e chamado', async () => {
  await comFlagDaReceita('true', async () => {
    const fonte = fonteFakeDaReceita(86, 20);
    const harness = montarRunDoLoop(fonte);

    await harness.instance.processSearchRun('run-1', { id: 'u1' }, normalizadoBase());

    assert.equal(harness.chamadasWeb.length, 0, 'a Receita entregou e nao secou: o motor web nao pode rodar neste lote');
    assert.equal(harness.itens.length, 20, 'o lote fecha com os registros da Receita persistidos');
    assert.equal(harness.run.consecutiveEmptyBatchCount, 0, 'lote com card aprovado nunca conta como lote vazio');
    assert.ok(
      harness.logs.some((linha: string) => linha.includes('ordem=rfb ') && linha.includes('rfb_exhausted=false')),
      `o log da cadeia precisa dizer a verdade da ordem: ${harness.logs.join(' | ')}`,
    );
  });
});

test('Receita seca de cara (0 registros): a web roda no mesmo lote', async () => {
  await comFlagDaReceita('true', async () => {
    const fonte = fonteFakeDaReceita(0, 20);
    const harness = montarRunDoLoop(fonte);

    await harness.instance.processSearchRun('run-1', { id: 'u1' }, normalizadoBase());

    assert.equal(harness.chamadasWeb.length, 1, 'sem nada na Receita, a unica lane que resta e a web');
  });
});

test('erro DENTRO da fonte Receita: libera a web no mesmo lote (degrade gracioso)', async () => {
  await comFlagDaReceita('true', async () => {
    const fonte = { run: async () => { throw new Error('delegate da Receita caiu'); } };
    const harness = montarRunDoLoop(fonte);

    await harness.instance.processSearchRun('run-1', { id: 'u1' }, normalizadoBase());

    assert.equal(harness.chamadasWeb.length, 1, 'erro da Receita NUNCA pode trancar a lane web');
  });
});

test('erro no call-site da Receita: o fallback do catch marca seca e a web roda', async () => {
  await comFlagDaReceita('true', async () => {
    const harness = montarRunDoLoop(fonteFakeDaReceita(86, 20));
    // Furo do fallback: sem `exhausted: true` no `.catch`, o campo sairia `undefined` e a web
    // ficaria esperando pra sempre uma drenagem que nunca vem.
    harness.instance.runCnpjPublicSourceForClientRunIfEligible = async () => { throw new Error('explodiu antes de responder'); };

    await harness.instance.processSearchRun('run-1', { id: 'u1' }, normalizadoBase());

    assert.equal(harness.chamadasWeb.length, 1, 'falha do bloco da Receita nao pode prender a web');
  });
});

test('cursor sobrevive entre lotes: o 2o lote continua de onde o 1o parou', async () => {
  await comFlagDaReceita('true', async () => {
    const fonte = fonteFakeDaReceita(86, 20);
    const harness = montarRunDoLoop(fonte);

    await harness.instance.processSearchRun('run-1', { id: 'u1' }, normalizadoBase());
    await harness.instance.processSearchRun('run-1', { id: 'u1' }, normalizadoBase());

    assert.equal(fonte.cursoresRecebidos.length, 2);
    assert.equal(fonte.cursoresRecebidos[0], null, 'o 1o lote comeca sem cursor');
    assert.deepEqual(
      fonte.cursoresRecebidos[1],
      { phase: 'with_contact', cnpj: '20' },
      'o 2o lote tem de continuar do cursor gravado no metricsJson (senao reentrega a mesma pagina)',
    );
    assert.equal(harness.itens.length, 40, 'dois lotes, 40 empresas distintas — nenhuma repetida');
  });
});

test('estado durável: instancia NOVA (restart do backend) le o cursor do metricsJson do run', async () => {
  await comFlagDaReceita('true', async () => {
    const fonte = fonteFakeDaReceita(86, 20);
    const instance: any = new (RadarCoreSearchLoopMixin as any)();
    instance.logger = { log: () => undefined, warn: () => undefined };
    instance.updateSearchRunMetrics = async () => undefined;
    instance.getRadarCnpjPublicSource = () => fonte;
    instance.saveSearchRunResults = async (_c: any, _n: any, _r: string, results: any[]) => ({ found: results.length, duplicate: 0, skipped: 0, invalid: 0 });
    instance.enqueueRadarPostSaveEnrichmentForSavedLeads = async () => undefined;
    // O processo reiniciou: só existe o que está gravado no run.
    instance.prisma = {
      webscrapingSearchRun: {
        findUnique: async () => ({
          metricsJson: JSON.stringify({
            rfbDrain: { cursor: { phase: 'without_contact', cnpj: '40' }, exhausted: false, delivered: 40, available: null },
          }),
        }),
      },
    };

    await instance.runCnpjPublicSourceForClientRunIfEligible({ companyId: 'c1' }, normalizadoBase(), 'run-1', 60);

    assert.deepEqual(
      fonte.cursoresRecebidos[0],
      { phase: 'without_contact', cnpj: '40' },
      'sem o espelho no metricsJson o restart faria a Receita reentregar tudo desde a 1a pagina',
    );
  });
});

test('seca gravada no run: o lote seguinte nem instancia a fonte', async () => {
  await comFlagDaReceita('true', async () => {
    const fonte = fonteFakeDaReceita(86, 20);
    const instance: any = new (RadarCoreSearchLoopMixin as any)();
    instance.logger = { log: () => undefined, warn: () => undefined };
    instance.updateSearchRunMetrics = async () => undefined;
    instance.getRadarCnpjPublicSource = () => fonte;
    instance.prisma = {
      webscrapingSearchRun: {
        findUnique: async () => ({
          metricsJson: JSON.stringify({ rfbDrain: { cursor: null, exhausted: true, delivered: 86, available: 86 } }),
        }),
      },
    };

    const resultado = await instance.runCnpjPublicSourceForClientRunIfEligible({ companyId: 'c1' }, normalizadoBase(), 'run-1', 14);

    assert.equal(fonte.chamadas(), 0, 'base seca no run nao se consulta de novo');
    assert.equal(resultado.exhausted, true);
    assert.equal(resultado.ran, false);
  });
});

test('frase honesta: sem os numeros novos o texto e EXATAMENTE o de antes', () => {
  const config = new RadarSearchRunConfigService();
  const antigo = 'Busca parcial: 4 contatos encontrados. O motor tentou 8 lotes, mas nao atingiu a meta.';
  assert.equal(config.buildSearchRunInsufficientMessage(4, 8), antigo);
  assert.equal(config.buildSearchRunInsufficientMessage(4, 8, null), antigo);
  assert.equal(
    config.buildSearchRunInsufficientMessage(4, 8, { rfbDisponivel: null, rfbEntregues: null, webEntregues: null }),
    antigo,
    'numero indisponivel some da frase — nunca vira "null" na tela do dono',
  );
});

test('frase honesta: com os numeros novos cita a Receita e o que a web somou', () => {
  const config = new RadarSearchRunConfigService();
  assert.equal(
    config.buildSearchRunInsufficientMessage(15, 8, { rfbDisponivel: 86, rfbEntregues: 12, webEntregues: 3 }),
    'Busca parcial: 15 contatos encontrados. O motor tentou 8 lotes, mas nao atingiu a meta. A Receita tem 86 nessa cidade; entreguei 12; a web completou +3.',
  );
  // Count da base indisponivel (orcamento de 8s estourado): a frase degrada, nao mente.
  assert.equal(
    config.buildSearchRunInsufficientMessage(15, 8, { rfbDisponivel: null, rfbEntregues: 12, webEntregues: 3 }),
    'Busca parcial: 15 contatos encontrados. O motor tentou 8 lotes, mas nao atingiu a meta. A Receita entregou 12; a web completou +3.',
  );
});

test('frase honesta no loop: le o disponivel do metricsJson e conta as lanes pelos itens salvos', async () => {
  const config = new RadarSearchRunConfigService();
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  instance.logger = { log: () => undefined, warn: () => undefined };
  instance.updateSearchRunMetrics = async () => undefined;
  instance.buildSearchRunInsufficientMessage = (found: number, tentativas: number, lanes?: any) => config.buildSearchRunInsufficientMessage(found, tentativas, lanes);
  const itens = [
    ...Array.from({ length: 8 }, () => ({ status: 'found', source: 'cnpj_public' })),
    ...Array.from({ length: 3 }, () => ({ status: 'found', source: 'hbx' })),
    { status: 'duplicate', source: 'hbx' },
  ];
  instance.prisma = {
    webscrapingSearchRun: {
      findUnique: async () => ({
        metricsJson: JSON.stringify({ rfbDrain: { cursor: null, exhausted: true, delivered: 8, available: 86 } }),
      }),
    },
    webscrapingSearchRunItem: {
      count: async ({ where }: any) => itens.filter((item) => (
        (!where?.status || item.status === where.status) && (!where?.source || item.source === where.source)
      )).length,
    },
  };

  const mensagem = await instance.buildInsufficientMessageWithLanes('run-1', normalizadoBase(), 11, 9);

  assert.equal(
    mensagem,
    'Busca parcial: 11 contatos encontrados. O motor tentou 9 lotes, mas nao atingiu a meta. A Receita tem 86 nessa cidade; entreguei 8; a web completou +3.',
  );
});

test('frase honesta no loop: sem base e sem itens, cai na frase de sempre', async () => {
  const config = new RadarSearchRunConfigService();
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  instance.logger = { log: () => undefined, warn: () => undefined };
  instance.updateSearchRunMetrics = async () => undefined;
  instance.buildSearchRunInsufficientMessage = (found: number, tentativas: number, lanes?: any) => config.buildSearchRunInsufficientMessage(found, tentativas, lanes);
  // Sem delegate de itens e sem `cnpjBaseQuery` (ambiente que não carregou a base 28M).
  instance.prisma = { webscrapingSearchRun: { findUnique: async () => ({ metricsJson: null }) } };

  const mensagem = await instance.buildInsufficientMessageWithLanes('run-1', normalizadoBase(), 4, 8);

  assert.equal(mensagem, 'Busca parcial: 4 contatos encontrados. O motor tentou 8 lotes, mas nao atingiu a meta.');
});
