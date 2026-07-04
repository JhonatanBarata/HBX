import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  buildTenantGuardExtension,
  logTenantGuardBoot,
  resolveTenantGuardMode,
} from './tenant-guard.extension';

function buildRuntimeDatabaseUrl() {
  return String(process.env.DATABASE_URL || '').trim();
}

function describeDatabaseTarget(databaseUrl: string) {
  if (!databaseUrl) {
    return 'DATABASE_URL not configured';
  }

  try {
    const parsed = new URL(databaseUrl);
    const databaseName = String(parsed.pathname || '').replace(/^\//, '') || null;
    const connectionLimit = parsed.searchParams.get('connection_limit');
    const poolTimeout = parsed.searchParams.get('pool_timeout');
    return [
      `host=${parsed.hostname || 'unknown'}`,
      parsed.port ? `port=${parsed.port}` : null,
      databaseName ? `database=${databaseName}` : null,
      connectionLimit ? `connection_limit=${connectionLimit}` : null,
      poolTimeout ? `pool_timeout=${poolTimeout}` : null,
    ]
      .filter(Boolean)
      .join(' ');
  } catch {
    return 'DATABASE_URL configured';
  }
}

type RuntimeSchemaEnsureDefinition = {
  key: string;
  method: string;
  target: string;
  shouldBecomeMigration: boolean;
};

type RuntimeSchemaHealthCheckDefinition = {
  key: string;
  ensureKey?: string;
  type: 'table' | 'column';
  table: string;
  column?: string;
  shouldBecomeMigration: boolean;
};

type RuntimeSchemaHealthCheckResult = RuntimeSchemaHealthCheckDefinition & {
  ok: boolean;
};

export type RuntimeSchemaHealthReport = {
  ok: boolean;
  generatedAt: string;
  databaseTarget: string;
  checkedCount: number;
  missingCount: number;
  runtimeEnsures: RuntimeSchemaEnsureDefinition[];
  checks: RuntimeSchemaHealthCheckResult[];
  missing: RuntimeSchemaHealthCheckResult[];
};

const RUNTIME_SCHEMA_ENSURES: RuntimeSchemaEnsureDefinition[] = [
  {
    key: 'company-commission-settings-columns',
    method: 'ensureCompanyCommissionSettingsColumns',
    target: 'Company.commissionDueBusinessDays',
    shouldBecomeMigration: true,
  },
  {
    key: 'regua-cargo-access-columns',
    method: 'ensureReguaCargoAccessColumns',
    target: 'Company.sellerCargoAccessJson + User.canViewBilling (régua única PR13062026007)',
    shouldBecomeMigration: true,
  },
  {
    key: 'trial-identity-columns',
    method: 'ensureTrialIdentityColumns',
    target: 'TrialPhoneUsage.taxDocumentNormalized (anti-abuso de trial por CPF — 15/06)',
    shouldBecomeMigration: true,
  },
  {
    key: 'user-tutorial-onboarding-column',
    method: 'ensureTutorialOnboardingColumn',
    target: 'User.tutorialCompletedAt (boas-vindas/tutorial 14/06 — existentes backfillados resolvidos)',
    shouldBecomeMigration: true,
  },
  {
    key: 'company-prospecting-segments-column',
    method: 'ensureCompanyProspectingSegmentsColumn',
    target: 'Company.prospectingSegmentsJson (ramo-alvo do dono — primeiro login 14/06)',
    shouldBecomeMigration: true,
  },
  {
    key: 'plan-module-config-table',
    method: 'ensurePlanModuleConfigTable',
    target: 'PlanModuleConfig table (módulos padrões por plano — PR13062026007)',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendas-automation-triagem-columns',
    method: 'ensureVendasAutomationTriagemColumns',
    target: 'VendasAutomationCampaign triagemConfirmedAt/By (bot fail-closed — PR13062026007)',
    shouldBecomeMigration: true,
  },
  {
    key: 'user-sales-profile-columns',
    method: 'ensureUserSalesProfileColumns',
    target: 'User seller profile and distribution columns',
    shouldBecomeMigration: true,
  },
  {
    key: 'hbx-partner-referral-candidate-tables',
    method: 'ensureHbxPartnerReferralCandidateTables',
    target: 'HbxPartnerReferralCandidate table, constraints and indexes',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendas-lead-assignment-columns',
    method: 'ensureVendasLeadAssignmentColumns',
    target: 'VendasLead assignment, sale and commission columns',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendas-lead-opportunity-score-column',
    method: 'ensureVendasLeadOpportunityScoreColumn',
    target: 'VendasLead.opportunityScore (score no card do Vendas — B2 PR13062026008)',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendas-commission-payout-tables',
    method: 'ensureVendasCommissionPayoutTables',
    target: 'VendasCommissionPayout table, constraints and indexes',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendas-commission-receivable-tables',
    method: 'ensureVendasCommissionReceivableTables',
    target: 'VendasCommissionReceivable table, constraints and indexes',
    shouldBecomeMigration: true,
  },
  {
    key: 'radar-auto-distribution-rule-tables',
    method: 'ensureRadarAutoDistributionRuleTables',
    target: 'RadarAutoDistributionRule table, constraints and indexes',
    shouldBecomeMigration: true,
  },
  {
    key: 'radar-distribution-daily-usage-tables',
    method: 'ensureRadarDistributionDailyUsageTables',
    target: 'RadarAutoDistributionRule daily limits and RadarDistributionDailyUsage table',
    shouldBecomeMigration: true,
  },
  {
    key: 'master-notice-tables',
    method: 'ensureMasterNoticeTables',
    target: 'MasterNotice and MasterNoticeAck tables, constraints and indexes',
    shouldBecomeMigration: true,
  },
  {
    key: 'hbx-support-ticket-tables',
    method: 'ensureHbxSupportTicketTables',
    target: 'hbx_support_ticket and hbx_job tables, constraints and indexes',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendas-cancellation-case-columns',
    method: 'ensureVendasCancellationCaseColumns',
    target: 'VendasLead cancellation case columns and index (E5 PLAN12062026001)',
    shouldBecomeMigration: true,
  },
  {
    key: 'hbx-job-application-table',
    method: 'ensureHbxJobApplicationTable',
    target: 'HbxJobApplication table and indexes (Trabalhe Conosco)',
    shouldBecomeMigration: true,
  },
  {
    key: 'master-payment-notification-log-table',
    method: 'ensureMasterPaymentNotificationLogTable',
    target: 'MasterPaymentNotificationLog table and indexes (E8 PLAN12062026001)',
    shouldBecomeMigration: true,
  },
  {
    key: 'master-event-table',
    method: 'ensureMasterEventTable',
    target: 'MasterEvent table, FK and indexes (COCKPIT-MASTER Sprint 1 — trilha única do dono)',
    shouldBecomeMigration: true,
  },
  {
    key: 'master-context-tables',
    method: 'ensureMasterContextTables',
    target: 'MasterAssumedContextSession + MasterSupportAuditLog tables, FKs and indexes (COCKPIT-MASTER Sprint 4 — DDL migrado do master-context.service.ts)',
    shouldBecomeMigration: true,
  },
];

const RUNTIME_SCHEMA_HEALTH_CHECKS: RuntimeSchemaHealthCheckDefinition[] = [
  {
    key: 'company.commissionDueBusinessDays',
    ensureKey: 'company-commission-settings-columns',
    type: 'column',
    table: 'Company',
    column: 'commissionDueBusinessDays',
    shouldBecomeMigration: true,
  },
  {
    key: 'user.phone',
    ensureKey: 'user-sales-profile-columns',
    type: 'column',
    table: 'User',
    column: 'phone',
    shouldBecomeMigration: true,
  },
  {
    key: 'user.commissionPercent',
    ensureKey: 'user-sales-profile-columns',
    type: 'column',
    table: 'User',
    column: 'commissionPercent',
    shouldBecomeMigration: true,
  },
  {
    key: 'user.canRegisterHbxSellers',
    ensureKey: 'user-sales-profile-columns',
    type: 'column',
    table: 'User',
    column: 'canRegisterHbxSellers',
    shouldBecomeMigration: true,
  },
  {
    key: 'user.sellerReferralCommissionPercent',
    ensureKey: 'user-sales-profile-columns',
    type: 'column',
    table: 'User',
    column: 'sellerReferralCommissionPercent',
    shouldBecomeMigration: true,
  },
  {
    key: 'user.referredByUserId',
    ensureKey: 'user-sales-profile-columns',
    type: 'column',
    table: 'User',
    column: 'referredByUserId',
    shouldBecomeMigration: true,
  },
  {
    key: 'user.sellerDistributionMode',
    ensureKey: 'user-sales-profile-columns',
    type: 'column',
    table: 'User',
    column: 'sellerDistributionMode',
    shouldBecomeMigration: true,
  },
  {
    key: 'hbxPartnerReferralCandidate.table',
    ensureKey: 'hbx-partner-referral-candidate-tables',
    type: 'table',
    table: 'HbxPartnerReferralCandidate',
    shouldBecomeMigration: true,
  },
  {
    key: 'hbxPartnerReferralCandidate.phoneNormalized',
    ensureKey: 'hbx-partner-referral-candidate-tables',
    type: 'column',
    table: 'HbxPartnerReferralCandidate',
    column: 'phoneNormalized',
    shouldBecomeMigration: true,
  },
  {
    key: 'hbxPartnerReferralCandidate.status',
    ensureKey: 'hbx-partner-referral-candidate-tables',
    type: 'column',
    table: 'HbxPartnerReferralCandidate',
    column: 'status',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendasLead.assignedUserId',
    ensureKey: 'vendas-lead-assignment-columns',
    type: 'column',
    table: 'VendasLead',
    column: 'assignedUserId',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendasLead.commissionStatus',
    ensureKey: 'vendas-lead-assignment-columns',
    type: 'column',
    table: 'VendasLead',
    column: 'commissionStatus',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendasLead.commissionAmount',
    ensureKey: 'vendas-lead-assignment-columns',
    type: 'column',
    table: 'VendasLead',
    column: 'commissionAmount',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendasLead.commissionPayoutId',
    ensureKey: 'vendas-lead-assignment-columns',
    type: 'column',
    table: 'VendasLead',
    column: 'commissionPayoutId',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendasCommissionPayout.table',
    ensureKey: 'vendas-commission-payout-tables',
    type: 'table',
    table: 'VendasCommissionPayout',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendasCommissionReceivable.table',
    ensureKey: 'vendas-commission-receivable-tables',
    type: 'table',
    table: 'VendasCommissionReceivable',
    shouldBecomeMigration: true,
  },
  {
    key: 'vendasCommissionReceivable.cycleKey',
    ensureKey: 'vendas-commission-receivable-tables',
    type: 'column',
    table: 'VendasCommissionReceivable',
    column: 'cycleKey',
    shouldBecomeMigration: true,
  },
  {
    key: 'radarAutoDistributionRule.table',
    ensureKey: 'radar-auto-distribution-rule-tables',
    type: 'table',
    table: 'RadarAutoDistributionRule',
    shouldBecomeMigration: true,
  },
  {
    key: 'radarAutoDistributionRule.adminDailyLimit',
    ensureKey: 'radar-distribution-daily-usage-tables',
    type: 'column',
    table: 'RadarAutoDistributionRule',
    column: 'adminDailyLimit',
    shouldBecomeMigration: true,
  },
  {
    key: 'radarAutoDistributionRule.dailyLimitPerSeller',
    ensureKey: 'radar-distribution-daily-usage-tables',
    type: 'column',
    table: 'RadarAutoDistributionRule',
    column: 'dailyLimitPerSeller',
    shouldBecomeMigration: true,
  },
  {
    key: 'radarDistributionDailyUsage.table',
    ensureKey: 'radar-distribution-daily-usage-tables',
    type: 'table',
    table: 'RadarDistributionDailyUsage',
    shouldBecomeMigration: true,
  },
  {
    key: 'masterNotice.table',
    ensureKey: 'master-notice-tables',
    type: 'table',
    table: 'MasterNotice',
    shouldBecomeMigration: true,
  },
  {
    key: 'masterNoticeAck.table',
    ensureKey: 'master-notice-tables',
    type: 'table',
    table: 'MasterNoticeAck',
    shouldBecomeMigration: true,
  },
  {
    key: 'hbxSupportTicket.table',
    ensureKey: 'hbx-support-ticket-tables',
    type: 'table',
    table: 'hbx_support_ticket',
    shouldBecomeMigration: true,
  },
  {
    key: 'hbxSupportTicket.status',
    ensureKey: 'hbx-support-ticket-tables',
    type: 'column',
    table: 'hbx_support_ticket',
    column: 'status',
    shouldBecomeMigration: true,
  },
  {
    key: 'hbxSupportTicket.codexDispatchStatus',
    ensureKey: 'hbx-support-ticket-tables',
    type: 'column',
    table: 'hbx_support_ticket',
    column: 'codexDispatchStatus',
    shouldBecomeMigration: true,
  },
  {
    key: 'hbxJob.table',
    ensureKey: 'hbx-support-ticket-tables',
    type: 'table',
    table: 'hbx_job',
    shouldBecomeMigration: true,
  },
  {
    key: 'hbxJob.ticketId',
    ensureKey: 'hbx-support-ticket-tables',
    type: 'column',
    table: 'hbx_job',
    column: 'ticketId',
    shouldBecomeMigration: true,
  },
  {
    key: 'masterEvent.table',
    ensureKey: 'master-event-table',
    type: 'table',
    table: 'MasterEvent',
    shouldBecomeMigration: true,
  },
  {
    key: 'masterAssumedContextSession.table',
    ensureKey: 'master-context-tables',
    type: 'table',
    table: 'MasterAssumedContextSession',
    shouldBecomeMigration: true,
  },
  {
    key: 'masterSupportAuditLog.table',
    ensureKey: 'master-context-tables',
    type: 'table',
    table: 'MasterSupportAuditLog',
    shouldBecomeMigration: true,
  },
  {
    key: 'externalWebhookEvent.table',
    type: 'table',
    table: 'ExternalWebhookEvent',
    shouldBecomeMigration: false,
  },
  {
    key: 'externalWebhookEvent.payloadHash',
    type: 'column',
    table: 'ExternalWebhookEvent',
    column: 'payloadHash',
    shouldBecomeMigration: false,
  },
  {
    key: 'whatsappConsentLedger.table',
    type: 'table',
    table: 'WhatsappConsentLedger',
    shouldBecomeMigration: false,
  },
  {
    key: 'whatsappConsentLedger.phoneNormalized',
    type: 'column',
    table: 'WhatsappConsentLedger',
    column: 'phoneNormalized',
    shouldBecomeMigration: false,
  },
];

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly schemaCapabilityCache = new Map<string, boolean>();
  private readonly runtimeDatabaseUrl: string;

  constructor() {
    const runtimeDatabaseUrl = buildRuntimeDatabaseUrl();
    super(
      runtimeDatabaseUrl
        ? {
            datasources: {
              db: {
                url: runtimeDatabaseUrl,
              },
            },
          }
        : undefined,
    );
    this.runtimeDatabaseUrl = runtimeDatabaseUrl;

    // Trava de escopo de tenant (multi-tenancy Sprint 1). O $extends devolve um
    // NOVO client imutável (não muta `this`); os dois compartilham a MESMA conexão,
    // então o $connect/$disconnect de `this` cobre os dois. Delegamos os acessos a
    // model (this.user, this.company, ...) e os métodos $transaction/$queryRaw pro
    // client estendido via Proxy, mantendo os métodos próprios do PrismaService
    // (onModuleInit, hasTable, ensures...) intactos. O guard lê o tenant do request
    // no AsyncLocalStorage — ver tenant-guard.extension.ts.
    const guardMode = resolveTenantGuardMode();
    logTenantGuardBoot(guardMode);
    if (guardMode === 'off') {
      return;
    }

    // Membros PRÓPRIOS do PrismaService (lifecycle, ensures de schema, helpers
    // hasTable/hasColumn, isSqliteUrl, logger, caches) — coletados da cadeia de
    // protótipo ATÉ (sem incluir) o PrismaClient, mais as props de instância. Ficam
    // sempre no target real: o $extends não os conhece e os ensures rodam SQL cru no
    // client cru (por isso $queryRaw/$executeRaw não passam pela trava, documentado).
    const ownMembers = new Set<string>(Object.getOwnPropertyNames(this));
    let proto = Object.getPrototypeOf(this);
    while (proto && proto !== PrismaClient.prototype && proto !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name !== 'constructor') ownMembers.add(name);
      }
      proto = Object.getPrototypeOf(proto);
    }

    const extended = this.$extends(buildTenantGuardExtension(guardMode)) as unknown as PrismaClient;
    return new Proxy(this, {
      get(target, prop, receiver) {
        // Todo o resto (delegates de model `this.user`/`this.company`... + $transaction)
        // vem do client estendido, que aplica a trava de tenant.
        if (typeof prop === 'string' && ownMembers.has(prop)) {
          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        if (prop in extended) {
          const value = Reflect.get(extended as object, prop, extended);
          return typeof value === 'function' ? value.bind(extended) : value;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  async onModuleInit() {
    try {
      // eslint-disable-next-line no-console
      console.log('Prisma runtime target:', describeDatabaseTarget(this.runtimeDatabaseUrl || String(process.env.DATABASE_URL || '').trim()));
    } catch (e) {}
    await this.$connect();
    await this.runRuntimeSchemaEnsure('company-commission-settings-columns', () => this.ensureCompanyCommissionSettingsColumns());
    await this.runRuntimeSchemaEnsure('regua-cargo-access-columns', () => this.ensureReguaCargoAccessColumns());
    await this.runRuntimeSchemaEnsure('user-tutorial-onboarding-column', () => this.ensureTutorialOnboardingColumn());
    await this.runRuntimeSchemaEnsure('company-prospecting-segments-column', () => this.ensureCompanyProspectingSegmentsColumn());
    await this.runRuntimeSchemaEnsure('plan-module-config-table', () => this.ensurePlanModuleConfigTable());
    await this.runRuntimeSchemaEnsure('vendas-automation-triagem-columns', () => this.ensureVendasAutomationTriagemColumns());
    await this.runRuntimeSchemaEnsure('user-sales-profile-columns', () => this.ensureUserSalesProfileColumns());
    await this.runRuntimeSchemaEnsure('hbx-partner-referral-candidate-tables', () => this.ensureHbxPartnerReferralCandidateTables());
    await this.runRuntimeSchemaEnsure('vendas-lead-assignment-columns', () => this.ensureVendasLeadAssignmentColumns());
    await this.runRuntimeSchemaEnsure('vendas-lead-opportunity-score-column', () => this.ensureVendasLeadOpportunityScoreColumn());
    await this.runRuntimeSchemaEnsure('vendas-commission-payout-tables', () => this.ensureVendasCommissionPayoutTables());
    await this.runRuntimeSchemaEnsure('vendas-commission-receivable-tables', () => this.ensureVendasCommissionReceivableTables());
    await this.runRuntimeSchemaEnsure('radar-auto-distribution-rule-tables', () => this.ensureRadarAutoDistributionRuleTables());
    await this.runRuntimeSchemaEnsure('radar-distribution-daily-usage-tables', () => this.ensureRadarDistributionDailyUsageTables());
    await this.runRuntimeSchemaEnsure('master-notice-tables', () => this.ensureMasterNoticeTables());
    await this.runRuntimeSchemaEnsure('hbx-support-ticket-tables', () => this.ensureHbxSupportTicketTables());
    await this.runRuntimeSchemaEnsure('vendas-cancellation-case-columns', () => this.ensureVendasCancellationCaseColumns());
    await this.runRuntimeSchemaEnsure('hbx-job-application-table', () => this.ensureHbxJobApplicationTable());
    await this.runRuntimeSchemaEnsure('master-payment-notification-log-table', () => this.ensureMasterPaymentNotificationLogTable());
    await this.runRuntimeSchemaEnsure('master-event-table', () => this.ensureMasterEventTable());
    await this.runRuntimeSchemaEnsure('trial-identity-columns', () => this.ensureTrialIdentityColumns());
    await this.runRuntimeSchemaEnsure('master-context-tables', () => this.ensureMasterContextTables());
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private isSqliteUrl() {
    const databaseUrl = String(this.runtimeDatabaseUrl || process.env.DATABASE_URL || '').trim().toLowerCase();
    return databaseUrl.startsWith('file:') || databaseUrl.endsWith('.db');
  }

  private getRuntimeSchemaEnsureDefinition(key: string) {
    const definition = RUNTIME_SCHEMA_ENSURES.find((ensure) => ensure.key === key);
    if (!definition) {
      throw new Error(`Runtime schema ensure not registered: ${key}`);
    }
    return definition;
  }

  private async runRuntimeSchemaEnsure(key: string, action: () => Promise<void>) {
    const definition = this.getRuntimeSchemaEnsureDefinition(key);
    const startedAt = Date.now();
    this.logger.warn(
      `[schema-runtime-ensure] running method=${definition.method} target="${definition.target}" shouldBecomeMigration=${definition.shouldBecomeMigration}`,
    );

    try {
      await action();
      this.logger.warn(
        `[schema-runtime-ensure] ok method=${definition.method} durationMs=${Date.now() - startedAt} shouldBecomeMigration=${definition.shouldBecomeMigration}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[schema-runtime-ensure] failed method=${definition.method} target="${definition.target}" shouldBecomeMigration=${definition.shouldBecomeMigration}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async getRuntimeSchemaHealth(): Promise<RuntimeSchemaHealthReport> {
    const checks: RuntimeSchemaHealthCheckResult[] = [];

    for (const check of RUNTIME_SCHEMA_HEALTH_CHECKS) {
      const ok =
        check.type === 'table'
          ? await this.hasTable(check.table)
          : await this.hasColumn(check.table, String(check.column || ''));

      checks.push({
        ...check,
        ok,
      });
    }

    const missing = checks.filter((check) => !check.ok);
    return {
      ok: missing.length === 0,
      generatedAt: new Date().toISOString(),
      databaseTarget: describeDatabaseTarget(this.runtimeDatabaseUrl || String(process.env.DATABASE_URL || '').trim()),
      checkedCount: checks.length,
      missingCount: missing.length,
      runtimeEnsures: RUNTIME_SCHEMA_ENSURES,
      checks,
      missing,
    };
  }

  private async ensureCompanyCommissionSettingsColumns() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "Company"
      ADD COLUMN IF NOT EXISTS "commissionDueBusinessDays" INTEGER NOT NULL DEFAULT 3
    `);
  }

  // Régua única (PR13062026007 P1): molho de acesso do cargo Vendedor (1 por
  // empresa) + marcador Dono/Gerente dentro do papel ADMIN.
  private async ensureReguaCargoAccessColumns() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "Company"
      ADD COLUMN IF NOT EXISTS "sellerCargoAccessJson" TEXT
    `);
    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "canViewBilling" BOOLEAN NOT NULL DEFAULT true
    `);
    // PF3: Central de Implantação do Full — valor de implantação + parcela acordada.
    await this.$executeRawUnsafe(`
      ALTER TABLE "Company"
      ADD COLUMN IF NOT EXISTS "setupValue" DOUBLE PRECISION
    `);
    await this.$executeRawUnsafe(`
      ALTER TABLE "Company"
      ADD COLUMN IF NOT EXISTS "monthlyValueOverride" DOUBLE PRECISION
    `);
  }

  // Anti-abuso de trial por CPF (15/06): coluna nulável + índice na MESMA tabela do
  // telefone. O onDelete:SetNull do companyId já libera o CPF quando a conta é apagada
  // (mesmo padrão do phoneNormalized) — sem tabela nova, sem bagunçar a árvore.
  private async ensureTrialIdentityColumns() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "TrialPhoneUsage"
      ADD COLUMN IF NOT EXISTS "taxDocumentNormalized" TEXT
    `);
    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TrialPhoneUsage_taxDocumentNormalized_idx"
      ON "TrialPhoneUsage" ("taxDocumentNormalized")
    `);
  }

  // Boas-vindas (primeiro acesso, 14/06): tutorialCompletedAt no User. O ADD com
  // DEFAULT NOW() backfilla os EXISTENTES como resolvidos (não veem o tutorial);
  // o DROP DEFAULT logo em seguida faz os NOVOS nascerem null = pendentes (veem).
  // Idempotente: nos boots seguintes ADD IF NOT EXISTS e DROP DEFAULT são no-op,
  // então quem foi criado depois (pendente) NÃO é re-resolvido por engano.
  private async ensureTutorialOnboardingColumn() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "tutorialCompletedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
    `);
    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ALTER COLUMN "tutorialCompletedAt" DROP DEFAULT
    `);
  }

  // Ramo-alvo da empresa (dono, 14/06): coluna nullable simples. Empresas
  // existentes ficam NULL → o portão pergunta no próximo login do dono.
  private async ensureCompanyProspectingSegmentsColumn() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "Company"
      ADD COLUMN IF NOT EXISTS "prospectingSegmentsJson" TEXT
    `);
  }

  // Score de oportunidade no card do Vendas (B2 PR13062026008): snapshot herdado
  // do Radar no import. Aditivo/nullable; idempotente.
  private async ensureVendasLeadOpportunityScoreColumn() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "opportunityScore" INTEGER
    `);
  }

  // Régua única (PR13062026007 PB1): módulos padrões por plano (editáveis no Sistema).
  private async ensurePlanModuleConfigTable() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PlanModuleConfig" (
        "planKey" TEXT PRIMARY KEY,
        "modulesJson" TEXT NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // PR13062026008: override editável dos valores do plano (assentos/quota/parcela/trial).
    await this.$executeRawUnsafe(`
      ALTER TABLE "PlanModuleConfig"
      ADD COLUMN IF NOT EXISTS "planInfoJson" TEXT
    `);
  }

  // Régua (PR13062026007, 5º muro): bot fail-closed — campanha só dispara com triagem.
  private async ensureVendasAutomationTriagemColumns() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasAutomationCampaign"
      ADD COLUMN IF NOT EXISTS "triagemConfirmedAt" TIMESTAMP(3)
    `);
    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasAutomationCampaign"
      ADD COLUMN IF NOT EXISTS "triagemConfirmedByUserId" INTEGER
    `);
  }

  async hasTable(tableName: string) {
    const normalizedTableName = String(tableName || '').trim();
    if (!normalizedTableName) return false;
    const cacheKey = `table:${normalizedTableName}`;
    if (this.schemaCapabilityCache.has(cacheKey)) {
      return Boolean(this.schemaCapabilityCache.get(cacheKey));
    }

    try {
      let exists = false;
      if (this.isSqliteUrl()) {
        const escapedTableName = normalizedTableName.replace(/'/g, "''");
        const rows = (await this.$queryRawUnsafe(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${escapedTableName}' LIMIT 1`,
        )) as Array<{ name?: string }>;
        exists = Array.isArray(rows) && rows.length > 0;
      } else {
        const escapedTableName = normalizedTableName.replace(/'/g, "''");
        const rows = (await this.$queryRawUnsafe(
          `SELECT 1 AS present FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${escapedTableName}' LIMIT 1`,
        )) as Array<{ present?: number }>;
        exists = Array.isArray(rows) && rows.length > 0;
      }
      this.schemaCapabilityCache.set(cacheKey, exists);
      return exists;
    } catch {
      this.schemaCapabilityCache.set(cacheKey, false);
      return false;
    }
  }

  async hasColumn(tableName: string, columnName: string) {
    const normalizedTableName = String(tableName || '').trim();
    const normalizedColumnName = String(columnName || '').trim();
    if (!normalizedTableName || !normalizedColumnName) return false;
    const cacheKey = `column:${normalizedTableName}:${normalizedColumnName}`;
    if (this.schemaCapabilityCache.has(cacheKey)) {
      return Boolean(this.schemaCapabilityCache.get(cacheKey));
    }

    try {
      let exists = false;
      if (this.isSqliteUrl()) {
        const escapedTableName = normalizedTableName.replace(/"/g, '""');
        const rows = (await this.$queryRawUnsafe(
          `PRAGMA table_info("${escapedTableName}")`,
        )) as Array<{ name?: string }>;
        exists = Array.isArray(rows)
          ? rows.some((row) => String(row?.name || '').trim() === normalizedColumnName)
          : false;
      } else {
        const escapedTableName = normalizedTableName.replace(/'/g, "''");
        const escapedColumnName = normalizedColumnName.replace(/'/g, "''");
        const rows = (await this.$queryRawUnsafe(
          `SELECT 1 AS present FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${escapedTableName}' AND column_name = '${escapedColumnName}' LIMIT 1`,
        )) as Array<{ present?: number }>;
        exists = Array.isArray(rows) && rows.length > 0;
      }
      this.schemaCapabilityCache.set(cacheKey, exists);
      return exists;
    } catch {
      this.schemaCapabilityCache.set(cacheKey, false);
      return false;
    }
  }

  private async ensureUserSalesProfileColumns() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "phone" TEXT
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    // Teto de comissão por fechamento (PR13062026007). 0 = sem teto. Admin-only.
    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "commissionMonthlyCap" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "setupCommissionCap" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "canRegisterHbxSellers" BOOLEAN NOT NULL DEFAULT false
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "sellerReferralCommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "referredByUserId" INTEGER
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "referredByCommissionPercentSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "sellerDistributionMode" TEXT NOT NULL DEFAULT 'learning'
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "sellerDistributionPausedUntil" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "sellerDistributionDailyLimitOverride" INTEGER
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "sellerDistributionNote" TEXT
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "sellerDistributionUpdatedAt" TIMESTAMP(3)
    `);

    // Preferência de segmento/região do vendedor (self-service 14/06). Nullable;
    // existentes ficam NULL → default cai no ramo da empresa. Idempotente.
    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "preferredSegmentsJson" TEXT
    `);

    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "User_referredByUserId_idx" ON "User"("referredByUserId")',
    );

    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "User_canRegisterHbxSellers_idx" ON "User"("canRegisterHbxSellers")',
    );

    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "User_sellerDistributionMode_idx" ON "User"("sellerDistributionMode")',
    );
  }

  private async ensureHbxPartnerReferralCandidateTables() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HbxPartnerReferralCandidate" (
        "id" TEXT NOT NULL,
        "companyId" INTEGER NOT NULL,
        "referrerUserId" INTEGER NOT NULL,
        "name" TEXT NOT NULL,
        "phone" TEXT NOT NULL,
        "phoneNormalized" TEXT,
        "note" TEXT,
        "preferredSegmentsJson" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "reviewedByUserId" INTEGER,
        "reviewedAt" TIMESTAMP(3),
        "convertedUserId" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "HbxPartnerReferralCandidate_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'HbxPartnerReferralCandidate_companyId_fkey'
        ) THEN
          ALTER TABLE "HbxPartnerReferralCandidate"
          ADD CONSTRAINT "HbxPartnerReferralCandidate_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'HbxPartnerReferralCandidate_referrerUserId_fkey'
        ) THEN
          ALTER TABLE "HbxPartnerReferralCandidate"
          ADD CONSTRAINT "HbxPartnerReferralCandidate_referrerUserId_fkey"
          FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'HbxPartnerReferralCandidate_reviewedByUserId_fkey'
        ) THEN
          ALTER TABLE "HbxPartnerReferralCandidate"
          ADD CONSTRAINT "HbxPartnerReferralCandidate_reviewedByUserId_fkey"
          FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'HbxPartnerReferralCandidate_convertedUserId_fkey'
        ) THEN
          ALTER TABLE "HbxPartnerReferralCandidate"
          ADD CONSTRAINT "HbxPartnerReferralCandidate_convertedUserId_fkey"
          FOREIGN KEY ("convertedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "HbxPartnerReferralCandidate_companyId_status_createdAt_idx" ON "HbxPartnerReferralCandidate"("companyId", "status", "createdAt")',
    );
    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "HbxPartnerReferralCandidate_referrerUserId_status_idx" ON "HbxPartnerReferralCandidate"("referrerUserId", "status")',
    );
    await this.$executeRawUnsafe(
      'ALTER TABLE "HbxPartnerReferralCandidate" ADD COLUMN IF NOT EXISTS "phoneNormalized" TEXT',
    );
    await this.$executeRawUnsafe(`
      UPDATE "HbxPartnerReferralCandidate"
      SET "phoneNormalized" = NULLIF(regexp_replace(COALESCE("phone", ''), '\\D', '', 'g'), '')
      WHERE "phoneNormalized" IS NULL
    `);
    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "HbxPartnerReferralCandidate_companyId_phoneNormalized_idx" ON "HbxPartnerReferralCandidate"("companyId", "phoneNormalized")',
    );
    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "HbxPartnerReferralCandidate_reviewedByUserId_idx" ON "HbxPartnerReferralCandidate"("reviewedByUserId")',
    );
    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "HbxPartnerReferralCandidate_convertedUserId_idx" ON "HbxPartnerReferralCandidate"("convertedUserId")',
    );
  }

  private async ensureVendasLeadAssignmentColumns() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "assignedUserId" INTEGER
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "assignedByUserId" INTEGER
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionPercentSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "saleStatus" TEXT NOT NULL DEFAULT 'none'
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "saleValue" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "salePlanKey" TEXT
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "saleConfirmedAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "saleCanceledAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionStatus" TEXT NOT NULL DEFAULT 'none'
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionBaseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionDueAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionPaidAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionRecurring" BOOLEAN NOT NULL DEFAULT false
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionNote" TEXT
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionLinkedCompanyId" INTEGER
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionLinkedAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionAutoSyncedAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionSyncSource" TEXT
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionPayoutId" TEXT
    `);

    // Implantação (one-time) — PR13062026005
    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "setupValue" DOUBLE PRECISION
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "setupCommissionAmount" DOUBLE PRECISION
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "setupCommissionStatus" TEXT
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasLead_assignedUserId_status_idx" ON "VendasLead"("assignedUserId", "status")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasLead_assignedUserId_commissionStatus_idx" ON "VendasLead"("assignedUserId", "commissionStatus")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasLead_companyId_saleStatus_idx" ON "VendasLead"("companyId", "saleStatus")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasLead_commissionLinkedCompanyId_idx" ON "VendasLead"("commissionLinkedCompanyId")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasLead_commissionPayoutId_idx" ON "VendasLead"("commissionPayoutId")
    `);
  }

  private async ensureVendasCommissionPayoutTables() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "VendasCommissionPayout" (
        "id" TEXT NOT NULL,
        "companyId" INTEGER NOT NULL,
        "sellerUserId" INTEGER,
        "status" TEXT NOT NULL DEFAULT 'paid',
        "leadCount" INTEGER NOT NULL DEFAULT 0,
        "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "referenceLabel" TEXT,
        "notes" TEXT,
        "paidAt" TIMESTAMP(3),
        "createdByUserId" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "VendasCommissionPayout_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'VendasCommissionPayout_companyId_fkey'
        ) THEN
          ALTER TABLE "VendasCommissionPayout"
          ADD CONSTRAINT "VendasCommissionPayout_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionPayout_companyId_paidAt_idx" ON "VendasCommissionPayout"("companyId", "paidAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionPayout_sellerUserId_paidAt_idx" ON "VendasCommissionPayout"("sellerUserId", "paidAt")
    `);
  }

  private async ensureVendasCommissionReceivableTables() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "VendasCommissionReceivable" (
        "id" TEXT NOT NULL,
        "companyId" INTEGER NOT NULL,
        "leadId" TEXT NOT NULL,
        "sellerUserId" INTEGER,
        "linkedCompanyId" INTEGER,
        "cycleKey" TEXT NOT NULL,
        "kind" TEXT NOT NULL DEFAULT 'recurring',
        "status" TEXT NOT NULL DEFAULT 'payable',
        "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "dueAt" TIMESTAMP(3),
        "paidAt" TIMESTAMP(3),
        "payoutId" TEXT,
        "source" TEXT NOT NULL DEFAULT 'hbx_recurring',
        "createdByUserId" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "VendasCommissionReceivable_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'VendasCommissionReceivable_companyId_fkey'
        ) THEN
          ALTER TABLE "VendasCommissionReceivable"
          ADD CONSTRAINT "VendasCommissionReceivable_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'VendasCommissionReceivable_leadId_fkey'
        ) THEN
          ALTER TABLE "VendasCommissionReceivable"
          ADD CONSTRAINT "VendasCommissionReceivable_leadId_fkey"
          FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await this.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "VendasCommissionReceivable_leadId_cycleKey_kind_key" ON "VendasCommissionReceivable"("leadId", "cycleKey", "kind")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_companyId_status_dueAt_idx" ON "VendasCommissionReceivable"("companyId", "status", "dueAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_sellerUserId_status_dueAt_idx" ON "VendasCommissionReceivable"("sellerUserId", "status", "dueAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_linkedCompanyId_idx" ON "VendasCommissionReceivable"("linkedCompanyId")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_payoutId_idx" ON "VendasCommissionReceivable"("payoutId")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_cycleKey_idx" ON "VendasCommissionReceivable"("cycleKey")
    `);
  }

  private async ensureRadarAutoDistributionRuleTables() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RadarAutoDistributionRule" (
        "id" TEXT NOT NULL,
        "companyId" INTEGER NOT NULL,
        "scope" TEXT NOT NULL DEFAULT 'company',
        "status" TEXT NOT NULL DEFAULT 'draft',
        "includeAdmin" BOOLEAN NOT NULL DEFAULT false,
        "adminUserId" INTEGER,
        "adminTargetStock" INTEGER NOT NULL DEFAULT 0,
        "targetStockPerSeller" INTEGER NOT NULL DEFAULT 30,
        "preferredState" TEXT,
        "preferredCity" TEXT,
        "segment" TEXT,
        "categoryKey" TEXT,
        "radiusKm" INTEGER,
        "targetUserIdsJson" TEXT,
        "filtersJson" TEXT,
        "createdByUserId" INTEGER,
        "updatedByUserId" INTEGER,
        "lastActivatedAt" TIMESTAMP(3),
        "lastRunAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RadarAutoDistributionRule_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'RadarAutoDistributionRule_companyId_fkey'
        ) THEN
          ALTER TABLE "RadarAutoDistributionRule"
          ADD CONSTRAINT "RadarAutoDistributionRule_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await this.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "RadarAutoDistributionRule_companyId_scope_key" ON "RadarAutoDistributionRule"("companyId", "scope")
    `);
    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RadarAutoDistributionRule_companyId_status_idx" ON "RadarAutoDistributionRule"("companyId", "status")
    `);
    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RadarAutoDistributionRule_companyId_updatedAt_idx" ON "RadarAutoDistributionRule"("companyId", "updatedAt")
    `);
  }

  private async ensureRadarDistributionDailyUsageTables() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "RadarAutoDistributionRule"
      ADD COLUMN IF NOT EXISTS "adminDailyLimit" INTEGER NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "RadarAutoDistributionRule"
      ADD COLUMN IF NOT EXISTS "dailyLimitPerSeller" INTEGER NOT NULL DEFAULT 20
    `);

    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RadarDistributionDailyUsage" (
        "id" TEXT NOT NULL,
        "companyId" INTEGER NOT NULL,
        "userId" INTEGER,
        "dayKey" TEXT NOT NULL,
        "dailyLimit" INTEGER NOT NULL DEFAULT 20,
        "deliveredCount" INTEGER NOT NULL DEFAULT 0,
        "skippedCount" INTEGER NOT NULL DEFAULT 0,
        "lastDeliveryAt" TIMESTAMP(3),
        "lastSkipReason" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RadarDistributionDailyUsage_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'RadarDistributionDailyUsage_companyId_fkey'
        ) THEN
          ALTER TABLE "RadarDistributionDailyUsage"
          ADD CONSTRAINT "RadarDistributionDailyUsage_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'RadarDistributionDailyUsage_userId_fkey'
        ) THEN
          ALTER TABLE "RadarDistributionDailyUsage"
          ADD CONSTRAINT "RadarDistributionDailyUsage_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await this.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "RadarDistributionDailyUsage_companyId_userId_dayKey_key"
      ON "RadarDistributionDailyUsage"("companyId", "userId", "dayKey")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RadarDistributionDailyUsage_companyId_dayKey_idx"
      ON "RadarDistributionDailyUsage"("companyId", "dayKey")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RadarDistributionDailyUsage_userId_dayKey_idx"
      ON "RadarDistributionDailyUsage"("userId", "dayKey")
    `);
  }

  private async ensureMasterNoticeTables() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MasterNotice" (
        "id" TEXT NOT NULL,
        "companyId" INTEGER NOT NULL,
        "audience" TEXT NOT NULL DEFAULT 'seller',
        "title" TEXT NOT NULL,
        "body" TEXT NOT NULL,
        "tone" TEXT NOT NULL DEFAULT 'info',
        "forceSeconds" INTEGER NOT NULL DEFAULT 0,
        "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3),
        "createdByUserId" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MasterNotice_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MasterNoticeAck" (
        "id" TEXT NOT NULL,
        "noticeId" TEXT NOT NULL,
        "userId" INTEGER NOT NULL,
        "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MasterNoticeAck_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'MasterNotice_companyId_fkey'
        ) THEN
          ALTER TABLE "MasterNotice"
          ADD CONSTRAINT "MasterNotice_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'MasterNotice_createdByUserId_fkey'
        ) THEN
          ALTER TABLE "MasterNotice"
          ADD CONSTRAINT "MasterNotice_createdByUserId_fkey"
          FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'MasterNoticeAck_noticeId_fkey'
        ) THEN
          ALTER TABLE "MasterNoticeAck"
          ADD CONSTRAINT "MasterNoticeAck_noticeId_fkey"
          FOREIGN KEY ("noticeId") REFERENCES "MasterNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'MasterNoticeAck_userId_fkey'
        ) THEN
          ALTER TABLE "MasterNoticeAck"
          ADD CONSTRAINT "MasterNoticeAck_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MasterNotice_companyId_audience_startsAt_expiresAt_idx"
      ON "MasterNotice"("companyId", "audience", "startsAt", "expiresAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MasterNotice_companyId_createdAt_idx"
      ON "MasterNotice"("companyId", "createdAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "MasterNoticeAck_noticeId_userId_key"
      ON "MasterNoticeAck"("noticeId", "userId")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MasterNoticeAck_userId_acknowledgedAt_idx"
      ON "MasterNoticeAck"("userId", "acknowledgedAt")
    `);
  }

  private async ensureHbxJobApplicationTable() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HbxJobApplication" (
        "id" TEXT NOT NULL,
        "companyId" INTEGER NOT NULL,
        "name" TEXT NOT NULL,
        "phone" TEXT NOT NULL,
        "phoneNormalized" TEXT,
        "email" TEXT,
        "city" TEXT,
        "experience" TEXT,
        "resumeUrl" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "note" TEXT,
        "reviewedByUserId" INTEGER,
        "reviewedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "HbxJobApplication_pkey" PRIMARY KEY ("id")
      )
    `);
    await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "HbxJobApplication_companyId_status_createdAt_idx" ON "HbxJobApplication"("companyId", "status", "createdAt")`);
    await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "HbxJobApplication_companyId_phoneNormalized_idx" ON "HbxJobApplication"("companyId", "phoneNormalized")`);
  }

  private async ensureMasterPaymentNotificationLogTable() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MasterPaymentNotificationLog" (
        "id" TEXT NOT NULL,
        "companyId" INTEGER NOT NULL,
        "target" TEXT NOT NULL,
        "text" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'sent',
        "providerMessageId" TEXT,
        "errorMessage" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MasterPaymentNotificationLog_pkey" PRIMARY KEY ("id")
      )
    `);
    await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MasterPaymentNotificationLog_companyId_createdAt_idx" ON "MasterPaymentNotificationLog"("companyId", "createdAt")`);
    await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MasterPaymentNotificationLog_createdAt_idx" ON "MasterPaymentNotificationLog"("createdAt")`);
  }

  // COCKPIT-MASTER Sprint 1: trilha única de eventos do dono (MasterEvent).
  // FK em Company com SET NULL de propósito — o evento é histórico do MASTER e
  // sobrevive à exclusão da empresa (não some junto com o tenant).
  private async ensureMasterEventTable() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MasterEvent" (
        "id" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "severity" TEXT NOT NULL DEFAULT 'info',
        "companyId" INTEGER,
        "dedupKey" TEXT,
        "payloadJson" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MasterEvent_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'MasterEvent_companyId_fkey'
        ) THEN
          ALTER TABLE "MasterEvent"
          ADD CONSTRAINT "MasterEvent_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MasterEvent_createdAt_idx" ON "MasterEvent"("createdAt")`);
    await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MasterEvent_type_createdAt_idx" ON "MasterEvent"("type", "createdAt")`);
    await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MasterEvent_companyId_createdAt_idx" ON "MasterEvent"("companyId", "createdAt")`);
    await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MasterEvent_dedupKey_createdAt_idx" ON "MasterEvent"("dedupKey", "createdAt")`);
  }

  // COCKPIT-MASTER Sprint 4: DDL migrado de master-context.service.ts (ensureSchema
  // rodava no onModuleInit daquele service — higiene: todo DDL vive SÓ aqui, no
  // framework central). SQL IDÊNTICO ao original, sem mudar nenhuma coluna/índice.
  private async ensureMasterContextTables() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MasterAssumedContextSession" (
        "id" TEXT PRIMARY KEY,
        "masterUserId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
        "reason" TEXT,
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3),
        "endedAt" TIMESTAMP(3),
        "endedByUserId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL
      )
    `);

    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MasterAssumedContextSession_masterUserId_startedAt_idx" ON "MasterAssumedContextSession"("masterUserId", "startedAt")',
    );
    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MasterAssumedContextSession_companyId_startedAt_idx" ON "MasterAssumedContextSession"("companyId", "startedAt")',
    );
    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MasterAssumedContextSession_masterUserId_endedAt_idx" ON "MasterAssumedContextSession"("masterUserId", "endedAt")',
    );

    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MasterSupportAuditLog" (
        "id" TEXT PRIMARY KEY,
        "masterUserId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "companyId" INTEGER REFERENCES "Company"("id") ON DELETE SET NULL,
        "assumedContextSessionId" TEXT REFERENCES "MasterAssumedContextSession"("id") ON DELETE SET NULL,
        "scope" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "severity" TEXT NOT NULL DEFAULT 'INFO',
        "route" TEXT,
        "metadata" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MasterSupportAuditLog_masterUserId_createdAt_idx" ON "MasterSupportAuditLog"("masterUserId", "createdAt")',
    );
    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MasterSupportAuditLog_companyId_createdAt_idx" ON "MasterSupportAuditLog"("companyId", "createdAt")',
    );
    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MasterSupportAuditLog_scope_action_createdAt_idx" ON "MasterSupportAuditLog"("scope", "action", "createdAt")',
    );
  }

  private async ensureVendasCancellationCaseColumns() {
    await this.$executeRawUnsafe(`ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "cancellationCaseStatus" TEXT`);
    await this.$executeRawUnsafe(`ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "cancellationCaseOpenedAt" TIMESTAMP(3)`);
    await this.$executeRawUnsafe(`ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "cancellationCaseRefundAmount" DOUBLE PRECISION`);
    await this.$executeRawUnsafe(`ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "cancellationCaseResolution" TEXT`);
    await this.$executeRawUnsafe(`ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "cancellationCaseResolvedAt" TIMESTAMP(3)`);
    await this.$executeRawUnsafe(`ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "cancellationCaseResolvedByUserId" INTEGER`);
    await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "VendasLead_companyId_cancellationCaseStatus_idx" ON "VendasLead"("companyId", "cancellationCaseStatus")`);
  }

  private async ensureHbxSupportTicketTables() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "hbx_support_ticket" (
        "id" TEXT NOT NULL,
        "ticketCode" TEXT NOT NULL,
        "externalId" TEXT,
        "companyId" INTEGER,
        "conversationId" INTEGER,
        "source" TEXT NOT NULL DEFAULT 'owner',
        "origin" TEXT NOT NULL DEFAULT 'owner',
        "originChannel" TEXT NOT NULL DEFAULT 'manual',
        "branch" TEXT NOT NULL DEFAULT 'technical_support',
        "category" TEXT NOT NULL DEFAULT 'technical_support',
        "classification" TEXT NOT NULL DEFAULT 'TRIAGE',
        "status" TEXT NOT NULL DEFAULT 'new',
        "priority" TEXT NOT NULL DEFAULT 'Alta',
        "customerName" TEXT,
        "customerPhone" TEXT,
        "customerEmail" TEXT,
        "title" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "lastCustomerMessage" TEXT,
        "metadataJson" TEXT,
        "codexDispatchStatus" TEXT NOT NULL DEFAULT 'not_dispatched',
        "codexRunId" TEXT,
        "codexRunUrl" TEXT,
        "githubIssueUrl" TEXT,
        "githubPrNumber" INTEGER,
        "githubBranch" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "hbx_support_ticket_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "hbx_job" (
        "id" TEXT NOT NULL,
        "ticketId" TEXT NOT NULL,
        "companyId" INTEGER,
        "type" TEXT NOT NULL DEFAULT 'codex_task',
        "status" TEXT NOT NULL DEFAULT 'waiting_codex',
        "branch" TEXT NOT NULL DEFAULT 'technical_support',
        "title" TEXT NOT NULL,
        "payloadJson" TEXT,
        "resultJson" TEXT,
        "startedAt" TIMESTAMP(3),
        "finishedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "hbx_job_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'hbx_support_ticket_companyId_fkey'
        ) THEN
          ALTER TABLE "hbx_support_ticket"
          ADD CONSTRAINT "hbx_support_ticket_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'hbx_support_ticket_conversationId_fkey'
        ) THEN
          ALTER TABLE "hbx_support_ticket"
          ADD CONSTRAINT "hbx_support_ticket_conversationId_fkey"
          FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'hbx_job_ticketId_fkey'
        ) THEN
          ALTER TABLE "hbx_job"
          ADD CONSTRAINT "hbx_job_ticketId_fkey"
          FOREIGN KEY ("ticketId") REFERENCES "hbx_support_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'hbx_job_companyId_fkey'
        ) THEN
          ALTER TABLE "hbx_job"
          ADD CONSTRAINT "hbx_job_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "hbx_support_ticket"
      ADD COLUMN IF NOT EXISTS "codexDispatchStatus" TEXT NOT NULL DEFAULT 'not_dispatched'
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "hbx_support_ticket"
      ADD COLUMN IF NOT EXISTS "codexRunId" TEXT
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "hbx_support_ticket"
      ADD COLUMN IF NOT EXISTS "codexRunUrl" TEXT
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "hbx_support_ticket"
      ADD COLUMN IF NOT EXISTS "githubIssueUrl" TEXT
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "hbx_support_ticket"
      ADD COLUMN IF NOT EXISTS "githubPrNumber" INTEGER
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "hbx_support_ticket"
      ADD COLUMN IF NOT EXISTS "githubBranch" TEXT
    `);

    await this.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "hbx_support_ticket_ticketCode_key"
      ON "hbx_support_ticket"("ticketCode")
    `);

    await this.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "hbx_support_ticket_externalId_key"
      ON "hbx_support_ticket"("externalId")
      WHERE "externalId" IS NOT NULL
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "hbx_support_ticket_companyId_status_createdAt_idx"
      ON "hbx_support_ticket"("companyId", "status", "createdAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "hbx_support_ticket_category_status_createdAt_idx"
      ON "hbx_support_ticket"("category", "status", "createdAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "hbx_support_ticket_branch_status_createdAt_idx"
      ON "hbx_support_ticket"("branch", "status", "createdAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "hbx_support_ticket_codexDispatchStatus_updatedAt_idx"
      ON "hbx_support_ticket"("codexDispatchStatus", "updatedAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "hbx_support_ticket_conversationId_idx"
      ON "hbx_support_ticket"("conversationId")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "hbx_job_ticketId_status_idx"
      ON "hbx_job"("ticketId", "status")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "hbx_job_companyId_status_createdAt_idx"
      ON "hbx_job"("companyId", "status", "createdAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "hbx_job_branch_status_createdAt_idx"
      ON "hbx_job"("branch", "status", "createdAt")
    `);
  }
}
