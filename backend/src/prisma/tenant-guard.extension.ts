import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  getTenantCompanyId,
  getTenantScopeBypassReason,
  getTenantStore,
} from './tenant-context';

// ============================================================================
// Tenant guard do Prisma (arquitetura nº7 — multi-tenancy Sprint 1)
// ============================================================================
//
// Hoje o isolamento entre empresas é convenção: cada service escreve
// `where: { companyId }` na mão e nada barra uma query esquecida (ex. real
// achado em 01/07: gerencial.service.ts puxava 300 pesquisas de satisfação de
// TODOS os tenants e filtrava em memória). Esta extensão do PrismaClient
// intercepta as leituras/escritas em MASSA de modelos tenant-scoped e:
//   - report  (default em prod): loga o hit e DEIXA passar (zero mudança de
//              comportamento — seguro pra ligar em produção e coletar hits).
//   - enforce (default em dev/test): lança exceção — quebra na mesa do dev.
//   - off:     desliga.
//
// O tenant do request vem do AsyncLocalStorage (tenant-context.ts), populado
// pelo TenantContextInterceptor a partir de req.user. Sem tenant no store
// (master puro sem empresa assumida, jobs de boot, cron) NÃO acusa.
//
// $queryRaw / $executeRaw NÃO passam por aqui (SQL cru) — logado uma vez no boot.
// Esse flanco é coberto ESTATICAMENTE no build pelo lint scripts/check-tenant-raw.mjs
// (reprova raw novo sem companyId/empresaId); aqui em runtime, só o aviso.

// ---------------------------------------------------------------------------
// Lista de modelos TENANT-SCOPED.
//
// COMO FOI OBTIDA: varredura de backend/prisma/schema.prisma por todo `model`
// que declara um campo ESCALAR `companyId` OU `empresaId` (Int/String/etc — não
// relação). Modelos sem esse campo são GLOBAIS (catálogos, tabelas master, RFB,
// lagoa do Radar, o próprio Company) e NÃO são guardados. Script equivalente:
//
//   node -e 'const fs=require("fs");const lines=fs.readFileSync("prisma/schema.prisma","utf8").split(/\r?\n/);
//   let cur=null,body=[];const models=[];for(const raw of lines){const l=raw.replace(/\/\/.*$/,"");
//   const m=l.match(/^\s*model\s+(\w+)\s*\{/);if(m){cur=m[1];body=[];continue;}
//   if(cur&&/^\s*\}/.test(l)){models.push({name:cur,body});cur=null;continue;}if(cur)body.push(l);}
//   const t=[];for(const {name,body} of models){for(const l of body){const f=l.match(/^\s*(companyId|empresaId)\s+(Int|BigInt|String|Float|Decimal|Boolean)(\?)?/);
//   if(f&&!/\[\]/.test(l)){t.push(name);break;}}}console.log(JSON.stringify(t));'
//
// Rodar de novo e comparar quando o schema mudar (o lint check-tenant-scope.mjs
// também cobre o drift). Nomes em PascalCase = o `model` que o Prisma entrega em
// $allOperations.
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  'WhatsAppConnectionSession',
  'WhatsappConsentLedger',
  'NightFactoryRewardClaim',
  'NightOrder',
  'NightOrderDelivery',
  'CompanyCommercialEntitlement',
  'CompanyCommercialUsageLog',
  'EnrichmentCostLedger',
  'TrialPhoneUsage',
  'CompanyWhatsAppEndpoint',
  'CompanySubscription',
  'HbxRecoveryCustomer',
  'HbxRecoveryPayment',
  'FinanceiroCharge',
  'HbxRecoveryFlowStage',
  'CompanyConversation',
  'AtendimentoAppointment',
  'InboxTrashMeticulousPurgeJob',
  'CompanyMessage',
  'AtendimentoCustomer',
  'AtendimentoQuickReply',
  'CustomerProfile',
  'DebtCase',
  'IntegrationConnection',
  'IntegrationSyncRun',
  'ExternalWebhookEvent',
  'MetaLeadConnection',
  'AuvoExternalRecord',
  'ConversationSession',
  'OrderDraft',
  'User',
  'TeamPolicyPreset',
  'UserTeamPolicy',
  'TeamPolicyAuditLog',
  'HbxPartnerReferralCandidate',
  'SellerOnboarding',
  'CompanyBillableSeatUsage',
  'MasterNotice',
  'MasterPaymentNotificationLog',
  'VendasCardComplaint',
  'WebscrapingSearchHistory',
  'WebscrapingSearchRun',
  'WebscrapingSearchRunItem',
  'WebscrapingUsageLog',
  'RadarLeadPool',
  'RadarLeadCompanyState',
  'RadarLeadEvent',
  'RadarAutoDistributionRule',
  'RadarDistributionDailyUsage',
  'RadarLeadEnrichment',
  'RecoveryOpportunity',
  'WebscrapingCampaign',
  'HarvestImportBatch',
  'VendasLead',
  'VendasCommissionPayout',
  'VendasCommissionReceivable',
  'Atividade',
  'SavedSearch',
  'SalesProfile',
  'VendasAutomationCampaign',
  'VendasAutomationJob',
  'Cadencia',
  'CadenciaInscricao',
  'CadenciaGatilho',
  'CadenciaRotina',
  'TechAssistantInteraction',
  'MasterAssumedContextSession',
  'MasterSupportAuditLog',
  'HbxSupportTicket',
  'HbxJob',
  'CompanyEmailSettings',
  'CompanyEmailTemplate',
  'CompanyEmailAsset',
  'CommercialEmailMessageLog',
  'CompanyModule',
  'DeletionRecord',
  'Product',
  'AutoReplyRule',
  'InboundMessage',
  'OutboundMessage',
  'WhatsAppWebhookEvent',
  'WhatsAppAuditLog',
  'CadastroFornecedor',
  'CadastroPais',
  'CadastroPorto',
  'CadastroTransitTime',
  'AssistenteConfig',
  'GmailConnection',
  'FiscalInvoice',
]);

