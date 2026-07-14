import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AiGatewayService, AiGatewayUsageEvent } from '../ai-gateway/ai-gateway.service';
import { CreditActionConfigService } from './credit-action-config.service';
import { CreditWalletService } from './credit-wallet.service';
import { CreditsService } from './credits.service';
import { isCreditsFeatureEnabled } from './credits.flags';

export type CreditActionAuthorization = {
  allowed: boolean;
  applied: boolean;
  charged: number;
  cost: number;
  usageKey: string | null;
  release?: () => Promise<void>;
};

/**
 * Autorização canônica de uma ação paga. Grátis é no-op; Débito reserva antes
 * do efeito e oferece release idempotente
 * para falha confirmada. O mesmo contrato atende IA, automações e Logística.
 */
@Injectable()
export class CreditActionUsageService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly config: CreditActionConfigService,
    private readonly wallet: CreditWalletService,
    private readonly credits: CreditsService,
  ) {}

  onModuleInit() {
    AiGatewayService.setUsageAuthorizer((usage) => this.authorizeAiUsage(usage));
  }

  onModuleDestroy() {
    AiGatewayService.setUsageAuthorizer(null);
  }

  private async authorizeAiUsage(usage: AiGatewayUsageEvent) {
    const reservation = await this.authorize({
      companyId: usage.companyId,
      actionKey: usage.actionKey,
      refId: usage.refId,
      units: usage.units,
      metadata: { lane: usage.lane },
    });
    return { allowed: reservation.allowed, release: reservation.release };
  }

  async authorize(input: {
    companyId: number;
    actionKey: string;
    refId: string | number;
    units?: number;
    userId?: number | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<CreditActionAuthorization> {
    const companyId = Math.trunc(Number(input?.companyId || 0));
    const refId = String(input?.refId ?? '').trim();
    if (!isCreditsFeatureEnabled() || companyId <= 0 || !refId) {
      return { allowed: true, applied: false, charged: 0, cost: 0, usageKey: null };
    }

    const definition = await this.config.resolveEffective(input.actionKey);
    if (!definition || definition.mode === 'free' || definition.cost <= 0) {
      return { allowed: true, applied: false, charged: 0, cost: 0, usageKey: null };
    }
    if (!(await this.credits.isEnforceActiveForCompany(companyId))) {
      return { allowed: true, applied: false, charged: 0, cost: definition.cost, usageKey: null };
    }

    const units = Math.max(1, Math.trunc(Number(input.units ?? 1)) || 1);
    const cost = Math.round(definition.cost * units * 1000) / 1000;
    const usageKey = `action:${definition.key}:${refId}`;
    const result = await this.wallet.debit(companyId, cost, {
      actionKey: definition.key,
      usageKey,
      userId: input.userId ?? null,
      metadata: input.metadata ?? null,
    });

    if (result.debited < cost) {
      if (result.debited > 0) {
        await this.wallet.refund(companyId, { usageKey, userId: input.userId ?? null }).catch(() => null);
      }
      return { allowed: false, applied: true, charged: 0, cost, usageKey };
    }

    return {
      allowed: true,
      applied: true,
      charged: result.debited,
      cost,
      usageKey,
      release: async () => {
        await this.wallet.refund(companyId, {
          usageKey,
          userId: input.userId ?? null,
          metadata: { ...(input.metadata || {}), release: 'confirmed_failure' },
        });
      },
    };
  }
}
