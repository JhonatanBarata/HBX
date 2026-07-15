import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

import { buildTenantGuardExtension } from '../prisma/tenant-guard.extension';
import { withoutTenantScope } from '../prisma/tenant-context';

// ============================================================================
// Prova de COMPLETUDE da exclusão de empresa (multi-tenancy Sprint 3).
// ============================================================================
//
// O "seguro-morre" do sprint: cria uma empresa de teste, semeia dado em cada ramo
// da cascata (FKs que ERAM Restrict + netos que travavam + TODAS as tabelas de
// companyId ESCALAR sem FK) e depois apaga a empresa com o MESMO caminho declarativo
// da produção (`company.delete()` + purge das escalares). Em seguida VARRE as 90
// tabelas com companyId/empresaId do banco e prova:
//   (1) ZERO linhas órfãs referenciando a empresa apagada (nem via FK-cascade nem via
//       purge escalar) — direito de eliminação LGPD art.18 cumprido.
//   (2) Uma empresa VIZINHA (B), semeada em paralelo, fica INTACTA — o delete de A
//       não vaza pra B.
//
// Tabelas com onDelete: SetNull (autoria/auditoria que SOBREVIVE — DeletionRecord,
// MasterSupportAuditLog, TrialPhoneUsage, RadarLeadPool/Event, Product de outra
// empresa...) continuam existindo, mas com companyId=NULL — então `WHERE companyId=A`
// dá 0, e a varredura passa. É exatamente o comportamento correto.
//
// Requer Postgres local (backend/.env → app-db-1). Sem banco → PULA (não quebra o
// gate). Roda: npm run build && node --test dist/companies/company-deletion-completeness.integration.test.js
//
// NÃO usa o service inteiro (depende de MP/mailer) — reproduz o núcleo declarativo:
// purge das escalares + company.delete(). O que este teste NÃO cobre (reembolso/
// cancelamento MP) é best-effort e vive fora da transação.

