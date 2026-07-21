import test from 'node:test';
import assert from 'node:assert/strict';

// S05 (MOTOR-ÚNICO) — testes unit do AgentService (adapter GET/PUT/sandbox/
// publish do Atendente sobre AssistenteConfig + BotConfig(atendimento_bot)).
// Mesmo estilo dos vizinhos da pasta (node:test + mocks manuais,
// `Object.create(Service.prototype)` — ver automation-overview.service.
// test.ts): instancia SEM DI real, injeta os services fonte como
// propriedades. Cobre os critérios de aceite da S05.md: (1) view monta dos 2
// stores, (2) PUT roteia pro store certo por campo, (3) publish respeita o
// pino (propaga o erro do gate em vez de engolir), (4) sandbox roteiro
// responde sem rede, (5) PUT sem canManage -> 403.

import { AgentService, resolveAgentBrain, replayRoteiroSandbox } from './agent.service';
import { DEFAULT_ATENDIMENTO_BOT_CONFIG } from '../inbox/atendimento-config';

function adminUser(companyId = 7) {
  return { id: 1, companyId, role: 'ADMIN' };
}
function sellerUser(companyId = 7) {
  return { id: 2, companyId, role: 'USER' };
}

function assistenteFixture(overrides: any = {}) {
  return {
    id: 'assist-1',
    nome: 'Bia',
    tom: 'normal',
    perfil: 'vendas',
    produtos: 'Água mineral',
    empresaNome: 'Empresa Teste',
    fluxo: { entradaPassoId: 'p1', passos: [{ id: 'p1', tipo: 'mensagem', texto: 'Oi!' }], condicoes: [] },
    published: false,
    testCounter: 0,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-15T10:00:00.000Z',
    ...overrides,
  };
}

type Deps = {
  assistente?: any;
  roteiroVersions?: Array<{ version: number; updatedByUserId: number | null; createdAt: Date }>;
  activation?: any;
  botConfig?: any;
  updateBotConfigImpl?: (user: any, payload: unknown) => Promise<any>;
  saveAssistenteImpl?: (user: any, dto: unknown) => Promise<any>;
  publishAssistenteImpl?: (user: any, on: boolean) => Promise<any>;
  putActivationImpl?: (user: any, body: any) => Promise<any>;
  runSandboxImpl?: (user: any, dto: any) => Promise<any>;
};

type Calls = {
  saveAssistente: number;
  updateBotConfig: number;
  publishAssistente: number;
  putActivation: number;
  runSandbox: number;
  getBotConfig: number;
};

function makeService(deps: Deps = {}): { svc: AgentService; calls: Calls } {
  const calls: Calls = {
    saveAssistente: 0,
    updateBotConfig: 0,
    publishAssistente: 0,
    putActivation: 0,
    runSandbox: 0,
    getBotConfig: 0,
  };

  const svc: any = Object.create(AgentService.prototype);
  svc.logger = { log() {}, warn() {}, error() {}, debug() {} };

  svc.assistenteService = {
    get: async () => ({ ok: true, publishEnabled: true, assistente: deps.assistente ?? null }),
    save: async (user: any, dto: any) => {
      calls.saveAssistente += 1;
      return deps.saveAssistenteImpl
        ? deps.saveAssistenteImpl(user, dto)
        : { ok: true, assistente: { ...assistenteFixture(), ...dto, published: false } };
    },
    publish: async (user: any, on: boolean) => {
      calls.publishAssistente += 1;
      return deps.publishAssistenteImpl
        ? deps.publishAssistenteImpl(user, on)
        : { ok: true, published: on, publishEnabled: true };
    },
    runSandbox: async (user: any, dto: any) => {
      calls.runSandbox += 1;
      return deps.runSandboxImpl
        ? deps.runSandboxImpl(user, dto)
        : {
            ok: true,
            testNumber: 1,
            dispatched: false,
            channel: 'sandbox',
            reply: 'resposta da IA',
            source: 'roteiro',
            matchedCondicaoId: null,
            model: 'qwen2.5:7b',
            latencyMs: 12,
          };
    },
  };

  svc.inboxService = {
    getBotConfig: async () => {
      calls.getBotConfig += 1;
      return deps.botConfig ?? { ...DEFAULT_ATENDIMENTO_BOT_CONFIG, providerCapabilities: { provider: 'evolution', canUseOfficialButtons: false } };
    },
    updateBotConfig: async (user: any, payload: any) => {
      calls.updateBotConfig += 1;
      return deps.updateBotConfigImpl ? deps.updateBotConfigImpl(user, payload) : payload;
    },
  };

  svc.botActivationService = {
    getActivation: async () =>
      deps.activation ?? {
        armed: true,
        types: { atendimento: { live: false, preflight: { chipConectado: true, configCompleta: true } } },
      },
    putActivation: async (user: any, body: any) => {
      calls.putActivation += 1;
      if (deps.putActivationImpl) return deps.putActivationImpl(user, body);
      return { ok: true, type: body.type, live: body.live };
    },
  };

  svc.botConfigStore = {
    listVersions: async () => deps.roteiroVersions ?? [],
  };

  return { svc: svc as AgentService, calls };
}

