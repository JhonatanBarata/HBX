import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyCreditActionOverrides,
  CreditActionDefinition,
  CREDIT_ACTION_KEYS,
  CreditActionKey,
  CreditActionMode,
  CreditActionOverride,
  getCreditActionBaseDefinition,
  getCreditActionDefinition,
  getCreditActionOverride,
  listCreditActionKeys,
  normalizeCreditActionKey,
  normalizeCreditCost,
} from './credit-action-catalog';

export type CreditActionCatalogItem = {
  actionKey: CreditActionKey;
  label: string;
  base: { mode: CreditActionMode; cost: number };
  override: { mode: CreditActionMode; cost: number } | null;
  effective: { mode: CreditActionMode; cost: number };
};

const VALID_MODES = new Set<CreditActionMode>(['free', 'debit']);

@Injectable()
export class CreditActionConfigService implements OnModuleInit {
  private readonly logger = new Logger(CreditActionConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refreshOverlay().catch((error) =>
      this.logger.warn(`Falha ao hidratar catálogo de ações: ${error instanceof Error ? error.message : error}`),
    );
  }

  private parseOverride(configJson: string | null | undefined): CreditActionOverride | null {
    try {
      const parsed = configJson ? JSON.parse(configJson) : null;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      // Uma configuração de modo desconhecido é descartada por inteiro; nunca
      // reaproveitamos seu custo como débito.
      if (parsed.mode !== undefined && !VALID_MODES.has(parsed.mode)) return null;
      const override: CreditActionOverride = {};
      if (parsed.mode === 'free' || parsed.mode === 'debit') override.mode = parsed.mode;
      const cost = normalizeCreditCost(parsed.cost);
      if (cost != null) override.cost = cost;
      return Object.keys(override).length ? override : null;
    } catch {
      return null;
    }
  }

  async refreshOverlay(): Promise<void> {
    const rows = await (this.prisma as any).creditActionConfig.findMany({
      select: { actionKey: true, configJson: true },
    }).catch(() => [] as Array<{ actionKey: string; configJson: string }>);
    applyCreditActionOverrides(
      rows.filter((row: { actionKey: string }) => row.actionKey !== CREDIT_ACTION_KEYS.LEAD_DELIVERY).map((row: { actionKey: string; configJson: string | null }) => ({
        actionKey: row.actionKey,
        override: this.parseOverride(row.configJson),
      })),
    );
  }

  private toItem(key: CreditActionKey): CreditActionCatalogItem {
    const base = getCreditActionBaseDefinition(key)!;
    if (key === CREDIT_ACTION_KEYS.LEAD_DELIVERY) {
      return {
        actionKey: key,
        label: base.label,
        base: { mode: 'debit', cost: 1 },
        override: null,
        effective: { mode: 'debit', cost: 1 },
      };
    }
    const override = getCreditActionOverride(key);
    const effective = getCreditActionDefinition(key)!;
    return {
      actionKey: key,
      label: base.label,
      base: { mode: base.mode, cost: base.cost },
      override: override ? { mode: override.mode ?? base.mode, cost: override.cost ?? base.cost } : null,
      effective: { mode: effective.mode, cost: effective.cost },
    };
  }

  /** Atualiza antes de listar para evitar catálogo divergente entre réplicas. */
  async listForMaster(): Promise<CreditActionCatalogItem[]> {
    await this.refreshOverlay();
    return listCreditActionKeys().map((key) => this.toItem(key));
  }

  /** Resolve direto do banco no caminho de cobrança; preço nunca depende só da memória local. */
  async resolveEffective(actionKeyInput: unknown): Promise<CreditActionDefinition | null> {
    const key = normalizeCreditActionKey(actionKeyInput);
    if (!key) return null;
    const base = getCreditActionBaseDefinition(key)!;
    if (key === CREDIT_ACTION_KEYS.LEAD_DELIVERY) return { ...base, mode: 'debit', cost: 1 };
    const row = await (this.prisma as any).creditActionConfig.findUnique({
      where: { actionKey: key },
      select: { configJson: true },
    }).catch(() => null);
    const override = this.parseOverride(row?.configJson);
    return {
      ...base,
      mode: override?.mode ?? base.mode,
      cost: override?.cost ?? base.cost,
    };
  }

  async setOverride(actionKeyInput: unknown, patch: { mode?: unknown; cost?: unknown }): Promise<CreditActionCatalogItem> {
    const key = normalizeCreditActionKey(actionKeyInput);
    if (!key) throw new BadRequestException('actionKey desconhecida');
    if (key === CREDIT_ACTION_KEYS.LEAD_DELIVERY) {
      throw new BadRequestException('A entrega de lead tem debito fixo de 1 credito e nao aceita override');
    }
    if (typeof patch?.mode !== 'string' || !VALID_MODES.has(patch.mode as CreditActionMode)) {
      throw new BadRequestException('mode deve ser free ou debit');
    }
    const mode = patch.mode as CreditActionMode;
    const cost = mode === 'free' ? 0 : normalizeCreditCost(patch?.cost);
    if (cost == null) throw new BadRequestException('cost deve estar entre 0 e 1000, com até 3 casas decimais');
    if (mode === 'debit' && cost <= 0) {
      throw new BadRequestException('ações em débito precisam ter custo maior que zero');
    }
    await (this.prisma as any).creditActionConfig.upsert({
      where: { actionKey: key },
      update: { configJson: JSON.stringify({ mode, cost }) },
      create: { actionKey: key, configJson: JSON.stringify({ mode, cost }) },
    });
    await this.refreshOverlay();
    return this.toItem(key);
  }

  async clearOverride(actionKeyInput: unknown): Promise<CreditActionCatalogItem> {
    const key = normalizeCreditActionKey(actionKeyInput);
    if (!key) throw new BadRequestException('actionKey desconhecida');
    await (this.prisma as any).creditActionConfig.deleteMany({ where: { actionKey: key } });
    await this.refreshOverlay();
    return this.toItem(key);
  }
}
