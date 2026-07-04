import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyCreditExpiryDefaultOverride,
  applyCreditPackOverrides,
  buildCreditPacksCatalog,
  CreditPackDefinition,
  CreditPackOverride,
  getCreditExpiryDefaultDays,
  listCreditPackKeys,
  normalizeCreditPackKey,
} from './credit-pack-catalog';

// CRÉDITOS S3-PARTE1 — hidrata o overlay editável do catálogo de pacotes (CreditPackConfig)
// e a config global de expiração (CreditGlobalConfig) para os getters síncronos em
// credit-pack-catalog.ts. Mesmo padrão de modules.service.refreshCommercialCatalogOverlay:
// roda no boot (onModuleInit) e a cada edição do master. Idempotente; falha aqui NÃO derruba
// o boot (defensivo, igual ao catálogo comercial).
@Injectable()
export class CreditPackConfigService implements OnModuleInit {
  private readonly logger = new Logger(CreditPackConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refreshOverlay().catch((err) =>
      this.logger.warn(`Falha ao hidratar overlay de pacotes de crédito: ${err instanceof Error ? err.message : err}`),
    );
  }

  /** Lê CreditPackConfig + CreditGlobalConfig do banco e empurra pro overlay em memória. */
  async refreshOverlay(): Promise<void> {
    let rows: Array<{ packKey: string; configJson: string | null }> = [];
    try {
      rows = await (this.prisma as any).creditPackConfig.findMany({
        select: { packKey: true, configJson: true },
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
      const override: CreditPackOverride = {};
      if (parsed) {
        if (typeof parsed.title === 'string') override.title = parsed.title;
        if (typeof parsed.observation === 'string') override.observation = parsed.observation;
        if (parsed.status === 'paused' || parsed.status === 'available') override.status = parsed.status;
        if (parsed.credits != null) override.credits = Number(parsed.credits);
        if (parsed.price != null) override.price = Number(parsed.price);
        if (parsed.defaultExpiryDays != null) override.defaultExpiryDays = Number(parsed.defaultExpiryDays);
      }
      return { packKey: row.packKey, override };
    });
    applyCreditPackOverrides(entries);

    try {
      const cfg = await (this.prisma as any).creditGlobalConfig.findUnique({ where: { key: 'default' } });
      applyCreditExpiryDefaultOverride(cfg?.defaultExpiryDays ?? null);
    } catch {
      applyCreditExpiryDefaultOverride(null);
    }
  }

  /** Catálogo completo com overlay aplicado (uso do master — inclui pausados). */
  async listForMaster(): Promise<CreditPackDefinition[]> {
    return buildCreditPacksCatalog({ includePaused: true });
  }

  /** Catálogo público (uso do /credits/me) — só pacotes disponíveis. */
  listAvailable(): CreditPackDefinition[] {
    return buildCreditPacksCatalog({ includePaused: false });
  }

  getGlobalExpiryDefaultDays(): number {
    return getCreditExpiryDefaultDays();
  }

  /**
   * Persiste o override de UM pacote em `CreditPackConfig.configJson` (merge sobre o que já
   * existe, mesmo padrão do `setCompanyModuleByMaster`/planInfoJson) e refresca o overlay em
   * memória imediatamente. `packKey` precisa ser uma das chaves fixas do catálogo em código
   * (starter|growth|scale) — S3-PARTE1 não cria pacotes novos, só edita os existentes.
   */
  async updatePack(
    packKey: unknown,
    patch: {
      title?: string;
      observation?: string;
      status?: CreditPackStatusInput;
      credits?: number;
      price?: number;
      defaultExpiryDays?: number;
    },
  ): Promise<CreditPackDefinition> {
    const key = normalizeCreditPackKey(packKey);
    if (!key) throw new Error('updatePack: packKey inválido');

    const existing = await (this.prisma as any).creditPackConfig.findUnique({ where: { packKey: key } });
    let current: Record<string, unknown> = {};
    if (existing?.configJson) {
      try {
        const parsed = JSON.parse(existing.configJson);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) current = parsed;
      } catch {
        current = {};
      }
    }

    const next: Record<string, unknown> = { ...current };
    if (typeof patch.title === 'string' && patch.title.trim()) next.title = patch.title.trim();
    if (typeof patch.observation === 'string') next.observation = patch.observation;
    if (patch.status === 'paused' || patch.status === 'available') next.status = patch.status;
    if (patch.credits != null && Number.isFinite(Number(patch.credits))) {
      next.credits = Math.max(0, Math.trunc(Number(patch.credits)));
    }
    if (patch.price != null && Number.isFinite(Number(patch.price))) {
      next.price = Number(Number(patch.price).toFixed(2));
    }
    if (patch.defaultExpiryDays != null && Number.isFinite(Number(patch.defaultExpiryDays))) {
      next.defaultExpiryDays = Math.max(1, Math.trunc(Number(patch.defaultExpiryDays)));
    }

    await (this.prisma as any).creditPackConfig.upsert({
      where: { packKey: key },
      update: { configJson: JSON.stringify(next) },
      create: { packKey: key, configJson: JSON.stringify(next) },
    });

    await this.refreshOverlay();
    const def = buildCreditPacksCatalog({ includePaused: true }).find((p) => p.key === key);
    if (!def) throw new Error('updatePack: pacote nao encontrado apos atualizacao');
    return def;
  }

  /** Config global: prazo default de expiração do crédito (D6, editável pelo master). */
  async updateGlobalExpiryDefaultDays(days: number): Promise<number> {
    const value = Math.max(1, Math.trunc(Number(days) || 0));
    await (this.prisma as any).creditGlobalConfig.upsert({
      where: { key: 'default' },
      update: { defaultExpiryDays: value },
      create: { key: 'default', defaultExpiryDays: value },
    });
    await this.refreshOverlay();
    return getCreditExpiryDefaultDays();
  }

  listPackKeys() {
    return listCreditPackKeys();
  }
}

type CreditPackStatusInput = 'available' | 'paused';
