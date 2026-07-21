import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModulesService } from '../modules/modules.service';
import { AssistenteService } from '../assistente/assistente.service';
import { BotActivationService } from '../bot/bot-activation.service';
import { BotConfigStoreService } from '../bot/config/bot-config-store.service';
import { VendasAutomationService } from '../vendas/vendas-automation.service';
import { CadenciaGatilhoService } from '../cadencia/cadencia-gatilho.service';
import { CadenciaRotinaService } from '../cadencia/cadencia-rotina.service';
import { OutboundOrchestratorService, type OutboundExecutorTelemetry } from './outbound-orchestrator.service';
import { automationFlag } from './automation-flags';

// ============================================================================
// S04 (MOTOR-ÚNICO) — AutomationOverviewService.
//
// Painel único de status (README: "o que está ligado, pré-voo do chip, teto do
// dia") — hoje espalhado em 3 sistemas de liga/desliga sem visão conjunta
// (AssistenteConfig, BotConfig por domain, pino bot-activation) + o motor de
// prospecção (vendas-automation) + cadência (gatilhos/rotinas).
//
// ADITIVO PURO: só LÊ. Nenhum motor existente muda de comportamento. Cada
// bloco INJETA o service dono (nunca reimplementa a lógica de status) e é
// FAIL-SOFT — se o motor de origem falhar/lançar, o bloco vira
// `{ ok:false, reason }`, nunca derruba o endpoint inteiro
// (docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/S04-modulo-automation-overview.md,
// "Cada sub-bloco do overview é fail-soft").
// ============================================================================

export type AgentBrain = 'roteiro' | 'ia';

type OverviewBlockOk<T extends Record<string, unknown>> = { ok: true } & T;
type OverviewBlockErr = { ok: false; reason: string };
export type OverviewBlock<T extends Record<string, unknown>> = OverviewBlockOk<T> | OverviewBlockErr;

export type AutomationOverviewResponse = {
  companyId: number;
  // CONTRATO.md §3.1 fixa `{ bot, vendas }`. `atendimento` entra aqui de forma
  // ADITIVA (nada do contrato é removido/renomeado): o gate de acesso desta
  // sprint é OR de 3 chaves (S04.md "⚠️ Gate de 3 chaves" — atendimento|bot|
  // vendas), e o front (S12) precisa enxergar a 3ª chave pra decidir o que
  // mostrar em cada seção.
  moduleAccess: { atendimento: boolean; bot: boolean; vendas: boolean };
  botArmed: { armed: boolean; armedAt: string | null; armedByUserId: number | null };
  atendente: OverviewBlock<{ brain: AgentBrain | null; published: boolean; updatedAt: string | null }>;
  cobranca: OverviewBlock<{ live: boolean; workerEnabled: boolean }>;
  prospeccao: OverviewBlock<{ live: boolean; campaignId: string | null; pendingLeads: number }>;
  regras: OverviewBlock<{ gatilhosAtivos: number; rotinasAtivas: number }>;
  // Bloco `motor` é uma extensão ADITIVA além do shape fixado no CONTRATO.md
  // §3.1 (que não lista uma chave `motor` de topo) — pedido explícito de
  // S04-modulo-automation-overview.md item 1 ("motor: flags relevantes
  // (runnerEnabled da cadência, publishEnabled do assistente) e identidade do
  // chip"). Não remove nem renomeia nenhum campo do contrato; só soma um
  // bloco novo, também fail-soft.
  // `executores` entrou na S07 (MOTOR-ÚNICO) — ADITIVO dentro do bloco `motor`
  // já existente (nenhum campo anterior mudou de nome/tipo): telemetria do
  // OutboundOrchestratorService (S07-outbound-orchestrator.md item 5).
  motor: OverviewBlock<{
    runnerEnabled: boolean;
    publishEnabled: boolean;
    chipConectado: boolean;
    executores: OutboundExecutorTelemetry[];
  }>;
};

function requireCompanyId(user: any): number {
  const companyId = Number(
    user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId || 0,
  );
  if (!companyId) throw new BadRequestException('Empresa não identificada.');
  return companyId;
}

function requireUserId(user: any): number {
  const id = Number(user?.id || 0);
  if (!id) throw new BadRequestException('Usuário não identificado.');
  return id;
}

// S20 (MOTOR-ÚNICO): `automationFlag` deixou de ser local — mora em
// `./automation-flags.ts` (FONTE ÚNICA, mesmo helper que os pontos de leitura
// REAIS usam: conversation-assistant-runtime.service.ts, cadencia*.ts,
// messaging.service.ts, vendas.service.ts, assistente.service.ts). Uso aqui é
// SÓ LEITURA/relatório — não muda comportamento de nenhum motor, só reflete o
// valor efetivo (nova OU legada) no painel.
//
// Nomes das 2 flags desta seção FIXADOS na S20 (S20-backend-orfaos-flags-ddl.md
// item 2) — supersedem a proposta provisória de CONTRATO.md §5.1
// (`HBX_AUTOMATION_AGENT_PUBLISH_ENABLED`/`HBX_AUTOMATION_PROSPECCAO_RUNNER_
// ENABLED`, que nunca chegou a ser lida em runtime): `HBX_AUTOMATION_IA_LIVE` e
// `HBX_AUTOMATION_RUNNER_ENABLED`, ver `buildMotor` abaixo.

