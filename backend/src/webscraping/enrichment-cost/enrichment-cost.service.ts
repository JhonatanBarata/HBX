import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  COMMERCIAL_PLAN_KEYS,
  getCommercialPlanTier,
  normalizeCommercialPlanKey,
  type ActiveCommercialPlanKey,
} from '../../commercial-plans/commercial-plan-catalog';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  EnrichmentBudgetConfig,
  EnrichmentCostDecision,
  EnrichmentCostDecisionStage,
  EnrichmentCostProvider,
  EnrichmentCostSummary,
  EnrichmentCostTrigger,
  EnrichmentLedgerRecordInput,
  PaidFallbackContext,
  PaidFallbackReservation,
  PaidFallbackRuntimeUsage,
} from './enrichment-cost.types';

const PAID_PROVIDERS = new Set<EnrichmentCostProvider>(['google', 'email_provider']);
const DEFAULT_USD_TO_BRL = 5.5;

function clampNonNegativeInteger(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.trunc(numeric));
}

function clampNonNegativeMoney(value: unknown, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Number(Math.max(0, numeric).toFixed(4));
}

function startOfCurrentMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function startOfCurrentDay(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function normalizeDomain(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^www\./, '').replace(/\/.*$/, '');
  }
}

function redactSensitiveMetadata(value: any, depth = 0): any {
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactSensitiveMetadata(item, depth + 1));
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, any> = {};
  for (const [key, item] of Object.entries(value).slice(0, 80)) {
    if (/(token|secret|password|passwd|credential|access[_-]?key|api[_-]?key|authorization)/i.test(key)) {
      output[key] = '[redacted]';
      continue;
    }
    output[key] = redactSensitiveMetadata(item, depth + 1);
  }
  return output;
}

@Injectable()
export class EnrichmentCostService {
  constructor(private readonly prisma: PrismaService) {}

  getDefaultBudgetForPlan(planKeyRaw: unknown): EnrichmentBudgetConfig {
    const planKey = normalizeCommercialPlanKey(planKeyRaw);
    if (planKey === COMMERCIAL_PLAN_KEYS.LITE) {
      return {
        freeSmartEnrichmentsPerDay: 1000,
        paidGoogleFallbacksPerDay: 0,
        paidEmailVerificationsPerMonth: 0,
        paidApiBudgetBrlPerMonth: 0,
      };
    }
    if (planKey === COMMERCIAL_PLAN_KEYS.MELHOR) {
      return {
        freeSmartEnrichmentsPerDay: 6000,
        paidGoogleFallbacksPerDay: 50,
        paidEmailVerificationsPerMonth: 500,
        paidApiBudgetBrlPerMonth: 100,
      };
    }
    return {
      freeSmartEnrichmentsPerDay: 3000,
      paidGoogleFallbacksPerDay: 10,
      paidEmailVerificationsPerMonth: 100,
      paidApiBudgetBrlPerMonth: 25,
    };
  }

