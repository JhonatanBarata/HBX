# CONTRATO.md — Vocabulário/APIs/tipos/flags do motor único (S03)

> **Este documento é a lei das sprints F1-F3.** Nome de serviço, rota, tipo ou flag que não
> está aqui é uma pergunta em aberto — volta pro orquestrador, não se inventa no meio da sprint.
> Fonte: `messaging.service.ts`, `cadencia/*.ts`, `assistente/*.ts`, `bot/bot-activation.service.ts`,
> `vendas/vendas-automation.service.ts`, `modules/bot-armed.guard.ts`, INVENTARIO.md (S02) e os
> testes de caracterização da S01 (`backend/src/automation/characterization/*.test.ts`, o JUIZ
> de qualquer refactor de precedência).

---

## 1. Mapa de dependências atual

### 1.1 Módulos NestJS — quem importa quem

```
AssistenteModule
  imports: PrismaModule, forwardRef(ModulesAccessModule)
  providers: AssistenteService, AssistenteSandboxService, CopilotoService,
             ConversationAssistantRuntimeService
  exports:  AssistenteService, ConversationAssistantRuntimeService
  NÃO importa MessagingModule/ConversationsService — de propósito (sandbox nunca toca chip).

MessagingModule
  imports: PrismaModule, ModulesAccessModule, PaymentsModule, CadastrosModule,
           CustomerProfileModule, MailModule, IntentEngineModule, BotConfigStoreModule,
           CreditsModule, forwardRef(AssistenteModule)   <- injeta ConversationAssistantRuntimeService
                                                              como @Optional() no MessagingService
  MessagingService.processPersistedInbound é O router de inbound hoje (ver 1.2).

CadenciaModule
  imports: PrismaModule, AuthModule, ModulesAccessModule, MessagingModule, AtividadesModule,
           SavedSearchModule, MailModule
  CadenciaGatilhoService.onModuleInit() registra
    (this.conversations as ConversationsService).setCadenciaInboundHook(...)
  — é assim que o inbound chega nos gatilhos, SEM o CadenciaModule ser importado pelo
  MessagingModule (evita ciclo). MessagingService chama
  this.conversations.dispatchCadenciaInbound(...) (fire-and-forget, `void`, NÃO awaited).

BotModule
  imports: PrismaModule, ModulesAccessModule, BotConfigStoreModule
  providers: BotActivationService (pino armed/live por tipo: atendimento/recovery/prospeccao)
  NÃO importa MessagingModule.

VendasModule (vendas-automation.service.ts mora aqui)
  Executor de prospecção; consome ConversationsService.queueOutboundForCompany e
  CommercialContactControlService. Trava de negócio: Company.prospectingBotLiveAt.

HbxRecoveryModule
  Executor de cobrança (Recovery); mesmo padrão — consome queueOutboundForCompany.
  Trava de negócio: Company.recoveryBotLiveAt.

automation/ (JÁ EXISTE, pasta solta, SEM automation.module.ts)
  commercial-automation-state.service.ts — CommercialAutomationStateService, classe PURA
  (NÃO é @Injectable, NÃO tem DI), instanciada manualmente com `new CommercialAutomationStateService
  (this.prisma)` dentro de CommercialContactControlService (vendas/commercial-contact-control.
  service.ts:74). É a fonte "canônica" da Fase 3 de exclusividade bot×cadência (ledger/
  enrollment dual-write). ⚠️ ACHADO da S03: o nome de pasta que o README pede para o módulo
  novo (`automation`) JÁ EXISTE parcialmente ocupado. S04 deve ADICIONAR a este diretório
  (automation.module.ts novo + os serviços da vocabulário-alvo abaixo), nunca renomear/mover
  commercial-automation-state.service.ts sem necessidade — ele é INFRA de exclusividade, não
  concorre em nome com nenhum serviço do vocabulário-alvo (seção 2). O `characterization/`
  também já mora aqui (S01).
```

### 1.2 Onde cada motor pendura no `messaging.service.ts` (precedência real)

Trecho `processPersistedInbound`, por volta de `messaging.service.ts:10041-10169` (offsets podem
mudar com o commit; procure por `isValidHumanInbound`). Ordem **exata**, confirmada linha a
linha e validada contra os testes da S01 (seção 7):

1. `isValidHumanInbound` = `inboundType` é humano (`text|button|interactive|image|video|
   document|audio`) **E** `classifyProspectingAutoReply(text) === null` (auto-reply de
   ausência/robô não conta como humano).
2. Se `isValidHumanInbound` → `await this.commercialContactControl.interruptForInbound(...)`
   (SEMPRE primeiro, awaited, idempotente por `inboundMessageId`).
