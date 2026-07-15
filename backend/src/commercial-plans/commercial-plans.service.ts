import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MasterContextService } from '../master-context/master-context.service';
import { isPlatformInfraCompany } from '../common/company-kind';
import {
  COMMERCIAL_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_KEYS,
  buildCommercialPlansCatalog,
  getCommercialAnnualDiscountPercent,
  normalizeCommercialPlanKey,
  resolveCommercialPlanKeyForCapabilities,
  toCommercialCurrency,
  type ActiveCommercialPlanKey,
  type CommercialEntitlementKey,
} from './commercial-plan-catalog';
// R4 (FASE 2 — REMOÇÃO): seat-billing.util não é mais consumido aqui — assento
// grátis, computeCompanyCommercialAmount não soma mais custo por cabeça.
import { resolveCompanyAccessState } from '../modules/company-access-state';
import { MasterAlertService } from '../master-alert/master-alert.service';
import { MailService } from '../mail/mail.service';

type CommercialCurrentState = {
  planKey: ActiveCommercialPlanKey | null;
  entitlements: Record<CommercialEntitlementKey, boolean>;
  selectedPlanKey: ActiveCommercialPlanKey | null;
  contactName: string | null;
  contactPhone: string | null;
  taxDocument: string | null;
  accessState: string | null;
  accessStateLabel: string | null;
  // Sinal NEUTRO de bloqueio (sobrevive para vendedor — não é valor financeiro):
  // true quando a empresa não pode operar (pending_checkout/overdue/suspended).
  accessPaused: boolean;
  trialEndsAt: string | null;
  trialRemainingDays: number | null;
  billingGraceEndsAt: string | null;
  billingGraceRemainingHours: number | null;
  isTrial: boolean;
  billingBreakdown?: CommercialBillingBreakdown | null;
  // Cartão na ficha (assinatura vigente, inclusive trial): permite reusar no
  // upgrade/assinar ("•••• 4242 — confirmar") sem redigitar. Só audiência de billing.
  savedCard: { brand: string | null; last4: string | null } | null;
  assistedSetup: {
    required: boolean;
    status: string;
    completedAt: string | null;
    message: string | null;
  };
  canSeeLeadIntelligence: boolean;
  canSeeCompanyData: boolean;
  // Modelo de cobrança da conta (decisão do dono 07/07, decisão C): true = conta de CRÉDITO
  // (cortesia/modelo grátis com HBX_CREDITS_ENABLED). O front troca o card de plano ("HBX Lead
  // Plus / Leads do mês x/2.200") por saldo de crédito. NEUTRO (não é valor financeiro em R$):
  // sobrevive para o card da sidebar, que só é audiência de cobrança (não-vendedor).
  creditsAccount: boolean;
};

type CommercialBillingBreakdown = {
  baseMonthly: number;
  includedUsers: number;
  billableUsers: number;
  extraUsers: number;
  extraUserMonthlyPrice: number;
  extraUsersMonthlyAmount: number;
  extraUsersProratedAmount?: number;
  extraUsersBillableDays?: number;
  billedImmediately?: boolean;
  billingMode?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  monthlyTotal: number;
  cycleAmount: number;
};