  evaluatePaidFallback(input: PaidFallbackContext): EnrichmentCostDecision {
    const planKey = normalizeCommercialPlanKey(input.planKey);
    const provider = input.provider;
    const sku = String(input.sku || '').trim() || 'unknown';
    const triggeredBy = this.normalizeTrigger(input.triggeredBy);
    const cacheHit = Boolean(input.cacheHit);
    const budget = this.mergeBudget(planKey, input.budget || null);
    const estimatedCostUsd = clampNonNegativeMoney(input.estimatedCostUsd);
    const estimatedCostBrl = clampNonNegativeMoney(
      input.estimatedCostBrl,
      estimatedCostUsd > 0 ? estimatedCostUsd * this.usdToBrl() : 0,
    );
    const paidProvider = PAID_PROVIDERS.has(provider);
    const consumesPaidQuota = paidProvider && !cacheHit && estimatedCostBrl > 0;
    const projectedMonthCost = clampNonNegativeMoney(input.currentMonthCostBrl) + (consumesPaidQuota ? estimatedCostBrl : 0);
    const budgetUsageRatio = budget.paidApiBudgetBrlPerMonth > 0
      ? Number((projectedMonthCost / budget.paidApiBudgetBrlPerMonth).toFixed(4))
      : consumesPaidQuota
        ? 1
        : 0;

    if (cacheHit) {
      return this.decision(input, {
        allowed: true,
        code: 'cache_hit',
        stage: 'ok',
        message: 'Cache reutilizado sem consumo de cota paga.',
        budget,
        budgetUsageRatio,
        estimatedCostUsd: 0,
        estimatedCostBrl: 0,
        planKey,
        triggeredBy,
        consumesPaidQuota: false,
      });
    }

    if (!paidProvider) {
      return this.decision(input, {
        allowed: true,
        code: 'internal_provider',
        stage: 'ok',
        message: 'Provider interno sem custo pago.',
        budget,
        budgetUsageRatio,
        estimatedCostUsd,
        estimatedCostBrl,
        planKey,
        triggeredBy,
        consumesPaidQuota: false,
      });
    }

    if (estimatedCostBrl <= 0) {
      return this.block(input, 'missing_estimated_cost', 'locked', 'Fallback pago exige custo estimado antes da reserva.', {
        budget,
        budgetUsageRatio,
        planKey,
        triggeredBy,
        estimatedCostUsd,
        estimatedCostBrl,
      });
    }

    if (budget.paidApiBudgetBrlPerMonth <= 0) {
      return this.block(input, 'paid_budget_unavailable', 'locked', 'Plano sem saldo mensal para fallback pago.', {
        budget,
        budgetUsageRatio,
        planKey,
        triggeredBy,
        estimatedCostUsd,
        estimatedCostBrl,
      });
    }

    if (budgetUsageRatio >= 1) {
      return this.block(input, 'paid_budget_exhausted', 'locked', 'Orcamento mensal de API paga atingido.', {
        budget,
        budgetUsageRatio,
        planKey,
        triggeredBy,
        estimatedCostUsd,
        estimatedCostBrl,
      });
    }

    if (budgetUsageRatio >= 0.9 && !['manual', 'admin'].includes(triggeredBy)) {
      return this.block(input, 'paid_budget_manual_only', 'manual_only', 'A partir de 90%, fallback pago automatico fica bloqueado.', {
        budget,
        budgetUsageRatio,
        planKey,
        triggeredBy,
        estimatedCostUsd,
        estimatedCostBrl,
      });
    }

    // NOTA (FASE 2 — REMOÇÃO, R3): este check é governador de CUSTO (COGS real,
    // fora do crédito por D1 do PLANO.md), não capacidade de produto — por
    // isso usa planKey diretamente e NÃO getCommercialPlanTier (que R3
    // aposentou como driver de acesso: agora sempre 'full'). List continua
    // sem fallback pago automático porque é o plano de orçamento zero.
    if (planKey === COMMERCIAL_PLAN_KEYS.LITE && triggeredBy === 'auto') {
      return this.block(input, 'plan_disallows_paid_auto', 'locked', 'HBX List nao usa fallback pago automatico.', {
        budget,
        budgetUsageRatio,
        planKey,
        triggeredBy,
        estimatedCostUsd,
        estimatedCostBrl,
      });
    }

    const channelLimitBlock = this.checkChannelLimit(provider, sku, input, budget);
    if (channelLimitBlock) {
      return this.block(input, channelLimitBlock.code, 'locked', channelLimitBlock.message, {
        budget,
        budgetUsageRatio,
        planKey,
        triggeredBy,
        estimatedCostUsd,
        estimatedCostBrl,
      });
    }

    const qualityBlock = this.checkQualityGate(provider, input, planKey);
    if (qualityBlock) {
      return this.block(input, qualityBlock.code, 'locked', qualityBlock.message, {
        budget,
        budgetUsageRatio,
        planKey,
        triggeredBy,
        estimatedCostUsd,
        estimatedCostBrl,
      });
    }

    const allowedStage = this.stageForBudgetUsage(budgetUsageRatio);
    return this.decision(input, {
      allowed: true,
      code: allowedStage === 'manual_only'
        ? 'paid_fallback_manual_allowed'
        : allowedStage === 'reduce_auto'
          ? 'paid_fallback_reduced_auto'
          : 'paid_fallback_allowed',
      stage: allowedStage,
      message: allowedStage === 'manual_only'
        ? 'Saldo acima de 90%; fallback pago permitido somente por acao manual/admin.'
        : allowedStage === 'reduce_auto'
          ? 'Saldo acima de 70%; manter fallback pago automatico reduzido.'
          : 'Fallback pago permitido com ledger obrigatorio.',
      budget,
      budgetUsageRatio,
      estimatedCostUsd,
      estimatedCostBrl,
      planKey,
      triggeredBy,
      consumesPaidQuota,
    });
  }

