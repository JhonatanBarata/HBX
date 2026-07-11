import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AssistenteSandboxService } from './assistente-sandbox.service';
import { sanitizeAssistenteConfig, type AssistenteConfigShape } from './assistente-flow';

function makeConfig(): AssistenteConfigShape {
  return sanitizeAssistenteConfig({
    nome: 'Julia',
    tom: 'normal',
    perfil: 'vendas',
    produtos: 'planos de internet',
    empresaNome: 'NetFibra',
    fluxo: {
      passos: [
        { id: 'p1', texto: 'Ola! Aqui e a [[Seu nome]] da [[nome da empresa]]. Posso te ajudar?' },
        { id: 'p2', texto: 'Otimo! Temos [[nome da empresa]] com varios planos. Qual seu interesse?' },
      ],
      condicoes: [
        { id: 'sim', rotulo: 'Interesse', exemplos: ['quero', 'sim', 'me explica'], proximoPassoId: 'p2' },
        { id: 'nao', rotulo: 'Recusou', exemplos: ['nao quero', 'para'] },
      ],
    },
  });
}

test('sandbox: 1a mensagem abre pelo roteiro, SEM IA e SEM rede', async () => {
  const svc = new AssistenteSandboxService();
  // chat injetado que EXPLODE se for chamado — prova que a abertura nao usa IA.
  const chat = async () => {
    throw new Error('IA nao deveria ser chamada na abertura');
  };
  const res = await svc.reply(makeConfig(), [], 'oi', chat);
  assert.equal(res.source, 'roteiro');
  assert.match(res.reply, /aqui e a Julia da NetFibra/i);
  assert.equal(svc.guard.ollamaCalls, 0, 'nenhuma chamada real ao Ollama');
  assert.equal(svc.guard.realDispatchCalls, 0, 'NUNCA toca Webwhats');
});

test('sandbox: turno seguinte usa o chat INJETADO (mesmo pipeline), sem chip', async () => {
  const svc = new AssistenteSandboxService();
  const captured: Array<Array<{ role: string; content: string }>> = [];
  const chat = async (messages: Array<{ role: string; content: string }>) => {
    captured.push(messages);
    return 'Claro! Nosso plano de 500MB sai por um valor otimo. Quer que eu detalhe?';
  };
  const history = [
    { role: 'assistant' as const, content: 'Ola! Posso te ajudar?' },
  ];
  const res = await svc.reply(makeConfig(), history, 'quero saber dos planos', chat);
  assert.equal(res.source, 'ia');
  assert.match(res.reply, /plano/i);
  // o prompt-sistema foi montado e mandado como primeira msg
  assert.equal(captured.length, 1);
  assert.equal(captured[0][0].role, 'system');
  assert.match(captured[0][0].content, /Julia/);
  // few-shot casou a condicao "sim"
  assert.equal(res.matchedCondicaoId, 'sim');
  // provas anti-chip
  assert.equal(svc.guard.ollamaCalls, 0, 'usou o chat injetado, nao o fetch real');
  assert.equal(svc.guard.realDispatchCalls, 0);
});

test('sandbox: IA indisponivel cai no ROTEIRO (fallback), nunca em envio real', async () => {
  const svc = new AssistenteSandboxService();
  const chat = async () => {
    throw new Error('ollama fora do ar');
  };
  const res = await svc.reply(makeConfig(), [{ role: 'assistant', content: 'oi' }], 'quero', chat);
  assert.equal(res.source, 'fallback');
  assert.ok(res.reply.length > 0);
  assert.equal(svc.guard.realDispatchCalls, 0);
});

// ── Envs proprias do assistente (desacopladas do classificador do bot) ─────
// Pinar env no teste: host/worktree nao tem .env garantido (ver MEMORY.md).
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

test('sandbox: HBX_ASSISTENTE_MODEL setada -> usa o modelo proprio do assistente', async () => {
  await withEnv(
    {
      HBX_ASSISTENTE_MODEL: 'qwen3:4b',
      HBX_LLM_CLASSIFIER_MODEL: 'qwen2.5:7b',
    },
    async () => {
      const svc = new AssistenteSandboxService();
      const chat = async () => 'ok';
      const res = await svc.reply(
        makeConfig(),
        [{ role: 'assistant', content: 'oi' }],
        'quero',
        chat,
      );
      assert.equal(res.model, 'qwen3:4b', 'assistente deve usar HBX_ASSISTENTE_MODEL, nao a env do classificador');
    },
  );
});