// ── resolveAgentBrain (regra pura, S05.md item 2) ───────────────────────────

test('resolveAgentBrain: AssistenteConfig publicado sempre vence, mesmo com roteiro configurado', () => {
  assert.equal(resolveAgentBrain(true, true, true), 'ia');
  assert.equal(resolveAgentBrain(true, true, false), 'ia');
});

test('resolveAgentBrain: só roteiro existe -> roteiro', () => {
  assert.equal(resolveAgentBrain(false, false, true), 'roteiro');
});

test('resolveAgentBrain: os dois existem sem publish -> ia (preferida quando existe)', () => {
  assert.equal(resolveAgentBrain(true, false, true), 'ia');
});

test('resolveAgentBrain: só assistente existe (sem publish, sem roteiro) -> ia', () => {
  assert.equal(resolveAgentBrain(true, false, false), 'ia');
});

test('resolveAgentBrain: nenhum dos dois configurado -> roteiro (default de cold-start)', () => {
  assert.equal(resolveAgentBrain(false, false, false), 'roteiro');
});

// ── getView: monta dos 2 stores ─────────────────────────────────────────────

test('getView: monta AgentView combinando AssistenteConfig + BotConfig(atendimento_bot)', async () => {
  const { svc } = makeService({
    assistente: assistenteFixture({ published: false }),
    roteiroVersions: [{ version: 3, updatedByUserId: 9, createdAt: new Date('2026-07-20T10:00:00Z') }],
  });

  const view = await svc.getView(adminUser());

  // brain: existem os 2, nenhum publicado -> 'ia' preferida (resolveAgentBrain).
  assert.equal(view.brain, 'ia');
  assert.equal(view.published, false);
  assert.ok(view.ia);
  assert.equal(view.ia?.nome, 'Bia');
  assert.ok(view.roteiro, 'roteiro deveria vir preenchido (existe BotConfig salvo)');
  assert.equal(view.roteiro?.welcomeMessage, DEFAULT_ATENDIMENTO_BOT_CONFIG.welcomeMessage);
  assert.equal(view.canManage, true);
  assert.equal(view.armed, true);
});

test('getView: sem nenhum store configurado -> brain roteiro, os dois campos null', async () => {
  const { svc } = makeService({ assistente: null, roteiroVersions: [] });
  const view = await svc.getView(adminUser());
  assert.equal(view.brain, 'roteiro');
  assert.equal(view.ia, null);
  assert.equal(view.roteiro, null);
  assert.equal(view.updatedAt, null);
});

test('getView: vendedor (não-admin) recebe canManage:false, mas a leitura funciona', async () => {
  const { svc } = makeService({ assistente: assistenteFixture() });
  const view = await svc.getView(sellerUser());
  assert.equal(view.canManage, false);
  assert.ok(view.ia, 'GET continua liberado a qualquer usuário do módulo');
});

// ── updateAgent (PUT): roteia pro store certo por campo ─────────────────────

test('updateAgent: campo "roteiro" grava via InboxService.updateBotConfig e NÃO toca AssistenteService', async () => {
  const { svc, calls } = makeService({ roteiroVersions: [{ version: 1, updatedByUserId: 1, createdAt: new Date() }] });
  await svc.updateAgent(adminUser(), {
    brain: 'roteiro',
    published: false,
    roteiro: { welcomeMessage: 'Oi, bem-vindo!' } as any,
    ia: null,
  });
  assert.equal(calls.updateBotConfig, 1);
  assert.equal(calls.saveAssistente, 0);
});

test('updateAgent: campo "ia" grava via AssistenteService.save e NÃO toca InboxService', async () => {
  const { svc, calls } = makeService({});
  await svc.updateAgent(adminUser(), {
    brain: 'ia',
    published: false,
    roteiro: null,
    ia: assistenteFixture() as any,
  });
  assert.equal(calls.saveAssistente, 1);
  assert.equal(calls.updateBotConfig, 0);
});

