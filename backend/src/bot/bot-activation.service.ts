// Serviço de ativação do bot por tipo (PLAN-BOT-A + parte backend de PLAN-BOT-D).
// Fonte canônica de leitura e escrita do estado por tipo — não duplicar lógica aqui.

import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  resolveBotActivation,
  isBotArmedForCompany,
} from '../modules/bot-activation-state';
import {
  isAtendimentoBotSetupComplete,
  normalizeAtendimentoBotConfig,
  ATENDIMENTO_BOT_CONFIG_CHANNEL,
  ATENDIMENTO_BOT_CONFIG_TITLE,
} from '../inbox/atendimento-config';
import { normalizeRecoveryBotConfig } from '../hbx-recovery/recovery-bot-config';
import type { BotTypeKey } from './dto/bot-activation.dto';

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

// ── config helpers (reusar padrão do inbox.service) ────────────────────────

type ConfigRow = { id: string; template: string | null } | null;

@Injectable()
export class BotActivationService {
  constructor(private readonly prisma: PrismaService) {}

  // ── leitura de config JSON (mesmo padrão do InboxService) ────────────────

  private async getConfigRow(companyId: number, channel: string, title: string): Promise<ConfigRow> {
    return this.prisma.hbxRecoveryFlowStage.findFirst({
      where: { companyId, channel, title },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, template: true },
    });
  }

  private async saveConfigRow(
    companyId: number,
    channel: string,
    title: string,
    payload: unknown,
  ): Promise<void> {
    const row = await this.getConfigRow(companyId, channel, title);
    const data = {
      companyId,
      title,
      channel,
      template: JSON.stringify(payload || {}),
      daysAfter: 0,
      enabled: false,
      sortOrder: 0,
    };
    if (row?.id) {
      await this.prisma.hbxRecoveryFlowStage.update({ where: { id: row.id }, data });
      return;
    }
    await this.prisma.hbxRecoveryFlowStage.create({ data });
  }

  private async getAtendimentoConfig(companyId: number) {
    const row = await this.getConfigRow(
      companyId,
      ATENDIMENTO_BOT_CONFIG_CHANNEL,
      ATENDIMENTO_BOT_CONFIG_TITLE,
    );
    if (!row?.template) return normalizeAtendimentoBotConfig(null);
    try {
      return normalizeAtendimentoBotConfig(JSON.parse(row.template));
    } catch {
      return normalizeAtendimentoBotConfig(null);
    }
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

  // ── chave geral (master switch) por empresa — INDEPENDE de config/chip ───────
  // Guardada no padrão de config-row (sem migration). off=true → o dono DESLIGOU o
  // bot inteiro; o ícone do topo fica CINZA mesmo com tudo configurado.
  private readonly BOT_MASTER_SWITCH_CHANNEL = '__BOT_MASTER_SWITCH__';

  private async resolveMasterOff(companyId: number): Promise<boolean> {
    const row = await this.getConfigRow(companyId, this.BOT_MASTER_SWITCH_CHANNEL, 'v1');
    if (!row?.template) return false; // sem registro = chave LIGADA (default)
    try {
      return Boolean(JSON.parse(row.template)?.off);
    } catch {
      return false;
    }
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
      // Recovery: tem start template ativo + mainMenuButtons não vazios.
      const row = await this.getConfigRow(
        companyId,
        '__HBX_RECOVERY_BOT_CONFIG__',
        'config_v1',
      );
      if (!row?.template) return false;
      try {
        const config = normalizeRecoveryBotConfig(JSON.parse(row.template));
        const hasActiveTemplate = config.startTemplates.some((t) => t.active && t.name.trim());
        const hasMainMenu = config.mainMenuButtons.length > 0;
        return hasActiveTemplate && hasMainMenu;
      } catch {
        return false;
      }
    }

    if (type === 'prospeccao') {
      // Prospecção: mede a config de disparo REAL (espelha isProspConfigComplete do front).
      // Pega a última vendasAutomationCampaign da empresa e verifica:
      //   - ≥1 variante de 1º contato não-vazia (firstContactVariants em filtersJson)
      //   - intervalMinutes numérico
      //   - dailyLimit numérico
      const campaign = await this.prisma.vendasAutomationCampaign
        .findFirst({
          where: { companyId },
          orderBy: { updatedAt: 'desc' },
          select: { filtersJson: true, intervalMinutes: true, dailyLimit: true },
        })
        .catch(() => null);
      if (!campaign) return false;

      // intervalMinutes e dailyLimit estão em colunas diretas da tabela
      if (typeof campaign.intervalMinutes !== 'number') return false;
      if (typeof campaign.dailyLimit !== 'number') return false;

      // firstContactVariants fica dentro do JSON filtersJson
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
    atendimentoConfig?: ReturnType<typeof normalizeAtendimentoBotConfig>,
  ) {
    const configCompleta = await this.resolveConfigCompleta(companyId, type, atendimentoConfig);
    return { chipConectado, configCompleta };
  }

  private resolveBlocked(
    type: BotTypeKey,
    armed: boolean,
    preflight: { chipConectado: boolean; configCompleta: boolean },
  ): string | null {
    if (!armed) return 'Bot não ativado pela plataforma. Acione o suporte.';
    if (!preflight.chipConectado) return 'Nenhum chip WhatsApp conectado.';
    if (!preflight.configCompleta) return 'Configuração do bot incompleta.';
    return null;
  }

  // ── GET /bot/activation ───────────────────────────────────────────────────

  async getActivation(user: any) {
    const companyId = requireCompanyId(user);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        botArmedAt: true,
        botArmChannel: true,
        botArmedByUserId: true,
        botArmReason: true,
        recoveryBotLiveAt: true,
        recoveryBotLiveByUserId: true,
        prospectingBotLiveAt: true,
        prospectingBotLiveByUserId: true,
      },
    });

    const activation = resolveBotActivation(company);
    const armed = activation.armed;

    // armedBy: buscar nome do usuário que armou
    let armedBy: string | null = null;
    if (armed && company?.botArmedByUserId) {
      const armer = await this.prisma.user
        .findUnique({
          where: { id: company.botArmedByUserId },
          select: { name: true },
        })
        .catch(() => null);
      armedBy = armer?.name || null;
    }

    const canAdminToggle = isAdminOrMaster(user) && armed;

    // Atendimento: ler globalBotEnabled do config JSON
    const atendimentoConfig = await this.getAtendimentoConfig(companyId);
    const atendimentoLive = armed && Boolean(atendimentoConfig.routingRules?.globalBotEnabled);

    // Chip conectado (único para todos os tipos — mesma empresa)
    const chipConectado = armed ? await this.resolveChipConectado(companyId) : false;

    // Pré-voo por tipo (paralelo)
    const [atendPreflight, recovPreflight, prospPreflight] = await Promise.all([
      this.resolvePreflight(companyId, 'atendimento', chipConectado, atendimentoConfig),
      this.resolvePreflight(companyId, 'recovery', chipConectado),
      this.resolvePreflight(companyId, 'prospeccao', chipConectado),
    ]);

    const recovLive = armed && Boolean(company?.recoveryBotLiveAt);
    const prospLive = armed && Boolean(company?.prospectingBotLiveAt);

    const masterOff = await this.resolveMasterOff(companyId);

    return {
      armed,
      armedBy,
      armReason: company?.botArmReason || null,
      channel: activation.channel,
      masterOff,
      canAdminToggle,
      types: {
        atendimento: {
          live: atendimentoLive,
          preflight: atendPreflight,
          blocked: this.resolveBlocked('atendimento', armed, atendPreflight),
        },
        recovery: {
          live: recovLive,
          preflight: recovPreflight,
          blocked: this.resolveBlocked('recovery', armed, recovPreflight),
        },
        prospeccao: {
          live: prospLive,
          preflight: prospPreflight,
          blocked: this.resolveBlocked('prospeccao', armed, prospPreflight),
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

    // Verificar pino
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        botArmedAt: true,
        botArmChannel: true,
        recoveryBotLiveAt: true,
        prospectingBotLiveAt: true,
      },
    });

    if (!isBotArmedForCompany(company)) {
      throw new HttpException(
        { code: 'BOT_NOT_ARMED', message: 'Acione o suporte para ativar o bot.' },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const { type, live } = body;
    const validTypes: BotTypeKey[] = ['atendimento', 'recovery', 'prospeccao'];
    if (!validTypes.includes(type)) {
      throw new BadRequestException(`Tipo inválido: ${type}. Use atendimento, recovery ou prospeccao.`);
    }

    // Se está ligando ao vivo: checar pré-voo
    if (live) {
      const chipConectado = await this.resolveChipConectado(companyId);
      const atendimentoConfig =
        type === 'atendimento' ? await this.getAtendimentoConfig(companyId) : undefined;
      const preflight = await this.resolvePreflight(companyId, type, chipConectado, atendimentoConfig);
      const blocked = this.resolveBlocked(type, true, preflight);

      if (blocked) {
        throw new BadRequestException({ code: 'PREFLIGHT_FAILED', message: blocked, preflight });
      }
    }

    // Escrever fonte canônica por tipo
    if (type === 'atendimento') {
      await this.toggleAtendimentoLive(companyId, live);
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

  // ── CHAVE GERAL: liga/desliga o bot inteiro (INDEPENDE de pré-voo) ───────────
  // É a "chave de desligar o bot" do dono. Desligar SEMPRE funciona (não exige
  // chip/config) e derruba os 3 tipos de verdade. Ligar é best-effort: liga os
  // tipos que passam no pré-voo — o pré-voo (chip/config/teste) fica INTACTO, então
  // nada de cold-send sem estar pronto (anti-ban preservado).
  async setMasterSwitch(user: any, on: boolean) {
    const companyId = requireCompanyId(user);
    const userId = requireUserId(user);
    if (!isAdminOrMaster(user)) {
      throw new BadRequestException('Apenas administradores podem usar a chave geral do bot.');
    }

    // grava a INTENÇÃO (independe de config/chip — é a chave geral)
    await this.saveConfigRow(companyId, this.BOT_MASTER_SWITCH_CHANNEL, 'v1', {
      off: !on,
      at: new Date().toISOString(),
      byUserId: userId,
    });

    if (!on) {
      // DESLIGAR DE VERDADE: derruba os 3 tipos (live=false não exige pré-voo).
      await this.toggleAtendimentoLive(companyId, false).catch(() => undefined);
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          recoveryBotLiveAt: null,
          recoveryBotLiveByUserId: null,
          prospectingBotLiveAt: null,
          prospectingBotLiveByUserId: null,
        },
      });
      return { ok: true, on: false };
    }

    // LIGAR: só liga os tipos prontos (pré-voo ok). Em localhost sem chip nenhum
    // liga → o ícone fica VERMELHO ("ligado, faltando config"), não cinza.
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { botArmedAt: true },
    });
    const armed = isBotArmedForCompany(company);
    const chipConectado = armed ? await this.resolveChipConectado(companyId) : false;
    for (const type of ['atendimento', 'recovery', 'prospeccao'] as BotTypeKey[]) {
      const atendCfg =
        type === 'atendimento' ? await this.getAtendimentoConfig(companyId) : undefined;
      const preflight = await this.resolvePreflight(companyId, type, chipConectado, atendCfg);
      if (this.resolveBlocked(type, armed, preflight)) continue; // bloqueado → não liga
      if (type === 'atendimento') {
        await this.toggleAtendimentoLive(companyId, true).catch(() => undefined);
      } else if (type === 'recovery') {
        await this.prisma.company.update({
          where: { id: companyId },
          data: { recoveryBotLiveAt: new Date(), recoveryBotLiveByUserId: userId },
        });
      } else {
        await this.prisma.company.update({
          where: { id: companyId },
          data: { prospectingBotLiveAt: new Date(), prospectingBotLiveByUserId: userId },
        });
      }
    }
    return { ok: true, on: true };
  }

  // ── toggle atendimento via config JSON (reutilizar fonte canônica) ─────────

  private async toggleAtendimentoLive(companyId: number, live: boolean): Promise<void> {
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
    await this.saveConfigRow(
      companyId,
      ATENDIMENTO_BOT_CONFIG_CHANNEL,
      ATENDIMENTO_BOT_CONFIG_TITLE,
      updated,
    );
  }
}