// Operações que leem/escrevem em MASSA (não fixam 1 id de PK) — as perigosas quando
// esquecem o tenant. findUnique fica de fora porque só resolve por chave única
// (a fuga cross-tenant do findUnique é o service ignorar o companyId do resultado,
// não a query varrer tudo — isso não dá pra pegar aqui sem quebrar findUnique por id).
const GUARDED_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

const TENANT_KEYS = ['companyId', 'empresaId'] as const;

export type TenantGuardMode = 'off' | 'report' | 'enforce';

export function resolveTenantGuardMode(env: NodeJS.ProcessEnv = process.env): TenantGuardMode {
  const raw = String(env.HBX_TENANT_GUARD_MODE || '').trim().toLowerCase();
  if (raw === 'off' || raw === 'report' || raw === 'enforce') {
    return raw;
  }
  // Default por ambiente: prod = report (seguro, só observa); dev/test = enforce
  // (quebra cedo, na mesa do dev). NODE_ENV=production só existe na VPS.
  return env.NODE_ENV === 'production' ? 'report' : 'enforce';
}

// Procura companyId/empresaId em qualquer nível do AND raiz do where. Não desce em
// OR/NOT (um OR sem tenant em um dos ramos já vaza) nem em relações — presença do
// tenant no topo do AND é o contrato mínimo que este guard exige.
function whereHasTenantKey(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  const record = where as Record<string, unknown>;

  for (const key of TENANT_KEYS) {
    if (record[key] !== undefined && record[key] !== null) {
      return true;
    }
  }

  const and = record.AND;
  if (Array.isArray(and)) {
    return and.some((clause) => whereHasTenantKey(clause));
  }
  if (and && typeof and === 'object') {
    return whereHasTenantKey(and);
  }

  return false;
}

function shortStack(): string {
  const stack = new Error().stack || '';
  return stack
    .split('\n')
    .slice(2) // tira "Error" e o próprio shortStack
    .map((line) => line.trim())
    .filter((line) => line && !line.includes('tenant-guard.extension'))
    .slice(0, 4)
    .join(' <- ');
}