@Injectable()
export class AutomationOverviewService {
  private readonly logger = new Logger(AutomationOverviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly modulesService: ModulesService,
    private readonly assistenteService: AssistenteService,
    private readonly botActivationService: BotActivationService,
    private readonly botConfigStore: BotConfigStoreService,
    private readonly vendasAutomationService: VendasAutomationService,
    private readonly cadenciaGatilhoService: CadenciaGatilhoService,
    private readonly cadenciaRotinaService: CadenciaRotinaService,
    // S07: @Optional() de propósito — os testes existentes deste service
    // (automation-overview.service.test.ts) instanciam via
    // `Object.create(prototype)` sem passar por este construtor; o bloco
    // `motor` precisa continuar `ok:true` mesmo com o orquestrador ausente
    // (ver `buildMotor`, fallback `?? []`).
    @Optional() private readonly outboundOrchestrator?: OutboundOrchestratorService,
  ) {}

  // GET /automation/overview
  async getOverview(user: any): Promise<AutomationOverviewResponse> {
    const companyId = requireCompanyId(user);
    const userId = requireUserId(user);

    const [accessAtendimento, accessBot, accessVendas] = await Promise.all([
      this.safeAccess(userId, 'atendimento'),
      this.safeAccess(userId, 'bot'),
      this.safeAccess(userId, 'vendas'),
    ]);
    const moduleAccess = { atendimento: accessAtendimento, bot: accessBot, vendas: accessVendas };

    // Fonte única de armed/live/preflight por tipo — BotActivationService já
    // agrega isso pro painel /bot/activation; reusar em vez de reconsultar
    // (proibição do contrato: "não duplicar lógica de status").
    const activation = await this.botActivationService.getActivation(user).catch((e: any) => {
      this.logger.warn(`[automation-overview] getActivation indisponível: ${String(e?.message || e)}`);
      return null;
    });

    const company = await this.prisma.company
      .findUnique({ where: { id: companyId }, select: { botArmedAt: true, botArmedByUserId: true } })
      .catch(() => null);

    const botArmed = {
      armed: Boolean(activation?.armed ?? company?.botArmedAt),
      armedAt: company?.botArmedAt ? new Date(company.botArmedAt).toISOString() : null,
      armedByUserId: company?.botArmedByUserId ?? null,
    };

    const [atendente, cobranca, prospeccao, regras, motor] = await Promise.all([
      moduleAccess.atendimento || moduleAccess.bot
        ? this.buildAtendente(user, companyId, activation)
        : Promise.resolve(this.denied()),
      // Cobrança: recovery bot-config é gateado por `atendimento`, activation é
      // `bot` (CONTRATO.md §3.2, achado da terceira chave) — só monta o bloco
      // se a empresa tiver as DUAS (README decisão nº2, mapa por seção da S04.md).
      moduleAccess.atendimento && moduleAccess.bot
        ? this.buildCobranca(activation)
        : Promise.resolve(this.denied()),
      moduleAccess.vendas ? this.buildProspeccao(user, activation) : Promise.resolve(this.denied()),
      moduleAccess.vendas ? this.buildRegras(companyId) : Promise.resolve(this.denied()),
      this.buildMotor(activation),
    ]);

    return { companyId, moduleAccess, botArmed, atendente, cobranca, prospeccao, regras, motor };
  }

  private denied(): OverviewBlockErr {
    return { ok: false, reason: 'module_access_denied' };
  }

  private async safeAccess(userId: number, key: string): Promise<boolean> {
    try {
      return await this.modulesService.canUserAccessModule(userId, key);
    } catch (e: any) {
      this.logger.warn(`[automation-overview] canUserAccessModule(${key}) falhou: ${String(e?.message || e)}`);
      return false;
    }
  }

  // ── atendente: funde bot-atendimento (roteiro) + assistente (IA) ───────────
  private async buildAtendente(
    user: any,
    companyId: number,
    activation: any,
  ): Promise<OverviewBlock<{ brain: AgentBrain | null; published: boolean; updatedAt: string | null }>> {
    try {
      // Sem swallow aqui de propósito: `assistenteService.get`/`botConfigStore.
      // listVersions` só lançam por falha de infra (o companyId já foi validado
      // acima) — se lançarem, é "motor indisponível" de verdade e o bloco
      // inteiro deve virar ok:false (contrato da sprint), não dado parcial.
      const assistenteResult = await this.assistenteService.get(user);
      const assistente = assistenteResult?.assistente ?? null;
      const roteiroLive = Boolean(activation?.types?.atendimento?.live);
      const roteiroVersions = await this.botConfigStore.listVersions(companyId, 'atendimento_bot');
      const roteiroConfigured = roteiroVersions.length > 0;

      // Precedência real (CONTRATO §1.2, passo 6): IA publicada responde antes
      // do roteiro. Se nenhuma está "ao vivo", relatamos a que está configurada
      // (dado útil pro painel mesmo antes de qualquer uma ser ligada).
      let brain: AgentBrain | null = null;
      if (assistente?.published) brain = 'ia';
      else if (roteiroLive) brain = 'roteiro';
      else if (assistente) brain = 'ia';
      else if (roteiroConfigured) brain = 'roteiro';

      const published =
        brain === 'ia' ? Boolean(assistente?.published) : brain === 'roteiro' ? roteiroLive : false;
      const updatedAt =
        brain === 'ia'
          ? (assistente?.updatedAt ?? null)
          : brain === 'roteiro' && roteiroVersions[0]
            ? new Date(roteiroVersions[0].createdAt).toISOString()
            : null;

      return { ok: true, brain, published, updatedAt };
    } catch (e: any) {
      this.logger.warn(`[automation-overview] bloco atendente falhou: ${String(e?.message || e)}`);
      return { ok: false, reason: 'atendente_unavailable' };
    }
  }

