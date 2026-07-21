import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssistenteService } from '../assistente/assistente.service';
import { sanitizeAssistenteConfig, type AssistenteConfigShape } from '../assistente/assistente-flow';
import type { SandboxDto } from '../assistente/dto/assistente.dto';
import { InboxService } from '../inbox/inbox.service';
import {
  normalizeAtendimentoBotConfig,
  type AtendimentoBotButton,
  type AtendimentoBotConfig,
} from '../inbox/atendimento-config';
import { BotActivationService } from '../bot/bot-activation.service';
import { BotConfigStoreService, type BotConfigVersionInfo } from '../bot/config/bot-config-store.service';
import { isAutomationAgentRuntimeEnabled } from './agent-runtime.resolver';
import type {
  AgentBrain,
  AutomationAgentPublishRequest,
  AutomationAgentPublishResponse,
  AutomationAgentSandboxRequest,
  AutomationAgentSandboxResponse,
  AutomationAgentViewResponse,
  PutAutomationAgentRequest,
} from './dto/agent.dto';

// ============================================================================
// S05 (MOTOR-ÚNICO) — AgentService.
//
// UM contrato de leitura/escrita pro Atendente — hoje partido em dois mundos:
// AssistenteConfig (cérebro 'ia': nome/tom/perfil/fluxoJson/published, dono
// AssistenteService) e BotConfig domain='atendimento_bot' (cérebro 'roteiro':
// welcome/botões/menu, versionado via BotConfigStoreService, dono real é
// InboxService.getBotConfig/updateBotConfig — TODA a validação/sanitização
// tenant-aware mora lá e é privada; por isso este service delega pros
// MÉTODOS PÚBLICOS do InboxService em vez de reimplementar).
//
// ADITIVO PURO sobre os stores atuais — schema novo (`AutomationAgent`) é a
// S09; até lá isto é um adapter. NUNCA grava no prisma por fora dos services
// donos (CONTRATO.md §2.1, regra da S05.md item 3).
//
// Regra de produto (README linhas 89-98, "o agente é DA EMPRESA"): GET é
// liberado a qualquer usuário do módulo (devolve `canManage` pro front
// decidir editável × read-only); PUT/publish exigem `canManage`
// (Admin/USERMASTER). Sandbox é liberado a todos.
// ============================================================================

const ATENDIMENTO_DOMAIN = 'atendimento_bot' as const;

function requireCompanyId(user: any): number {
  const companyId = Number(
    user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId || 0,
  );
  if (!companyId) throw new BadRequestException('Empresa não identificada.');
  return companyId;
}