test('updateAgent: os dois campos presentes gravam nos dois stores', async () => {
  const { svc, calls } = makeService({});
  await svc.updateAgent(adminUser(), {
    brain: 'ia',
    published: false,
    roteiro: { welcomeMessage: 'Oi' } as any,
    ia: assistenteFixture() as any,
  });
  assert.equal(calls.saveAssistente, 1);
  assert.equal(calls.updateBotConfig, 1);
});

test('updateAgent: sem "ia" nem "roteiro" no payload -> 400', async () => {
  const { svc } = makeService({});
  await assert.rejects(() => svc.updateAgent(adminUser(), { brain: 'ia', published: false, roteiro: null, ia: null }), /ia.*roteiro|roteiro.*ia/i);
});

// ── PUT sem canManage -> 403 ─────────────────────────────────────────────────

test('updateAgent: vendedor (não-admin) recebe 403, nenhum store é gravado', async () => {
  const { svc, calls } = makeService({});
  await assert.rejects(
    () => svc.updateAgent(sellerUser(), { brain: 'roteiro', published: false, roteiro: { welcomeMessage: 'x' } as any, ia: null }),
    /permiss/i,
  );
  assert.equal(calls.updateBotConfig, 0);
  assert.equal(calls.saveAssistente, 0);
});

test('publish: vendedor (não-admin) recebe 403', async () => {
  const { svc, calls } = makeService({});
  await assert.rejects(() => svc.publish(sellerUser(), { on: true, brain: 'roteiro' }), /permiss/i);
  assert.equal(calls.putActivation, 0);
});

// ── publish: respeita o pino/gates dos services donos ───────────────────────

test('publish: brain "roteiro" delega pro BotActivationService.putActivation (pino/preflight)', async () => {
  const { svc, calls } = makeService({});
  const result = await svc.publish(adminUser(), { on: true, brain: 'roteiro' });
  assert.equal(calls.putActivation, 1);
  assert.equal(result.published, true);
  assert.equal(result.brain, 'roteiro');
});

test('publish: brain "roteiro" propaga o erro de pino não armado (BOT_NOT_ARMED) em vez de engolir', async () => {
  const { svc } = makeService({
    putActivationImpl: async () => {
      throw new Error('BOT_NOT_ARMED');
    },
  });
  await assert.rejects(() => svc.publish(adminUser(), { on: true, brain: 'roteiro' }), /BOT_NOT_ARMED/);
});

test('publish: brain "ia" delega pro AssistenteService.publish', async () => {
  const { svc, calls } = makeService({ assistente: assistenteFixture() });
  const result = await svc.publish(adminUser(), { on: true, brain: 'ia' });
  assert.equal(calls.publishAssistente, 1);
  assert.equal(result.published, true);
  assert.equal(result.brain, 'ia');
});

test('publish: sem "brain" no request infere o brain atual (mesma regra do GET)', async () => {
  const { svc, calls } = makeService({ assistente: null, roteiroVersions: [{ version: 1, updatedByUserId: 1, createdAt: new Date() }] });
  const result = await svc.publish(adminUser(), { on: true });
  assert.equal(result.brain, 'roteiro');
  assert.equal(calls.putActivation, 1);
  assert.equal(calls.publishAssistente, 0);
});

// ── sandbox: liberado a todos, roteiro responde sem rede ────────────────────

test('sandbox: brain "roteiro" com config em edição responde via replay determinístico (sem chamar InboxService/AssistenteService)', async () => {
  const { svc, calls } = makeService({});
  const result = await svc.sandbox(sellerUser(), {
    message: '',
    history: [],
    agent: { brain: 'roteiro', published: false, ia: null, roteiro: DEFAULT_ATENDIMENTO_BOT_CONFIG as any },
  });
  assert.equal(result.brain, 'roteiro');
  assert.equal(result.source, 'roteiro');
  assert.equal(result.reply, DEFAULT_ATENDIMENTO_BOT_CONFIG.welcomeMessage);
  assert.equal(result.dispatched, false);
  assert.equal(result.channel, 'sandbox');
  // "sem rede": nem o store de leitura nem o pipeline de IA foram chamados —
  // o replay usou só a config em edição recebida no request.
  assert.equal(calls.getBotConfig, 0);
  assert.equal(calls.runSandbox, 0);
});

test('sandbox: brain "roteiro" sem config em edição usa a config salva (InboxService.getBotConfig)', async () => {
  const { svc, calls } = makeService({ roteiroVersions: [{ version: 1, updatedByUserId: 1, createdAt: new Date() }] });
  const result = await svc.sandbox(sellerUser(), { message: '', history: [] });
  assert.equal(result.brain, 'roteiro');
  assert.equal(calls.getBotConfig, 1);
  assert.equal(result.reply, DEFAULT_ATENDIMENTO_BOT_CONFIG.welcomeMessage);
});

