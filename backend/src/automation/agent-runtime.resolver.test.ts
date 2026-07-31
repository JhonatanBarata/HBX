import test from 'node:test';
import assert from 'node:assert/strict';

// S10 (MOTOR-ÚNICO) — testes do AgentRuntimeResolver + da fiação atrás da
// flag `HBX_AUTOMATION_AGENT` dentro de ConversationAssistantRuntimeService.
// Mesmo estilo dos vizinhos (node:test + mocks manuais de Prisma, sem rede
// real — ver backend/src/automation/characterization/assistant-claim.test.ts).
//
// Cobre os 4 cenários do contrato da sprint (S10.md item 4):
//   1. flag off -> source 'legacy', zero diferença (nem toca prisma.automationAgent).
//   2. flag on + brain 'ia' -> responde com a config do agente (não do AssistenteConfig legado).
//   3. flag on + brain 'roteiro' -> a assistente não reivindica.
//   4. flag on sem AutomationAgent na empresa -> cai no legado (empresa não migrada não quebra).
//
// S20 (MOTOR-ÚNICO): a flag virou default ON EM CÓDIGO (kill-switch é um
// valor EXPLICITAMENTE falso — 0/false/no/off). Os testes "flag off" abaixo
// que antes usavam `HBX_AUTOMATION_AGENT: undefined` pra representar "off"
// agora usam `'0'` (kill-switch explícito) — "ausente" mudou de significado
// (virou ON). Um teste novo (`isAutomationAgentRuntimeEnabled: flag ausente
// -> true por default`) prova o novo default diretamente.

import { AgentRuntimeResolver, isAutomationAgentRuntimeEnabled } from './agent-runtime.resolver';
import { ConversationAssistantRuntimeService } from '../assistente/conversation-assistant-runtime.service';