3. `dispatchVendasCockpitProjection(...)` (awaited, projeção de cockpit — fora do escopo da
   fusão, não mexer).
4. Se `isValidHumanInbound` → `void this.conversations.dispatchCadenciaInbound(...)`
   **fire-and-forget, NÃO awaited** — detalhe que qualquer refactor (S06) precisa preservar
   byte a byte (não pode virar `await` sem medir impacto de latência).
5. `findRecoveryCustomerByPhone(companyId, from)` — SEMPRE chamado, mesmo quando
   `!isValidHumanInbound` (usado depois no fallback de recovery).
6. Se `isValidHumanInbound && !recoveryCustomer && this.conversationAssistant` (o
   `@Optional()` do DI — pode ser `null` se `AssistenteModule` não estiver plugado) →
   `conversationAssistant.prepareReply(...)`. Se `prepared.handled === true`:
   - Com `runId` + `reply` → `queueOutboundForCompany(..., sourceModule: 'conversation_assistant')`
     + `markQueued` (ou `markQueueFailed` se o enqueue falhar) → retorna
     `{ matched:true, source:'conversation_assistant' }`.
   - Sem `runId`/`reply` (duplicate/failed) → **NÃO enfileira nada**, retorna igual
     `{ matched:true, source:'conversation_assistant', duplicate/failed }`.
   - Em QUALQUER caso de `handled:true`, **`handleAtendimentoInbound` NUNCA é chamado** (1
     motor conversacional responde por inbound).
7. Se a assistente não tratou (`handled:false`, ou `recoveryCustomer` presente, ou inbound
   não-humano) e `inboundType` é humano → `handleAtendimentoInbound(...)`. Se
   `atendimentoResult.handled`:
   - `delegatedToRecovery === true` → retorna `source:'hbx_recovery'`.
   - senão → retorna `source:'atendimento'`.
8. Fallback mais profundo (fora do escopo desta sprint, não detalhado aqui):
   `resolveAtendimentoBotSanitizationContext` + `handleRecoveryInbound` quando
   `recoveryEnabled && recoveryCustomer` e nada acima tratou.

**Guarda interna da assistente** (`ConversationAssistantRuntimeService.prepareReply`,
`assistente/conversation-assistant-runtime.service.ts:29-91`) roda DEPOIS de entrar no passo 6,
nesta ordem:
1. `!this.enabled` (flag `HBX_ASSISTENTE_PUBLISH_ENABLED`) → `{handled:false, reason:
   'assistant_runtime_disabled'}`.
2. Input inválido (`companyId`/`conversationId`/`inboundMessageId`/`text` faltando) →
   `assistant_input_ineligible`.
3. `!configRow?.published` (`AssistenteConfig.published`) → `assistant_not_published`.
4. `!company?.botArmedAt` → `assistant_not_entitled`.
5. `!conversation || conversation.botActive !== true || conversation.humanAssigned === true`
   → `assistant_conversation_inactive`.
6. Claim: `conversationAssistantRun.create(...)`. `P2002` (unique constraint) →
   `{handled:true, duplicate:true, reason:'assistant_reply_already_claimed'}` — **NÃO chama o
   modelo**.
7. Só então chama `AssistenteSandboxService.reply(...)` (Ollama).

### 1.3 `sourceModule` de outbound — inventário por domínio

`queueOutboundForCompany(companyId, payload: QueueOutboundPayload)` (`messaging/conversations.
service.ts:548`) é a **ÚNICA porta de saída WhatsApp** (disjuntor, teto, warmup — ver seção 6).
`sourceModule` é string livre gravada em `OutboundMessage`/`CompanyMessage`; usada por
`interruptForInbound` para achar o que cancelar (`COMMERCIAL_WHATSAPP_SOURCE_MODULES`) e por
`hbx_recovery`/`atendimento` para telemetria. Valores reais em uso hoje (fora de teste),
agrupados por domínio — **nenhum destes nomes deve ser reaproveitado com sentido diferente**
nas sprints novas; S07/S20 decidem se migram para um prefixo novo, mas até lá são os nomes que
o banco tem gravado:

| Domínio | `sourceModule` | Emissor |
|---|---|---|
| **Assistente (IA)** | `conversation_assistant` | `messaging.service.ts:10092` (única emissão) |
| **Atendimento (menu/roteiro)** | `atendimento`, `atendimento_bot`, `atendimento_human`, `atendimento_manual`, `atendimento_router` | `messaging.service.ts` (dezenas de pontos, todos dentro de `handleAtendimentoInbound` e vizinhos), `inbox.service.ts`, `bot/pipeline/legacy-rules.handler.ts` |
| **Recovery (cobrança)** | `hbx_recovery`, `hbx_recovery_bot`, `hbx_recovery_human`, `hbx_recovery_automation`, `hbx_recovery_system`, `hbx_recovery_internal`, `hbx_recovery_paused`, `hbx_recovery_reminder` | `hbx-recovery.service.ts`, `hbx-recovery/recovery-automation-worker.service.ts`, `messaging.service.ts` |
| **Prospecção/Cadência** | `vendas_prospeccao_bot`, `vendas_prospeccao_email_bot`, `cadencia_email` | `vendas-automation.service.ts:4389`, `cadencia.service.ts:635,699`, `messaging.service.ts` |
| **Vendas (humano)** | `vendas`, `vendas_human`, `vendas_fechamento` | `vendas.service.ts`, `vendas-conversation.service.ts`, `vendas-automation.service.ts` |
| **Fora do escopo desta fusão** (não tocar) | `logistica_entrega`, `logistica_chegando`, `logistica_fechamento`, `logistica_cobranca`, `resumo_diario`, `financeiro`, `support`, `whatsapp_personal`, `webwhats_sync`, `whatsapp_webhook`, `onboarding_test` | Logística, Financeiro, Suporte, sincronização — módulos separados |

`COMMERCIAL_WHATSAPP_SOURCE_MODULES` (usado por `interruptForInbound` para saber o que é
"comercial" e cancelável) está definido em `vendas/commercial-contact-control.service.ts` — SÓ
inclui os `sourceModule` de prospecção/cadência, não os de atendimento/recovery (por design:
atendimento/recovery não são interrompidos por inbound do MESMO fluxo).

---

## 2. Vocabulário alvo (fixo)

### 2.1 Backend

| Peça | Nome fixo | Observação |
|---|---|---|
| Módulo NestJS novo | `automation` (`backend/src/automation/automation.module.ts`) | Pasta já existe parcialmente ocupada — ver 1.1. `AutomationModule` deve **importar** `AssistenteModule`/`MessagingModule`/`CadenciaModule`/`BotModule` conforme cada sprint plugar, nunca duplicar o que já existe neles. |
| Config unificada do Atendente | `AgentService` | S05. Adapter sobre `AssistenteConfig` + `BotConfig(domain='atendimento_bot')` até a S09/S10 migrarem para o schema novo. |
| Router de inbound | `InboundRouterService` | S06. Extração LITERAL do trecho da seção 1.2 — mesma ordem, mesmo `void` no `dispatchCadenciaInbound`, sem "aproveitar e melhorar". |
| Scheduler de outbound | `OutboundOrchestratorService` | S07. Orquestra os executores existentes (`vendas-automation`, `cadencia` runner, `hbx-recovery` worker) — NÃO substitui `queueOutboundForCompany`. |
| Gatilhos generalizados | `EventRuleService` | S08. Generalização de `CadenciaGatilhoService`. |
| Visão agregada | `AutomationOverviewService` | S04. Alimenta `GET /automation/overview`. |
| Tabela nova (Fase 2) | `AutomationAgent` | S09, aditiva, `companyId @unique` (regra de produto — 1 agente por empresa, ver README linha 89-98). |

### 2.2 Frontend

| Peça | Nome fixo | Observação |
|---|---|---|
| Rota | `/automacao` (singular) | Pasta atual é `frontend/src/app/(app)/automacoes` (plural, WORM-13/cadência) — **não confundir**; a nova é singular e substitui as 3 telas (`/bot`, `/automacoes`, `/assistente` → redirect, ver README decisão nº4). |
| Seção 1 | `atendente` | Funde bot-atendimento (menu) + assistente (IA). |
| Seção 2 | `cobranca` | Recovery reembalado. |
| Seção 3 | `prospeccao` | Prospecção + Cadência fundidas. |
| Seção 4 | `regras` | Gatilhos + Rotinas. |

### 2.3 Nomes que NÃO mudam (fora do escopo da fusão)

- `Copiloto` (`backend/src/assistente/copiloto.controller.ts` + `copiloto.service.ts`,
  `@Controller('assistente/copiloto')`) — **preservado intacto**. Feature separada (redação
  assistida pro vendedor humano na tela do Lead), flag própria `HBX_COPILOTO_ENABLED`, gate
  `JwtAuthGuard` puro (sem `ModuleAccess`), NÃO toca `AssistenteConfig`/`BotConfig`/
  `ConversationAssistantRun`. Só compartilha o prefixo de URL `/assistente` por acidente
  histórico (comentário no próprio arquivo, linha 10-17). Quando `/assistente` (tela de config
  do bot conversacional) virar redirect pra `/automacao#atendente` (S12/S17), o sub-recurso
  `/assistente/copiloto/*` **continua existindo exatamente onde está** — não é rota candidata a
  redirect. Nenhuma sprint desta frente cria `AgentService`/`InboundRouterService`/etc. para o
  Copiloto.
