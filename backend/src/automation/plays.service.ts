import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModulesService } from '../modules/modules.service';
import { CadenciaService } from '../cadencia/cadencia.service';
import { CadenciaRotinaService } from '../cadencia/cadencia-rotina.service';
import { VendasAutomationService } from '../vendas/vendas-automation.service';
import { BotActivationService } from '../bot/bot-activation.service';
import type { AplicarCadenciaDto } from '../cadencia/dto/cadencia.dto';

// ============================================================================
// S11 (MOTOR-ÚNICO) — PlaysService.
//
// Prospecção, cadências e rotinas são todos "plays" proativos (o sistema toma
// iniciativa). Este service é um ADAPTER DE LEITURA puro: nenhuma linha nova,
// nenhuma regra de negócio nova — só COMPÕE o que já existe em 3 lugares
// diferentes numa lista uniforme, e ROTEIA ações pros services DONOS.
//
//   tipo 'cadencia'   -> CadenciaService (lista via listForUser; ação via
//                        updateForUser({ativa}) e aplicarForUser)
//   tipo 'rotina'     -> CadenciaRotinaService (lista via listForUser; ação
//                        via updateForUser({ativa}))
//   tipo 'prospeccao' -> VendasAutomationService.getLiveStatusForUser (leitura,
//                        singleton por empresa) + BotActivationService (ativo
//                        vem de getActivation; ação via putActivation({type:
//                        'prospeccao', live}))
//
// canManage/permissão: NUNCA reimplementado aqui. CadenciaService/
// CadenciaRotinaService já checam `isAdmin || canViewCompanyCards`
// (assertCanManage, via resolveVendasAccessContext) dentro de updateForUser/
// aplicarForUser; BotActivationService.putActivation já checa
// isAdminOrMaster. Este service só delega — se o domínio lançar
// Forbidden/BadRequest, o erro propaga tal como está (mesmo padrão do
// AgentService, S05).
//
// Gate de módulo: os 3 tipos vivem hoje atrás de `vendas`
// (CadenciaController e VendasController são `@ModuleAccess('vendas')` —
// CONTRATO.md §2.4 tabela por seção). Diferente do bloco `atendente`/
// `cobranca` do AutomationOverviewService (S04), aqui um ÚNICO check de
// módulo cobre os 3 blocos porque os 3 domínios-fonte já vivem atrás da
// MESMA chave. `VendasAutomationService.getLiveStatusForUser` (prospecção)
// não se autogate por módulo (só por `botArmedAt`, ver assertEntitlement) —
// por isso o gate explícito aqui é necessário mesmo pra prospecção, replicando
// o motivo documentado em automation-overview.service.ts (buildProspeccao só
// é chamado quando `moduleAccess.vendas` é true).
// ============================================================================

export type AutomationPlayTipo = 'prospeccao' | 'cadencia' | 'rotina';

export type AutomationPlay = {
  id: string;
  tipo: AutomationPlayTipo;
  nome: string;
  ativo: boolean;
  resumo: string;
  contagem: number;
  ultimaExecucao: { at: string | null; status: string | null; count: number | null };
  fonte: { savedSearchId?: string; persona?: string };
};

export type AutomationPlayToggleResponse = { ok: true; tipo: AutomationPlayTipo; id: string; ativo: boolean };

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

@Injectable()
export class PlaysService {
  private readonly logger = new Logger(PlaysService.name);

  constructor(
    private readonly modulesService: ModulesService,
    private readonly cadenciaService: CadenciaService,
    private readonly cadenciaRotinaService: CadenciaRotinaService,
    private readonly vendasAutomationService: VendasAutomationService,
    private readonly botActivationService: BotActivationService,
  ) {}

  private async safeVendasAccess(userId: number): Promise<boolean> {
    try {
      return await this.modulesService.canUserAccessModule(userId, 'vendas');
    } catch (e: any) {
      this.logger.warn(`[plays] canUserAccessModule(vendas) falhou: ${String(e?.message || e)}`);
      return false;
    }
  }

