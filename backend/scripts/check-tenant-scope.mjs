// HBX MULTI-TENANCY — lint de escopo de tenant (arquitetura nº7, Sprint 1).
//
// COMPLEMENTA o guard de runtime (src/prisma/tenant-guard.extension.ts): o guard
// pega o que EXECUTA; este lint pega o que está no CÓDIGO (inclusive caminhos raros
// ou mortos que o guard nunca exercita) e trava DRIFT no build.
//
// O que faz: varre os services (.ts, fora de *.test.ts) por chamadas
// `prisma.<model>.findMany(` / `.findFirst(` onde <model> é TENANT-SCOPED (tem
// companyId/empresaId no schema) e NÃO há um literal `companyId`/`empresaId` no
// bloco de argumentos da chamada. Heurístico (não é parser TS), por isso trabalha
// com CATRACA + baseline: os hits legítimos-mas-sem-literal de hoje (caminhos
// master/global) entram no baseline; a contagem só pode CAIR. Um hit NOVO estoura.
//
// Espírito e mecânica espelham frontend/scripts/check-pele.mjs.
//
// Uso:
//   node scripts/check-tenant-scope.mjs            # trava se estourar a catraca
//   node scripts/check-tenant-scope.mjs --update   # regrava o baseline (ao abaixar)
//   node scripts/check-tenant-scope.mjs --list      # lista todos os hits atuais

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', 'src');
const BASELINE_PATH = join(HERE, 'tenant-scope-baseline.json');

const args = new Set(process.argv.slice(2));
const UPDATE = args.has('--update');
const LIST = args.has('--list');

// Modelos TENANT-SCOPED — MESMA lista derivada do schema que a extensão de runtime
// usa (todo model com campo escalar companyId/empresaId). Espelhada aqui em minúsculo
// (o delegate do Prisma é camelCase: prisma.vendasLead, prisma.user, ...). Quando o
// schema mudar, atualizar as DUAS listas (esta + TENANT_SCOPED_MODELS na extensão).
const TENANT_MODELS = new Set(
  [
    'WhatsAppConnectionSession', 'WhatsappConsentLedger', 'NightFactoryRewardClaim', 'NightOrder',
    'NightOrderDelivery', 'CompanyCommercialEntitlement', 'CompanyCommercialUsageLog',
    'EnrichmentCostLedger', 'TrialPhoneUsage', 'CompanyWhatsAppEndpoint', 'CompanySubscription',
    'HbxRecoveryCustomer', 'HbxRecoveryPayment', 'HbxRecoveryPaymentEvent', 'FinanceiroCharge',
    'RecoveryDebtItem', 'RecoveryDebtAllocation', 'RecoveryAutomationStepRun', 'EntregaComprovante', 'HbxRecoveryFlowStage',
    'CompanyConversation', 'AtendimentoAppointment', 'InboxTrashMeticulousPurgeJob', 'CompanyMessage',
    'AtendimentoCustomer', 'AtendimentoQuickReply', 'CustomerProfile', 'DebtCase', 'IntegrationConnection',
    'IntegrationSyncRun', 'ExternalWebhookEvent', 'MetaLeadConnection', 'AuvoExternalRecord', 'Conversation',
    'ConversationSession', 'OrderDraft', 'MobileDevice', 'MobilePairingCode', 'MobileAction',
    'LogisticaRoute', 'LogisticaRouteStop', 'LogisticaEssentialCreditClaim',
    'LogisticaTrackingSession', 'LogisticaTrackingPoint', 'LogisticaTrackingEvent',
    'LogisticaTrackedCreditClaim', 'LogisticaTrackingBonusGrant',
    'User', 'TeamPolicyPreset', 'UserTeamPolicy', 'TeamPolicyAuditLog',
    'HbxPartnerReferralCandidate', 'SellerOnboarding', 'CompanyBillableSeatUsage', 'MasterNotice',
    'MasterPaymentNotificationLog', 'VendasCardComplaint', 'WebscrapingSearchHistory', 'WebscrapingSearchRun',
    'RadarLeadProcessRun',
    'WebscrapingSearchRunItem', 'WebscrapingUsageLog', 'RadarLeadPool', 'RadarLeadCompanyState',
    'RadarLeadEvent', 'RadarAutoDistributionRule', 'RadarDistributionDailyUsage', 'RadarLeadEnrichment',
    'RecoveryOpportunity', 'WebscrapingCampaign', 'HarvestImportBatch', 'VendasLead', 'VendasCommissionPayout',
    'VendasCommissionReceivable', 'Atividade', 'SavedSearch', 'SalesProfile', 'VendasAutomationCampaign',
    'VendasAutomationJob', 'AutomationEnrollment', 'AutomationStepRun', 'AutomationLedgerEvent',
    'ConversationAssistantRun', 'EmailOutboundMessage', 'Cadencia', 'CadenciaInscricao', 'CadenciaGatilho', 'CadenciaRotina',
    'TechAssistantInteraction', 'MasterAssumedContextSession', 'MasterSupportAuditLog', 'HbxSupportTicket',
    'HbxJob', 'CompanyEmailSettings', 'CompanyEmailTemplate', 'CompanyEmailAsset', 'CommercialEmailMessageLog',
    'CompanyModule', 'DeletionRecord', 'Product', 'AutoReplyRule', 'InboundMessage', 'OutboundMessage',
    'WhatsAppWebhookEvent', 'WhatsAppAuditLog', 'CadastroFornecedor', 'CadastroPais', 'CadastroPorto',
    'CadastroTransitTime', 'AssistenteConfig', 'GmailConnection', 'FiscalInvoice',
  ].map((m) => m.charAt(0).toLowerCase() + m.slice(1)),
);