- `queueOutboundForCompany`, `ConversationsService`, `commercialContactControl` — nomes atuais,
  SALVOS (README linha 57-58), não renomeiam.
- `vendas-automation.service.ts` — o executor de prospecção continua com este nome; só ganha um
  orquestrador novo por cima (`OutboundOrchestratorService`), não é reescrito.

---

## 3. Contratos de API (request/response TS)

### 3.1 Endpoints NOVOS (nascem na F1, flag OFF até S10/S17 religar rota)

```ts
// GET /automation/overview  (S04, AutomationOverviewService)
// Painel único de status — "o que está ligado, pré-voo do chip, teto do dia" (README).
// Agrega dado que HOJE está espalhado em 3 sistemas de liga/desliga sem visão conjunta.
type AutomationOverviewResponse = {
  companyId: number;
  moduleAccess: { bot: boolean; vendas: boolean }; // gates atuais (README decisão nº2)
  botArmed: { armed: boolean; armedAt: string | null; armedByUserId: number | null }; // pino master
  atendente: {
    brain: AgentBrain;           // ver 4.1 — qual cérebro está configurado
    published: boolean;          // reflete AssistenteConfig.published OU bot_master_switch, conforme brain (ver nota S05 em 3.2)
    updatedAt: string | null;
  };
  cobranca: {
    live: boolean;                // Company.recoveryBotLiveAt != null
    workerEnabled: boolean;       // flag do worker (ver seção 5)
  };
  prospeccao: {
    live: boolean;                 // Company.prospectingBotLiveAt != null
    campaignId: string | null;
    pendingLeads: number;
  };
  regras: {
    gatilhosAtivos: number;        // CadenciaGatilho.ativo=true
    rotinasAtivas: number;         // CadenciaRotina.ativa=true
  };
};

// GET /automation/agent  (S05, AgentService)
// PUT /automation/agent  (S05, AgentService — exige canManage, ver README regra de produto)
type AgentBrain = 'roteiro' | 'ia';

type AutomationAgentDto = {
  companyId: number;
  brain: AgentBrain;
  published: boolean;
  updatedAt: string;
  updatedByUserId: number | null;
  // Exatamente UM dos dois abaixo é não-nulo, conforme `brain` — SEM campo novo, shape
  // idêntico ao que já existe hoje (ver seção 4):
  roteiro: AtendimentoBotConfig | null; // = payload hoje gravado em BotConfig domain='atendimento_bot'
  ia: AssistenteConfigShape | null;     // = { nome, tom, perfil, produtos, empresaNome, fluxo } de AssistenteConfig
};

type PutAutomationAgentRequest = Omit<AutomationAgentDto, 'companyId' | 'updatedAt' | 'updatedByUserId'>;

// POST /automation/agent/sandbox  (S05/S13 — reusa AssistenteSandboxService, NUNCA toca chip)
type AutomationAgentSandboxRequest = {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  // Testar config em edição antes de salvar (mesmo padrão do SandboxDto atual):
  agent?: PutAutomationAgentRequest;
};
type AutomationAgentSandboxResponse = { reply: string; source: string };

// POST /automation/agent/publish  (S05 — exige canManage)
// ⚠️ NOTA (ambiguidade resolvida nesta sprint, ver seção 8): hoje "publicar" significa coisas
// DIFERENTES por brain (roteiro usa BotActivationService.putActivation({type:'atendimento',
// live}); ia usa AssistenteService.publish -> AssistenteConfig.published). Este endpoint
// UNIFICA a AÇÃO (on:boolean -> published:boolean) — a S05 decide, por dentro, para qual
// mecanismo legado delega conforme o `brain` atual. Não é decisão de nome/rota, é decisão de
// implementação; registrada aqui para a S05 não reabrir a pergunta "o que publish quer dizer".
type AutomationAgentPublishRequest = { on: boolean };
type AutomationAgentPublishResponse = { published: boolean };
```

### 3.2 Endpoints reaproveitados (paths atuais — NÃO mudam nesta fase; S12-S17 decidem se o
front migra a chamada para os novos endpoints acima ou se o backend passa a ser só um proxy)