const SUFFIX = `del_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

// Tabelas com companyId (ou empresaId) que DEVEM sobreviver ao delete com companyId=NULL
// (onDelete: SetNull deliberado) — a varredura ainda exige 0 linhas com companyId=A,
// o que é garantido pelo SetNull. Listadas só para documentar a intenção.
const SET_NULL_SURVIVORS = new Set<string>([
  'DeletionRecord',
  'ExternalWebhookEvent',
  'MasterSupportAuditLog',
  'NightFactoryRewardClaim',
  'RadarLeadEvent',
  'RadarLeadPool',
  'TeamPolicyAuditLog',
  'TrialPhoneUsage',
  'hbx_job',
  'hbx_support_ticket',
]);

async function dbReachable(base: PrismaClient): Promise<boolean> {
  try {
    await base.$queryRawUnsafe('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// Semeia best-effort: um seed que falhar (campo obrigatório não previsto) é registrado
// e NÃO derruba o teste — a varredura final é a prova real e cobre TODAS as tabelas,
// tenha o seed entrado ou não. Retorna true se entrou.
async function seed(label: string, fn: () => Promise<unknown>, seeded: string[], failed: string[]) {
  try {
    await fn();
    seeded.push(label);
    return true;
  } catch (error: any) {
    failed.push(`${label}: ${String(error?.message || error).slice(0, 120)}`);
    return false;
  }
}

test('completude da exclusão de empresa contra o Postgres local', async (t) => {
  const base = new PrismaClient();
  const reachable = await dbReachable(base);
  if (!reachable) {
    await base.$disconnect();
    t.skip('Postgres local indisponível — completude fica coberta só localmente.');
    return;
  }

  const prisma = base.$extends(buildTenantGuardExtension('enforce')) as unknown as PrismaClient;

  let companyAId = 0;
  let companyBId = 0;
  let userAId = 0;
  const seeded: string[] = [];
  const failed: string[] = [];

  try {
    await withoutTenantScope('seed-completude-delete', async () => {
      const a = await prisma.company.create({ data: { name: `Del A ${SUFFIX}`, slug: `dela-${SUFFIX}` } });
      const b = await prisma.company.create({ data: { name: `Del B ${SUFFIX}`, slug: `delb-${SUFFIX}` } });
      companyAId = a.id;
      companyBId = b.id;

      const userA = await prisma.user.create({
        data: { username: `ua-${SUFFIX}`, email: `ua-${SUFFIX}@t.local`, password: 'x', companyId: a.id },
      });
      userAId = userA.id;
      // Usuário na empresa B — prova que o delete de A não apaga usuário de B.
      await prisma.user.create({
        data: { username: `ub-${SUFFIX}`, email: `ub-${SUFFIX}@t.local`, password: 'x', companyId: b.id },
      });

      // ── Cadeia ATENDIMENTO (Conversation→Message; netos) ──────────────────────
      const conv = await seed('CompanyConversation', () =>
        prisma.companyConversation.create({ data: { companyId: a.id, contact: `c-${SUFFIX}` } as any }), seeded, failed);
      if (conv) {
        const convRow = await prisma.companyConversation.findFirst({ where: { companyId: a.id } });
        await seed('CompanyMessage', () =>
          prisma.companyMessage.create({ data: { companyId: a.id, conversationId: convRow!.id, direction: 'INBOUND', body: 'oi' } as any }), seeded, failed);
      }
      const prof = await seed('CustomerProfile', () =>
        prisma.customerProfile.create({ data: { companyId: a.id } as any }), seeded, failed);
      if (prof) {
        const profRow = await prisma.customerProfile.findFirst({ where: { companyId: a.id } });
        await seed('DebtCase', () =>
          prisma.debtCase.create({ data: { companyId: a.id, customerProfileId: profRow!.id, sourceProvider: 'x' } as any }), seeded, failed);
      }

      // ── Cadeia INTEGRAÇÕES (Connection→SyncRun/Auvo) ──────────────────────────
      const conn = await seed('IntegrationConnection', () =>
        prisma.integrationConnection.create({ data: { companyId: a.id, provider: 'auvo', instanceName: `i-${SUFFIX}` } as any }), seeded, failed);
      if (conn) {
        const connRow = await prisma.integrationConnection.findFirst({ where: { companyId: a.id } });
        await seed('IntegrationSyncRun', () =>
          prisma.integrationSyncRun.create({ data: { companyId: a.id, connectionId: connRow!.id, type: 'full' } as any }), seeded, failed);
        await seed('AuvoExternalRecord', () =>
          prisma.auvoExternalRecord.create({ data: { companyId: a.id, connectionId: connRow!.id, externalId: `e-${SUFFIX}` } as any }), seeded, failed);
      }

      // ── Cadeia RECUPERAÇÃO (Customer→Payment) ─────────────────────────────────
      const rc = await seed('HbxRecoveryCustomer', () =>
        prisma.hbxRecoveryCustomer.create({ data: { companyId: a.id, name: 'n', whatsappNumber: '5599', workdaySaleDay: 1 } as any }), seeded, failed);
      if (rc) {
        const rcRow = await prisma.hbxRecoveryCustomer.findFirst({ where: { companyId: a.id } });
        await seed('HbxRecoveryPayment', () =>
          prisma.hbxRecoveryPayment.create({ data: { companyId: a.id, customerId: rcRow!.id, amount: 1, description: 'd' } as any }), seeded, failed);
      }

      // ── Cadeia AUTO-REPLY (Rule→Response) ─────────────────────────────────────
      const rule = await seed('AutoReplyRule', () =>
        prisma.autoReplyRule.create({ data: { companyId: a.id, pattern: 'oi' } as any }), seeded, failed);
      if (rule) {
        const ruleRow = await prisma.autoReplyRule.findFirst({ where: { companyId: a.id } });
        await seed('AutoReplyResponse', () =>
          prisma.autoReplyResponse.create({ data: { ruleId: ruleRow!.id, order: 0, template: 'x' } as any }), seeded, failed);
      }

      // ── Cadeia OUTBOUND (Message→Attempt) ─────────────────────────────────────
      const om = await seed('OutboundMessage', () =>
        prisma.outboundMessage.create({ data: { companyId: a.id, to: '5599', body: 'x' } as any }), seeded, failed);
      if (om) {
        const omRow = await prisma.outboundMessage.findFirst({ where: { companyId: a.id } });
        await seed('OutboundAttempt', () =>
          prisma.outboundAttempt.create({ data: { messageId: omRow!.id, attemptNo: 1 } as any }), seeded, failed);
      }
      await seed('InboundMessage', () =>
        prisma.inboundMessage.create({ data: { companyId: a.id, from: '5599', body: 'x' } as any }), seeded, failed);

      // ── Cadeia SESSION/DRAFT ──────────────────────────────────────────────────
      const sess = await seed('ConversationSession', () =>
        prisma.conversationSession.create({ data: { companyId: a.id, from: '5599', expiresAt: new Date(Date.now() + 3600000) } as any }), seeded, failed);
      if (sess) {
        const sessRow = await prisma.conversationSession.findFirst({ where: { companyId: a.id } });
        await seed('OrderDraft', () =>
          prisma.orderDraft.create({ data: { companyId: a.id, sessionId: sessRow!.id } as any }), seeded, failed);
      }

      // ── Cadeia PRODUTO (Product→Version) — era SET NULL, virou CASCADE ────────
      const prod = await seed('Product', () =>
        prisma.product.create({ data: { companyId: a.id, name: 'p', price: 1 } as any }), seeded, failed);
      if (prod) {
        const prodRow = await prisma.product.findFirst({ where: { companyId: a.id } });
        await seed('ProductVersion', () =>
          prisma.productVersion.create({ data: { productId: prodRow!.id, data: '{}', version: 1 } as any }), seeded, failed);
      }

      // ── Cadeia RADAR (userId era RESTRICT) ────────────────────────────────────
      await seed('WebscrapingSearchHistory', () =>
        prisma.webscrapingSearchHistory.create({ data: { companyId: a.id, userId: userA.id, city: 'x', segment: 's', quantity: 1, filtersJson: '{}', searchSignature: `sig-${SUFFIX}` } as any }), seeded, failed);
      await seed('WebscrapingSearchRun', () =>
        prisma.webscrapingSearchRun.create({ data: { companyId: a.id, userId: userA.id, city: 'x', segment: 's', targetQuantity: 1 } as any }), seeded, failed);
      await seed('WebscrapingCampaign', () =>
        prisma.webscrapingCampaign.create({ data: { companyId: a.id, userId: userA.id, city: 'x', segment: 's', targetTotal: 1 } as any }), seeded, failed);
      await seed('WebscrapingUsageLog', () =>
        prisma.webscrapingUsageLog.create({ data: { companyId: a.id, userId: userA.id } as any }), seeded, failed);
      await seed('PasswordReset', () =>
        prisma.passwordReset.create({ data: { userId: userA.id, token: `t-${SUFFIX}`, expiresAt: new Date(Date.now() + 3600000) } as any }), seeded, failed);
      await seed('TechAssistantInteraction', () =>
        prisma.techAssistantInteraction.create({ data: { companyId: a.id, userId: userA.id, mode: 'chat', maskedInput: 'x', responseJson: '{}' } as any }), seeded, failed);

      // ── CADASTROS (empresaId; Porto→TransitTime) ──────────────────────────────
      const porto = await seed('CadastroPorto', () =>
        prisma.cadastroPorto.create({ data: { empresaId: a.id, nome: `porto-${SUFFIX}` } as any }), seeded, failed);
      await seed('CadastroPais', () =>
        prisma.cadastroPais.create({ data: { empresaId: a.id, nome: `pais-${SUFFIX}` } as any }), seeded, failed);
      await seed('CadastroFornecedor', () =>
        prisma.cadastroFornecedor.create({ data: { empresaId: a.id, nome: `forn-${SUFFIX}` } as any }), seeded, failed);
      if (porto) {
        const portoRow = await prisma.cadastroPorto.findFirst({ where: { empresaId: a.id } });
        await seed('CadastroTransitTime', () =>
          prisma.cadastroTransitTime.create({ data: { empresaId: a.id, portoOrigemId: portoRow!.id, portoDestinoId: portoRow!.id, dias: 1 } as any }), seeded, failed);
      }

      // ── FOLHAS companyId com FK (eram Restrict) ───────────────────────────────
      // CompanyModule precisa de um SystemModule real (moduleId). Cria um ad-hoc.
      const sysMod = await seed('SystemModule(setup)', () =>
        prisma.systemModule.create({ data: { key: `mod-${SUFFIX}`, name: 'M', description: 'd' } as any }), seeded, failed);
      if (sysMod) {
        const smRow = await prisma.systemModule.findFirst({ where: { key: `mod-${SUFFIX}` } });
        await seed('CompanyModule', () =>
          prisma.companyModule.create({ data: { companyId: a.id, moduleId: smRow!.id } as any }), seeded, failed);
      }
      await seed('CompanyEmailSettings', () =>
        prisma.companyEmailSettings.create({ data: { companyId: a.id } as any }), seeded, failed);
      await seed('CompanyWhatsAppEndpoint', () =>
        prisma.companyWhatsAppEndpoint.create({ data: { companyId: a.id, label: 'x' } as any }), seeded, failed);
      await seed('WhatsAppAuditLog', () =>
        prisma.whatsAppAuditLog.create({ data: { companyId: a.id, scope: 's', event: 'e', message: 'm' } as any }), seeded, failed);
      await seed('AtendimentoAppointment', () =>
        prisma.atendimentoAppointment.create({ data: { companyId: a.id, customerPhone: '5599', agendaGroupId: 'g', startsAt: new Date(), endsAt: new Date(Date.now() + 3600000) } as any }), seeded, failed);
      const vlead = await seed('VendasLead', () =>
        prisma.vendasLead.create({ data: { companyId: a.id, name: 'lead' } as any }), seeded, failed);
      if (vlead) {
        const vleadRow = await prisma.vendasLead.findFirst({ where: { companyId: a.id } });
        await seed('Atividade', () =>
          prisma.atividade.create({ data: { companyId: a.id, leadId: vleadRow!.id, tipo: 't', titulo: 'x', vencimento: new Date() } as any }), seeded, failed);
        const automationEnrollment = await seed('AutomationEnrollment', () =>
          prisma.automationEnrollment.create({
            data: {
              companyId: a.id,
              leadId: vleadRow!.id,
              definitionKind: 'cadence',
              definitionId: `cad-${SUFFIX}`,
              status: 'active',
              activeCommercialSlot: 'commercial',
            } as any,
          }), seeded, failed);
        if (automationEnrollment) {
          const enrollmentRow = await prisma.automationEnrollment.findFirst({ where: { companyId: a.id } });
          const stepRun = await seed('AutomationStepRun', () =>
            prisma.automationStepRun.create({
              data: {
                companyId: a.id,
                leadId: vleadRow!.id,
                enrollmentId: enrollmentRow!.id,
                stepKey: '0',
                channel: 'whatsapp',
                idempotencyKey: `step-${SUFFIX}`,
              } as any,
            }), seeded, failed);
          if (stepRun) {
            const stepRow = await prisma.automationStepRun.findFirst({ where: { companyId: a.id } });
            await seed('AutomationLedgerEvent', () =>
              prisma.automationLedgerEvent.create({
                data: {
                  companyId: a.id,
                  leadId: vleadRow!.id,
                  enrollmentId: enrollmentRow!.id,
                  stepRunId: stepRow!.id,
                  eventType: 'step_scheduled',
                  source: 'test',
                  idempotencyKey: `ledger-${SUFFIX}`,
                } as any,
              }), seeded, failed);
          }
        }
      }
      await seed('HbxRecoveryFlowStage', () =>
        prisma.hbxRecoveryFlowStage.create({ data: { companyId: a.id, title: 't', template: 'x' } as any }), seeded, failed);

      // ── TABELAS ESCALARES (companyId sem FK — só saem pelo purge explícito) ────
      await seed('AtendimentoCustomer', () =>
        prisma.atendimentoCustomer.create({ data: { companyId: a.id, phone: '5599', phoneNormalized: '5599' } as any }), seeded, failed);
      await seed('AtendimentoQuickReply', () =>
        prisma.atendimentoQuickReply.create({ data: { companyId: a.id, title: 't', content: 'c' } as any }), seeded, failed);
      await seed('AssistenteConfig', () =>
        prisma.assistenteConfig.create({ data: { companyId: a.id } as any }), seeded, failed);
      await seed('Cadencia', () =>
        prisma.cadencia.create({ data: { companyId: a.id, nome: 'cad', passosJson: '[]' } as any }), seeded, failed);
      await seed('SavedSearch', () =>
        prisma.savedSearch.create({ data: { companyId: a.id, ownerId: userA.id, nome: 's', filtroJson: '{}' } as any }), seeded, failed);
      await seed('GmailConnection', () =>
        prisma.gmailConnection.create({ data: { companyId: a.id, userId: userA.id, email: `g-${SUFFIX}@x.com` } as any }), seeded, failed);
      await seed('FiscalInvoice', () =>
        prisma.fiscalInvoice.create({ data: { companyId: a.id, paymentRefId: `pr-${SUFFIX}`, competencia: '2026-07', valorCents: 100 } as any }), seeded, failed);
      await seed('NightOrder', () =>
        prisma.nightOrder.create({ data: { companyId: a.id, segment: 's', normalizedSegment: 's' } as any }), seeded, failed);
      await seed('HarvestImportBatch', () =>
        prisma.harvestImportBatch.create({ data: { companyId: a.id, batchId: `b-${SUFFIX}`, sourceMode: 'x', sourceName: 'y' } as any }), seeded, failed);
      await seed('RadarLeadEnrichment', () =>
        prisma.radarLeadEnrichment.create({ data: { companyId: a.id, radarLeadId: `rl-${SUFFIX}` } as any }), seeded, failed);
      await seed('RecoveryOpportunity', () =>
        prisma.recoveryOpportunity.create({ data: { companyId: a.id, sourceType: 'x', sourceId: `s-${SUFFIX}`, recoveryReason: 'r' } as any }), seeded, failed);
      await seed('WhatsAppWebhookEvent', () =>
        prisma.whatsAppWebhookEvent.create({ data: { companyId: a.id, kind: 'k', payload: '{}' } as any }), seeded, failed);
    });

    // Registra o que semeou / falhou (visível no output do teste).
    t.diagnostic(`seeded=${seeded.length} tabelas: ${seeded.join(', ')}`);
    if (failed.length) t.diagnostic(`seed pulado (${failed.length}): ${failed.join(' | ')}`);
    // Exige uma cobertura mínima real — se quase nada entrou, o teste não prova nada.
    assert.ok(seeded.length >= 25, `seed insuficiente (${seeded.length}) — teste não provaria completude`);

    // ── EXCLUSÃO pelo caminho declarativo de produção ─────────────────────────
    // Purge das escalares (Prisma models) + company.delete() cascateando o resto.
    const scalarModels = [
      'assistenteConfig', 'atendimentoQuickReply', 'atendimentoCustomer', 'atividade',
      'cadenciaInscricao', 'cadenciaGatilho', 'cadenciaRotina', 'cadencia',
      'commercialEmailMessageLog', 'fiscalInvoice', 'gmailConnection',
      'harvestImportBatch', 'inboxTrashMeticulousPurgeJob', 'masterPaymentNotificationLog',
      'nightOrderDelivery', 'nightOrder', 'radarLeadEnrichment', 'recoveryOpportunity',
      'savedSearch', 'whatsAppWebhookEvent',
    ];
    await withoutTenantScope('completude-delete-empresa-A', async () => {
      await prisma.$transaction(async (tx: any) => {
        for (const m of scalarModels) {
          try { await tx[m].deleteMany({ where: { companyId: companyAId } }); } catch { /* runtime-ensure ausente */ }
        }
        for (const raw of ['HbxJobApplication', 'HbxRecoveryPaymentEvent']) {
          try { await tx.$executeRawUnsafe(`DELETE FROM "${raw}" WHERE "companyId" = $1`, companyAId); } catch { /* idem */ }
        }
        await tx.company.delete({ where: { id: companyAId } });
      });
    });

    // ── VARREDURA: zero linhas órfãs em QUALQUER tabela com companyId/empresaId ──
    // Tabela a tabela (nome de tabela não parametriza em SQL puro sem dynamic SQL).
    const cols: Array<{ table_name: string; column_name: string }> = await base.$queryRawUnsafe(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name IN ('companyId','empresaId')
      ORDER BY table_name;
    `) as any;

    const orphans: Array<{ table: string; col: string; n: number }> = [];
    for (const { table_name, column_name } of cols) {
      const rows: Array<{ n: bigint }> = await base.$queryRawUnsafe(
        `SELECT count(*)::bigint AS n FROM "${table_name}" WHERE "${column_name}" = $1`,
        companyAId,
      ) as any;
      const n = Number(rows[0]?.n || 0);
      if (n > 0) orphans.push({ table: table_name, col: column_name, n });
    }

    t.diagnostic(`varredura: ${cols.length} tabelas checadas para companyId=${companyAId}`);
    assert.equal(
      orphans.length,
      0,
      `ÓRFÃOS após excluir empresa A: ${orphans.map((o) => `${o.table}.${o.col}=${o.n}`).join(', ')}`,
    );

    // ── Empresa B INTACTA (delete de A não vazou) ─────────────────────────────
    const bStillThere = await base.$queryRawUnsafe(
      `SELECT count(*)::bigint AS n FROM "Company" WHERE id = $1`,
      companyBId,
    ) as Array<{ n: bigint }>;
    assert.equal(Number(bStillThere[0]?.n || 0), 1, 'empresa B sumiu — delete de A vazou');
    const bUser = await base.$queryRawUnsafe(
      `SELECT count(*)::bigint AS n FROM "User" WHERE "companyId" = $1`,
      companyBId,
    ) as Array<{ n: bigint }>;
    assert.equal(Number(bUser[0]?.n || 0), 1, 'usuário de B sumiu — delete de A vazou');

    void userAId;
    void SET_NULL_SURVIVORS;
  } finally {
    // Limpeza best-effort (empresa B + qualquer sobra da A que tenha escapado do teste).
    await withoutTenantScope('cleanup-completude-delete', async () => {
      try {
        for (const cid of [companyAId, companyBId]) {
          if (!cid) continue;
          try { await base.$executeRawUnsafe(`DELETE FROM "CompanyModule" WHERE "companyId" = $1`, cid); } catch { /* noop */ }
          try { await base.$executeRawUnsafe(`DELETE FROM "User" WHERE "companyId" = $1`, cid); } catch { /* noop */ }
          try { await base.$executeRawUnsafe(`DELETE FROM "Company" WHERE id = $1`, cid); } catch { /* noop */ }
        }
        // SystemModule é catálogo GLOBAL (não sai por company.delete) — limpa o ad-hoc.
        try { await base.$executeRawUnsafe(`DELETE FROM "SystemModule" WHERE key = $1`, `mod-${SUFFIX}`); } catch { /* noop */ }
      } catch {
        /* melhor-esforço */
      }
    });
    await base.$disconnect();
  }
});
