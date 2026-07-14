import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyCreditActionOverrides,
  CREDIT_ACTION_KEYS,
  CreditActionKey,
  CreditActionMode,
  CreditActionOverride,
  getCreditActionBaseDefinition,
  getCreditActionDefinition,
  getCreditActionOverride,
  isFixedLogisticsCreditActionKey,
  listCreditActionKeys,
  normalizeCreditActionKey,
} from './credit-action-catalog';

export type CreditActionCatalogItem = {
  actionKey: CreditActionKey;
  label: string;
  base: { mode: CreditActionMode; cost: number };
  override: { mode: CreditActionMode; cost: number } | null;
  effective: { mode: CreditActionMode; cost: number };
};

const VALID_MODES = new Set<CreditActionMode>(['free', 'track', 'debit']);

// PR11072026 W1 (docs/PLANEJAMENTOS/PR11072026/01-OVERLAY-CATALOGO-ACOES.md) — hidrata o
// overlay editável do catálogo de AÇÕES de crédito (CreditActionConfig) pros getters
// síncronos em credit-action-catalog.ts. MESMO padrão de CreditPackConfigService: cache em
// memória, refresh no boot (onModuleInit) e a cada escrita do master. Fail-soft: banco
// indisponível no boot → overlay vazio + warn, nunca derruba o boot.
@Injectable()
export class CreditActionConfigService implements OnModuleInit {
  private readonly logger = new Logger(CreditActionConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refreshOverlay().catch((err) =>
      this.logger.warn(
        `Falha ao hidratar overlay do catálogo de ações de crédito: ${err instanceof Error ? err.message : err}`,
      ),
    );
  }

  /** Lê CreditActionConfig do banco e empurra pro overlay em memória (base do catálogo). */
  async refreshOverlay(): Promise<void> {
    let rows: Array<{ actionKey: string; configJson: string | null }> = [];
    try {
      rows = await (this.prisma as any).creditActionConfig.findMany({
        select: { actionKey: true, configJson: true },
      });
    } catch {
      rows = [];
    }

    const entries = rows.map((row) => {
      let parsed: Record<string, unknown> | null = null;
      if (row.configJson) {
        try {
          const j = JSON.parse(row.configJson);
          parsed = j && typeof j === 'object' && !Array.isArray(j) ? j : null;
        } catch {
          parsed = null;
        }
      }
      const override: CreditActionOverride = {};
      if (parsed) {
        if (parsed.mode === 'free' || parsed.mode === 'track' || parsed.mode === 'debit') override.mode = parsed.mode;
        if (parsed.cost != null && Number.isFinite(Number(parsed.cost))) override.cost = Number(parsed.cost);
      }
      return { actionKey: row.actionKey, override };
    });
    applyCreditActionOverrides(entries);
  }

  private toItem(key: CreditActionKey): CreditActionCatalogItem {
    const base = getCreditActionBaseDefinition(key)!;
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

  /** Catálogo completo (base + overlay), ordem fixa do catálogo em código. */
  listForMaster(): CreditActionCatalogItem[] {
    return listCreditActionKeys().map((key) => this.toItem(key));
  }

  /**
   * Persiste o override de UMA ação (mode + cost, os 2 juntos — sem merge parcial, ao
   * contrário do CreditPackConfig: o catálogo de ações não tem outros campos editáveis) e
   * refresca o overlay imediatamente. Validações DURAS (regra de negócio, não config):
   *   - actionKey precisa existir em CREDIT_ACTION_KEYS;
   *   - `lead_delivery` REJEITA sempre — cobrança fixa no caminho assert
   *     (CommercialUsageLimitsService → assertAndDebitLeadDelivery), não pelo catálogo;
   *   - `whatsapp_auto_send` com mode='debit' REJEITA — decisão do dono: WhatsApp nunca
   *     debita (só Meta API oficial futura cobraria, e via ação nova, não flip desta);
   *   - cost precisa ser inteiro >= 1 (ledger é Int; track/debit sempre com peso positivo).
   */
  async setOverride(actionKeyInput: unknown, patch: { mode?: unknown; cost?: unknown }): Promise<CreditActionCatalogItem> {
    const key = normalizeCreditActionKey(actionKeyInput);
    if (!key) throw new BadRequestException('actionKey desconhecida');

    if (key === CREDIT_ACTION_KEYS.LEAD_DELIVERY) {
      throw new BadRequestException('lead_delivery não é editável — cobrança fixa no caminho de entrega do lead');
    }

    if (isFixedLogisticsCreditActionKey(key)) {
      throw new BadRequestException(`${key} não é editável — contrato fixo da logística`);
    }

    const modeInput = patch?.mode;
    if (typeof modeInput !== 'string' || !VALID_MODES.has(modeInput as CreditActionMode)) {
      throw new BadRequestException('mode deve ser free, track ou debit');
    }
    const mode = modeInput as CreditActionMode;

    if (key === CREDIT_ACTION_KEYS.WHATSAPP_AUTO_SEND && mode === 'debit') {
      throw new BadRequestException('whatsapp_auto_send nunca debita (decisão do dono) — use free ou track');
    }

    const costNumber = Number(patch?.cost);
    if (!Number.isFinite(costNumber) || !Number.isInteger(costNumber) || costNumber < 1) {
      throw new BadRequestException('cost deve ser um número inteiro >= 1');
    }

    const configJson = JSON.stringify({ mode, cost: costNumber });
    await (this.prisma as any).creditActionConfig.upsert({
      where: { actionKey: key },
      update: { configJson },
      create: { actionKey: key, configJson },
    });

    await this.refreshOverlay();
    return this.toItem(key);
  }

  /** Remove o override (volta à base do código). Idempotente — sem override não é erro. */
  async clearOverride(actionKeyInput: unknown): Promise<CreditActionCatalogItem> {
    const key = normalizeCreditActionKey(actionKeyInput);
    if (!key) throw new BadRequestException('actionKey desconhecida');

    await (this.prisma as any).creditActionConfig.deleteMany({ where: { actionKey: key } });
    await this.refreshOverlay();
    return this.toItem(key);
  }
}