@Injectable()
export class CommercialPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterContextService: MasterContextService,
    private readonly masterAlert: MasterAlertService,
    private readonly mail: MailService,
  ) {}

  private async resolveUserContext(user: any) {
    const userId = Number(user?.id || 0);
    if (!userId) throw new ForbiddenException('Usuario nao identificado.');
    const runtimeContext = await this.masterContextService.resolveRuntimeContext(user);
    const companyId = Boolean(user?.isSystemMaster)
      ? Number(runtimeContext.effectiveCompanyId || 0)
      : Number(runtimeContext.effectiveCompanyId || user?.companyId || user?.company?.id || 0);
    if (!companyId && Boolean(user?.isSystemMaster)) {
      throw new ForbiddenException('Selecione/crie um tenant para configurar plano.');
    }
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    return {
      companyId,
      userId,
      canSelectPlan: this.canSelectPlans(user),
    };
  }

  private canSelectPlans(user: any) {
    if (Boolean(user?.isSystemMaster)) return true;
    // USERMASTER (dono do tenant) = admin: seleciona plano, igual a ADMIN.
    const role = String(user?.role || '').trim().toUpperCase();
    return role === 'ADMIN' || role === 'USERMASTER';
  }

  private computeTrialRemainingDays(trialEndsAt?: Date | null) {
    if (!(trialEndsAt instanceof Date)) return null;
    const diff = trialEndsAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  async getBillableUserCount(companyId: number): Promise<number> {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { companyKind: true },
    });
    if (this.isPlatformInfraCommercialCompany(company)) return 0;
    return this.prisma.user.count({
      where: {
        companyId: Number(companyId),
        isActive: true,
        deactivatedAt: null,
        isSystemMaster: false,
        role: 'USER',
      },
    });
  }

  // R4 (FASE 2 — REMOÇÃO, definitivo): assento GRÁTIS — extraUsers/extraSeat*
  // sempre zerados (D5). Mantido o shape do retorno (billingBreakdown ainda é
  // lido pela tela antiga de "Plano e cobrança"), só sem custo por cabeça.
  async computeCompanyCommercialAmount(
    companyId: number,
    planKeyRaw: unknown,
    billingCycleRaw: unknown,
  ): Promise<CommercialBillingBreakdown> {
    const planKey = normalizeCommercialPlanKey(planKeyRaw);
    const catalogPlan = buildCommercialPlansCatalog({ includeHidden: true }).find((plan) => plan.key === planKey);
    const baseMonthly = toCommercialCurrency(catalogPlan?.monthlyPrice ?? 0);
    const billingCycle = String(billingCycleRaw || '').trim().toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
    const billableUsers = await this.prisma.user.count({
      where: { companyId: Number(companyId), isActive: true, deactivatedAt: null, isSystemMaster: false, role: { in: ['USER', 'ADMIN'] } },
    }).catch(() => 0);
    const baseCycleAmount = billingCycle === 'ANNUAL'
      ? toCommercialCurrency(baseMonthly * 12 * (1 - getCommercialAnnualDiscountPercent() / 100))
      : baseMonthly;

    return {
      baseMonthly,
      includedUsers: billableUsers,
      billableUsers,
      extraUsers: 0,
      extraUserMonthlyPrice: 0,
      extraUsersMonthlyAmount: 0,
      extraUsersProratedAmount: 0,
      extraUsersBillableDays: 0,
      billedImmediately: false,
      billingMode: 'month_end_prorated',
      billingPeriodStart: new Date().toISOString(),
      billingPeriodEnd: new Date().toISOString(),
      monthlyTotal: baseMonthly,
      cycleAmount: baseCycleAmount,
    };
  }

  // Projecoes do estado canonico (company-access-state.ts) — este servico
  // nao re-deriva mais acesso/trial de campos crus (PR-002 A.4).
  private isCompanyTrialingVendas(company: any) {
    const trialModule = String(company?.trialModuleSelection || '').trim().toLowerCase();
    if (trialModule !== COMMERCIAL_ENTITLEMENT_KEYS.VENDAS) return false;
    const access = resolveCompanyAccessState(company);
    return access.state === 'trial' || access.state === 'trial_ending';
  }

  private isCompanyCommercialAccessAllowed(company: any) {
    if (this.isPlatformInfraCommercialCompany(company)) return true;
    return resolveCompanyAccessState(company).canUse;
  }

  private resolveEntitlements(company: any): Record<CommercialEntitlementKey, boolean> {
    const enabled = !this.isPlatformInfraCommercialCompany(company) && this.isCompanyCommercialAccessAllowed(company);
    return {
      vendas: enabled,
      atendimento_chat: enabled,
      webscraping: enabled,
      recovery: enabled,
      recovery_intelligence: enabled,
      digital_audit: enabled,
      opportunity_score: enabled,
      ai_sales_scripts: enabled,
    };
  }

  private isPlatformInfraCommercialCompany(company: any) {
    return isPlatformInfraCompany(company);
  }

  private assertTenantCommercialPlanContext(company: any) {
    if (this.isPlatformInfraCommercialCompany(company)) {
      throw new ForbiddenException('Empresa tecnica da plataforma nao pode receber plano comercial.');
    }
  }

  private buildFullEntitlements(): Record<CommercialEntitlementKey, boolean> {
    return {
      vendas: true,
      atendimento_chat: true,
      webscraping: true,
      recovery: true,
      recovery_intelligence: true,
      digital_audit: true,
      opportunity_score: true,
      ai_sales_scripts: true,
    };
  }

  private async buildCurrentState(company: any): Promise<CommercialCurrentState> {
    const entitlements = this.resolveEntitlements(company);
    const platformInfra = this.isPlatformInfraCommercialCompany(company);
    const companyAccess = resolveCompanyAccessState(company);
    const hasExplicitCommercialPlan = Boolean(
      String(company?.selectedPlanKey || '').trim() ||
      companyAccess.state === 'manual' ||
      companyAccess.state === 'exempt',
    );
    const selectedPlanKey = platformInfra
      ? null
      : hasExplicitCommercialPlan
        ? resolveCommercialPlanKeyForCapabilities({ selectedPlanKey: company?.selectedPlanKey })
        : null;
    const planKey = selectedPlanKey;
    const isTrial = this.isCompanyTrialingVendas(company);
    const billingGraceEndsAt = company?.billingGraceEndsAt instanceof Date ? company.billingGraceEndsAt : null;
    const billingGraceRemainingHours = billingGraceEndsAt
      ? Math.max(0, Math.ceil((billingGraceEndsAt.getTime() - Date.now()) / (60 * 60 * 1000)))
      : null;

    const billingBreakdown = platformInfra
      ? null
      : planKey
      ? await this.computeCompanyCommercialAmount(Number(company?.id || 0), planKey, company?.billingCycle)
      : null;
    const savedCard = platformInfra ? null : await this.loadSavedCard(Number(company?.id || 0));
    const assistedSetupRequired = platformInfra
      ? false
      : Boolean(company?.assistedSetupRequired);
    const rawAssistedSetupStatus = String(company?.assistedSetupStatus || '').trim().toLowerCase();
    const assistedSetupStatus = assistedSetupRequired
      ? rawAssistedSetupStatus === 'completed'
        ? 'completed'
        : 'pending'
      : 'not_required';

    const canSeeLeadIntelligence = true;
    const canSeeCompanyData = true;

    // Todo tenant compra lead por crédito. accountType/plano/flag não mudam o produto.
    const creditsAccount = !platformInfra;

    return {
      planKey,
      entitlements,
      selectedPlanKey,
      contactName: company?.primaryContactName || null,
      contactPhone: company?.contactPhone || null,
      taxDocument: company?.taxDocument || null,
      // Estado de acesso projetado do canonico (DROP): sem campos crus.
      accessState: platformInfra ? null : companyAccess.state,
      accessStateLabel: platformInfra ? null : companyAccess.statusLabel,
      // Neutro: só "pode operar ou não". Mantido para vendedor (não revela motivo
      // financeiro). platform_infra nunca bloqueia.
      accessPaused: platformInfra ? false : !companyAccess.canUse,
      trialEndsAt: company?.trialEndsAt instanceof Date ? company.trialEndsAt.toISOString() : null,
      trialRemainingDays: this.computeTrialRemainingDays(company?.trialEndsAt),
      billingGraceEndsAt: billingGraceEndsAt ? billingGraceEndsAt.toISOString() : null,
      billingGraceRemainingHours,
      isTrial,
      billingBreakdown,
      savedCard,
      assistedSetup: {
        required: assistedSetupRequired,
        status: platformInfra ? 'completed' : assistedSetupStatus,
        completedAt: company?.assistedSetupCompletedAt instanceof Date
          ? company.assistedSetupCompletedAt.toISOString()
          : null,
        message:
          !platformInfra && assistedSetupRequired && assistedSetupStatus !== 'completed'
            ? 'Implantação assistida pendente. A HBX configura mensagens, limites, horários e handoff humano antes de liberar automação completa.'
            : null,
      },
      canSeeLeadIntelligence,
      canSeeCompanyData,
      creditsAccount,
    };
  }

  private async loadCompany(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      include: {
        commercialEntitlements: true,
      },
    });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');
    return company;
  }

  // Cobranca e assunto do contratante (PR-002 D.4): vendedor recebe so o que
  // a UI operacional precisa (plano vigente + entitlements). Status de
  // pagamento, valores, graca, trial e dados cadastrais do contratante NAO
  // saem do backend para role USER.
  private presentCurrentStateForUser(current: CommercialCurrentState, billingAudience: boolean): CommercialCurrentState {
    if (billingAudience) return current;
    return {
      ...current,
      contactName: null,
      contactPhone: null,
      taxDocument: null,
      accessState: null,
      accessStateLabel: null,
      trialEndsAt: null,
      trialRemainingDays: null,
      billingGraceEndsAt: null,
      billingGraceRemainingHours: null,
      billingBreakdown: null,
      savedCard: null,
    };
  }

  // Cartão da assinatura vigente (inclui 'trialing' — o trial já autoriza o cartão).
  // Só o "•••• 4242"/bandeira, nunca o número. Devolve null se não há cartão na ficha.
  private async loadSavedCard(
    companyId: number,
  ): Promise<{ brand: string | null; last4: string | null } | null> {
    if (!companyId) return null;
    const sub = await this.prisma.companySubscription.findFirst({
      where: { companyId, status: { in: ['trialing', 'authorized', 'active', 'past_due', 'paused'] } },
      orderBy: { createdAt: 'desc' },
      select: { cardBrand: true, cardLast4: true },
    });
    const last4 = sub?.cardLast4 ? String(sub.cardLast4).replace(/\D/g, '').slice(-4) : null;
    if (!last4) return null;
    return { brand: sub?.cardBrand ? String(sub.cardBrand) : null, last4 };
  }

  private async buildPayload(company: any, user?: any) {
    const canSelectPlan = user ? this.canSelectPlans(user) : false;
    // Self-checkout logado (decisão do dono 07/07): planos 'paused' (List/Lead/Pro por default no
    // modelo de crédito) saem da vitrine — não são ofertados nem contratáveis. O MASTER
    // (isSystemMaster) continua vendo tudo, pra reabrir via override. O plano ATUAL da empresa é
    // exibido à parte (buildCurrentState), então filtrar a lista de OFERTA não esconde o vigente.
    const isMaster = Boolean(user?.isSystemMaster);
    const plans = buildCommercialPlansCatalog()
      .filter((plan) => !plan.hidden && (isMaster || (plan as { status?: string }).status !== 'paused'))
      .map((plan) => canSelectPlan
        ? plan
        : {
            ...plan,
            monthlyPrice: null,
            legalCopy: null,
          });
    const current = await this.buildCurrentState(company);
    return {
      current: this.presentCurrentStateForUser(current, canSelectPlan),
      plans,
      permissions: {
        canSelectPlan,
        selectPlanDeniedMessage: canSelectPlan
          ? null
          : 'Seu usuário não pode alterar a cobrança. Contate seu ADMIN ou o suporte da empresa.',
      },
    };
  }

  async getCatalogForUser(user: any) {
    const context = await this.resolveUserContext(user);
    const company = await this.loadCompany(context.companyId);
    this.assertTenantCommercialPlanContext(company);
    return this.buildPayload(company, user);
  }

  async getCurrentStateForCompany(companyId: number) {
    const company = await this.loadCompany(companyId);
    return this.buildCurrentState(company);
  }

  async assertEntitlementForUser(user: any, _entitlement: CommercialEntitlementKey) {
    if (Boolean(user?.isSystemMaster)) {
      return {
        planKey: COMMERCIAL_PLAN_KEYS.MELHOR,
        entitlements: this.buildFullEntitlements(),
      };
    }

    const context = await this.resolveUserContext(user);
    const current = await this.getCurrentStateForCompany(context.companyId);
    if (!current.accessPaused) return current;

    throw new HttpException(
      {
        code: 'COMPANY_ACCESS_PAUSED',
        message: 'O acesso operacional da empresa está pausado.',
      },
      HttpStatus.FORBIDDEN,
    );
  }

  async assertAssistedSetupCompleteForCompany(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: {
        companyKind: true,
        selectedPlanKey: true,
        assistedSetupRequired: true,
        assistedSetupStatus: true,
      },
    });
    if (this.isPlatformInfraCommercialCompany(company)) return;
    const required = Boolean(company?.assistedSetupRequired);
    const rawStatus = String(company?.assistedSetupStatus || '').trim().toLowerCase();
    const status = required && rawStatus !== 'completed' ? 'pending' : rawStatus;
    if (!required || status === 'completed') return;
    throw new HttpException(
      {
        code: 'ASSISTED_SETUP_REQUIRED',
        message: 'A automação completa precisa de implantação assistida para evitar bloqueio no WhatsApp.',
        assistedSetup: {
          required: true,
          status: status || 'pending',
        },
      },
      HttpStatus.CONFLICT,
    );
  }

  // HBX Full = implantação assistida, SEM self-checkout (ordem do dono 14/06): o
  // cliente PEDE e um especialista (o dono) entra em contato. NÃO muda o plano nem
  // libera entitlement aqui (isso seria feature paga sem pagamento — PAGAMENTOS.md);
  // só registra o pedido e dispara o alerta do master. O alerta é best-effort:
  // falha de canal nunca derruba o pedido.
  // Pedido de Implantação com mensagem livre (bloco PR16062026025).
  // Envia e-mail para jhonatan@hbxsystem.com.br + alerta in-app do master.
  // Best-effort: falha de canal nunca derruba a resposta.
  async requestImplantacaoContact(user: any, dto: { message?: string }) {
    const context = await this.resolveUserContext(user);
    if (!context.canSelectPlan) {
      throw new ForbiddenException({
        code: 'USER_IMPLANTATION_REQUEST_NOT_ALLOWED',
        message: 'Fale com o ADMIN da empresa para solicitar Implantação.',
      });
    }
    const company = await this.prisma.company.findUnique({
      where: { id: context.companyId },
      select: { id: true, name: true, primaryContactName: true, contactPhone: true },
    });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');

    const msg = String(dto?.message || '').slice(0, 2000).trim();
    const subject = `Pedido de Implantação — ${company.name || 'empresa'}`;
    const text = [
      `Empresa: ${company.name || '—'}`,
      `Contato: ${company.primaryContactName || '—'}`,
      `Telefone: ${company.contactPhone || '—'}`,
      `E-mail: ${user?.email || '—'}`,
      '',
      msg ? `Mensagem:\n${msg}` : '(sem mensagem adicional)',
    ].join('\n');

    this.mail
      .sendMail({
        to: 'jhonatan@hbxsystem.com.br',
        subject,
        text,
        html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`,
      })
      .catch(() => {
        // best-effort: falha de SMTP não derruba a resposta
      });

    this.masterAlert
      .notifyFullPlanRequested({
        companyId: company.id,
        companyName: company.name,
        contactName: company.primaryContactName,
        contactPhone: company.contactPhone,
        requestedByEmail: user?.email || null,
      })
      .catch(() => {
        // best-effort: falha de alerta não derruba a resposta
      });

    return {
      ok: true,
      message: 'Recebemos seu pedido de Implantação. A HBX vai te chamar.',
    };
  }
}