const logger = new Logger('TenantGuard');

// Loga uma vez no boot que o SQL cru não é coberto.
let rawWarningLogged = false;
export function logTenantGuardBoot(mode: TenantGuardMode) {
  if (mode === 'off') {
    logger.warn('[tenant-guard] modo=off — trava de escopo DESLIGADA.');
    return;
  }
  logger.log(
    `[tenant-guard] ativo modo=${mode} — ${TENANT_SCOPED_MODELS.size} modelos tenant-scoped guardados.`,
  );
  if (!rawWarningLogged) {
    logger.warn(
      '[tenant-guard] AVISO: $queryRaw/$queryRawUnsafe/$executeRaw NÃO são cobertos por esta trava (SQL cru) — escopar por companyId na mão nessas chamadas. ' +
        'A cobertura desse flanco é ESTÁTICA, no build: o lint `node scripts/check-tenant-raw.mjs` (backend/scripts/check-tenant-raw.mjs) reprova qualquer raw novo sem companyId/empresaId.',
    );
    rawWarningLogged = true;
  }
}

export class TenantScopeViolationError extends Error {
  constructor(model: string, operation: string, reason: string) {
    super(
      `[tenant-guard] query sem escopo de tenant BLOQUEADA: model=${model} op=${operation} — ${reason}. ` +
        'Adicione companyId/empresaId no where, ou envolva em withoutTenantScope("motivo") se for master/cross-tenant.',
    );
    this.name = 'TenantScopeViolationError';
  }
}

export type GuardedOperationParams = {
  model: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
};

// Núcleo da trava, isolado do wrapper $extends pra ser testável direto (o objeto
// que Prisma.defineExtension devolve é opaco). Decide, para uma operação, se deixa
// passar / loga / lança — lendo o tenant do request no AsyncLocalStorage.
export async function applyTenantGuard(
  mode: TenantGuardMode,
  { model, operation, args, query }: GuardedOperationParams,
): Promise<unknown> {
  if (mode === 'off') return query(args);
  if (!model || !TENANT_SCOPED_MODELS.has(model)) return query(args);
  if (!GUARDED_OPERATIONS.has(operation)) return query(args);

  const where = (args as { where?: unknown } | undefined)?.where;
  if (whereHasTenantKey(where)) return query(args);

  const store = getTenantStore();
  const companyId = getTenantCompanyId();
  const bypassReason = getTenantScopeBypassReason();

  // Bypass consciente (withoutTenantScope): passa, mas registra o motivo.
  if (bypassReason) {
    logger.debug(
      `[tenant-guard] bypass model=${model} op=${operation} reason="${bypassReason}"`,
    );
    return query(args);
  }

  // Sem tenant no store = nada a exigir (master puro sem empresa assumida, boot,
  // cron). NÃO acusa — não é um request de um tenant específico.
  if (!store || !companyId) {
    return query(args);
  }

  // Request DE um tenant, query em modelo tenant-scoped, SEM companyId no where
  // raiz = suspeita de vazamento.
  const reason = `request no tenant companyId=${companyId} mas o where não fixa o tenant`;

  if (mode === 'enforce') {
    throw new TenantScopeViolationError(model, operation, reason);
  }

  // report: loga estruturado e deixa passar.
  logger.warn(
    `[tenant-guard] unscoped model=${model} op=${operation} companyId=${companyId} stack=${shortStack()}`,
  );
  return query(args);
}

// Constrói a extensão $extends que aplica a trava. `mode` é resolvido 1x na criação.
export function buildTenantGuardExtension(mode: TenantGuardMode = resolveTenantGuardMode()) {
  return Prisma.defineExtension({
    name: 'hbx-tenant-guard',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return applyTenantGuard(mode, {
            model: String(model),
            operation: String(operation),
            args,
            query: query as (a: unknown) => Promise<unknown>,
          });
        },
      },
    },
  });
}