  // ── cobrança: Recovery reembalado ───────────────────────────────────────────
  private async buildCobranca(activation: any): Promise<OverviewBlock<{ live: boolean; workerEnabled: boolean }>> {
    try {
      const live = Boolean(activation?.types?.recovery?.live);
      const workerEnabled = automationFlag(
        'HBX_AUTOMATION_COBRANCA_WORKER_ENABLED',
        'HBX_RECOVERY_AUTOMATION_WORKER_ENABLED',
      );
      return { ok: true, live, workerEnabled };
    } catch (e: any) {
      this.logger.warn(`[automation-overview] bloco cobranca falhou: ${String(e?.message || e)}`);
      return { ok: false, reason: 'cobranca_unavailable' };
    }
  }

  // ── prospecção: REUSA o live-status do vendas-automation ────────────────────
  private async buildProspeccao(
    user: any,
    activation: any,
  ): Promise<OverviewBlock<{ live: boolean; campaignId: string | null; pendingLeads: number }>> {
    try {
      const live = Boolean(activation?.types?.prospeccao?.live);
      // getLiveStatusForUser lança se o bot não estiver armado (estado normal
      // pra empresa que nunca ligou o pino) — isso NÃO é "motor indisponível",
      // então degradamos pros defaults em vez de marcar o bloco inteiro ok:false.
      const liveStatus = await this.vendasAutomationService.getLiveStatusForUser(user).catch((e: any) => {
        this.logger.debug(`[automation-overview] live-status prospeccao indisponível: ${String(e?.message || e)}`);
        return null;
      });
      const campaignId = liveStatus?.campaign?.id ?? null;
      const pendingLeads = Number(liveStatus?.pendingJobs ?? liveStatus?.counters?.pendingJobs ?? 0) || 0;
      return { ok: true, live, campaignId, pendingLeads };
    } catch (e: any) {
      this.logger.warn(`[automation-overview] bloco prospeccao falhou: ${String(e?.message || e)}`);
      return { ok: false, reason: 'prospeccao_unavailable' };
    }
  }

  // ── regras: contagens de gatilhos/rotinas ativas ────────────────────────────
  private async buildRegras(
    companyId: number,
  ): Promise<OverviewBlock<{ gatilhosAtivos: number; rotinasAtivas: number }>> {
    try {
      const [gatilhosAtivos, rotinasAtivas] = await Promise.all([
        this.cadenciaGatilhoService.countActiveForCompany(companyId),
        this.cadenciaRotinaService.countActiveForCompany(companyId),
      ]);
      return { ok: true, gatilhosAtivos, rotinasAtivas };
    } catch (e: any) {
      this.logger.warn(`[automation-overview] bloco regras falhou: ${String(e?.message || e)}`);
      return { ok: false, reason: 'regras_unavailable' };
    }
  }

  // ── motor: flags + identidade do chip (mesma fonte do preflight do bot) ─────
  private async buildMotor(
    activation: any,
  ): Promise<
    OverviewBlock<{
      runnerEnabled: boolean;
      publishEnabled: boolean;
      chipConectado: boolean;
      executores: OutboundExecutorTelemetry[];
    }>
  > {
    try {
      const runnerEnabled = automationFlag(
        'HBX_AUTOMATION_RUNNER_ENABLED',
        'HBX_CADENCIA_RUNNER_ENABLED',
      );
      const publishEnabled = automationFlag(
        'HBX_AUTOMATION_IA_LIVE',
        'HBX_ASSISTENTE_PUBLISH_ENABLED',
      );
      const chipConectado = Boolean(activation?.types?.atendimento?.preflight?.chipConectado);
      // S07: telemetria do OutboundOrchestratorService. `?? []` cobre tanto o
      // orquestrador ausente (testes antigos, ver construtor) quanto getTelemetry
      // lançando por algum motivo inesperado — nunca derruba o bloco `motor`.
      const executores = this.outboundOrchestrator?.getTelemetry?.() ?? [];
      return { ok: true, runnerEnabled, publishEnabled, chipConectado, executores };
    } catch (e: any) {
      this.logger.warn(`[automation-overview] bloco motor falhou: ${String(e?.message || e)}`);
      return { ok: false, reason: 'motor_unavailable' };
    }
  }
}
