import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaGeoService } from './logistica-geo.service';

/**
 * 🔴 01/08 — BUSCA DO MODO VIAGEM. Ordem do dono depois do teste de rota ao vivo:
 * "modo viagem tá tudo bugado... não acha nada perto de mim direito".
 *
 * Os três defeitos que estes testes travam:
 *   1. FALHA CACHEADA POR 1 HORA — `[]` vindo de um 429 do Nominatim (trivial enquanto
 *      se digita, o público aceita 1 req/s) era guardado como se fosse resposta boa.
 *      Um único erro matava aquele termo pelo resto do dia. Falha NÃO entra em cache.
 *   2. PERTO SÓ COM FRASE MÁGICA — o raio só apertava se o texto contivesse "perto de
 *      mim"/"próximo". Com posição conhecida, perto é o PADRÃO; a busca só se abre
 *      quando o raio curto não devolve nada.
 *   3. "NÃO EXISTE" = "NÃO RESPONDEU" — as duas viravam lista vazia e a tela ficava
 *      em branco sem explicar. Agora vem `status`.
 *
 * Sem rede: o `fetch` global é trocado por um dublê em cada teste.
 */

const CENTRO = { lat: -22.4229, lng: -47.5862 }; // Jd. Nova Veneza, Rio Claro/SP

function respostaOk(rows: unknown[]) {
  return { ok: true, status: 200, json: async () => rows } as unknown as Response;
}
function resposta429() {
  return { ok: false, status: 429, json: async () => [] } as unknown as Response;
}
function lugar(nome: string, lat: number, lng: number) {
  return { name: nome, display_name: `${nome}, Rio Claro, São Paulo`, lat: String(lat), lon: String(lng) };
}

async function comFetch<T>(dubles: Array<() => Response>, fn: (svc: LogisticaGeoService, urls: string[]) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const urls: string[] = [];
  let i = 0;
  process.env.HBX_GEO_SERVER_ENABLED = 'true';
  globalThis.fetch = (async (url: any) => {
    urls.push(String(url));
    const proximo = dubles[Math.min(i, dubles.length - 1)];
    i += 1;
    return proximo();
  }) as typeof fetch;
  try {
    return await fn(new LogisticaGeoService(), urls);
  } finally {
    globalThis.fetch = original;
  }
}

test('busca: com posição conhecida a PRIMEIRA tentativa é colada na pessoa (bounded=1)', async () => {
  await comFetch([() => respostaOk([lugar('Padaria Perto', -22.4231, -47.5859)])], async (svc, urls) => {
    const r = await svc.busca('padaria', CENTRO.lat, CENTRO.lng);
    assert.equal(r.status, 'ok');
    assert.equal(r.items.length, 1);
    assert.ok(urls[0].includes('bounded=1'), `a 1ª busca tem que ser limitada ao redor: ${urls[0]}`);
    assert.ok(urls[0].includes('viewbox='), 'sem viewbox não existe "perto"');
  });
});

test('busca: sem a frase "perto de mim" continua valendo perto (o padrão não é o texto, é o GPS)', async () => {
  await comFetch([() => respostaOk([lugar('Mercado', -22.4235, -47.5866)])], async (svc, urls) => {
    const r = await svc.busca('mercado', CENTRO.lat, CENTRO.lng);
    assert.equal(r.status, 'ok');
    assert.ok(urls[0].includes('bounded=1'), 'a frase mágica não pode ser requisito');
  });
});

test('busca: raio curto vazio → ABRE a busca numa segunda ida (e só numa)', async () => {
  const dubles = [() => respostaOk([]), () => respostaOk([lugar('Atacadão', -22.418, -47.58)])];
  await comFetch(dubles, async (svc, urls) => {
    const r = await svc.busca('atacadao', CENTRO.lat, CENTRO.lng);
    assert.equal(r.status, 'ok');
    assert.equal(r.items.length, 1);
    assert.equal(urls.length, 2, 'no máximo 2 idas — o Nominatim público aceita 1 req/s');
    assert.ok(urls[0].includes('bounded=1'));
    assert.ok(!urls[1].includes('bounded=1'), 'a 2ª ida é a que abre o raio');
  });
});

test('busca: 429 do Nominatim tenta de novo e, se insistir, devolve INDISPONIVEL (não "vazio")', async () => {
  await comFetch([resposta429], async (svc, urls) => {
    const r = await svc.busca('padaria', CENTRO.lat, CENTRO.lng);
    assert.equal(r.status, 'indisponivel', '"não respondeu" não pode virar "não existe"');
    assert.equal(r.items.length, 0);
    assert.ok(urls.length >= 2, 'um 429 merece uma segunda chance');
  });
});

test('🔴 busca: FALHA NUNCA É CACHEADA — o termo não pode morrer por causa de um 429', async () => {
  const original = globalThis.fetch;
  process.env.HBX_GEO_SERVER_ENABLED = 'true';
  let chamada = 0;
  globalThis.fetch = (async () => {
    chamada += 1;
    // As primeiras (a tentativa + o retry) falham; depois o Nominatim volta ao normal.
    if (chamada <= 2) return resposta429();
    return respostaOk([lugar('Padaria Claret', -22.4231, -47.5859)]);
  }) as typeof fetch;
  try {
    const svc = new LogisticaGeoService();
    const primeira = await svc.busca('padaria', CENTRO.lat, CENTRO.lng);
    assert.equal(primeira.status, 'indisponivel');

    // MESMO termo, MESMA posição: antes, o `[]` da falha ficava 1h no cache e esta
    // segunda busca voltava vazia sem nem tentar. Agora tem que ir na rede de novo.
    const segunda = await svc.busca('padaria', CENTRO.lat, CENTRO.lng);
    assert.equal(segunda.status, 'ok', 'a falha anterior não pode envenenar o termo');
    assert.equal(segunda.items.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('busca: resultado BOM é cacheado (não martela o Nominatim com a mesma digitação)', async () => {
  await comFetch([() => respostaOk([lugar('Padaria Claret', -22.4231, -47.5859)])], async (svc, urls) => {
    await svc.busca('padaria', CENTRO.lat, CENTRO.lng);
    await svc.busca('padaria', CENTRO.lat, CENTRO.lng);
    assert.equal(urls.length, 1, 'a segunda igual sai do cache');
  });
});

test('busca: resposta vazia de verdade é "vazio", e vem ordenada por distância', async () => {
  await comFetch([() => respostaOk([])], async (svc) => {
    const r = await svc.busca('naoexistenada', CENTRO.lat, CENTRO.lng);
    assert.equal(r.status, 'vazio');
    assert.deepEqual(r.items, []);
  });

  await comFetch(
    [
      () =>
        respostaOk([
          lugar('Longe', -22.46, -47.62),
          lugar('Colado', -22.4231, -47.5859),
          lugar('Meio', -22.44, -47.6),
        ]),
    ],
    async (svc) => {
      const r = await svc.busca('padaria', CENTRO.lat, CENTRO.lng);
      assert.deepEqual(r.items.map((i) => i.nome), ['Colado', 'Meio', 'Longe']);
      assert.ok((r.items[0].distanciaM ?? 1e9) < (r.items[1].distanciaM ?? 0));
    },
  );
});
