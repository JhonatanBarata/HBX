import { ConflictException, Injectable, Optional } from '@nestjs/common';
import { isPlatformInfraCompany } from '../common/company-kind';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { resolveCommercialPlanKeyForCapabilities } from './commercial-plan-catalog';

@Injectable()
export class CommercialUsageLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    // Débito real do lead permanece no choke único deste serviço.
    @Optional() private readonly creditsService?: CreditsService,
  ) {}

  // selectedPlanKey é somente metadado do ledger comercial; nunca define quantos
  // leads alguém pode adquirir.
  private async getCompanyPlan(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { selectedPlanKey: true, companyKind: true },
    });
    const platformInfra = isPlatformInfraCompany(company);
    const planKey = platformInfra ? 'platform_infra' : resolveCommercialPlanKeyForCapabilities(company || {});
    return { planKey };
  }

  private async log(companyId: number, userId: number | null, eventType: string, source: string, metadata: Record<string, any> = {}) {
    const company = await this.getCompanyPlan(companyId);
    return this.prisma.companyCommercialUsageLog.create({
      data: {
        companyId,
        userId: Number(userId || 0) || null,
        planKey: company.planKey,
        eventType,
        source,
        metadataJson: JSON.stringify({ planKey: company.planKey, userId: Number(userId || 0) || null, ...metadata }),
      },
    });
  }

  private normalizeUsageKey(value: unknown) {
    return String(value || '').trim().replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 160);
  }

  /** Chave canônica da aquisição; contato posterior não participa do débito. */
  private resolveLeadDeliveryKey(metadata: Record<string, any>): string {
    const explicit = this.normalizeUsageKey(metadata?.usageKey || '');
    if (explicit) return explicit;
    const radarLeadId = String(metadata?.radarLeadId ?? '').trim();
    if (radarLeadId) return this.normalizeUsageKey(`radar:${radarLeadId}`);
    const vendasLeadId = String(metadata?.vendasLeadId ?? '').trim();
    if (vendasLeadId) return this.normalizeUsageKey(`vendas:${vendasLeadId}`);
    return '';
  }

  private throwCreditDebitUnavailable(reason: string): never {
    throw new ConflictException({
      ok: false,
      code: 'CREDIT_DEBIT_UNAVAILABLE',
      message: 'Nao foi possivel confirmar o debito do lead. Nenhum dado foi liberado.',
      reason,
    });
  }

  /**
   * Choke canônico da aquisição: debita o crédito antes de qualquer gravação ou
   * revelação do lead. A usageKey torna retries idempotentes no CreditWalletService;
   * sem saldo ou sem serviço de crédito, falha fechado e não deixa card órfão.
   * `isBillingAudienceUser` decide a mensagem (dono → "Saldo de
   * créditos esgotado"; vendedor/gerente → bloqueio neutro, LEI DO VENDEDOR).
   */
  async reserveLeadDeliveryCredit(
    companyId: number,
    userId: number | null,
    input: { usageKey: string; isBillingAudienceUser?: boolean },
  ): Promise<{ applied: boolean; debited: number }> {
    if (!this.creditsService || typeof this.creditsService.assertAndDebitLeadDelivery !== 'function') {
      this.throwCreditDebitUnavailable('credits_service_unavailable');
    }
    const usageKey = this.normalizeUsageKey(input?.usageKey || '');
    if (!usageKey) this.throwCreditDebitUnavailable('missing_lead_key');
    const result = await this.creditsService.assertAndDebitLeadDelivery(companyId, userId, {
      leadId: usageKey,
      actionKey: 'lead_delivery',
      isBillingAudienceUser: Boolean(input?.isBillingAudienceUser),
    });
    if (!result?.applied || Number(result?.debited || 0) < 1) {
      this.throwCreditDebitUnavailable('debit_not_applied');
    }
    return { applied: true, debited: Number(result.debited) };
  }

  /**
   * Estorno confirmado da reserva quando a entrega falha depois do débito. A
   * operação nunca informa sucesso sem confirmação financeira do crédito devolvido.
   */
  async releaseLeadDeliveryCredit(
    companyId: number,
    userId: number | null,
    input: { usageKey: string },
  ): Promise<{ refunded: number; alreadyRefunded: boolean }> {
    if (!this.creditsService || typeof this.creditsService.refundLeadDelivery !== 'function') {
      throw new ConflictException({
        ok: false,
        code: 'CREDIT_REFUND_UNAVAILABLE',
        message: 'O estorno do crédito ficou pendente de confirmação.',
        reason: 'credits_service_unavailable',
      });
    }
    const usageKey = this.normalizeUsageKey(input?.usageKey || '');
    if (!usageKey) {
      throw new ConflictException({
        ok: false,
        code: 'CREDIT_REFUND_UNAVAILABLE',
        message: 'O estorno do crédito ficou pendente de confirmação.',
        reason: 'missing_usage_key',
      });
    }
    const result = await this.creditsService.refundLeadDelivery(
      companyId,
      userId,
      { leadId: usageKey, actionKey: 'lead_delivery' },
    );
    const refunded = Number(result?.refunded || 0);
    const alreadyRefunded = result?.alreadyRefunded === true;
    if (refunded < 1) {
      throw new ConflictException({
        ok: false,
        code: 'CREDIT_REFUND_UNCONFIRMED',
        message: 'O estorno do crédito ficou pendente de confirmação.',
        reason: 'refund_not_applied',
      });
    }
    // Em retry, `alreadyRefunded` prova que a linha idempotente já existia; o
    // valor continua sendo exatamente o total histórico registrado no ledger.
    return { refunded, alreadyRefunded };
  }

  /** Prova append-only de que a aquisição debitou e ainda não foi estornada. */
  async hasActiveLeadDeliveryCredit(companyId: number, input: { usageKey: string }) {
    const usageKey = this.normalizeUsageKey(input?.usageKey || '');
    if (!usageKey) return false;
    const debitKey = `enforce:lead_delivery:${usageKey}`;
    const [debit, refund] = await Promise.all([
      (this.prisma as any).creditLedgerEntry.findFirst({
        where: { companyId, kind: 'debit', usageKey: debitKey },
        select: { id: true },
      }),
      (this.prisma as any).creditLedgerEntry.findFirst({
        where: { companyId, kind: 'refund', usageKey: `refund:${debitKey}` },
        select: { id: true },
      }),
    ]);
    return Boolean(debit?.id && !refund?.id);
  }

  /** Primeiro uso é apenas telemetria. O único débito ocorre na aquisição canônica. */
  async recordCardCommercialUseOnce(companyId: number, userId: number | null, metadata: Record<string, any> = {}) {
    const usageKey = this.normalizeUsageKey(metadata.usageKey || metadata.vendasLeadId || metadata.radarLeadId);
    const existing = usageKey
      ? await this.prisma.companyCommercialUsageLog.findFirst({
          where: {
            companyId,
            eventType: 'card_commercial_used',
            metadataJson: { contains: `"usageKey":"${usageKey}"` },
          },
          select: { id: true },
        })
      : null;
    if (existing) return { debited: false, alreadyDebited: true };
    await this.log(companyId, userId, 'card_commercial_used', String(metadata.source || 'commercial_use'), {
      status: 'observed',
      ...metadata,
      ...(usageKey ? { usageKey } : {}),
    });
    return { debited: false, alreadyDebited: false };
  }

  private async resolveRefundDeliveryKey(companyId: number, metadata: Record<string, any>) {
    const explicit = this.normalizeUsageKey(metadata?.claimUsageKey || metadata?.usageKey || '');
    if (explicit) return explicit;

    const radarLeadId = String(metadata?.radarLeadId ?? '').trim();
    const processDelegate = (this.prisma as any)?.radarLeadProcessRun;
    if (radarLeadId && processDelegate && typeof processDelegate.findFirst === 'function') {
      const claim = await processDelegate.findFirst({
        where: {
          companyId,
          radarLeadId,
          mode: 'claim',
          status: { in: ['completed', 'partial'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (claim?.id) return this.normalizeUsageKey(`radar:${radarLeadId}:claim:${claim.id}`);
    }

    return this.resolveLeadDeliveryKey(metadata);
  }

  async recordCardRefund(companyId: number, userId: number | null, metadata: Record<string, any> = {}) {
    const usageKey = await this.resolveRefundDeliveryKey(companyId, metadata);
    try {
      const financial = await this.releaseLeadDeliveryCredit(companyId, userId, { usageKey });
      const result = await this.log(companyId, userId, 'vendas_card_refunded', 'vendas_complaint_refund', {
        status: 'refunded',
        ...metadata,
        count: 1,
        usageKey,
        refundedCredits: financial.refunded,
      });
      return [result];
    } catch (error: any) {
      await this.log(companyId, userId, 'vendas_card_refund_pending', 'vendas_complaint_refund', {
        status: 'refund_pending',
        ...metadata,
        count: 1,
        usageKey: usageKey || null,
        error: String(error?.message || error || 'Falha ao confirmar estorno.').slice(0, 500),
      });
      throw error;
    }
  }

  // E-mail de apresentação não possui cota comercial por plano.
  async assertCanSendPresentationEmail(_companyId: number, _userId?: number | null) {
    return { allowed: true };
  }

  async recordPresentationEmailAttempt(companyId: number, userId: number | null, metadata: Record<string, any> = {}) {
    return this.log(companyId, userId, 'presentation_email_attempt', 'email_presentation', metadata);
  }

  async recordPresentationEmailResult(companyId: number, userId: number | null, metadata: Record<string, any> = {}) {
    const status = String(metadata.status || '').trim();
    const eventType = status === 'sent'
      ? 'presentation_email_sent'
      : status === 'blocked'
        ? 'presentation_email_blocked_policy'
        : 'presentation_email_failed';
    return this.log(companyId, userId, eventType, 'email_presentation', metadata);
  }
}
