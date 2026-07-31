// Serviço de ativação do bot por tipo (PLAN-BOT-A + parte backend de PLAN-BOT-D).
// Fonte canônica de leitura e escrita do estado por tipo — não duplicar lógica aqui.

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ATENDIMENTO_AGENDA_CONFIG_CHANNEL,
  ATENDIMENTO_BOT_CONFIG_CHANNEL,
  isAtendimentoBotSetupComplete,
  normalizeAtendimentoBotConfig,
} from '../inbox/atendimento-config';
import {
  normalizeRecoveryBotConfig,
  RECOVERY_BOT_CONFIG_CHANNEL,
} from '../hbx-recovery/recovery-bot-config';
import type { BotTypeKey } from './dto/bot-activation.dto';
import {
  BotConfigStoreService,
  type BotConfigDomain,
  type BotConfigVersionInfo,
} from './config/bot-config-store.service';
import { PersonaIaService, type PerfilEmpresaIa } from '../vendas/persona-ia.service';

const BOT_CONFIG_DOMAINS: BotConfigDomain[] = [
  'atendimento_bot',
  'atendimento_agenda',
  'recovery_bot',
];

const RECOVERY_LEGACY_INTERNAL_CHANNELS = [
  RECOVERY_BOT_CONFIG_CHANNEL,
  'HBX_RECOVERY_META_TEMPLATES',
  ATENDIMENTO_BOT_CONFIG_CHANNEL,
  ATENDIMENTO_AGENDA_CONFIG_CHANNEL,
  '__BOT_MASTER_SWITCH__',
  '__BOT_TESTED_META__',
];

// ── helpers ────────────────────────────────────────────────────────────────

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