| Domínio | Método + path | Controller | Gate (`@ModuleAccess`) |
|---|---|---|---|
| Atendimento (roteiro) | `GET/PATCH /inbox/bot-config` | `inbox.controller.ts:89,94` | `atendimento` |
| Recovery (cobrança) | `GET/PATCH /hbx-recovery/bot-config` | `hbx-recovery.controller.ts:68,123` | `atendimento` |
| Assistente (IA) | `GET /assistente`, `GET /assistente/templates`, `GET /assistente/prompt`, `POST /assistente`, `POST /assistente/sandbox`, `POST /assistente/publish` | `assistente.controller.ts` | `bot` |
| Copiloto (INTOCADO, fora da fusão) | `GET /assistente/copiloto`, `POST /assistente/copiloto/rascunho\|resumo\|sugestao` | `copiloto.controller.ts` | nenhum (`JwtAuthGuard` só) |
| Cadência (persona) | `GET/POST /cadencia`, `PATCH/DELETE /cadencia/:id`, `POST /cadencia/:id/aplicar`, `POST /cadencia/:id/cancelar` | `cadencia.controller.ts` | `vendas` |
| Gatilhos | `GET/POST /cadencia/gatilhos`, `PATCH/DELETE /cadencia/gatilhos/:id` | idem | `vendas` |
| Rotinas | `GET/POST /cadencia/rotinas`, `PATCH/DELETE /cadencia/rotinas/:id` | idem | `vendas` |
| Prospecção | `GET /vendas/automation/bot-config`, `PATCH /vendas/automation/bot-config`, `GET /vendas/automation/agenda`, `GET /vendas/automation/live-status`, `POST /vendas/automation/prospecting/{start,pause,resume,cancel,simulate}`, `PATCH /vendas/automation/prospecting/config` | `vendas.controller.ts` | `vendas` |
| Pino master | `GET/PUT /bot/activation`, `PUT /bot/activation/master-switch`, `GET /bot/activation/config/:domain/versions` | `bot-activation.controller.ts` | `bot` |

⚠️ **Achado — terceira chave de gate não coberta pela decisão nº2 do README**: `/inbox` e
`/hbx-recovery` (onde vivem os endpoints de config do roteiro e do recovery) são gateados por
`atendimento`, não por `bot`/`vendas`. `module-categories.ts:22` confirma que a categoria OOBE
"WhatsApp + IA" já liga `atendimento` e `bot` JUNTOS (`whatsapp: ['atendimento', 'bot']`), mas
são `CompanyModule` distintos — uma empresa pode ter um sem o outro no banco. A decisão nº2 do
README ("manter as chaves `bot` e `vendas` com OR") **não menciona `atendimento`**; a rota
`/automacao` nova precisa decidir se o gate vira OR de 3 chaves (`atendimento`/`bot`/`vendas`)
ou se mantém 2 — sinalizado aqui para o dono bater o martelo antes da S12, não decidido por mim.

---

## 4. Tipos do agente

### 4.1 `AgentBrain`

```ts
type AgentBrain = 'roteiro' | 'ia';
```

- `'roteiro'` = motor de botões/menu (bot de Atendimento atual — `BotConfig` domain
  `atendimento_bot`).
- `'ia'` = assistente com IA (`AssistenteConfig` atual).
- **Nenhum terceiro valor.** Se uma sprint futura quiser um terceiro cérebro, isso é decisão do
  dono, não do worker.

### 4.2 `roteiroJson` = shape atual de `AtendimentoBotConfig`

Fonte: `backend/src/inbox/atendimento-config.ts` (não copiar o arquivo inteiro pro CONTRATO —
só o formato). Campos de topo (SEM inventar novo campo, é o que já existe e é normalizado por
`normalizeAtendimentoBotConfig`):

```ts
type AtendimentoBotConfig = {
  setup: AtendimentoBotSetup;                 // completed, botType, channelMode, provider...
  variableCatalog: AtendimentoBotVariableDefinition[];
  actionCatalog: AtendimentoBotActionGuide[];
  routingRules: AtendimentoRoutingRules;      // globalBotEnabled, checkRecoveryBeforeReply...
  smartVariables?: AtendimentoSmartVariablesConfig;
  sceneRules?: AtendimentoSceneRule[];
  welcomeButtons: AtendimentoBotButton[];
  returningCustomerButtons: AtendimentoBotButton[];
  mainMenuPrompt: string;
  mainMenuButtons: AtendimentoBotButton[];
  welcomeMessage: string;
  returningCustomerMessage: string;
  recoveryDetectedMessage: string;
  recoveryDetectedButtons: AtendimentoBotButton[];
  postActionPrompt: string;
  postActionButtons: AtendimentoBotButton[];
  humanAckMessage: string;
  closeTopicMessage: string;
  blockedMessage: string;
};
```

Persistido hoje via `BotConfigStoreService` na tabela `BotConfig` (`domain='atendimento_bot'`,
versionado). `AgentService` (S05) é quem lê/escreve isso por baixo de `roteiro` no
`AutomationAgentDto` — não recria o shape.

### 4.3 `fluxoJson` = shape atual do assistente

Fonte: `backend/src/assistente/assistente-flow.ts`:

