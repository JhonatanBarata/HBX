import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaOsrmService } from './logistica-osrm.service';

/**
 * 30/07 (RETRAÇO DA ROTA) — cena que originou estes testes: o dono dirigindo,
 * errou uma entrada, e a linha verde continuou apontando pro caminho antigo até
 * o fim da rota. Duas das causas moram AQUI no proxy:
 *
 *  1. o roteador não sabia pra que lado o carro estava apontado (`bearings`), e
 *     rota nova sem isso manda fazer retorno na hora;
 *  2. o teto de 30 rotas/min por EMPRESA — educação com o servidor público de
 *     demonstração — estrangulava a operação real agora que o roteador é nosso
 *     (`hbx-osrm`), derrubando o app justamente pro público que a gente parou de
 *     usar.
 *
 * Sem rede real: `fetch` global é trocado por um duble que registra as URLs.
 */

type Chamada = string;

function montarFetchFake(payload: unknown = { code: 'Ok', routes: [{ geometry: { coordinates: [] } }] }) {
  const chamadas: Chamada[] = [];
  const fake = async (url: any) => {
    chamadas.push(String(url));
    return { ok: true, json: async () => payload } as any;
  };
  return { chamadas, fake };
}

/** Troca env + fetch, roda o caso e devolve TUDO ao lugar (suíte não pode vazar estado). */
async function comAmbiente(
  baseUrl: string | undefined,
  payload: unknown,
  caso: (service: LogisticaOsrmService, chamadas: Chamada[]) => Promise<void>,
): Promise<void> {
  const envAnterior = process.env.OSRM_BASE_URL;
  const fetchAnterior = globalThis.fetch;
  const { chamadas, fake } = montarFetchFake(payload);
  if (baseUrl === undefined) delete process.env.OSRM_BASE_URL;
  else process.env.OSRM_BASE_URL = baseUrl;
  globalThis.fetch = fake as any;
  const service = new LogisticaOsrmService();
  try {
    await caso(service, chamadas);
  } finally {
    globalThis.fetch = fetchAnterior;
    if (envAnterior === undefined) delete process.env.OSRM_BASE_URL;
    else process.env.OSRM_BASE_URL = envAnterior;
  }
}

const SELF_HOST = 'http://172.18.0.1:5000';
const COORDS_2 = '-47.55,-22.4;-47.56,-22.41';
const OK = { code: 'Ok', routes: [{ geometry: { coordinates: [[0, 0], [1, 1]] } }] };

test('bearings válido chega no upstream (é o que impede a rota nova de mandar retorno)', async () => {
  await comAmbiente(SELF_HOST, OK, async (service, chamadas) => {
    await service.route(1, COORDS_2, 'true', '90,60;');
    assert.equal(chamadas.length, 1);
    assert.ok(chamadas[0].includes('bearings=90%2C60%3B'), `URL sem bearings: ${chamadas[0]}`);
  });
});

test('sem bearings a URL sai exatamente como antes desta sprint', async () => {
  await comAmbiente(SELF_HOST, OK, async (service, chamadas) => {
    await service.route(1, COORDS_2, 'false');
    assert.ok(!chamadas[0].includes('bearings'), `URL não devia ter bearings: ${chamadas[0]}`);
  });
});

test('bearings só com itens vazios não suja a URL', async () => {
  await comAmbiente(SELF_HOST, OK, async (service, chamadas) => {
    await service.route(1, COORDS_2, 'false', ';');
    assert.ok(!chamadas[0].includes('bearings'), `URL não devia ter bearings: ${chamadas[0]}`);
  });
});

test('bearings inválido é 400 e NUNCA vai pro upstream', async () => {
  const casos = [
    ['contagem diferente de coords', '90,60;;'],
    ['formato', 'norte,60;'],
    ['grau fora da faixa', '400,60;'],
    ['tolerância fora da faixa', '90,200;'],
    ['injeção de parâmetro', '90,60&exclude=motorway;'],
  ] as const;
  for (const [nome, valor] of casos) {
    await comAmbiente(SELF_HOST, OK, async (service, chamadas) => {
      await assert.rejects(
        () => service.route(1, COORDS_2, 'false', valor),
        (e: any) => e?.status === 400,
        `esperava 400 em: ${nome}`,
      );
      assert.equal(chamadas.length, 0, `upstream chamado com bearings inválido (${nome})`);
    });
  }
});

test('bearings entra na chave de cache: quem pediu sem direção não recebe o traçado com direção', async () => {
  await comAmbiente(SELF_HOST, OK, async (service, chamadas) => {
    await service.route(1, COORDS_2, 'false', '90,60;');
    await service.route(1, COORDS_2, 'false');
    assert.equal(chamadas.length, 2, 'a 2ª chamada não podia ter sido servida pelo cache da 1ª');
    await service.route(1, COORDS_2, 'false', '90,60;');
    assert.equal(chamadas.length, 2, 'repetir o MESMO pedido tinha que bater no cache');
  });
});

test('resposta NoRoute não fica guardada (cache de fracasso é pior que cache nenhum)', async () => {
  await comAmbiente(SELF_HOST, { code: 'NoRoute' }, async (service, chamadas) => {
    await service.route(1, COORDS_2, 'false', '90,60;');
    await service.route(1, COORDS_2, 'false', '90,60;');
    assert.equal(chamadas.length, 2, 'NoRoute foi cacheado — o carro vira e o "não achei" volta de graça');
  });
});

test('🔴 roteador NOSSO: 31 rotas seguidas passam (o teto de 30/min estrangulava a operação real)', async () => {
  await comAmbiente(SELF_HOST, OK, async (service, chamadas) => {
    for (let i = 0; i < 31; i++) {
      // coords diferentes a cada volta: cache hit não conta pra janela, e o que
      // se quer provar aqui é a janela, não o cache.
      await service.route(1, `-47.55,-22.4;-47.56,-22.${410 + i}`, 'false');
    }
    assert.equal(chamadas.length, 31);
  });
});

test('🔴 servidor PÚBLICO de demonstração continua travado em 30/min por empresa', async () => {
  await comAmbiente(undefined, OK, async (service, chamadas) => {
    for (let i = 0; i < 30; i++) {
      await service.route(1, `-47.55,-22.4;-47.56,-22.${410 + i}`, 'false');
    }
    await assert.rejects(
      () => service.route(1, '-47.55,-22.4;-47.56,-22.999', 'false'),
      (e: any) => e?.status === 429,
      'o público tem que continuar cortando em 30/min',
    );
    assert.equal(chamadas.length, 30);
  });
});

test('teto é POR EMPRESA: uma empresa no limite não derruba a outra', async () => {
  await comAmbiente(undefined, OK, async (service, chamadas) => {
    for (let i = 0; i < 30; i++) {
      await service.route(1, `-47.55,-22.4;-47.56,-22.${410 + i}`, 'false');
    }
    // Rota que NINGUÉM pediu ainda: o cache é compartilhado entre empresas de
    // propósito (hit é de graça, não ameaça o upstream), então reusar coords da
    // empresa 1 aqui provaria o cache, não a janela.
    await service.route(2, '-46.63,-23.55;-46.64,-23.56', 'false');
    assert.equal(chamadas.length, 31);
  });
});
