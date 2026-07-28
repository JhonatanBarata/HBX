import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarWebEnrichmentService } from './radar-web-enrichment.service';

// F4 REFUNDAÇÃO (28/07): ordem do dinheiro em searchWeb — GRÁTIS primeiro (bing→ddg),
// Brave (pago) por ÚLTIMO e só quando o grátis voltou vazio. A ordem antiga (Brave 1º em
// toda query) estourou os 900/mês com ddg fechando o mês em ZERO chamadas.

function resetEmergencyStopCache() {
  (RadarWebEnrichmentService as any)._emergencyStopCache = { value: false, checkedAt: 0 };
}

const BING_HTML_COM_RESULTADO = `
<ol>
<li class="b_algo"><a href="https://distribuidoraexemplo.com.br">Distribuidora Exemplo</a><p>Água mineral em Aguaí</p></li>
</ol>`;

test('searchWeb: bing com resultado → Brave (pago) NUNCA é consultado, mesmo com chave', async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = 'chave-de-teste';
  resetEmergencyStopCache();
  const urls: string[] = [];
  const fetcher = (async (url: any) => {
    urls.push(String(url));
    if (String(url).includes('bing.com')) {
      return { ok: true, text: async () => BING_HTML_COM_RESULTADO } as any;
    }
    throw new Error(`fonte inesperada consultada: ${url}`);
  }) as unknown as typeof fetch;

  try {
    const service = new RadarWebEnrichmentService();
    const result = await (service as any).searchWeb(fetcher, 'distribuidora de agua aguai', 3000);
    assert.equal(result.length, 1);
    assert.equal(result[0].url, 'https://distribuidoraexemplo.com.br/');
    assert.equal(urls.length, 1, 'apenas 1 fonte consultada');
    assert.match(urls[0], /bing\.com/, 'a primeira fonte é o bing (grátis)');
    assert.equal(urls.some((u) => u.includes('brave')), false, 'Brave não pode ser chamado com o grátis resolvendo');
  } finally {
    resetEmergencyStopCache();
    if (previousBraveKey !== undefined) process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
    else delete process.env.BRAVE_SEARCH_API_KEY;
  }
});

test('searchWeb: bing e ddg vazios → ddg é tentado ANTES de qualquer pago (fim do "ddg virgem")', async () => {
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY; // sem chave: cadeia termina no grátis
  resetEmergencyStopCache();
  const urls: string[] = [];
  const fetcher = (async (url: any) => {
    urls.push(String(url));
    return { ok: true, text: async () => '<html></html>' } as any;
  }) as unknown as typeof fetch;

  try {
    const service = new RadarWebEnrichmentService();
    const result = await (service as any).searchWeb(fetcher, 'distribuidora de agua aguai', 3000);
    assert.deepEqual(result, []);
    assert.equal(urls.length, 2, 'bing e ddg consultados');
    assert.match(urls[0], /bing\.com/);
    assert.match(urls[1], /duckduckgo\.com/, 'ddg entra na fila quando o bing não resolve');
  } finally {
    resetEmergencyStopCache();
    if (previousBraveKey !== undefined) process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});
