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
import { SAFE_FIRST_CONTACT_TEMPLATE } from '../vendas/prospecting-safety';
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
      // Prospecção: sales-profile preenchido (whatDoYouSell) + template de 1º contato seguro existe.
      const salesProfile = await this.prisma.salesProfile
        .findFirst({
          where: { companyId },
          select: { id: true, whatDoYouSell: true },
        })
        .catch(() => null);
      const hasSalesProfile = Boolean(salesProfile?.whatDoYouSell?.trim());
      // Template de 1º contato: SAFE_FIRST_CONTACT_TEMPLATE existe como constante — sempre ok
      // enquanto ele não for nulo/vazio.
      const hasSafeTemplate = Boolean(SAFE_FIRST_CONTACT_TEMPLATE?.trim());
      return hasSalesProfile && hasSafeTemplate;
    }

    return false;
  }

  // ── pré-voo: passouModoTeste ──────────────────────────────────────────────
  // testedAt fica DENTRO do config JSON de cada tipo para evitar coluna nova.
  // atendimento → setup.testedAt no config JSON do atendimento
  // recovery → campo setup.testedAt no config JSON do recovery (__BOT_TESTED_META__)
  // prospeccao → idem

  private readonly BOT_TEST_META_CHANNEL = '__BOT_TESTED_META__';

  private async resolvePassouModoTeste(companyId: number, type: BotTypeKey): Promise<boolean> {
    if (type === 'atendimento') {
      const config = await this.getAtendimentoConfig(companyId);
      return Boolean((config.setup as any).testedAt);
    }
    // recovery e prospeccao: canal separado simples
    const row = await this.getConfigRow(companyId, this.BOT_TEST_META_CHANNEL, type);
    if (!row?.template) return false;
    try {
      const parsed = JSON.parse(row.template);
      return Boolean(parsed?.testedAt);
    } catch {
      return false;
    }
  }

  // ── mark-tested ───────────────────────────────────────────────────────────

  async markTested(user: any, type: BotTypeKey): Promise<{ ok: boolean; testedAt: string }> {
    const companyId = requireCompanyId(user);
    const now = new Date().toISOString();

    if (type === 'atendimento') {
      // Gravar testedAt dentro do setup do config de atendimento
      const config = await this.getAtendimentoConfig(companyId);
      const updated = {
        ...config,
        setup: { ...config.setup, testedAt: now },
      };
      await this.saveConfigRow(
        companyId,
        ATENDIMENTO_BOT_CONFIG_CHANNEL,
        ATENDIMENTO_BOT_CONFIG_TITLE,
        updated,
      );
    } else {
      // recovery / prospeccao: canal simples
      await this.saveConfigRow(companyId, this.BOT_TEST_META_CHANNEL, type, { testedAt: now });
    }

    return { ok: true, testedAt: now };
  }

  // ── pré-voo completo por tipo ─────────────────────────────────────────────

  private async resolvePreflight(
    companyId: number,
    type: BotTypeKey,
    chipConectado: boolean,
    atendimentoConfig?: ReturnType<typeof normalizeAtendimentoBotConfig>,
  ) {
    const [configCompleta, passouModoTeste] = await Promise.all([
      this.resolveConfigCompleta(companyId, type, atendimentoConfig),
      this.resolvePassouModoTeste(companyId, type),
    ]);
    return { chipConectado, configCompleta, passouModoTeste };
  }

  private resolveBlocked(
    type: BotTypeKey,
    armed: boolean,
    preflight: { chipConectado: boolean; configCompleta: boolean; passouModoTeste: boolean },
  ): string | null {
    if (!armed) return 'Bot não ativado pela plataforma. Acione o suporte.';
    if (!preflight.chipConectado) return 'Nenhum chip WhatsApp conectado.';
    if (!preflight.configCompleta) return 'Configuração do bot incompleta.';
    // atendimento não bloqueia por modo teste (reativo)
    if (type !== 'atendimento' && !preflight.passouModoTeste) {
      return 'Rode o teste do bot antes de ligar ao vivo.';
    }
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

    return {
      armed,
      armedBy,
      armReason: company?.botArmReason || null,
      channel: activation.channel,
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
