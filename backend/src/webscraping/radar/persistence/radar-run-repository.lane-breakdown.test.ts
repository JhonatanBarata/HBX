import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarRunRepositoryService } from './radar-run-repository.service';

// LOTE 4 (17/08 — PR17082026-FAXINA-DA-BUSCA-RFB-PRIMEIRO): "o relatório para de mentir".
// A cena que o dono viu: 6 cidades, 4 cards, e nenhuma tela dizendo de ONDE veio cada card nem
// quais cidades voltaram vazias. Aqui mora a metade de baixo do conserto — o breakdown por lane
// nasce do banco (card SALVO, não candidato oferecido) e sobrevive no metricsJson SEM MIGRATION.
// Fakes in-memory, sem banco/DI real (mesmo estilo do radar-search-session.service.test.ts).

type Row = Record<string, any>;

function makeFakePrisma(items: Row[], runSeed: Row = {}) {
  const run: Row = { id: 'run-1', foundCount: 0, metricsJson: null, startedAt: null, finishedAt: null, status: 'running', ...runSeed };
  return {
    run,
    updates: [] as Row[],
    webscrapingSearchRun: {
      async findUnique({ where }: any) {
        return where?.id === run.id ? { ...run } : null;
      },
      async update({ where, data }: any) {
        if (where?.id !== run.id) throw new Error('run_not_found');
        Object.assign(run, data);
        return { ...run };
      },
    },
    webscrapingSearchRunItem: {
      async findMany({ where, select }: any) {
        // O fake respeita o `select` de propósito: se a produção esquecer de pedir `source`,
        // o teste vê `undefined` e a lane cai em "outros" — é assim que ele pega o esquecimento.
        return items
          .filter((row) => row.runId === where.runId)
          .map((row) => {
            const projected: Row = {};
            for (const key of Object.keys(select || { status: true })) projected[key] = row[key];
            return projected;
          });
      },
    },
  };
}

test('recalculateCounters separa Receita, web e "outros" contando CARD SALVO', async () => {
  const prisma = makeFakePrisma([
    // A Receita é canônica na fusão: item fundido rfb↔web continua com source cnpj_public.
    { runId: 'run-1', status: 'found', source: 'cnpj_public' },
    { runId: 'run-1', status: 'found', source: 'cnpj_public' },
    { runId: 'run-1', status: 'found', source: 'cnpj_public' },
    // Rótulos REAIS que o motor Python emite — o mapa único é quem sabe que isto é web.
    { runId: 'run-1', status: 'found', source: 'hbx_scraping:free_pj' },
    { runId: 'run-1', status: 'found', source: 'hbx_agenda:web' },
    // Duplicata NÃO é card salvo: não pode inflar lane nenhuma.
    { runId: 'run-1', status: 'duplicate', source: 'hbx_scraping:web' },
    // Sem source (e `radar_database`/`company_history`): banco relembra, não descobre.
    { runId: 'run-1', status: 'found', source: null },
    // Outro run na mesma tabela: nunca atravessa.
    { runId: 'run-2', status: 'found', source: 'cnpj_public' },
  ]);
  const repo = new RadarRunRepositoryService(prisma as any);

  const counters = await repo.recalculateCounters('run-1');

  assert.equal(counters.foundCount, 6);
  assert.equal(counters.duplicateCount, 1);
  assert.deepEqual(counters.laneBreakdown, { rfb: 3, web: 2, outros: 1 });
  // rfb + web MENOR que foundCount é o comportamento correto: o total que a tela mostra é
  // sempre o foundCount, e "outros" fica fora da copy.
  assert.ok(counters.laneBreakdown.rfb + counters.laneBreakdown.web < counters.foundCount);
});

test('run sem nenhum item: breakdown zerado, nunca undefined (a tela precisa do número)', async () => {
  const prisma = makeFakePrisma([]);
  const repo = new RadarRunRepositoryService(prisma as any);

  const counters = await repo.recalculateCounters('run-1');

  assert.equal(counters.foundCount, 0);
  assert.deepEqual(counters.laneBreakdown, { rfb: 0, web: 0, outros: 0 });
});

test('SEM MIGRATION: laneBreakdown gravado sobrevive a um patch que nem menciona a chave', async () => {
  const prisma = makeFakePrisma([], {
    metricsJson: JSON.stringify({ radiusKm: 100, laneBreakdown: { rfb: 3, web: 2, outros: 1 } }),
  });
  const repo = new RadarRunRepositoryService(prisma as any);

  const next: any = await repo.updateMetrics('run-1', { status: 'running', increment: { parsedContacts: 2 } } as any);

  // É esta a prova de que o campo não precisa de coluna: o `...rawMetrics` do merge devolve a
  // chave desconhecida, e o patch só reescreve o que ele mesmo trouxe.
  assert.deepEqual(next.laneBreakdown, { rfb: 3, web: 2, outros: 1 });
  assert.equal(next.radiusKm, 100);
  assert.equal(next.parsedContacts, 2);
  assert.deepEqual(JSON.parse(prisma.run.metricsJson).laneBreakdown, { rfb: 3, web: 2, outros: 1 });
});

test('o Lote 2 e o Lote 4 dividem o mesmo metricsJson sem se apagarem', async () => {
  const prisma = makeFakePrisma([], {
    metricsJson: JSON.stringify({ rfbDrain: { cursor: null, exhausted: true, delivered: 8, available: 86 } }),
  });
  const repo = new RadarRunRepositoryService(prisma as any);

  await repo.updateMetrics('run-1', { laneBreakdown: { rfb: 8, web: 3, outros: 0 } } as any);
  const gravado = JSON.parse(prisma.run.metricsJson);

  // Namespaces combinados: a drenagem da Receita (Lote 2) e as lanes (Lote 4) convivem — se um
  // sobrescrevesse o outro, a frase honesta e o relatório por cidade brigariam na tela.
  assert.equal(gravado.rfbDrain.available, 86);
  assert.equal(gravado.rfbDrain.exhausted, true);
  assert.deepEqual(gravado.laneBreakdown, { rfb: 8, web: 3, outros: 0 });
});