  async reservePaidFallback(input: PaidFallbackContext): Promise<PaidFallbackReservation> {
    const hydrated = await this.hydrateRuntimeUsage(input);
    const decision = this.evaluatePaidFallback(hydrated);
    const shouldRecord = decision.allowed || decision.cacheHit || Boolean(input.recordBlocked);
    let ledgerId: string | null = null;

    if (shouldRecord) {
      const ledger = await this.recordLedger({
        companyId: input.companyId,
        leadId: input.leadId,
        provider: decision.provider,
        sku: decision.sku,
        estimatedCostUsd: decision.consumesPaidQuota ? decision.estimatedCostUsd : 0,
        estimatedCostBrl: decision.consumesPaidQuota ? decision.estimatedCostBrl : 0,
        cacheHit: decision.cacheHit,
        reason: input.reason || decision.code,
        planKey: decision.planKey,
        triggeredBy: decision.triggeredBy,
        metadata: {
          ...(input.metadata || {}),
          decision: {
            code: decision.code,
            allowed: decision.allowed,
            stage: decision.stage,
            budgetUsageRatio: decision.budgetUsageRatio,
            ledgerRequired: decision.ledgerRequired,
          },
        },
      });
      ledgerId = ledger.id;
    }

    return {
      ...decision,
      ledgerId,
      ledgerCreated: Boolean(ledgerId),
    };
  }

  async recordLedger(input: EnrichmentLedgerRecordInput): Promise<{ id: string }> {
    await this.ensureLedgerAvailable();
    const delegate = this.ledgerDelegate();
    const created = await delegate.create({
      data: {
        companyId: this.optionalPositiveInteger(input.companyId),
        leadId: this.optionalString(input.leadId),
        provider: input.provider,
        sku: String(input.sku || '').trim() || 'unknown',
        estimatedCostUsd: clampNonNegativeMoney(input.estimatedCostUsd),
        estimatedCostBrl: clampNonNegativeMoney(input.estimatedCostBrl),
        cacheHit: Boolean(input.cacheHit),
        reason: this.optionalString(input.reason),
        planKey: this.optionalString(input.planKey),
        triggeredBy: this.normalizeTrigger(input.triggeredBy),
        metadataJson: this.stringifyMetadata(input.metadata || null),
      },
    });

    return { id: String(created.id) };
  }

  async getCompanyCostSummaryForUser(user: any, options: { days?: unknown } = {}) {
    const companyId = this.resolveCompanyIdFromUser(user);
    const planKey = user?.company?.selectedPlanKey || user?.selectedPlanKey || user?.planKey;
    return this.getCompanyCostSummary(companyId, { ...options, planKey });
  }

  async getCompanyCostSummary(companyIdRaw: unknown, options: { days?: unknown; planKey?: unknown } = {}): Promise<EnrichmentCostSummary> {
    const companyId = Number(companyIdRaw);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new BadRequestException('companyId invalido para resumo de custo de enriquecimento.');
    }

