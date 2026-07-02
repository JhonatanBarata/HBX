import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarWebEnrichmentService } from './radar-web-enrichment.service';

// P1 (02/07 — docs/PLANEJAMENTOS/PR02072026/W1-cutover-ordem-fixa.md), tarefa 5: "PARAR corta
// ddg/bing". O gate `emergencyStop` (Sprint 1 MOTOR-RFB-FILA) já congelava o Brave dentro de
// `searchBrave`; searchWeb (bing->ddg) NÃO estava coberto. Fix: 1 checagem no topo de
// `searchWeb` — único ponto de entrada do fallback bing/ddg deste serviço — cobre os dois.
//
// Injeta o cache estático diretamente (mesmo furo de teste usado em
// source-budget.service.test.ts para _counterDb): força emergencyStop=true sem tocar Prisma.

function forceEmergencyStop(value: boolean) {
  (RadarWebEnrichmentService as any)._emergencyStopCache = { value, checkedAt: Date.now() };
}

function resetEmergencyStopCache() {
  (RadarWebEnrichmentService as any)._emergencyStopCache = { value: false, checkedAt: 0 };
}

test('searchWeb com emergencyStop ativo: devolve [] sem chamar fetch (bing/ddg cortados junto com o Brave)', async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  forceEmergencyStop(true);
  let fetchCalled = false;
  const fetcher = (async () => {
    fetchCalled = true;
    throw new Error('fetch nao deveria ser chamado com o PARAR ativo');
  }) as unknown as typeof fetch;

  try {
    const service = new RadarWebEnrichmentService();
    const result = await (service as any).searchWeb(fetcher, 'barbearia fortaleza whatsapp', 3000);
    assert.deepEqual(result, []);
    assert.equal(fetchCalled, false, 'nem bing nem ddg deveriam disparar fetch com o PARAR ativo');
  } finally {
    resetEmergencyStopCache();
    if (previousBraveKey !== undefined) process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});

test('searchWeb com emergencyStop inativo: segue o fluxo normal (bing tentado)', async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  forceEmergencyStop(false);
  let fetchCalled = false;
  const fetcher = (async () => {
    fetchCalled = true;
    return {
      ok: true,
      text: async () => '<html></html>',
    } as any;
  }) as unknown as typeof fetch;

  try {
    const service = new RadarWebEnrichmentService();
    await (service as any).searchWeb(fetcher, 'barbearia fortaleza whatsapp', 3000);
    assert.equal(fetchCalled, true, 'sem PARAR ativo, o fallback bing deveria tentar a chamada normalmente');
  } finally {
    resetEmergencyStopCache();
    if (previousBraveKey !== undefined) process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});
