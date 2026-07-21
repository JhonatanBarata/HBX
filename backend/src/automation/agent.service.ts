import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AssistenteService } from '../assistente/assistente.service';
import type { AssistenteConfigShape } from '../assistente/assistente-flow';
import type { SandboxDto } from '../assistente/dto/assistente.dto';
import { InboxService } from '../inbox/inbox.service';
import {
  normalizeAtendimentoBotConfig,
  type AtendimentoBotButton,
  type AtendimentoBotConfig,
} from '../inbox/atendimento-config';
import { BotActivationService } from '../bot/bot-activation.service';
import { BotConfigStoreService, type BotConfigVersionInfo } from '../bot/config/bot-config-store.service';
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

  // GET /automation/agent
  async getView(user: any): Promise<AutomationAgentViewResponse> {
    const companyId = requireCompanyId(user);
    const canManage = isAdminOrMaster(user);

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
    requireCompanyId(user);
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

    return this.getView(user);
  }

  // POST /automation/agent/sandbox — liberado a TODOS (sem canManage).
  async sandbox(user: any, dto: AutomationAgentSandboxRequest): Promise<AutomationAgentSandboxResponse> {
    const companyId = requireCompanyId(user);

    const requestedBrain = dto?.agent?.brain;
    const brain: AgentBrain =
      requestedBrain === 'ia' || requestedBrain === 'roteiro'
        ? requestedBrain
        : (await this.loadBrainState(user, companyId)).brain;

    if (brain === 'ia') {
      // Delega pro MESMO caminho do POST /assistente/sandbox (que por sua vez
      // chama AssistenteSandboxService.reply — Ollama local, zero Webwhats).
      const assistenteDto: SandboxDto = {
        message: dto?.message,
        history: dto?.history,
        config: dto?.agent?.ia as any,
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
      return {
        published: Boolean(result.published),
        brain,
        ok: Boolean(result.ok),
        message: (result as any).message ?? null,
      };
    }

    const result = await this.botActivationService.putActivation(user, { type: 'atendimento', live: on });
    return { published: Boolean(result.live), brain, ok: Boolean((result as any).ok) };
  }
}