test('sandbox: brain "ia" delega pro AssistenteService.runSandbox', async () => {
  const { svc, calls } = makeService({});
  const result = await svc.sandbox(sellerUser(), {
    message: 'oi',
    history: [],
    agent: { brain: 'ia', published: false, roteiro: null, ia: assistenteFixture() as any },
  });
  assert.equal(result.brain, 'ia');
  assert.equal(calls.runSandbox, 1);
  assert.equal(result.reply, 'resposta da IA');
});

// ── replayRoteiroSandbox (função pura) — sequência welcome -> menu -> botão -> pós-ação ──

test('replayRoteiroSandbox: 1a chamada (sem histórico) abre com welcomeMessage', () => {
  const result = replayRoteiroSandbox(DEFAULT_ATENDIMENTO_BOT_CONFIG, [], '');
  assert.equal(result.stage, 'welcome');
  assert.equal(result.reply, DEFAULT_ATENDIMENTO_BOT_CONFIG.welcomeMessage);
  assert.deepEqual(result.buttons, DEFAULT_ATENDIMENTO_BOT_CONFIG.welcomeButtons);
  assert.equal(result.matchedButtonId, null);
});

test('replayRoteiroSandbox: 2a chamada (1 turno de assistente) mostra o menu principal', () => {
  const history = [{ role: 'assistant', content: DEFAULT_ATENDIMENTO_BOT_CONFIG.welcomeMessage }];
  const result = replayRoteiroSandbox(DEFAULT_ATENDIMENTO_BOT_CONFIG, history, 'continuar');
  assert.equal(result.stage, 'menu');
  assert.equal(result.reply, DEFAULT_ATENDIMENTO_BOT_CONFIG.mainMenuPrompt);
  assert.deepEqual(result.buttons, DEFAULT_ATENDIMENTO_BOT_CONFIG.mainMenuButtons);
});

test('replayRoteiroSandbox: usuário "clica" um botão do menu (kind reply) -> pós-ação com responseMessage', () => {
  const history = [
    { role: 'assistant', content: 'a' },
    { role: 'assistant', content: 'b' },
  ];
  const button = DEFAULT_ATENDIMENTO_BOT_CONFIG.mainMenuButtons.find((b) => b.title === 'Suporte tecnico')!;
  const action = DEFAULT_ATENDIMENTO_BOT_CONFIG.actionCatalog.find((a) => a.actionId === button.actionId)!;
  const result = replayRoteiroSandbox(DEFAULT_ATENDIMENTO_BOT_CONFIG, history, 'Suporte tecnico');
  assert.equal(result.stage, 'pos_acao');
  assert.equal(result.reply, action.responseMessage);
  assert.deepEqual(result.buttons, DEFAULT_ATENDIMENTO_BOT_CONFIG.postActionButtons);
  assert.equal(result.matchedButtonId, button.buttonId);
});

test('replayRoteiroSandbox: botão com kind human_handoff -> humanAckMessage, sem botões', () => {
  const history = [
    { role: 'assistant', content: 'a' },
    { role: 'assistant', content: 'b' },
  ];
  // "Falar com atendente" só existe em welcomeButtons no fixture default —
  // prova que o replay também casa contra welcomeButtons, não só mainMenu.
  const result = replayRoteiroSandbox(DEFAULT_ATENDIMENTO_BOT_CONFIG, history, 'Falar com atendente');
  assert.equal(result.stage, 'pos_acao');
  assert.equal(result.reply, DEFAULT_ATENDIMENTO_BOT_CONFIG.humanAckMessage);
  assert.deepEqual(result.buttons, []);
});

test('replayRoteiroSandbox: mensagem sem casar nenhum botão cai no postActionPrompt padrão', () => {
  const history = [
    { role: 'assistant', content: 'a' },
    { role: 'assistant', content: 'b' },
  ];
  const result = replayRoteiroSandbox(DEFAULT_ATENDIMENTO_BOT_CONFIG, history, 'blablabla sem sentido');
  assert.equal(result.stage, 'pos_acao');
  assert.equal(result.reply, DEFAULT_ATENDIMENTO_BOT_CONFIG.postActionPrompt);
  assert.equal(result.matchedButtonId, null);
});

test('replayRoteiroSandbox: nunca chama rede (função pura — mesmo shape em chamadas repetidas)', () => {
  const a = replayRoteiroSandbox(DEFAULT_ATENDIMENTO_BOT_CONFIG, [], '');
  const b = replayRoteiroSandbox(DEFAULT_ATENDIMENTO_BOT_CONFIG, [], '');
  assert.deepEqual(a, b);
});