```ts
type FluxoPasso = { id: string; tipo: 'mensagem'; texto: string };
type FluxoCondicao = {
  id: string;
  rotulo: string;
  comportamento: string;
  exemplos: string[];        // few-shots do classificador
  proximoPassoId?: string | null;
};
type FluxoJson = {
  entradaPassoId?: string | null;
  passos: FluxoPasso[];
  condicoes: FluxoCondicao[];
};

type AssistenteConfigShape = {
  nome: string;
  tom: 'formal' | 'normal' | 'descontraido';
  perfil: 'vendas' | 'suporte';
  produtos: string;
  empresaNome: string;
  fluxo: FluxoJson;
};
```

Persistido hoje em `AssistenteConfig.fluxoJson` (string JSON) + colunas soltas
(`nome`,`tom`,`perfil`,`produtos`,`empresaNome`,`published`). `AgentService` (S05) idem — lê/
escreve, não recria.

---

## 5. Família de flags `HBX_AUTOMATION_*`

Duas famílias DIFERENTES existem hoje e não devem ser misturadas:

**(A) Flags de FEATURE (liga/desliga/comportamento)** — estas são as que o README manda
consolidar em `HBX_AUTOMATION_*` até a S20. **(B) Envs de cliente de IA** (URL/modelo/timeout
do Ollama) — pertencem à fusão dos 3 clientes Ollama em 1 só (S05B, ver nota no fim desta
seção), NÃO entram no rename da S20. Não confundir as duas.

### 5.1 (A) Flags de feature — mapa velha → nova

`HBX_AUTOMATION_AGENT` (sem legado — nasce OFF na S10, gateia se o runtime já lê o schema novo
`AutomationAgent` em vez do par legado `BotConfig`+`AssistenteConfig`) é a primeira da família.
As demais, hoje soltas por motor, migram assim (⚠️ **nomes abaixo são PROPOSTA desta sprint —
o contrato do S03 deixou "?" de propósito; resolvido aqui para não travar S04-S08, mas é
decisão revisável pelo orquestrador antes da S20 executar o rename de fato**):

| Flag velha | Valor no VPS hoje (S02) | Flag nova proposta | O que controla |
|---|---|---|---|
| `HBX_ASSISTENTE_PUBLISH_ENABLED` | `true` | `HBX_AUTOMATION_AGENT_PUBLISH_ENABLED` | Liga a resposta ao vivo do Atendente no chip (hoje só cobre o cérebro `ia`; S05 decide se passa a cobrir os dois cérebros) |
| `HBX_CADENCIA_RUNNER_ENABLED` | `true` | `HBX_AUTOMATION_PROSPECCAO_RUNNER_ENABLED` | Liga o scheduler que processa `CadenciaInscricao` pendentes (`runDueSteps`) |
| `HBX_CADENCIA_EMAIL_ENABLED` | `true` | `HBX_AUTOMATION_PROSPECCAO_EMAIL_ENABLED` | Habilita canal e-mail nos passos de cadência |
| `HBX_CADENCIA_TICK_MS` | não setada (default 60000) | `HBX_AUTOMATION_PROSPECCAO_TICK_MS` | Intervalo do scheduler |
| `HBX_CADENCIA_WHATS_DAILY_CAP` | não setada (default 10) | `HBX_AUTOMATION_PROSPECCAO_WHATS_DAILY_CAP` | Teto diário de envio WhatsApp por empresa |
| `HBX_CADENCIA_EMAIL_DAILY_CAP` | não setada (default 50) | `HBX_AUTOMATION_PROSPECCAO_EMAIL_DAILY_CAP` | Teto diário de envio e-mail por empresa |
| `HBX_RECOVERY_AUTOMATION_WORKER_ENABLED` | `true` | `HBX_AUTOMATION_COBRANCA_WORKER_ENABLED` | Liga o worker do Recovery |
| `HBX_ATENDIMENTO_NLU_ENABLED` | não setada (default off) | `HBX_AUTOMATION_AGENTE_NLU_ENABLED` | Liga classificação de intenção (IntentEngine) no fluxo de atendimento |
| `HBX_ATENDIMENTO_NLU_TIMEOUT_MS` | não setada (default 6000) | `HBX_AUTOMATION_AGENTE_NLU_TIMEOUT_MS` | Timeout do NLU |
| `HBX_ATENDIMENTO_NLU_MIN_CONF` | não setada (default 0.75) | `HBX_AUTOMATION_AGENTE_NLU_MIN_CONF` | Confiança mínima do NLU |
| `HBX_VENDAS_AUTOMATION*` | **não existe** | — | Motor de prospecção não tem flag dedicada hoje — só a trava `Company.prospectingBotLiveAt`. Se nascer uma, já nasce com o prefixo novo. |
| `HBX_COPILOTO_ENABLED` | não setada (default ON) | **NÃO migra** | Copiloto é feature separada (seção 2.3) — flag fica como está, fora da família `HBX_AUTOMATION_*` |