function withFlags<T>(flags: Record<string, string | undefined>, callback: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(flags)) {
    previous[key] = process.env[key];
    if (flags[key] == null) delete process.env[key];
    else process.env[key] = flags[key];
  }
  return callback().finally(() => {
    for (const key of Object.keys(flags)) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

function throwingAutomationAgentFindUnique() {
  return async () => {
    throw new Error('flag OFF nunca deveria tocar prisma.automationAgent');
  };
}

// ── AgentRuntimeResolver.effectiveFor — puro ────────────────────────────────

test('effectiveFor: flag explicitamente OFF (kill-switch "0") -> source legacy, SEM tocar prisma.automationAgent', async () =>
  withFlags({ HBX_AUTOMATION_AGENT: '0' }, async () => {
    const prisma = { automationAgent: { findUnique: throwingAutomationAgentFindUnique() } };
    const resolver = new AgentRuntimeResolver(prisma as any);
    const result = await resolver.effectiveFor(7);
    assert.deepEqual(result, { source: 'legacy' });
    assert.equal(isAutomationAgentRuntimeEnabled(), false);
  }));

test('isAutomationAgentRuntimeEnabled: flag ausente -> true por default (S20, "a fusão vira o caminho principal")', async () =>
  withFlags({ HBX_AUTOMATION_AGENT: undefined }, async () => {
    assert.equal(isAutomationAgentRuntimeEnabled(), true);
  }));

test('effectiveFor: flag ausente (ON por default, S20) + empresa sem AutomationAgent -> source legacy (empresa não migrada não quebra)', async () =>
  withFlags({ HBX_AUTOMATION_AGENT: undefined }, async () => {
    let calls = 0;
    const prisma = {
      automationAgent: {
        findUnique: async () => {
          calls += 1;
          return null;
        },
      },
    };
    const resolver = new AgentRuntimeResolver(prisma as any);
    const result = await resolver.effectiveFor(7);
    assert.deepEqual(result, { source: 'legacy' });
    assert.equal(calls, 1, 'com o default ON, a consulta É feita (diferente do kill-switch, que nem chega a tentar)');
  }));

test('effectiveFor: flag ausente (ON por default, S20) + prisma sem model automationAgent (mock antigo) -> source legacy, sem crashar', async () =>
  withFlags({ HBX_AUTOMATION_AGENT: undefined }, async () => {
    const prisma = {}; // mock que nunca precisou de automationAgent (era escrito pra flag OFF)
    const resolver = new AgentRuntimeResolver(prisma as any);
    const result = await resolver.effectiveFor(7);
    assert.deepEqual(result, { source: 'legacy' });
  }));

test('effectiveFor: flag on + sem AutomationAgent pra empresa -> source legacy (empresa nao migrada)', async () =>
  withFlags({ HBX_AUTOMATION_AGENT: 'true' }, async () => {
    const prisma = { automationAgent: { findUnique: async () => null } };
    const resolver = new AgentRuntimeResolver(prisma as any);
    const result = await resolver.effectiveFor(7);
    assert.deepEqual(result, { source: 'legacy' });
  }));

test('effectiveFor: flag on + brain "ia" -> devolve config sanitizada do agente', async () =>
  withFlags({ HBX_AUTOMATION_AGENT: 'true' }, async () => {
    const prisma = {
      automationAgent: {
        findUnique: async () => ({
          companyId: 7,
          brain: 'ia',
          nome: 'Bia-Agente',
          tom: 'formal',
          perfil: 'suporte',
          produtos: 'ERP',
          empresaNome: 'Empresa 7',
          fluxoJson: '{}',
          roteiroJson: '{}',
          published: true,
        }),
      },
    };
    const resolver = new AgentRuntimeResolver(prisma as any);
    const result = await resolver.effectiveFor(7);
    assert.equal(result.source, 'agent');
    assert.equal(result.source === 'agent' && result.brain, 'ia');
    assert.equal(result.source === 'agent' && result.published, true);
    assert.equal(result.source === 'agent' && result.ia?.nome, 'Bia-Agente');
    assert.equal(result.source === 'agent' && result.ia?.tom, 'formal');
    assert.equal(result.source === 'agent' && result.roteiro, null);
  }));

test('effectiveFor: flag on + brain "roteiro" com roteiroJson real -> devolve roteiro normalizado', async () =>
  withFlags({ HBX_AUTOMATION_AGENT: 'true' }, async () => {
    const roteiroJson = JSON.stringify({ welcomeMessage: 'Oi, bem-vindo!', mainMenuButtons: [] });
    const prisma = {
      automationAgent: {
        findUnique: async () => ({
          companyId: 7,
          brain: 'roteiro',
          nome: 'Assistente',
          tom: 'normal',
          perfil: 'vendas',
          produtos: null,
          empresaNome: null,
          fluxoJson: '{}',
          roteiroJson,
          published: false,
        }),
      },
    };
    const resolver = new AgentRuntimeResolver(prisma as any);
    const result = await resolver.effectiveFor(7);
    assert.equal(result.source, 'agent');
    assert.equal(result.source === 'agent' && result.brain, 'roteiro');
    assert.equal(result.source === 'agent' && result.roteiro?.welcomeMessage, 'Oi, bem-vindo!');
    assert.equal(result.source === 'agent' && result.ia, null);
  }));

test('effectiveFor: flag on + brain "roteiro" SEM roteiro real (roteiroJson default "{}") -> roteiro:null (fallback legado)', async () =>
  withFlags({ HBX_AUTOMATION_AGENT: 'true' }, async () => {
    const prisma = {
      automationAgent: {
        findUnique: async () => ({
          companyId: 7,
          brain: 'roteiro',
          nome: 'Assistente',
          tom: 'normal',
          perfil: 'vendas',
          produtos: null,
          empresaNome: null,
          fluxoJson: '{}',
          roteiroJson: '{}',
          published: false,
        }),
      },
    };
    const resolver = new AgentRuntimeResolver(prisma as any);
    const result = await resolver.effectiveFor(7);
    assert.equal(result.source, 'agent');
    assert.equal(result.source === 'agent' && result.roteiro, null, 'sem roteiro real -> quem chama cai no fallback legado');
  }));

// ── Fiação dentro de ConversationAssistantRuntimeService.prepareReply ──────

function basePrisma(overrides: Record<string, any> = {}) {
  return {
    automationAgent: { findUnique: async () => null },
    assistenteConfig: {
      findUnique: async () => ({
        nome: 'Lia-Legado',
        tom: 'normal',
        perfil: 'vendas',
        produtos: 'ERP',
        empresaNome: 'Empresa 7',
        fluxoJson: '{}',
        published: true,
      }),
    },
    // ENTREVISTA no lugar do pino (31/07/2026): gate do runtime é a casa completa.
    vendasComercialConfig: {
      findUnique: async () => ({
        aiNome: 'Lia',
        aiIdentidade: 'nome_proprio',
        aiUserId: null,
        empresaFazTexto: 'Vendemos ERP.',
        catalogoJson: JSON.stringify({
          oQueVendemos: 'ERP',
          capacidades: [{ ganho: 'Organiza vendas', resolve: ['bagunca'] }],
          paraQuem: ['PMEs'],
          ancoraDePreco: null,
        }),
      }),
    },
    companyConversation: {
      findFirst: async () => ({ id: 10, botActive: true, humanAssigned: false, vendasLeadId: 'lead-1' }),
    },
    conversationAssistantRun: {
      create: async () => ({ id: 'run-1' }),
      updateMany: async () => ({ count: 1 }),
    },
    companyMessage: { findMany: async () => [] },
    ...overrides,
  };
}

test('prepareReply: flag HBX_AUTOMATION_AGENT off (kill-switch "0") -> comportamento legado intacto (le AssistenteConfig, nao toca automationAgent)', async () =>
  withFlags({ HBX_ASSISTENTE_PUBLISH_ENABLED: 'true', HBX_AUTOMATION_AGENT: '0' }, async () => {
    let automationAgentCalls = 0;
    let legacyConfigCalls = 0;
    const prisma = basePrisma({
      automationAgent: {
        findUnique: async () => {
          automationAgentCalls += 1;
          throw new Error('flag OFF nunca deveria tocar prisma.automationAgent');
        },
      },
      assistenteConfig: {
        findUnique: async () => {
          legacyConfigCalls += 1;
          return {
            nome: 'Lia-Legado',
            tom: 'normal',
            perfil: 'vendas',
            produtos: 'ERP',
            empresaNome: 'Empresa 7',
            fluxoJson: '{}',
            published: true,
          };
        },
      },
    });
    let sandboxNome: string | undefined;
    const service = new ConversationAssistantRuntimeService(prisma as any, {
      reply: async (config: any) => {
        sandboxNome = config.nome;
        return { reply: 'oi do legado', source: 'test' };
      },
    } as any);

    const result = await service.prepareReply({ companyId: 7, conversationId: 10, inboundMessageId: 55, text: 'Oi' });

    assert.equal(automationAgentCalls, 0, 'flag off nunca deveria consultar AutomationAgent');
    assert.equal(legacyConfigCalls, 1);
    assert.equal(result.handled, true);
    assert.equal(result.handled && result.reply, 'oi do legado');
    assert.equal(sandboxNome, 'Lia-Legado');
  }));

test('prepareReply: flag on + AutomationAgent brain "ia" -> responde com a config do agente, NAO le AssistenteConfig', async () =>
  withFlags({ HBX_ASSISTENTE_PUBLISH_ENABLED: 'true', HBX_AUTOMATION_AGENT: 'true' }, async () => {
    let legacyConfigCalls = 0;
    const prisma = basePrisma({
      automationAgent: {
        findUnique: async () => ({
          companyId: 7,
          brain: 'ia',
          nome: 'Bia-Agente',
          tom: 'formal',
          perfil: 'suporte',
          produtos: 'ERP novo',
          empresaNome: 'Empresa 7',
          fluxoJson: '{}',
          roteiroJson: '{}',
          published: true,
        }),
      },
      assistenteConfig: {
        findUnique: async () => {
          legacyConfigCalls += 1;
          return null;
        },
      },
    });
    let sandboxNome: string | undefined;
    const service = new ConversationAssistantRuntimeService(prisma as any, {
      reply: async (config: any) => {
        sandboxNome = config.nome;
        return { reply: 'oi do agente', source: 'test' };
      },
    } as any);

    const result = await service.prepareReply({ companyId: 7, conversationId: 10, inboundMessageId: 55, text: 'Oi' });

    assert.equal(legacyConfigCalls, 0, 'com o agente novo ativo, AssistenteConfig legado nao deveria nem ser consultado');
    assert.equal(result.handled, true);
    assert.equal(result.handled && result.reply, 'oi do agente');
    assert.equal(sandboxNome, 'Bia-Agente', 'a config usada pelo sandbox deveria vir do AutomationAgent, nao do legado');
  }));

test('prepareReply: flag on + AutomationAgent brain "roteiro" -> assistente NAO reivindica (nao tenta claim nem chama o modelo)', async () =>
  withFlags({ HBX_ASSISTENTE_PUBLISH_ENABLED: 'true', HBX_AUTOMATION_AGENT: 'true' }, async () => {
    let claimCalls = 0;
    let sandboxCalls = 0;
    const prisma = basePrisma({
      automationAgent: {
        findUnique: async () => ({
          companyId: 7,
          brain: 'roteiro',
          nome: 'Assistente',
          tom: 'normal',
          perfil: 'vendas',
          produtos: null,
          empresaNome: null,
          fluxoJson: '{}',
          roteiroJson: JSON.stringify({ welcomeMessage: 'Oi!' }),
          published: true,
        }),
      },
      conversationAssistantRun: {
        create: async () => {
          claimCalls += 1;
          return { id: 'run-1' };
        },
        updateMany: async () => ({ count: 1 }),
      },
    });
    const service = new ConversationAssistantRuntimeService(prisma as any, {
      reply: async () => {
        sandboxCalls += 1;
        return { reply: 'nao deveria responder', source: 'test' };
      },
    } as any);

    const result = await service.prepareReply({ companyId: 7, conversationId: 10, inboundMessageId: 55, text: 'Oi' });

    assert.equal(result.handled, false);
    assert.equal(result.handled === false && result.reason, 'assistant_agent_brain_roteiro');
    assert.equal(claimCalls, 0, 'cerebro roteiro nao deveria nem tentar reivindicar (claim)');
    assert.equal(sandboxCalls, 0, 'cerebro roteiro nunca chama o modelo da IA');
  }));

test('prepareReply: flag on SEM AutomationAgent pra empresa -> cai no legado (empresa nao migrada nao quebra)', async () =>
  withFlags({ HBX_ASSISTENTE_PUBLISH_ENABLED: 'true', HBX_AUTOMATION_AGENT: 'true' }, async () => {
    const prisma = basePrisma({
      automationAgent: { findUnique: async () => null },
    });
    let sandboxNome: string | undefined;
    const service = new ConversationAssistantRuntimeService(prisma as any, {
      reply: async (config: any) => {
        sandboxNome = config.nome;
        return { reply: 'oi do legado (empresa nao migrada)', source: 'test' };
      },
    } as any);

    const result = await service.prepareReply({ companyId: 7, conversationId: 10, inboundMessageId: 55, text: 'Oi' });

    assert.equal(result.handled, true);
    assert.equal(result.handled && result.reply, 'oi do legado (empresa nao migrada)');
    assert.equal(sandboxNome, 'Lia-Legado');
  }));