    await this.ensureLedgerAvailable();
    const now = new Date();
    const days = Math.max(1, Math.min(366, clampNonNegativeInteger(options.days, 31)));
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const entries = await this.ledgerDelegate().findMany({
      where: {
        companyId,
        createdAt: { gte: from },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const budget = this.getDefaultBudgetForPlan(options.planKey);
    const summary = this.summarizeEntries(companyId, entries, from, now, budget);
    return {
      ...summary,
      status: this.stageForBudgetUsage(summary.budgetUsageRatio),
    };
  }

  private async hydrateRuntimeUsage(input: PaidFallbackContext): Promise<PaidFallbackContext> {
    if (
      input.currentMonthCostBrl != null &&
      input.currentDailyProviderCount != null &&
      input.currentMonthlySkuCount != null
    ) {
      return input;
    }

    const companyId = this.optionalPositiveInteger(input.companyId);
    if (!companyId || !this.canReadLedger()) return input;

    const monthStart = startOfCurrentMonth();
    const dayStart = startOfCurrentDay();
    const monthEntries = await this.listLedgerEntries({
      companyId,
      createdAt: { gte: monthStart },
    });
    const dayEntries = monthEntries.filter((entry: any) => new Date(entry.createdAt).getTime() >= dayStart.getTime());
    const paidMonthEntries = monthEntries.filter((entry: any) => !entry.cacheHit && PAID_PROVIDERS.has(entry.provider));

    const runtime: PaidFallbackRuntimeUsage = {
      currentMonthCostBrl: input.currentMonthCostBrl ?? paidMonthEntries.reduce((sum: number, entry: any) => sum + clampNonNegativeMoney(entry.estimatedCostBrl), 0),
      currentDailyProviderCount: input.currentDailyProviderCount ?? dayEntries.filter((entry: any) => !entry.cacheHit && entry.provider === input.provider).length,
      currentMonthlySkuCount: input.currentMonthlySkuCount ?? paidMonthEntries.filter((entry: any) => entry.sku === input.sku).length,
    };

    return {
      ...input,
      ...runtime,
    };
  }

  private async listLedgerEntries(where: Record<string, any>) {
    if (!(await this.ledgerTableExists())) return [];
    return this.ledgerDelegate().findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
  }

  private summarizeEntries(
    companyId: number,
    entries: any[],
    from: Date,
    to: Date,
    budget: EnrichmentBudgetConfig,
  ): EnrichmentCostSummary {
    const byProvider: EnrichmentCostSummary['byProvider'] = {};
    let estimatedCostBrl = 0;
    let estimatedCostUsd = 0;
    let paidLedgerCount = 0;
    let cacheHitCount = 0;

    for (const entry of entries) {
      const provider = String(entry.provider || 'other');
      const cacheHit = Boolean(entry.cacheHit);
      const isPaid = !cacheHit && PAID_PROVIDERS.has(provider as EnrichmentCostProvider);
      const costBrl = isPaid ? clampNonNegativeMoney(entry.estimatedCostBrl) : 0;
      const costUsd = isPaid ? clampNonNegativeMoney(entry.estimatedCostUsd) : 0;

      if (!byProvider[provider]) {
        byProvider[provider] = {
          count: 0,
          paidCount: 0,
          cacheHitCount: 0,
          estimatedCostBrl: 0,
          estimatedCostUsd: 0,
        };
      }

      byProvider[provider].count += 1;
      if (cacheHit) {
        cacheHitCount += 1;
        byProvider[provider].cacheHitCount += 1;
      }
      if (isPaid) {
        paidLedgerCount += 1;
        estimatedCostBrl += costBrl;
        estimatedCostUsd += costUsd;
        byProvider[provider].paidCount += 1;
        byProvider[provider].estimatedCostBrl = clampNonNegativeMoney(byProvider[provider].estimatedCostBrl + costBrl);
        byProvider[provider].estimatedCostUsd = clampNonNegativeMoney(byProvider[provider].estimatedCostUsd + costUsd);
      }
    }

    const budgetUsageRatio = budget.paidApiBudgetBrlPerMonth > 0
      ? Number((estimatedCostBrl / budget.paidApiBudgetBrlPerMonth).toFixed(4))
      : estimatedCostBrl > 0
        ? 1
        : 0;

    return {
      companyId,
      generatedAt: to.toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
      ledgerCount: entries.length,
      paidLedgerCount,
      cacheHitCount,
      estimatedCostBrl: clampNonNegativeMoney(estimatedCostBrl),
      estimatedCostUsd: clampNonNegativeMoney(estimatedCostUsd),
      byProvider,
      budget,
      budgetUsageRatio,
      status: this.stageForBudgetUsage(budgetUsageRatio),
    };
  }

  private checkChannelLimit(provider: EnrichmentCostProvider, sku: string, input: PaidFallbackContext, budget: EnrichmentBudgetConfig) {
    if (provider === 'google') {
      const used = clampNonNegativeInteger(input.currentDailyProviderCount, 0);
      if (used >= budget.paidGoogleFallbacksPerDay) {
        return {
          code: 'paid_google_daily_limit',
          message: 'Limite diario de fallback Google pago atingido.',
        };
      }
    }

    if (provider === 'email_provider') {
      const used = clampNonNegativeInteger(input.currentMonthlySkuCount, 0);
      if (used >= budget.paidEmailVerificationsPerMonth) {
        return {
          code: 'paid_email_monthly_limit',
          message: 'Limite mensal de verificacao de email paga atingido.',
        };
      }
      if (!normalizeDomain(input.domain) && /domain|search|company/i.test(sku)) {
        return {
          code: 'missing_domain',
          message: 'Fallback pago de email exige dominio da empresa.',
        };
      }
    }

    return null;
  }

  // NOTA (FASE 2 — REMOÇÃO, R3): governador de CUSTO (COGS, fora do crédito
  // por D1) — usa planKey diretamente, não getCommercialPlanTier (aposentado
  // como driver de acesso por R3, sempre 'full' agora). Pro/Implantação
  // mantêm a barra mais baixa (55) que List/Lead Plus (70), como sempre foi.
  private checkQualityGate(provider: EnrichmentCostProvider, input: PaidFallbackContext, planKey: ActiveCommercialPlanKey) {
    if (!input.hasCriticalMissingData) {
      return {
        code: 'no_critical_missing_data',
        message: 'Fallback pago permitido apenas quando falta dado critico.',
      };
    }

    const isFullTierPlan = planKey === COMMERCIAL_PLAN_KEYS.PRO || planKey === COMMERCIAL_PLAN_KEYS.MELHOR;
    const score = Number(input.leadScore);
    const normalizedScore = Number.isFinite(score) ? score : 0;
    const minimumScore = isFullTierPlan ? 55 : 70;
    if (normalizedScore < minimumScore) {
      return {
        code: 'lead_score_too_low',
        message: `Score minimo para fallback pago: ${minimumScore}.`,
      };
    }

    if (provider === 'google' && (!input.hasCompanyName || !input.hasCity)) {
      return {
        code: 'insufficient_google_context',
        message: 'Fallback Google pago exige nome e cidade suficientes.',
      };
    }

    if (provider === 'email_provider' && !normalizeDomain(input.domain)) {
      return {
        code: 'missing_domain',
        message: 'Fallback pago de email exige dominio da empresa.',
      };
    }

    return null;
  }

  private block(
    input: PaidFallbackContext,
    code: string,
    stage: EnrichmentCostDecisionStage,
    message: string,
    context: {
      budget: EnrichmentBudgetConfig;
      budgetUsageRatio: number;
      planKey: ActiveCommercialPlanKey;
      triggeredBy: EnrichmentCostTrigger;
      estimatedCostUsd: number;
      estimatedCostBrl: number;
    },
  ): EnrichmentCostDecision {
    return this.decision(input, {
      allowed: false,
      code,
      stage,
      message,
      ...context,
      consumesPaidQuota: false,
    });
  }

  private decision(
    input: PaidFallbackContext,
    context: {
      allowed: boolean;
      code: string;
      stage: EnrichmentCostDecisionStage;
      message: string;
      budget: EnrichmentBudgetConfig;
      budgetUsageRatio: number;
      estimatedCostUsd: number;
      estimatedCostBrl: number;
      planKey: ActiveCommercialPlanKey;
      triggeredBy: EnrichmentCostTrigger;
      consumesPaidQuota: boolean;
    },
  ): EnrichmentCostDecision {
    return {
      allowed: context.allowed,
      code: context.code,
      stage: context.stage,
      message: context.message,
      provider: input.provider,
      sku: String(input.sku || '').trim() || 'unknown',
      planKey: context.planKey,
      planTier: getCommercialPlanTier(context.planKey),
      triggeredBy: context.triggeredBy,
      budget: context.budget,
      budgetUsageRatio: context.budgetUsageRatio,
      estimatedCostUsd: clampNonNegativeMoney(context.estimatedCostUsd),
      estimatedCostBrl: clampNonNegativeMoney(context.estimatedCostBrl),
      cacheHit: Boolean(input.cacheHit),
      ledgerRequired: context.allowed && PAID_PROVIDERS.has(input.provider) && !input.cacheHit,
      consumesPaidQuota: context.consumesPaidQuota,
    };
  }

  private mergeBudget(planKey: unknown, override: Partial<EnrichmentBudgetConfig> | null): EnrichmentBudgetConfig {
    const base = this.getDefaultBudgetForPlan(planKey);
    return {
      freeSmartEnrichmentsPerDay: clampNonNegativeInteger(override?.freeSmartEnrichmentsPerDay, base.freeSmartEnrichmentsPerDay),
      paidGoogleFallbacksPerDay: clampNonNegativeInteger(override?.paidGoogleFallbacksPerDay, base.paidGoogleFallbacksPerDay),
      paidEmailVerificationsPerMonth: clampNonNegativeInteger(override?.paidEmailVerificationsPerMonth, base.paidEmailVerificationsPerMonth),
      paidApiBudgetBrlPerMonth: clampNonNegativeMoney(override?.paidApiBudgetBrlPerMonth, base.paidApiBudgetBrlPerMonth),
    };
  }

  private stageForBudgetUsage(ratio: number): EnrichmentCostDecisionStage {
    if (ratio >= 1) return 'locked';
    if (ratio >= 0.9) return 'manual_only';
    if (ratio >= 0.7) return 'reduce_auto';
    return 'ok';
  }

  private normalizeTrigger(value: unknown): EnrichmentCostTrigger {
    const normalized = String(value || '').trim().toLowerCase();
    if (['manual', 'admin', 'retry', 'import'].includes(normalized)) return normalized as EnrichmentCostTrigger;
    return 'auto';
  }

  private optionalString(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private optionalPositiveInteger(value: unknown) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
  }

  private resolveCompanyIdFromUser(user: any) {
    const companyId = this.optionalPositiveInteger(user?.companyId || user?.company?.id);
    if (!companyId) throw new BadRequestException('Usuario sem companyId para resumo de custo.');
    return companyId;
  }

  private usdToBrl() {
    return clampNonNegativeMoney(process.env.HBX_ENRICHMENT_USD_TO_BRL, DEFAULT_USD_TO_BRL) || DEFAULT_USD_TO_BRL;
  }

  private stringifyMetadata(metadata: Record<string, any> | null) {
    if (!metadata) return null;
    const json = JSON.stringify(redactSensitiveMetadata(metadata));
    return json.length > 12000 ? `${json.slice(0, 11950)}...[truncated]` : json;
  }

  private ledgerDelegate() {
    const delegate = (this.prisma as any).enrichmentCostLedger;
    if (!delegate || typeof delegate.create !== 'function' || typeof delegate.findMany !== 'function') {
      throw new ServiceUnavailableException('Ledger de custo de enriquecimento indisponivel no Prisma Client.');
    }
    return delegate;
  }

  private canReadLedger() {
    const delegate = (this.prisma as any).enrichmentCostLedger;
    return Boolean(delegate && typeof delegate.findMany === 'function');
  }

  private async ledgerTableExists() {
    if (typeof (this.prisma as any).hasTable !== 'function') return true;
    return Boolean(await (this.prisma as any).hasTable('EnrichmentCostLedger'));
  }

  private async ensureLedgerAvailable() {
    this.ledgerDelegate();
    if (!(await this.ledgerTableExists())) {
      throw new ServiceUnavailableException('Tabela EnrichmentCostLedger ausente; aplique a migration antes de habilitar fallback pago.');
    }
  }
}