  // GET /automation/plays — S11.md item 1: shape "de fio" é a LISTA (array),
  // sem wrapper `{ok,...}` (CONTRATO ainda não cobre esta rota; S11.md é a
  // lei desta sprint e é explícito: "GET /automation/plays -> [{...}]").
  async listForUser(user: any): Promise<AutomationPlay[]> {
    requireCompanyId(user); // valida cedo — mesmo padrão dos vizinhos da pasta
    const userId = requireUserId(user);

    const hasVendas = await this.safeVendasAccess(userId);
    if (!hasVendas) return [];

    const [prospeccaoPlay, cadenciaPlays, rotinaPlays] = await Promise.all([
      this.buildProspeccaoPlay(user),
      this.buildCadenciaPlays(user),
      this.buildRotinaPlays(user),
    ]);

    return [...(prospeccaoPlay ? [prospeccaoPlay] : []), ...cadenciaPlays, ...rotinaPlays];
  }

  // ── prospeccao: singleton por empresa, REUSA o live-status do vendas-automation ──
  private async buildProspeccaoPlay(user: any): Promise<AutomationPlay | null> {
    try {
      const [activation, liveStatus] = await Promise.all([
        this.botActivationService.getActivation(user).catch((e: any) => {
          this.logger.warn(`[plays] getActivation indisponível: ${String(e?.message || e)}`);
          return null;
        }),
        // getLiveStatusForUser lança se o bot não estiver armado (estado normal
        // pra empresa que nunca ligou o pino) — mesma degradação graciosa que
        // AutomationOverviewService.buildProspeccao já faz (S04).
        this.vendasAutomationService.getLiveStatusForUser(user).catch((e: any) => {
          this.logger.debug(`[plays] live-status prospeccao indisponível: ${String(e?.message || e)}`);
          return null;
        }),
      ]);

      const campaign = (liveStatus as any)?.campaign ?? null;
      const pendingLeads = Number((liveStatus as any)?.pendingJobs ?? (liveStatus as any)?.counters?.pendingJobs ?? 0) || 0;
      const sentToday = Number((liveStatus as any)?.sentToday ?? 0) || 0;

      return {
        id: campaign?.id ? String(campaign.id) : 'prospeccao',
        tipo: 'prospeccao',
        nome: 'Prospecção',
        ativo: Boolean((activation as any)?.types?.prospeccao?.live),
        resumo: campaign ? this.describeProspeccaoCampaign(campaign) : 'Nenhuma campanha configurada.',
        contagem: pendingLeads,
        ultimaExecucao: {
          at: (liveStatus as any)?.lastSuccessfulSendAt ?? null,
          status: (liveStatus as any)?.status ?? null,
          count: sentToday || null,
        },
        fonte: {},
      };
    } catch (e: any) {
      this.logger.warn(`[plays] bloco prospeccao falhou: ${String(e?.message || e)}`);
      return null;
    }
  }

  private describeProspeccaoCampaign(campaign: { segment?: string | null; city?: string | null; state?: string | null }): string {
    const segment = String(campaign.segment || 'contatos').trim();
    const city = String(campaign.city || '').trim();
    const state = String(campaign.state || '').trim().toUpperCase();
    if (city) return `${segment} em ${city}${state ? `/${state}` : ''}`;
    if (state) return `${segment} no estado ${state}`;
    return `${segment} no Brasil`;
  }

