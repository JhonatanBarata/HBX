import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyCreditActionOverrides,
  CREDIT_ACTION_LOCK_REASON,
  CreditActionDefinition,
  CreditActionKey,
  CreditActionMode,
  CreditActionOverride,
  getCreditActionBaseDefinition,
  getCreditActionDefinition,
  getCreditActionLockReason,
  getCreditActionOverride,
  isCreditActionOverrideLocked,
  listCreditActionKeys,
  normalizeCreditActionKey,
  normalizeCreditCost,
} from './credit-action-catalog';

export type CreditActionCatalogItem = {
  actionKey: CreditActionKey;
  label: string;
  /** Preço fixo de fábrica: o painel mostra em leitura, sem campo nem botão. */
  locked: boolean;
  lockedReason: string | null;
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
      rows.map((row: { actionKey: string; configJson: string | null }) => ({
        actionKey: row.actionKey,
        // Overrides antigos da criação de entrega são conscientemente ignorados:
        // o preço canônico agora pertence apenas à rota Essencial/Rastreada.
        override: isCreditActionOverrideLocked(row.actionKey) ? null : this.parseOverride(row.configJson),
      })),
    );
  }

  private toItem(key: CreditActionKey): CreditActionCatalogItem {
    const base = getCreditActionBaseDefinition(key)!;
    const override = getCreditActionOverride(key);
    const effective = getCreditActionDefinition(key)!;
    const locked = isCreditActionOverrideLocked(key);
    return {
      actionKey: key,
      label: base.label,
      locked,
      lockedReason: getCreditActionLockReason(key),
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
    // A chave legada continua reconhecida para callers/ledger, porém é sempre
    // grátis: um override antigo no banco não pode somar 0,2 ao preço da rota.
    if (isCreditActionOverrideLocked(key)) return base;
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
    if (isCreditActionOverrideLocked(key)) {
      throw new BadRequestException(getCreditActionLockReason(key) ?? CREDIT_ACTION_LOCK_REASON);
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
