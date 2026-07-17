import test from 'node:test';
import assert from 'node:assert/strict';
import { AiSaneamentoService } from './ai-saneamento.service';

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
};

function createResponse(status: number, body: any): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function withFetch(impl: typeof global.fetch, run: () => Promise<void>) {
  const previous = global.fetch;
  global.fetch = impl;
  return run().finally(() => {
    global.fetch = previous;
  });
}

test('saneiaComNota devolve nome_limpo + segmento + nota + razao quando Ollama responde OK', async () => {
  await withFetch(async () => createResponse(200, {
    message: { content: JSON.stringify({ nome_limpo: 'Padaria Real', segmento: 'Padaria', nota: 9, razao: 'Nome comercial claro' }) },
  }) as any, async () => {
    const service = new AiSaneamentoService();
    const result = await service.saneiaComNota({ name: 'PADARIA REAL LTDA ME - matriz' });
    assert.equal(result.ok, true);
    assert.equal(result.nomeLimpo, 'Padaria Real');
    assert.equal(result.segmento, 'Padaria');
    assert.equal(result.nota, 9);
    assert.equal(result.razao, 'Nome comercial claro');
  });
});

test('saneiaComNota clampa nota fora do range 0-10', async () => {
  await withFetch(async () => createResponse(200, {
    message: { content: JSON.stringify({ nome_limpo: 'X', segmento: 'Y', nota: 999, razao: 'z' }) },
  }) as any, async () => {
    const service = new AiSaneamentoService();
    const result = await service.saneiaComNota({ name: 'Lixo Generico' });
    assert.equal(result.nota, 10);
  });
});

test('saneiaComNota usa sempre qwen3:4b-instruct mesmo se a env legada apontar outro modelo', async () => {
  const previous = process.env.HBX_AI_SANEAMENTO_MODEL;
  process.env.HBX_AI_SANEAMENTO_MODEL = 'modelo-legado-nao-permitido';
  let requestedModel = '';
  try {
    await withFetch(async (_url, init) => {
      requestedModel = JSON.parse(String(init?.body || '{}')).model;
      return createResponse(200, {
        message: { content: JSON.stringify({ nome_limpo: 'Empresa', segmento: 'Serviços', nota: 8, razao: 'ok' }) },
      }) as any;
    }, async () => {
      const result = await new AiSaneamentoService().saneiaComNota({ name: 'Empresa' });
      assert.equal(result.ok, true);
    });
    assert.equal(requestedModel, 'qwen3:4b-instruct');
  } finally {
    if (previous === undefined) delete process.env.HBX_AI_SANEAMENTO_MODEL;
    else process.env.HBX_AI_SANEAMENTO_MODEL = previous;
  }
});

test('saneiaComNota degrada gracioso quando Ollama responde HTTP nao-ok (nunca lanca)', async () => {
  await withFetch(async () => createResponse(500, {}) as any, async () => {
    const service = new AiSaneamentoService();
    const result = await service.saneiaComNota({ name: 'Empresa Teste' });
    assert.equal(result.ok, false);
    assert.equal(result.nota, null);
    assert.equal(result.nomeLimpo, null);
  });
});

test('saneiaComNota degrada gracioso quando JSON e invalido', async () => {
  await withFetch(async () => createResponse(200, { message: { content: 'nao e json' } }) as any, async () => {
    const service = new AiSaneamentoService();
    const result = await service.saneiaComNota({ name: 'Empresa Teste' });
    assert.equal(result.ok, false);
  });
});

test('saneiaComNota degrada gracioso quando fetch lanca (Ollama offline) — nunca joga excecao pra cima', async () => {
  await withFetch(async () => {
    throw new Error('ECONNREFUSED');
  }, async () => {
    const service = new AiSaneamentoService();
    const startedAt = Date.now();
    const result = await service.saneiaComNota({ name: 'Empresa Teste' });
    assert.equal(result.ok, false);
    // Cobre o retry 1x com backoff (~1500ms) sem estourar timeout do teste.
    assert.ok(Date.now() - startedAt >= 1000);
  });
});

test('saneiaComNota devolve ok:false para nome vazio sem chamar rede', async () => {
  let called = false;
  await withFetch(async () => {
    called = true;
    return createResponse(200, {}) as any;
  }, async () => {
    const service = new AiSaneamentoService();
    const result = await service.saneiaComNota({ name: '   ' });
    assert.equal(result.ok, false);
    assert.equal(called, false);
  });
});

test('saneia() (contrato antigo, worker manual/batch) continua sem campo nota — nao regrediu', async () => {
  await withFetch(async () => createResponse(200, {
    message: { content: JSON.stringify({ nome_limpo: 'Auto Pecas Silva', segmento: 'Autopecas' }) },
  }) as any, async () => {
    const service = new AiSaneamentoService();
    const result: any = await service.saneia({ name: 'AUTO PECAS SILVA EIRELI - (85) 3222-1100' });
    assert.equal(result.ok, true);
    assert.equal(result.nomeLimpo, 'Auto Pecas Silva');
    assert.equal(result.segmento, 'Autopecas');
    assert.equal(result.nota, undefined);
  });
});