test('sandbox: sem HBX_ASSISTENTE_MODEL -> cai na env do classificador do bot (fallback)', async () => {
  await withEnv(
    {
      HBX_ASSISTENTE_MODEL: undefined,
      HBX_LLM_CLASSIFIER_MODEL: 'qwen2.5:7b-classificador',
    },
    async () => {
      const svc = new AssistenteSandboxService();
      const chat = async () => 'ok';
      const res = await svc.reply(
        makeConfig(),
        [{ role: 'assistant', content: 'oi' }],
        'quero',
        chat,
      );
      assert.equal(res.model, 'qwen2.5:7b-classificador', 'sem env propria, deve cair na env do classificador');
    },
  );
});

test('sandbox: sem nenhuma env setada -> cai no default qwen2.5:7b (comportamento identico ao atual)', async () => {
  await withEnv(
    {
      HBX_ASSISTENTE_MODEL: undefined,
      HBX_LLM_CLASSIFIER_MODEL: undefined,
    },
    async () => {
      const svc = new AssistenteSandboxService();
      const chat = async () => 'ok';
      const res = await svc.reply(
        makeConfig(),
        [{ role: 'assistant', content: 'oi' }],
        'quero',
        chat,
      );
      assert.equal(res.model, 'qwen2.5:7b');
    },
  );
});

test('sandbox: HBX_ASSISTENTE_TIMEOUT_MS setada -> defaultOllamaChat usa o timeout e o model proprios (mock de fetch, sem rede)', async () => {
  await withEnv(
    {
      HBX_ASSISTENTE_TIMEOUT_MS: '5000',
      HBX_LLM_CLASSIFIER_TIMEOUT_MS: '9999',
      HBX_ASSISTENTE_MODEL: 'qwen3:4b',
      HBX_LLM_CLASSIFIER_MODEL: 'qwen2.5:7b',
      HBX_LLM_CLASSIFIER_ENABLED: 'true',
    },
    async () => {
      const originalFetch = global.fetch;
      let capturedBody: any = null;
      let capturedSignal: AbortSignal | undefined;
      (global as any).fetch = async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        capturedSignal = init.signal;
        return {
          ok: true,
          status: 200,
          json: async () => ({ message: { content: 'resposta via fetch mockado' } }),
        };
      };
      try {
        const svc = new AssistenteSandboxService();
        // Sem `chat` injetado -> cai no defaultOllamaChat (fetch mockado acima).
        const res = await svc.reply(makeConfig(), [{ role: 'assistant', content: 'oi' }], 'quero');
        assert.equal(res.source, 'ia');
        assert.equal(capturedBody?.model, 'qwen3:4b', 'defaultOllamaChat deve usar HBX_ASSISTENTE_MODEL');
        assert.ok(capturedSignal, 'deve montar um AbortSignal a partir do timeout proprio do assistente');
      } finally {
        (global as any).fetch = originalFetch;
      }
    },
  );
});

// ── PROVA ESTATICA: o modulo do sandbox NAO importa Webwhats/Conversations/Messaging.
// Se alguem soldar um envio real aqui, este teste quebra. Le a FONTE .ts (o teste
// roda de dist/, entao sobe ate a raiz do backend e desce em src/assistente).
test('sandbox: fonte NAO referencia Webwhats/Conversations/Messaging/socket', () => {
  const srcDir = join(__dirname, '..', '..', 'src', 'assistente');
  const files = [
    'assistente-sandbox.service.ts',
    'assistente.service.ts',
    'assistente.controller.ts',
    'assistente.module.ts',
    'assistente-flow.ts',
    'assistente-seeds.ts',
    // COPILOTO (LEADS-FINAL/05) + o cliente Ollama compartilhado: mesma lei —
    // geram texto, NUNCA tocam o chip.
    'assistente-ollama.ts',
    'copiloto.service.ts',
    'copiloto.controller.ts',
  ];
  const proibidos = [
    /ConversationsService/,
    /MessagingModule/,
    /queueOutbound/i,
    /webwhats/i,
    /evolution/i,
    /\/instance\//i,
    /baileys/i,
  ];
  // Remove COMENTARIOS antes de checar — a doc explica POR QUE nao toca o chip
  // (cita esses nomes de proposito). O que nao pode existir e no CODIGO real.
  const stripComments = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, '') // blocos /* ... */
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '')) // linha //
      .join('\n');

  for (const f of files) {
    const code = stripComments(readFileSync(join(srcDir, f), 'utf8'));
    for (const re of proibidos) {
      assert.equal(
        re.test(code),
        false,
        `${f} nao pode referenciar ${re} no codigo (o sandbox NUNCA toca chip)`,
      );
    }
  }
});
