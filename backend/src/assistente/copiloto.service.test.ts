import test from 'node:test';
import assert from 'node:assert/strict';

import { CopilotoService } from './copiloto.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';

// Pinar env (host/worktree nao tem .env garantido — ver MEMORY.md).
function withEnv(vars: Record<string, string | undefined>, run: () => Promise<void> | void) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) prev[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

// Mocka o Ollama LOCAL (global.fetch) — devolve `content` e conta as chamadas
// pra provar que NAO ha retry automatico.
function withOllama(content: string, run: (counter: { calls: number }) => Promise<void> | void) {
  const counter = { calls: 0 };
  const originalFetch = global.fetch;
  (global as any).fetch = async () => {
    counter.calls += 1;
    return { ok: true, status: 200, json: async () => ({ message: { content } }) };
  };
  return Promise.resolve(run(counter)).finally(() => {
    (global as any).fetch = originalFetch;
  });
}

const USER = { companyId: 7 };
const AI_ON = { HBX_LLM_CLASSIFIER_ENABLED: 'true', HBX_COPILOTO_ENABLED: undefined as string | undefined };

test('copiloto: flag OFF -> disabled, sem tocar a IA', async () => {
  await withEnv({ HBX_COPILOTO_ENABLED: 'false' }, async () => {
    let called = false;
    const originalFetch = global.fetch;
    (global as any).fetch = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    try {
      const svc = new CopilotoService();
      assert.equal(svc.enabled, false);
      const res = await svc.rascunho(USER, { mensagens: [], ficha: { nome: 'Padaria X' } });
      assert.equal(res.ok, false);
      assert.equal((res as any).disabled, true);
      assert.equal(called, false, 'flag OFF nao pode chamar a IA');
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});

test('copiloto: rascunho com JSON valido -> ok, texto limpo', async () => {
  AiGatewayService.resetForTest();
  await withEnv(AI_ON, () =>
    withOllama('{"rascunho":"Oi! Aqui é da NetFibra, posso te ajudar?"}', async (counter) => {
      const svc = new CopilotoService();
      const res = await svc.rascunho(USER, {
        mensagens: [{ direcao: 'lead', texto: 'quero saber dos planos' }],
        ficha: { nome: 'NetFibra', cnae: 'Provedor de internet' },
      });
      assert.equal(res.ok, true);
      assert.equal((res as any).kind, 'rascunho');
      assert.match((res as any).rascunho, /NetFibra/);
      assert.equal(counter.calls, 1, '1 clique = 1 chamada');
    }),
  );
});

test('copiloto: JSON malformado -> erro gracioso, SEM retry', async () => {
  AiGatewayService.resetForTest();
  await withEnv(AI_ON, () =>
    withOllama('desculpa, nao consegui formatar isso como json', async (counter) => {
      const svc = new CopilotoService();
      const res = await svc.rascunho(USER, { mensagens: [{ direcao: 'lead', texto: 'oi' }], ficha: {} });
      assert.equal(res.ok, false);
      assert.equal((res as any).disabled, undefined);
      assert.ok((res as any).error);
      assert.equal(counter.calls, 1, 'malformado NAO dispara retry automatico');
    }),
  );
});

test('copiloto: resumo extrai bullets (3-5) e ignora vazios', async () => {
  AiGatewayService.resetForTest();
  await withEnv(AI_ON, () =>
    withOllama('```json\n{"bullets":["Pediu orçamento","Tem urgência","",""]}\n```', async () => {
      const svc = new CopilotoService();
      const res = await svc.resumo(USER, {
        mensagens: [
          { direcao: 'lead', texto: 'preciso de um orçamento urgente' },
          { direcao: 'voce', texto: 'claro, te mando hoje' },
        ],
        ficha: { nome: 'Padaria X' },
      });
      assert.equal(res.ok, true);
      assert.deepEqual((res as any).bullets, ['Pediu orçamento', 'Tem urgência']);
    }),
  );
});

test('copiloto: resumo sem conversa -> erro gracioso, sem tocar IA', async () => {
  let called = false;
  const originalFetch = global.fetch;
  (global as any).fetch = async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };
  try {
    await withEnv(AI_ON, async () => {
      const svc = new CopilotoService();
      const res = await svc.resumo(USER, { mensagens: [], ficha: {} });
      assert.equal(res.ok, false);
      assert.equal(called, false, 'sem conversa nem chama o modelo');
    });
  } finally {
    (global as any).fetch = originalFetch;
  }
});

test('copiloto: sugestao clampa prazoDias e valida tipo', async () => {
  AiGatewayService.resetForTest();
  await withEnv(AI_ON, () =>
    withOllama('{"titulo":"Ligar para fechar","prazoDias":999,"tipo":"telepatia","motivo":"pediu orçamento"}', async () => {
      const svc = new CopilotoService();
      const res = await svc.sugestao(USER, {
        mensagens: [{ direcao: 'lead', texto: 'me liga depois' }],
        ficha: { nome: 'Padaria X' },
      });
      assert.equal(res.ok, true);
      assert.equal((res as any).prazoDias, 30, 'prazo > 30 é clampado');
      assert.equal((res as any).tipo, 'ligacao', 'tipo fora da whitelist vira ligacao');
      assert.equal((res as any).titulo, 'Ligar para fechar');
    }),
  );
});