function isAdminOrMaster(user: any): boolean {
  if (user?.isSystemMaster) return true;
  const role = String(user?.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'USERMASTER';
}

// ── config helpers ──────────────────────────────────────────────────────────
// INTENTENGINE S3: `getConfigRow`/`saveConfigRow` (JSON cru em HbxRecoveryFlowStage)
// saem daqui — a fonte agora é o BotConfigStoreService (tabela BotConfig, versionada,
// dual-read com fallback pro canal legado). Ver docs/PLANEJAMENTOS/INTENTENGINE/
// INTENTENGINE-sprint3.md.

@Injectable()
export class BotActivationService {
  // ENTREVISTA FORÇADA (31/07/2026): a tranca que libera qualquer bot é o
  // cliente ter respondido as 3 perguntas (o que a empresa faz · o que vende ·
  // como a IA se apresenta). Plain class fora do grafo de DI, padrão do repo.
  private readonly personaIa: PersonaIaService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly botConfigStore: BotConfigStoreService,
  ) {
    this.personaIa = new PersonaIaService(this.prisma);
  }

  private async getAtendimentoConfig(companyId: number) {
    const payload = await this.botConfigStore.get(companyId, 'atendimento_bot');
    return normalizeAtendimentoBotConfig(payload as any);
  }

  // ── pré-voo: chip conectado ───────────────────────────────────────────────

  private async resolveChipConectado(companyId: number): Promise<boolean> {
    // Reusar a leitura de sessão existente (padrão do inbox.service.ts):
    // sessão ativa na empresa = chip conectado.
    const session = await this.prisma.whatsAppConnectionSession.findFirst({
      where: { companyId, status: 'active' },
      select: { id: true },
    });
    if (session?.id) return true;

    // Fallback: checar também whatsappStatus da empresa (Meta Cloud API).
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { whatsappStatus: true, whatsappModalStatus: true },
    });
    const status = String(company?.whatsappStatus || company?.whatsappModalStatus || '').toUpperCase();
    return status === 'CONNECTED';
  }

  // ── pré-voo: configCompleta por tipo ─────────────────────────────────────

  private async resolveConfigCompleta(
    companyId: number,
    type: BotTypeKey,
    atendimentoConfig?: ReturnType<typeof normalizeAtendimentoBotConfig>,
  ): Promise<boolean> {
    if (type === 'atendimento') {
      const config = atendimentoConfig ?? (await this.getAtendimentoConfig(companyId));
      return isAtendimentoBotSetupComplete(config);
    }

    if (type === 'recovery') {
      // Recovery pode iniciar por template Meta aprovado OU por uma etapa
      // durável habilitada (WhatsApp conectado/e-mail). Isso permite operar no
      // canal QR sem inventar nome de template, mantendo o pré-voo fail-closed.
      const payload = await this.botConfigStore.get(companyId, 'recovery_bot');
      if (!payload) return false;
      const config = normalizeRecoveryBotConfig(payload as any);
      const hasActiveTemplate = config.startTemplates.some((t) => t.active && t.name.trim());
      const hasMainMenu = config.mainMenuButtons.length > 0;
      const durableStage = hasActiveTemplate
        ? null
        : await this.prisma.hbxRecoveryFlowStage.findFirst({
            where: {
              companyId,
              enabled: true,
              channel: { notIn: RECOVERY_LEGACY_INTERNAL_CHANNELS },
            },
            select: { id: true },
          });
      return (hasActiveTemplate || Boolean(durableStage?.id)) && hasMainMenu;
    }

    if (type === 'prospeccao') {
      // Prospecção: mede a config de disparo REAL. Ritmo/teto/janela saíram da
      // campanha (CASA DO RISCO, 31/07/2026 — VendasComercialConfig tem default
      // seguro e nunca está "faltando"); o que a campanha ainda pode deixar
      // vazio é o TEXTO: ≥1 variante de 1º contato em filtersJson.
      const campaign = await this.prisma.vendasAutomationCampaign
        .findFirst({
          where: { companyId },
          orderBy: { updatedAt: 'desc' },
          select: { filtersJson: true },
        })
        .catch(() => null);
      if (!campaign) return false;

      let firstContactVariants: string[] = [];
      try {
        const filters =
          typeof campaign.filtersJson === 'string'
            ? JSON.parse(campaign.filtersJson)
            : (campaign.filtersJson as any) ?? {};
        if (Array.isArray(filters.firstContactVariants)) {
          firstContactVariants = (filters.firstContactVariants as unknown[])
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
        }
      } catch {
        // filtersJson malformado → incompleto
      }
      return firstContactVariants.length > 0;
    }

    return false;
  }

  // ── pré-voo completo por tipo ─────────────────────────────────────────────

  private async resolvePreflight(
    companyId: number,
    type: BotTypeKey,
    chipConectado: boolean,
    perfil: PerfilEmpresaIa,
    atendimentoConfig?: ReturnType<typeof normalizeAtendimentoBotConfig>,
  ) {
    const configCompleta = await this.resolveConfigCompleta(companyId, type, atendimentoConfig);
    return { chipConectado, configCompleta, entrevistaCompleta: perfil.entrevistaCompleta };
  }

  private resolveBlocked(
    type: BotTypeKey,
    preflight: { chipConectado: boolean; configCompleta: boolean; entrevistaCompleta: boolean },
  ): string | null {
    // ENTREVISTA antes de tudo: IA que não sabe o que a empresa faz não fala
    // em nome dela — nos TRÊS tipos, sem exceção (fail-closed).
    if (!preflight.entrevistaCompleta) {
      return 'A IA ainda não sabe o que sua empresa faz. Responda as 3 perguntas em Automação para liberar.';
    }
    if (!preflight.chipConectado) return 'Nenhum chip WhatsApp conectado.';
    if (!preflight.configCompleta) return 'Configuração do bot incompleta.';
    return null;
  }

  // ── GET /bot/activation ───────────────────────────────────────────────────
  // "ARMAR BOT" MORREU (31/07/2026): não existe mais pino do master nem chave
  // geral. A tranca é a ENTREVISTA (fail-closed no cliente) + chip + config —
  // o cadeado sempre diz o motivo, e o motivo é sempre resolvível pelo dono.

  async getActivation(user: any) {
    const companyId = requireCompanyId(user);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        recoveryBotLiveAt: true,
        recoveryBotLiveByUserId: true,
        prospectingBotLiveAt: true,
        prospectingBotLiveByUserId: true,
      },
    });

    const canAdminToggle = isAdminOrMaster(user);

    // Atendimento: ler globalBotEnabled do config JSON
    const atendimentoConfig = await this.getAtendimentoConfig(companyId);
    const atendimentoLive = Boolean(atendimentoConfig.routingRules?.globalBotEnabled);

    // Chip conectado (único para todos os tipos — mesma empresa)
    const chipConectado = await this.resolveChipConectado(companyId);

    // Entrevista/persona: UMA leitura serve os 3 tipos (a identidade é única).
    const perfil = await this.personaIa.getPerfil(companyId);

    // Pré-voo por tipo (paralelo)
    const [atendPreflight, recovPreflight, prospPreflight] = await Promise.all([
      this.resolvePreflight(companyId, 'atendimento', chipConectado, perfil, atendimentoConfig),
      this.resolvePreflight(companyId, 'recovery', chipConectado, perfil),
      this.resolvePreflight(companyId, 'prospeccao', chipConectado, perfil),
    ]);

    const recovLive = Boolean(company?.recoveryBotLiveAt);
    const prospLive = Boolean(company?.prospectingBotLiveAt);

    return {
      canAdminToggle,
      // A tela mostra o cadeado COM o motivo escrito — nunca mudo.
      perfil: {
        entrevistaCompleta: perfil.entrevistaCompleta,
        pendencias: perfil.pendencias,
        aiNome: perfil.persona.nome,
        aiIdentidade: perfil.persona.modo,
        aiUserId: perfil.persona.fonteUserId,
        empresaFaz: perfil.empresaFaz,
        catalogoPronto: perfil.catalogoPronto,
      },
      types: {
        atendimento: {
          live: atendimentoLive,
          preflight: atendPreflight,
          blocked: this.resolveBlocked('atendimento', atendPreflight),
        },
        recovery: {
          live: recovLive,
          preflight: recovPreflight,
          blocked: this.resolveBlocked('recovery', recovPreflight),
        },
        prospeccao: {
          live: prospLive,
          preflight: prospPreflight,
          blocked: this.resolveBlocked('prospeccao', prospPreflight),
        },
      },
    };
  }

  // ── PUT /bot/activation ───────────────────────────────────────────────────

  async putActivation(user: any, body: { type: BotTypeKey; live: boolean }) {
    const companyId = requireCompanyId(user);
    const userId = requireUserId(user);

    if (!isAdminOrMaster(user)) {
      throw new BadRequestException('Apenas administradores podem alterar a ativação do bot.');
    }

    const { type, live } = body;
    const validTypes: BotTypeKey[] = ['atendimento', 'recovery', 'prospeccao'];
    if (!validTypes.includes(type)) {
      throw new BadRequestException(`Tipo inválido: ${type}. Use atendimento, recovery ou prospeccao.`);
    }

    // Se está ligando ao vivo: checar pré-voo (entrevista + chip + config)
    if (live) {
      const chipConectado = await this.resolveChipConectado(companyId);
      const perfil = await this.personaIa.getPerfil(companyId);
      const atendimentoConfig =
        type === 'atendimento' ? await this.getAtendimentoConfig(companyId) : undefined;
      const preflight = await this.resolvePreflight(companyId, type, chipConectado, perfil, atendimentoConfig);
      const blocked = this.resolveBlocked(type, preflight);

      if (blocked) {
        throw new BadRequestException({ code: 'PREFLIGHT_FAILED', message: blocked, preflight });
      }
    }

    // Escrever fonte canônica por tipo
    if (type === 'atendimento') {
      await this.toggleAtendimentoLive(companyId, live, userId);
    } else if (type === 'recovery') {
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          recoveryBotLiveAt: live ? new Date() : null,
          recoveryBotLiveByUserId: live ? userId : null,
        },
      });
    } else if (type === 'prospeccao') {
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          prospectingBotLiveAt: live ? new Date() : null,
          prospectingBotLiveByUserId: live ? userId : null,
        },
      });
    }

    return { ok: true, type, live };
  }

  // ── DESLIGAR TUDO: derruba os 3 tipos num gesto (freio real) ───────────────
  // Substitui a antiga "chave geral": desligar continua existindo como AÇÃO
  // (derruba os 3 live de verdade), mas não existe mais um estado persistente
  // "off" bloqueando religamento — religar é pelo toggle de cada tipo, com o
  // pré-voo intacto (anti-"frota disparando em 1 clique", incidente 20/07).
  async desligarTudo(user: any) {
    const companyId = requireCompanyId(user);
    const userId = requireUserId(user);
    if (!isAdminOrMaster(user)) {
      throw new BadRequestException('Apenas administradores podem desligar os bots da empresa.');
    }
    await this.toggleAtendimentoLive(companyId, false, userId).catch(() => undefined);
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        recoveryBotLiveAt: null,
        recoveryBotLiveByUserId: null,
        prospectingBotLiveAt: null,
        prospectingBotLiveByUserId: null,
      },
    });
    return { ok: true };
  }

  // ── toggle atendimento via config JSON (reutilizar fonte canônica) ─────────

  private async toggleAtendimentoLive(companyId: number, live: boolean, userId?: number): Promise<void> {
    const config = await this.getAtendimentoConfig(companyId);

    if (live && !isAtendimentoBotSetupComplete(config)) {
      throw new BadRequestException({
        code: 'ATENDIMENTO_BOT_SETUP_INCOMPLETE',
        message: 'Conclua a configuração do bot antes de ativar respostas automáticas.',
      });
    }

    const updated = {
      ...config,
      routingRules: {
        ...config.routingRules,
        globalBotEnabled: live,
      },
    };
    await this.botConfigStore.save(companyId, 'atendimento_bot', updated, userId ?? null);
  }

  // ── INTENTENGINE S3: histórico + rollback de config (admin/master) ──────────
  // Endpoint mínimo pedido no sprint (sem UI elaborada — o painel fica de follow-up).
  // Reusa o mesmo guard/checagem admin já usado em putActivation/setMasterSwitch.

  private requireBotConfigDomain(domain: string): BotConfigDomain {
    if (!BOT_CONFIG_DOMAINS.includes(domain as BotConfigDomain)) {
      throw new BadRequestException(
        `Domain inválido: ${domain}. Use ${BOT_CONFIG_DOMAINS.join(' | ')}.`,
      );
    }
    return domain as BotConfigDomain;
  }

  async listConfigVersions(user: any, domainRaw: string): Promise<BotConfigVersionInfo[]> {
    const companyId = requireCompanyId(user);
    if (!isAdminOrMaster(user)) {
      throw new BadRequestException('Apenas administradores podem ver o histórico de config do bot.');
    }
    const domain = this.requireBotConfigDomain(domainRaw);
    return this.botConfigStore.listVersions(companyId, domain);
  }

  async rollbackConfig(user: any, domainRaw: string) {
    const companyId = requireCompanyId(user);
    const userId = requireUserId(user);
    if (!isAdminOrMaster(user)) {
      throw new BadRequestException('Apenas administradores podem reverter config do bot.');
    }
    const domain = this.requireBotConfigDomain(domainRaw);
    const payload = await this.botConfigStore.rollback(companyId, domain, userId);
    return { ok: true, domain, payload };
  }
}