**Regra de fallback (README linha 85, "flags novas nascem OFF"):** toda flag nova lê a velha
como fallback até a S20 apagar a velha. Padrão de código (reaproveitar o `envOn`/`isEnabled` já
usado em todo o repo):

```ts
function automationFlag(newName: string, legacyName: string): boolean {
  const raw = process.env[newName] ?? process.env[legacyName];
  return ['true', '1', 'yes', 'on'].includes(String(raw || '').trim().toLowerCase());
}
```

### 5.2 (B) Envs de cliente de IA — NÃO fazem parte do rename acima

Três clientes Ollama locais existem hoje, todos batendo no MESMO Ollama (`:11434`) e
compartilhando URL/liga-desliga, mas com override de modelo/timeout PRÓPRIO cada um. A S05B
funde os três num cliente único "base Concierge" — este é o mecanismo de unificação deles, não
o mapa velha→nova da seção 5.1:

| Cliente | Arquivo | Cadeia de env (própria → compartilhada → hardcoded) |
|---|---|---|
| `ai-intent-classifier` (bot, prospecção/atendimento) | `bot/intent/ai-intent-classifier.service.ts` | modelo: só `HBX_LLM_CLASSIFIER_MODEL` (sem override próprio) → `'qwen2.5:7b'`; timeout: só `HBX_LLM_CLASSIFIER_TIMEOUT_MS` → `9000` |
| `assistente-ollama` (sandbox assistente + Copiloto) | `assistente/assistente-ollama.ts` | modelo: `HBX_ASSISTENTE_MODEL` → `HBX_LLM_CLASSIFIER_MODEL` → `'qwen2.5:7b'`; timeout: `HBX_ASSISTENTE_TIMEOUT_MS` → `HBX_LLM_CLASSIFIER_TIMEOUT_MS` → `12000` |
| `concierge-ollama` (extrator de slots do Concierge) | `concierge/concierge-ollama.ts` | modelo: `HBX_AI_CONCIERGE_MODEL` → `HBX_LLM_CLASSIFIER_MODEL` → `'qwen2.5:7b'`; timeout: `HBX_AI_CONCIERGE_TIMEOUT_MS` → `HBX_LLM_CLASSIFIER_TIMEOUT_MS` → `12000`; flag de feature própria `HBX_AI_CONCIERGE_ENABLED` (default OFF) |

Todos os três leem `HBX_LLM_CLASSIFIER_URL` (base URL) e `HBX_LLM_CLASSIFIER_ENABLED` (liga/
desliga da IA local) — essa é a env que a S05B provavelmente promove a "a" env do cliente base;
mas essa decisão é DA S05B, este documento só registra a cadeia atual pra ninguém reinventar.

---

## 6. Regras invioláveis (copiadas do README, resumidas — o README é a fonte, isto é atalho)

- `queueOutboundForCompany` é a ÚNICA porta de saída WhatsApp (disjuntor, teto, warmup). Tudo
  continua saindo por ela — `OutboundOrchestratorService` (S07) orquestra executores, não
  substitui a porta.
- `commercialContactControl.interruptForInbound` roda ANTES de qualquer resposta (seção 1.2,
  passo 2) — inbound real invalida contatos comerciais em voo.
- Claim idempotente `ConversationAssistantRun` (1 inbound = 1 resposta, sem eco duplo) —
  `P2002` sempre vira `duplicate:true`, nunca segunda chamada ao modelo.
- Precedência conversacional (seção 1.2) vira código EXPLÍCITO no `InboundRouterService` (S06)
  — mesma ordem, mesmo fire-and-forget no `dispatchCadenciaInbound`.
- `Webwhats/` é INTOCÁVEL nesta frente — nenhuma sprint mexe em conexão/reconexão/pareamento.
- Nenhum teste dispara WhatsApp real; sandbox/unit/caracterização só.
- Freios (disjuntor, teto, interrupt, claim) são features, remoção proibida.
- Não tocar: crédito/carteira, módulo financeiro, Concierge IA (frente separada — só o cliente
  Ollama dela vira base compartilhada via S05B, o resto do Concierge não muda).
- 1 agente por empresa (`companyId @unique`), Admin configura via `canManage`, vendedor herda
  read-only + sandbox (README "Regra de produto", linha 89-98).
- Migrations aditivas até S19; DDL destrutivo só na S20.

---

## 7. Validação contra os testes da S01 (checklist ponto a ponto)

Os dois arquivos de caracterização (`backend/src/automation/characterization/`) são o JUIZ —
qualquer sprint que mexer em precedência precisa continuar passando estes casos, e a seção 1.2
acima foi escrita para bater exatamente com eles:

| Teste (`inbound-precedence.test.ts`) | O que prova | Onde está na seção 1.2 |
|---|---|---|
| `assistente handled com reply responde e NAO chama o atendimento` | IA publicada responde, `atendimento` não é chamado, outbound sai com `sourceModule:'conversation_assistant'` | passo 6 |
| `claim duplicado da assistente nao produz resposta dupla nem chama atendimento` | `duplicate:true` não enfileira nem chama atendimento | passo 6 (ramo duplicate) |
| `assistente nao publicado cai no atendimento` | `handled:false` → cai no passo 7 | passos 6→7 |
| `recoveryCustomer presente pula a assistente e vai direto pro atendimento/recovery` | `recoveryCustomer` bloqueia a entrada no passo 6 mesmo com `isValidHumanInbound` | passo 6 (guarda `!recoveryCustomer`) |
| `auto-reply de prospeccao classificado nao aciona interrupt/cadencia/assistente` | `classifyProspectingAutoReply` derruba `isValidHumanInbound`, cortando os passos 2/4/6 | passo 1 |
| `interruptForInbound e chamado primeiro, com o messageId do inbound` | Ordem: interrupt antes de cadência e antes de assistente | passos 2, 4, 6 (ordem relativa) |
| `dispatchCadenciaInbound roda para inbound humano valido antes da assistente decidir` | Cadência roda ANTES da assistente decidir, mesmo que a IA acabe respondendo | passos 4→6 |

| Teste (`assistant-claim.test.ts`) | O que prova | Onde está na seção 1.2/1.3 |
|---|---|---|
| `claim P2002 (...) marca duplicate e nao chama o modelo` | Guarda interna passo 6 do `prepareReply` | seção "Guarda interna", item 6 |
| `conversa ja com humano designado (...) nao e respondida pela IA` | Guarda `humanAssigned` ANTES do claim | seção "Guarda interna", item 5 |
| `empresa sem botArmedAt (...) nao e respondida pela IA` | Guarda `botArmedAt` ANTES do claim | seção "Guarda interna", item 4 |

Nenhuma discrepância encontrada entre os testes e o código lido nesta sprint — a seção 1.2 é
uma transcrição fiel, não uma interpretação.

---

## 8. Ambiguidades resolvidas nesta sprint (log para o orquestrador)

1. **Nomes da família `HBX_AUTOMATION_*` (seção 5.1)**: o `S03-contrato-tecnico.md` deixou
   "`HBX_ASSISTENTE_PUBLISH_ENABLED`→?" em aberto de propósito. Resolvido com uma proposta
   nomeada por domínio (`_AGENT_`, `_PROSPECCAO_`, `_COBRANCA_`, `_AGENTE_NLU_`) — revisável, não
   é execução (a S20 é quem efetivamente cria/apaga env).
2. **Ação `publish` do `AgentService` (seção 3.1)**: hoje "publicar" tem DOIS mecanismos
   diferentes por cérebro (`BotActivationService.putActivation` para `roteiro` vs.
   `AssistenteConfig.published` para `ia`). O contrato fixa a FORMA externa (`{on:boolean} ->
   {published:boolean}`) e deixa explícito que a S05 decide a implementação interna — não
   inventei um terceiro mecanismo.
3. **Colisão de nome `backend/src/automation/`**: a pasta já existe (Fase 3 de exclusividade
   bot×cadência, `CommercialAutomationStateService`, sem NestJS module). Documentado na seção
   1.1 para a S04 não tentar "limpar" ou renomear esse arquivo por engano ao criar
   `automation.module.ts` — são coisas diferentes que vão coexistir na mesma pasta.
4. **Separação das duas famílias de env (`HBX_AUTOMATION_*` vs. `HBX_LLM_CLASSIFIER_*`/
   `HBX_ASSISTENTE_MODEL`/`HBX_AI_CONCIERGE_*`)**: o texto do S03-contrato-tecnico.md cita só
   duas flags como exemplo de mapa velha→nova; segui a leitura de que são flags de FEATURE
   (liga/desliga/comportamento), não envs de cliente de IA — e separei as duas famílias na
   seção 5 para não virarem a mesma rename na S20 por engano.
5. **NÃO resolvido, sinalizado pro dono** (seção 3.2): `/inbox` e `/hbx-recovery` (onde vivem
   `bot-config` do roteiro e do recovery) são gateados pela chave `atendimento`, uma terceira
   chave que a decisão nº2 do README (OR de `bot`/`vendas`) não cobre. Não decidi sozinho se o
   gate da `/automacao` nova vira OR de 3 chaves — fica registrado pro dono bater o martelo
   antes da S12 (README linha 141-149, "decisões em aberto").