// Mesmo booleano que CadenciaService usa como `canManage` (isAdmin ||
// canViewCompanyCards — cadencia.service.ts:124-127), via
// resolveVendasAccessContext -> resolveEffectiveTeamAccess
// (team-access-runtime.ts:208): `isAdmin = isSystemMaster || role==='ADMIN'
// || role==='USERMASTER'`. Replicado LOCAL (mesmo padrão já usado por
// bot-activation.service.ts:59-63, um dos dois services donos pra quem este
// adapter delega) em vez de chamar resolveVendasAccessContext direto: aquela
// função EXIGE 'vendas.access'/'workspace.vendas.access' (lança
// ForbiddenException sem eles) — bloquearia em erro qualquer empresa que só
// tenha `atendimento`/`bot` (sem `vendas`), que é exatamente o público do
// Atendente. `canViewCompanyCards` também não tem equivalente no catálogo de
// atendimento/bot hoje — a regra de produto desta sprint só fala em
// "Admin/USERMASTER" mesmo (README linha 97), então o componente `isAdmin`
// sozinho já é o mecanismo certo, sem hidratar team-policy fora do domínio.
function isAdminOrMaster(user: any): boolean {
  if (user?.isSystemMaster) return true;
  const role = String(user?.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'USERMASTER';
}

// Regra de `brain` (S05-agent-service-adapter.md item 2, "sem schema novo"):
//   - AssistenteConfig.published === true          -> 'ia'
//   - existe AssistenteConfig (mesmo sem publish)   -> 'ia' (preferida quando
//     os dois existem, e também cobre "só existe assistente")
//   - senão, existe BotConfig(atendimento_bot)       -> 'roteiro'
//   - nenhum dos dois configurado ainda (empresa nova) -> 'roteiro' (default
//     determinístico de cold-start; AgentBrain não tem valor nulo no
//     CONTRATO — precisa devolver sempre um dos dois).
export function resolveAgentBrain(
  hasAssistente: boolean,
  assistentePublished: boolean,
  hasRoteiro: boolean,
): AgentBrain {
  if (assistentePublished) return 'ia';
  if (hasAssistente) return 'ia';
  if (hasRoteiro) return 'roteiro';
  return 'roteiro';
}

// ── replay determinístico do cérebro 'roteiro' (sandbox, S05.md item 5) ────
// Substitui o chat fake hardcoded do front velho: SEM IA, SEM classificador,
// SEM rede — só interpreta a config já normalizada. Sequência fixa
// "welcome -> menu -> botão -> pós-ação":
//   0 turnos de assistente no histórico -> abre com welcomeMessage.
//   1 turno de assistente no histórico  -> mostra o menu principal.
//   2+ turnos                            -> interpreta a última mensagem do
//     usuário como o TÍTULO de um botão do menu (match exato, senão
//     substring) e responde a pós-ação (responseMessage da ação casada, ou o
//     postActionPrompt padrão). Ações terminais (falar com humano/encerrar/
//     recovery) respondem com a mensagem fixa correspondente.
export type RoteiroReplayResult = {
  reply: string;
  source: 'roteiro';
  stage: 'welcome' | 'menu' | 'pos_acao';
  buttons: AtendimentoBotButton[];
  matchedButtonId: string | null;
};

function findButtonMatch(buttons: AtendimentoBotButton[], text: string): AtendimentoBotButton | null {
  const needle = text.trim().toLowerCase();
  if (!needle || !buttons.length) return null;
  const exact = buttons.find((b) => b.title.trim().toLowerCase() === needle);
  if (exact) return exact;
  return (
    buttons.find((b) => {
      const title = b.title.trim().toLowerCase();
      return title.length > 0 && (needle.includes(title) || title.includes(needle));
    }) ?? null
  );
}

export function replayRoteiroSandbox(
  config: AtendimentoBotConfig,
  history: Array<{ role?: string; content?: string }>,
  message: string,
): RoteiroReplayResult {
  const assistantTurns = (Array.isArray(history) ? history : []).filter(
    (t) => String(t?.role || '').toLowerCase() === 'assistant',
  ).length;

  // Passo 1 — abertura (sem olhar `message`, igual ao sandbox 'ia': a 1a
  // resposta é sempre a abertura do roteiro).
  if (assistantTurns === 0) {
    const buttons = config.welcomeButtons.length ? config.welcomeButtons : config.mainMenuButtons;
    return { reply: config.welcomeMessage, source: 'roteiro', stage: 'welcome', buttons, matchedButtonId: null };
  }

  // Passo 2 — menu principal (o roteiro real sempre mostra o menu depois da
  // saudação; o replay só espelha essa transição fixa).
  if (assistantTurns === 1) {
    return {
      reply: config.mainMenuPrompt,
      source: 'roteiro',
      stage: 'menu',
      buttons: config.mainMenuButtons,
      matchedButtonId: null,
    };
  }

  // Passo 3/4 — usuário "clicou" um botão (texto livre casado por título) ->
  // resolve pela ação do botão (actionCatalog) -> pós-ação.
  const matched =
    findButtonMatch(config.mainMenuButtons, message) ?? findButtonMatch(config.welcomeButtons, message);
  const actionId = matched ? String(matched.actionId) : null;
  const action = actionId ? config.actionCatalog.find((a) => String(a.actionId) === actionId) : undefined;
  const matchedButtonId = matched?.buttonId ?? null;

  if (actionId === 'talk_human' || action?.kind === 'human_handoff') {
    return { reply: config.humanAckMessage, source: 'roteiro', stage: 'pos_acao', buttons: [], matchedButtonId };
  }
  if (actionId === 'close_topic' || action?.kind === 'close') {
    return { reply: config.closeTopicMessage, source: 'roteiro', stage: 'pos_acao', buttons: [], matchedButtonId };
  }
  if (actionId === 'enter_recovery' || action?.kind === 'recovery_handoff') {
    return {
      reply: config.recoveryDetectedMessage,
      source: 'roteiro',
      stage: 'pos_acao',
      buttons: config.recoveryDetectedButtons,
      matchedButtonId,
    };
  }
  if (actionId === 'show_main_menu' || action?.kind === 'show_menu') {
    return {
      reply: config.mainMenuPrompt,
      source: 'roteiro',
      stage: 'menu',
      buttons: config.mainMenuButtons,
      matchedButtonId,
    };
  }

  const reply = (action?.responseMessage && action.responseMessage.trim()) || config.postActionPrompt;
  return { reply, source: 'roteiro', stage: 'pos_acao', buttons: config.postActionButtons, matchedButtonId };
}

type AssistenteSummary = Awaited<ReturnType<AssistenteService['get']>>['assistente'];

type BrainState = {
  assistente: AssistenteSummary;
  hasRoteiro: boolean;
  roteiroVersions: BotConfigVersionInfo[];
  brain: AgentBrain;
};

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly assistenteService: AssistenteService,
    private readonly inboxService: InboxService,
    private readonly botActivationService: BotActivationService,
    private readonly botConfigStore: BotConfigStoreService,
    // S10 (MOTOR-ÚNICO): só usado atrás de `isAutomationAgentRuntimeEnabled()`
    // (flag OFF por default — README linha 85). PrismaModule é @Global(), sem
    // risco de ciclo. Testes existentes (agent.service.test.ts) instanciam
    // via `Object.create(AgentService.prototype)` sem setar `svc.prisma` — a
    // flag desligada garante que nenhum caminho abaixo toca `this.prisma`.
    private readonly prisma: PrismaService,
  ) {}

  // Lê os 2 stores em paralelo e resolve o `brain` — base compartilhada por
  // getView/sandbox/publish (nenhum dos três reimplementa a regra).
  private async loadBrainState(user: any, companyId: number): Promise<BrainState> {
    const [assistenteResult, roteiroVersions] = await Promise.all([
      this.assistenteService.get(user),
      this.botConfigStore.listVersions(companyId, ATENDIMENTO_DOMAIN),
    ]);
    const assistente = assistenteResult?.assistente ?? null;
    const hasRoteiro = roteiroVersions.length > 0;
    const brain = resolveAgentBrain(Boolean(assistente), Boolean(assistente?.published), hasRoteiro);
    return { assistente, hasRoteiro, roteiroVersions, brain };
  }

  // ── S10 (MOTOR-ÚNICO) — leitura/escrita do schema novo `AutomationAgent` ──
  //
  // Item 3 do contrato da sprint ("flag ON -> GET/PUT/publish/sandbox leem e
  // gravam AutomationAgent... write só no novo; leitura legada é fallback")
  // esbarra num limite real de escopo: `InboxService.updateBotConfig` e
  // `AssistenteService.publish/save` são os DONOS da validação/sanitização
  // tenant-aware e dos gates de segurança (BOT_NOT_ARMED, preflight,
  // HBX_ASSISTENTE_PUBLISH_ENABLED, validação de botão/ação) — nenhum dos
  // dois arquivos está na lista "Arquivos" desta sprint (S10.md), e o
  // guardrail duro "freios são features, remoção proibida" veta reimplementar
  // essa validação aqui só pra poder parar de chamá-los. Solução adotada
  // (documentada como desvio no relatório final do worker):
  //   - GET/sandbox: quando a empresa já tem uma linha em `AutomationAgent`,
  //     LEEM dela em vez de remontar dos 2 stores legados (substituição pura
  //     de leitura, zero risco).
  //   - PUT/publish: continuam delegando pros services donos (única forma
  //     seguro/no-escopo de manter os gates), e ADICIONALMENTE sincronizam
  //     (best-effort, nunca bloqueia a resposta) o resultado JÁ VALIDADO pra
  //     `AutomationAgent` — a tabela nova fica fresca sem reimplementar
  //     validação nem afrouxar gate nenhum.
  private iaConfigFromRow(row: {
    nome: string;
    tom: string;
    perfil: string;
    produtos: string | null;
    empresaNome: string | null;
    fluxoJson: string;
  }): AssistenteConfigShape {
    let fluxo: unknown = {};
    try {
      fluxo = JSON.parse(row.fluxoJson || '{}');
    } catch {
      fluxo = {};
    }
    return sanitizeAssistenteConfig({
      nome: row.nome,
      tom: row.tom,
      perfil: row.perfil,
      produtos: row.produtos || '',
      empresaNome: row.empresaNome || '',
      fluxo,
    });
  }

  private roteiroConfigFromRow(row: { roteiroJson: string }): AtendimentoBotConfig {
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(row.roteiroJson || '{}');
    } catch {
      parsed = {};
    }
    return normalizeAtendimentoBotConfig(parsed as any);
  }

  // GET/sandbox — monta o AgentView inteiramente a partir da linha nova (os
  // dois cérebros populados a partir das colunas do MESMO row, igual ao
  // adapter legado permite "os dois existirem ao mesmo tempo" — CONTRATO.md
  // §3.1). `published` segue a MESMA regra por cérebro do adapter (S05):
  // 'ia' reflete a coluna própria; 'roteiro' não tem coluna própria, reflete
  // o pino ao vivo do BotActivationService (leitura, não escrita).
  private async viewFromAutomationAgentRow(
    user: any,
    row: {
      brain: string;
      nome: string;
      tom: string;
      perfil: string;
      produtos: string | null;
      empresaNome: string | null;
      fluxoJson: string;
      roteiroJson: string;
      published: boolean;
      updatedAt: Date;
    },
    companyId: number,
    canManage: boolean,
  ): Promise<AutomationAgentViewResponse> {
    const brain: AgentBrain = row.brain === 'ia' ? 'ia' : 'roteiro';
    const ia = this.iaConfigFromRow(row);
    const roteiro = this.roteiroConfigFromRow(row);

    const activation = await this.botActivationService.getActivation(user).catch((e: any) => {
      this.logger.warn(`[agent] getActivation indisponível: ${String(e?.message || e)}`);
      return null;
    });
    const published =
      brain === 'ia' ? Boolean(row.published) : Boolean((activation as any)?.types?.atendimento?.live);

    return {
      companyId,
      brain,
      published,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      // AutomationAgent (S09) ainda não grava "quem editou" — mesma lacuna
      // documentada no adapter legado (S05); fica pra sprint futura preencher.
      updatedByUserId: null,
      roteiro,
      ia,
      canManage,
      armed: Boolean((activation as any)?.armed),
      preflight: (activation as any)?.types?.atendimento?.preflight ?? null,
    };
  }

  // PUT/publish (best-effort, nunca lança): espelha o estado JÁ VALIDADO
  // pelos services donos (getViewLegacy roda DEPOIS do save/updateBotConfig
  // terem sido aceitos) pra dentro de `AutomationAgent`. `published:false`
  // sempre — mesma regra WORM-14 que `AssistenteService.save` já aplica
  // ("toda edição volta a rascunho"); publicar é ação exclusiva do
  // POST /publish (syncAutomationAgentPublished abaixo).
  private async syncAutomationAgentFromLegacy(user: any, companyId: number): Promise<void> {
    const legacyView = await this.getViewLegacy(user, companyId, false);
    const fields = {
      nome: legacyView.ia?.nome ?? 'Assistente',
      tom: legacyView.ia?.tom ?? 'normal',
      perfil: legacyView.ia?.perfil ?? 'vendas',
      produtos: legacyView.ia?.produtos ?? null,
      empresaNome: legacyView.ia?.empresaNome ?? null,
      brain: legacyView.brain,
      fluxoJson: legacyView.ia ? JSON.stringify(legacyView.ia.fluxo) : '{}',
      roteiroJson: legacyView.roteiro ? JSON.stringify(legacyView.roteiro) : '{}',
      published: false,
    };
    await this.prisma.automationAgent.upsert({
      where: { companyId },
      create: { companyId, ...fields, testCounter: 0, migratedFrom: null },
      update: fields,
    });
  }

  // Só atualiza `published` numa linha JÁ existente — publish sozinho nunca
  // "migra" uma empresa pro schema novo (quem cria a linha é o PUT ou o
  // backfill, S09). Coluna só é lida quando `brain==='ia'` (ver
  // viewFromAutomationAgentRow); sincronizar também no 'roteiro' é inofensivo
  // (coluna inerte nesse ramo) e mantém o dado coerente se o brain mudar depois.
  private async syncAutomationAgentPublished(companyId: number, published: boolean): Promise<void> {
    const existing = await this.prisma.automationAgent.findUnique({ where: { companyId } });
    if (!existing) return;
    await this.prisma.automationAgent.update({ where: { companyId }, data: { published } });
  }

  // GET /automation/agent
  async getView(user: any): Promise<AutomationAgentViewResponse> {
    const companyId = requireCompanyId(user);
    const canManage = isAdminOrMaster(user);

    // S10: flag ON + empresa já migrada (linha em AutomationAgent) -> lê do
    // schema novo. Flag OFF ou empresa ainda não migrada -> cai no adapter
    // legado abaixo, SEM NENHUMA mudança de comportamento (fallback, README
    // linha 85).
    if (isAutomationAgentRuntimeEnabled()) {
      const row = await this.prisma.automationAgent.findUnique({ where: { companyId } }).catch((e: any) => {
        this.logger.warn(`[agent] leitura de AutomationAgent indisponível companyId=${companyId}: ${String(e?.message || e)}`);
        return null;
      });
      if (row) return this.viewFromAutomationAgentRow(user, row, companyId, canManage);
    }

    return this.getViewLegacy(user, companyId, canManage);
  }

  // Corpo ORIGINAL do adapter (S05), extraído sem nenhuma alteração de
  // comportamento — chamado tanto pelo fallback de `getView` quanto pelo
  // `syncAutomationAgentFromLegacy` (que precisa do estado já validado e
  // recém-gravado pelos services donos).
  private async getViewLegacy(user: any, companyId: number, canManage: boolean): Promise<AutomationAgentViewResponse> {
    const [state, activation, roteiroConfig] = await Promise.all([
      this.loadBrainState(user, companyId),
      this.botActivationService.getActivation(user).catch((e: any) => {
        this.logger.warn(`[agent] getActivation indisponível: ${String(e?.message || e)}`);
        return null;
      }),
      this.inboxService.getBotConfig(user).catch((e: any) => {
        this.logger.warn(`[agent] getBotConfig indisponível: ${String(e?.message || e)}`);
        return null;
      }),
    ]);

    const { assistente, hasRoteiro, roteiroVersions, brain } = state;

    const ia: AssistenteConfigShape | null = assistente
      ? {
          nome: assistente.nome,
          tom: assistente.tom,
          perfil: assistente.perfil,
          produtos: assistente.produtos,
          empresaNome: assistente.empresaNome,
          fluxo: assistente.fluxo,
        }
      : null;
    const roteiro: AtendimentoBotConfig | null =
      hasRoteiro && roteiroConfig ? (roteiroConfig as AtendimentoBotConfig) : null;

    const published =
      brain === 'ia' ? Boolean(assistente?.published) : Boolean((activation as any)?.types?.atendimento?.live);
    const updatedAt =
      brain === 'ia'
        ? (assistente?.updatedAt ?? null)
        : roteiroVersions[0]
          ? new Date(roteiroVersions[0].createdAt).toISOString()
          : null;
    // AssistenteConfig não grava "quem editou" hoje (só createdAt/updatedAt) —
    // lacuna real, não inventada; fica pro schema novo da S09 preencher.
    const updatedByUserId = brain === 'ia' ? null : (roteiroVersions[0]?.updatedByUserId ?? null);

    return {
      companyId,
      brain,
      published,
      updatedAt,
      updatedByUserId,
      roteiro,
      ia,
      canManage,
      armed: Boolean((activation as any)?.armed),
      preflight: (activation as any)?.types?.atendimento?.preflight ?? null,
    };
  }

  // PUT /automation/agent — grava no store CERTO conforme o CAMPO presente no
  // payload (não conforme `dto.brain` — o `brain` é sempre DERIVADO nesta era
  // adapter, nunca uma coluna gravável; ver resolveAgentBrain). Aceita os
  // dois campos ao mesmo tempo (empresa pode ter configurado os dois cérebros
  // em momentos diferentes — nenhum dos dois stores é destruído pelo outro).
  async updateAgent(user: any, dto: PutAutomationAgentRequest): Promise<AutomationAgentViewResponse> {
    const companyId = requireCompanyId(user);
    if (!isAdminOrMaster(user)) {
      throw new ForbiddenException(
        'Sem permissão para editar o agente. Regra de produto: o agente é da empresa, só Admin/USERMASTER configura.',
      );
    }

    const hasIaPayload = Boolean(dto?.ia && typeof dto.ia === 'object');
    const hasRoteiroPayload = Boolean(dto?.roteiro && typeof dto.roteiro === 'object');
    if (!hasIaPayload && !hasRoteiroPayload) {
      throw new BadRequestException('Envie "ia" e/ou "roteiro" para salvar.');
    }

    // identidade/fluxo -> AssistenteService.save (reusa sanitizeAssistenteConfig).
    // AssistenteService.save SEMPRE volta published:false na config editada
    // (WORM-14: "toda edição volta a rascunho") — o PUT nunca publica sozinho,
    // isso é papel exclusivo de POST /automation/agent/publish.
    if (hasIaPayload) {
      await this.assistenteService.save(user, dto.ia as any);
    }
    // roteiro -> InboxService.updateBotConfig (reusa a validação/sanitização
    // completa do PATCH /inbox/bot-config: pino armado, setup completo,
    // sanitizeAtendimentoBotConfigForTenant, validação de botões/ações).
    if (hasRoteiroPayload) {
      await this.inboxService.updateBotConfig(user, dto.roteiro as any);
    }

    // S10: flag ON -> sincroniza AutomationAgent com o estado JÁ VALIDADO
    // pelos services donos acima (best-effort — nunca derruba a resposta do
    // PUT por causa de uma falha de sincronização com a tabela nova).
    if (isAutomationAgentRuntimeEnabled()) {
      await this.syncAutomationAgentFromLegacy(user, companyId).catch((error: any) => {
        this.logger.warn(
          `[agent] sync pós-PUT em AutomationAgent falhou (não bloqueia a resposta) companyId=${companyId}: ${String(error?.message || error)}`,
        );
      });
    }

    return this.getView(user);
  }

  // POST /automation/agent/sandbox — liberado a TODOS (sem canManage).
  async sandbox(user: any, dto: AutomationAgentSandboxRequest): Promise<AutomationAgentSandboxResponse> {
    const companyId = requireCompanyId(user);

    // S10: flag ON -> lê a linha de AutomationAgent (se existir) pra servir
    // de default quando o request não trouxe `dto.agent` em edição — mesma
    // regra de precedência de antes (override do request sempre vence).
    const automationAgentRow = isAutomationAgentRuntimeEnabled()
      ? await this.prisma.automationAgent.findUnique({ where: { companyId } }).catch((e: any) => {
          this.logger.warn(`[agent] sandbox: leitura de AutomationAgent indisponível companyId=${companyId}: ${String(e?.message || e)}`);
          return null;
        })
      : null;

    const requestedBrain = dto?.agent?.brain;
    const brain: AgentBrain =
      requestedBrain === 'ia' || requestedBrain === 'roteiro'
        ? requestedBrain
        : automationAgentRow
          ? (automationAgentRow.brain === 'ia' ? 'ia' : 'roteiro')
          : (await this.loadBrainState(user, companyId)).brain;

    if (brain === 'ia') {
      // Delega pro MESMO caminho do POST /assistente/sandbox (que por sua vez
      // chama AssistenteSandboxService.reply — Ollama local, zero Webwhats).
      const assistenteDto: SandboxDto = {
        message: dto?.message,
        history: dto?.history,
        config: ((dto?.agent?.ia as any) ??
          (automationAgentRow ? this.iaConfigFromRow(automationAgentRow) : undefined)) as any,
      };
      const result = await this.assistenteService.runSandbox(user, assistenteDto);
      return {
        reply: result.reply,
        source: result.source,
        brain,
        dispatched: false,
        channel: 'sandbox',
        testNumber: result.testNumber,
        matchedCondicaoId: result.matchedCondicaoId,
        model: result.model,
        latencyMs: result.latencyMs,
      };
    }

    // brain 'roteiro' — replay determinístico local, sem IA e sem WhatsApp.
    const roteiroConfig = dto?.agent?.roteiro
      ? normalizeAtendimentoBotConfig(dto.agent.roteiro as any)
      : automationAgentRow
        ? this.roteiroConfigFromRow(automationAgentRow)
        : ((await this.inboxService.getBotConfig(user)) as AtendimentoBotConfig);
    const replay = replayRoteiroSandbox(
      roteiroConfig,
      Array.isArray(dto?.history) ? (dto.history as any) : [],
      String(dto?.message || ''),
    );
    return {
      reply: replay.reply,
      source: replay.source,
      brain,
      dispatched: false,
      channel: 'sandbox',
      stage: replay.stage,
      buttons: replay.buttons,
      matchedButtonId: replay.matchedButtonId,
    };
  }

  // POST /automation/agent/publish {on, brain?} — exige canManage.
  // brain 'ia'      -> mesmo caminho de POST /assistente/publish.
  // brain 'roteiro' -> mesmo caminho de PUT /bot/activation {type:'atendimento'}
  //                    (preserva pino armado + pré-voo — BotActivationService
  //                    já faz os dois checks, não duplicado aqui).
  async publish(user: any, dto: AutomationAgentPublishRequest): Promise<AutomationAgentPublishResponse> {
    const companyId = requireCompanyId(user);
    if (!isAdminOrMaster(user)) {
      throw new ForbiddenException(
        'Sem permissão para publicar o agente. Regra de produto: o agente é da empresa, só Admin/USERMASTER publica.',
      );
    }

    const requestedBrain = dto?.brain;
    const brain: AgentBrain =
      requestedBrain === 'ia' || requestedBrain === 'roteiro'
        ? requestedBrain
        : (await this.loadBrainState(user, companyId)).brain;
    const on = Boolean(dto?.on);

    if (brain === 'ia') {
      const result = await this.assistenteService.publish(user, on);
      const response = {
        published: Boolean(result.published),
        brain,
        ok: Boolean(result.ok),
        message: (result as any).message ?? null,
      };
      await this.syncAutomationAgentPublishedIfEnabled(companyId, response.published);
      return response;
    }

    const result = await this.botActivationService.putActivation(user, { type: 'atendimento', live: on });
    const response = { published: Boolean(result.live), brain, ok: Boolean((result as any).ok) };
    await this.syncAutomationAgentPublishedIfEnabled(companyId, response.published);
    return response;
  }

  // S10: sync best-effort — o gate (BOT_NOT_ARMED, preflight,
  // HBX_ASSISTENTE_PUBLISH_ENABLED) já rodou DENTRO de
  // assistenteService.publish/botActivationService.putActivation acima; se
  // algum deles lançou, este método nem é chamado (erro propaga normal). Uma
  // falha AQUI (ex.: linha ainda não migrada) nunca derruba a resposta do
  // publish.
  private async syncAutomationAgentPublishedIfEnabled(companyId: number, published: boolean): Promise<void> {
    if (!isAutomationAgentRuntimeEnabled()) return;
    await this.syncAutomationAgentPublished(companyId, published).catch((error: any) => {
      this.logger.warn(
        `[agent] sync pós-publish em AutomationAgent falhou (não bloqueia a resposta) companyId=${companyId}: ${String(error?.message || error)}`,
      );
    });
  }
}