  // ── cadencia (persona): REUSA CadenciaService.listForUser ───────────────────
  private async buildCadenciaPlays(user: any): Promise<AutomationPlay[]> {
    try {
      const result = await this.cadenciaService.listForUser(user);
      const cadencias: any[] = Array.isArray(result?.cadencias) ? result.cadencias : [];
      return cadencias.map((c) => ({
        id: c.id,
        tipo: 'cadencia' as const,
        nome: c.nome,
        ativo: Boolean(c.ativa),
        resumo: `${Number(c.passosCount ?? 0)} toques · ${Number(c.whatsSteps ?? 0)} WhatsApp`,
        contagem: Number(c.inscritos ?? 0) || 0,
        // Cadencia (persona) não tem coluna de "última execução" própria (é
        // template; a execução real é por CadenciaInscricao/lead) — o adapter
        // não inventa uma tabela/aggregation nova pra isso (fora do escopo
        // "sem schema novo" do S11.md); reporta null, honesto sobre a lacuna.
        ultimaExecucao: { at: null, status: null, count: null },
        fonte: { persona: c.persona },
      }));
    } catch (e: any) {
      // Empresa sem módulo `vendas` cai aqui via ForbiddenException de
      // resolveVendasAccessContext (CadenciaService.resolveContext) — fail-soft
      // por bloco (S04), nunca 500. Na prática o gate `hasVendas` acima já
      // intercepta antes; este catch cobre qualquer outra falha inesperada.
      this.logger.warn(`[plays] bloco cadencia falhou: ${String(e?.message || e)}`);
      return [];
    }
  }

  // ── rotina: REUSA CadenciaRotinaService.listForUser ──────────────────────────
  private async buildRotinaPlays(user: any): Promise<AutomationPlay[]> {
    try {
      const result = await this.cadenciaRotinaService.listForUser(user);
      const rotinas: any[] = Array.isArray(result?.rotinas) ? result.rotinas : [];
      return rotinas.map((r) => ({
        id: r.id,
        tipo: 'rotina' as const,
        nome: r.nome,
        ativo: Boolean(r.ativa),
        resumo: `A cada ${Number(r.everyWeeks ?? 1)} semana(s) · até ${Number(r.maxLeads ?? 0)} leads`,
        contagem: Number(r.maxLeads ?? 0) || 0,
        ultimaExecucao: {
          at: r.lastRunAt ?? null,
          status: r.lastRunStatus ?? null,
          count: r.lastRunCount ?? null,
        },
        fonte: { savedSearchId: r.savedSearchId },
      }));
    } catch (e: any) {
      this.logger.warn(`[plays] bloco rotina falhou: ${String(e?.message || e)}`);
      return [];
    }
  }

  // POST /automation/plays/:tipo/:id/toggle — S11.md item 2: "PATCH ativa nos
  // services de cadencia/rotina; prospecção -> fluxo atual de live do tipo
  // prospeccao (bot-activation)". Permissão NÃO é checada aqui — cada método
  // donde delega já checa a sua (ver header do arquivo); erro propaga como
  // veio (Forbidden/BadRequest/NotFound do domínio, sem tradução).
  async togglePlay(user: any, tipoRaw: string, idRaw: string, ativo: boolean): Promise<AutomationPlayToggleResponse> {
    const id = String(idRaw || '').trim();
    const tipo = String(tipoRaw || '').trim().toLowerCase();

    if (tipo === 'cadencia') {
      const result = await this.cadenciaService.updateForUser(user, id, { ativa: ativo });
      return { ok: true, tipo: 'cadencia', id, ativo: Boolean(result?.cadencia?.ativa) };
    }
    if (tipo === 'rotina') {
      const result = await this.cadenciaRotinaService.updateForUser(user, id, { ativa: ativo });
      return { ok: true, tipo: 'rotina', id, ativo: Boolean(result?.rotina?.ativa) };
    }
    if (tipo === 'prospeccao') {
      const result = await this.botActivationService.putActivation(user, { type: 'prospeccao', live: ativo });
      return { ok: true, tipo: 'prospeccao', id, ativo: Boolean((result as any)?.live) };
    }
    throw new BadRequestException(`Tipo de play inválido: ${tipoRaw}. Use prospeccao, cadencia ou rotina.`);
  }

  // POST /automation/plays/cadencia/:id/aplicar — S11.md item 2: "delega pro
  // endpoint/service atual". Mesmo shape de resposta de POST /cadencia/:id/aplicar
  // (zero tradução — CadenciaService.aplicarForUser já checa canManage).
  async aplicarCadenciaPlay(user: any, idRaw: string, dto: AplicarCadenciaDto) {
    const id = String(idRaw || '').trim();
    return this.cadenciaService.aplicarForUser(user, id, dto || {});
  }
}