// prisma.<model>.findMany(  ou  .findFirst(  — captura o model.
const CALL_RE = /\b(?:prisma|tx|this\.prisma|db)\.([a-zA-Z][a-zA-Z0-9]*)\.(findMany|findFirst|findFirstOrThrow|count|aggregate|groupBy|updateMany|deleteMany)\s*\(/g;
// Marcador de bypass consciente inline (ex.: // tenant-scope-allow: motivo).
const ALLOW_RE = /tenant-scope-allow/;
const TENANT_KEY_RE = /\b(companyId|empresaId)\b/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) yield p;
  }
}
const rel = (p) => relative(join(HERE, '..'), p).split(sep).join('/');

// Pega o "bloco de argumentos" da chamada a partir do '(' que abre — equilibra
// parênteses até fechar (janela heurística; suficiente pro literal companyId).
function argBlock(text, openParenIdx) {
  let depth = 0;
  for (let i = openParenIdx; i < text.length && i < openParenIdx + 4000; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return text.slice(openParenIdx, i + 1);
    }
  }
  return text.slice(openParenIdx, openParenIdx + 400);
}

const hits = [];
for (const file of walk(ROOT)) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  CALL_RE.lastIndex = 0;
  let m;
  while ((m = CALL_RE.exec(text)) !== null) {
    const model = m[1];
    if (!TENANT_MODELS.has(model)) continue;
    const openParen = text.indexOf('(', m.index + m[0].length - 1);
    if (openParen < 0) continue;
    const block = argBlock(text, openParen);
    if (TENANT_KEY_RE.test(block)) continue; // tem companyId/empresaId perto → ok

    // linha do hit p/ checar marcador de allow inline e reportar.
    const lineNo = text.slice(0, m.index).split(/\r?\n/).length;
    const lineText = lines[lineNo - 1] || '';
    const prevLine = lines[lineNo - 2] || '';
    if (ALLOW_RE.test(lineText) || ALLOW_RE.test(prevLine)) continue; // bypass consciente

    hits.push(`${rel(file)}:${lineNo}  ${model}.${m[2]}  ${lineText.trim().slice(0, 80)}`);
  }
}

hits.sort();

if (LIST) {
  console.log(`[check-tenant-scope] ${hits.length} chamadas tenant sem literal companyId/empresaId:`);
  for (const h of hits) console.log('  ' + h);
  process.exit(0);
}

let baseline = null;
if (existsSync(BASELINE_PATH)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).unscopedTenantCalls;
  } catch {
    baseline = null;
  }
}

if (baseline === null || UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ unscopedTenantCalls: hits.length }, null, 2) + '\n');
  console.log(
    `[check-tenant-scope] baseline da catraca ${baseline === null ? 'criado' : 'atualizado'}: ${hits.length} chamadas tenant sem literal de escopo (meta: 0).`,
  );
  process.exit(0);
}

if (hits.length > baseline) {
  console.error(`\n[check-tenant-scope] CATRACA ESTOUROU: ${hits.length} chamadas tenant sem escopo (teto: ${baseline}).`);
  console.error('Toda query tenant-scoped precisa de companyId/empresaId no where — ou marque // tenant-scope-allow: motivo se for master/global legítimo.');
  console.error('Novos hits (amostra):');
  for (const h of hits.slice(0, 20)) console.error('  ' + h);
  process.exit(1);
} else {
  if (hits.length < baseline) {
    writeFileSync(BASELINE_PATH, JSON.stringify({ unscopedTenantCalls: hits.length }, null, 2) + '\n');
  }
  console.log(
    `[check-tenant-scope] ok — catraca: ${hits.length}/${baseline} chamadas tenant sem literal de escopo (meta 0${hits.length < baseline ? ', teto reapertado' : ''}).`,
  );
}
