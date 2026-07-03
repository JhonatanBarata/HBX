import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ExternalWebhookLedgerService, externalWebhookPayloadHash } from '../integrations/external-webhook-ledger.service';
import { IntegrationSecretsService } from '../integrations/integration-secrets.service';
import { VendasService } from '../vendas/vendas.service';
import { MetaGraphClient, mapMetaLeadFields } from './meta-graph.client';

export const META_PROVIDER = 'meta_lead_ads';
const PROVIDER = META_PROVIDER;

export type LeadgenChange = {
  pageId: string;
  leadgenId: string;
  formId: string | null;
  createdTime: string | null;
};

export type MetaWebhookResult = {
  ok: boolean;
  reason?: string;
  received: number;
  enqueued: number;
  duplicates: number;
};

// Resultado do processamento de UM evento pela fila (worker). 'retry'/'dead_letter' são
// decididos pelo ledger via markRetry — aqui devolvemos o desfecho lógico.
export type LeadgenProcessOutcome = 'created' | 'duplicate' | 'skipped' | 'transient_error';

@Injectable()
export class MetaLeadAdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookLedger: ExternalWebhookLedgerService,
    private readonly secrets: IntegrationSecretsService,
    private readonly graph: MetaGraphClient,
    private readonly vendas: VendasService,
  ) {}

  private connectionDelegate() {
    return (this.prisma as any).metaLeadConnection;
  }

  // GET handshake do Meta: ele chama com hub.verify_token e espera o hub.challenge de volta.
  verifyHandshake(query: Record<string, any>): string | null {
    const expected = String(process.env.META_VERIFY_TOKEN || '').trim();
    const mode = String(query?.['hub.mode'] || '').trim();
    const token = String(query?.['hub.verify_token'] || '').trim();
    if (mode === 'subscribe' && expected && token === expected) {
      return String(query?.['hub.challenge'] ?? '');
    }
    return null;
  }

  // Assinatura HMAC-SHA256 do corpo cru com o App Secret. Fail-closed: sem segredo
  // configurado, nada é processado (não criamos lead a partir de payload não verificado).
  verifySignature(rawBody: Buffer | string | undefined, signatureHeader: string | undefined): boolean {
    const appSecret = String(process.env.META_APP_SECRET || '').trim();
    if (!appSecret) return false;
    const header = String(signatureHeader || '').trim();
    if (!header.startsWith('sha256=')) return false;
    const body = rawBody == null ? Buffer.alloc(0) : Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
    const expected = `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`;
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  extractLeadgenChanges(body: any): LeadgenChange[] {
    if (!body || body.object !== 'page' || !Array.isArray(body.entry)) return [];
    const changes: LeadgenChange[] = [];
    for (const entry of body.entry) {
      const entryPageId = String(entry?.id || '').trim();
      const entryChanges = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of entryChanges) {
        if (String(change?.field || '').trim() !== 'leadgen') continue;
        const value = change?.value || {};
        const leadgenId = String(value?.leadgen_id || '').trim();
        if (!leadgenId) continue;
        changes.push({
          pageId: String(value?.page_id || entryPageId || '').trim(),
          leadgenId,
          formId: value?.form_id ? String(value.form_id) : null,
          createdTime: value?.created_time ? String(value.created_time) : null,
        });
      }
    }
    return changes;
  }

  // ---- WEBHOOK: SÓ RECEBE (ARQ11 S1) ----
  // Verifica HMAC → extrai changes → grava cada um na fila durável (recordReceived com o
  // PAYLOAD COMPLETO do change, para replay) → 200. NENHUMA chamada à Graph aqui: o fetch
  // do lead + intake acontece no worker assíncrono (processLeadgenEvent). Assinatura inválida
  // deixa rastro via markRejected (eventId = hash do payload). Duplicata não re-enfileira.
  async processWebhook(input: {
    rawBody: Buffer | string | undefined;
    signatureHeader: string | undefined;
    body: any;
  }): Promise<MetaWebhookResult> {
    const result: MetaWebhookResult = { ok: true, received: 0, enqueued: 0, duplicates: 0 };

    if (!this.verifySignature(input.rawBody, input.signatureHeader)) {
      // Observabilidade de ataque/misconfig: registra a rejeição sem processar nada.
      // eventId = hash do corpo cru (não temos leadgen_id confiável num payload não verificado).
      const rejectedEventId = externalWebhookPayloadHash(input.rawBody ?? input.body ?? {});
      await this.webhookLedger
        .recordReceived(PROVIDER, rejectedEventId, { rawBodyHash: rejectedEventId }, {
          eventType: 'invalid_signature',
          signatureStatus: 'invalid',
        })
        .catch(() => null);
      await this.webhookLedger.markRejected(PROVIDER, rejectedEventId, 'invalid').catch(() => null);
      return { ...result, ok: false, reason: 'invalid_signature' };
    }

    const changes = this.extractLeadgenChanges(input.body);
    result.received = changes.length;

    for (const change of changes) {
      try {
        const connection = change.pageId
          ? await this.connectionDelegate()?.findUnique({ where: { pageId: change.pageId } }).catch(() => null)
          : null;

        const claim = await this.webhookLedger.recordReceived(PROVIDER, change.leadgenId, change, {
          companyId: connection?.companyId ?? null,
          eventType: 'leadgen',
          signatureStatus: 'valid',
        });

        // Corrida fechada: recordReceived devolve duplicate=true para a entrega perdedora
        // (ou reentrega). Não re-enfileira nem reprocessa.
        if (claim?.duplicate) result.duplicates += 1;
        else result.enqueued += 1;
      } catch {
        // Falha ao gravar na fila (banco): NÃO conta como enfileirado. O Meta re-tenta se
        // não recebeu 200 — mas aqui o controller sempre responde 200; a reconciliação
        // diária é a rede de segurança para o que não entrou.
      }
    }

    return result;
  }

  // ---- WORKER: PROCESSA UM EVENTO DA FILA (ARQ11 S1) ----
  // Contém a lógica que ANTES rodava síncrona no webhook (fetch Graph → map → intake).
  // Desfecho:
  //   'created'         → card criado (worker marca markProcessed)
  //   'duplicate'       → já processado antes (worker marca markProcessed)
  //   'skipped'         → falha PERMANENTE de dados (sem token/sem contato/sem responsável):
  //                        não adianta re-tentar → worker manda para dead_letter direto
  //   'transient_error' → falha que pode passar (Graph fora, página temporariamente sem
  //                        conexão ativa) → worker agenda retry com backoff
  async processLeadgenEvent(change: LeadgenChange): Promise<LeadgenProcessOutcome> {
    const eventId = change.leadgenId;

    if (await this.webhookLedger.wasProcessed(PROVIDER, eventId)) {
      return 'duplicate';
    }

    const connection = change.pageId
      ? await this.connectionDelegate()?.findUnique({ where: { pageId: change.pageId } }).catch(() => null)
      : null;

    if (!connection || connection.status !== 'active') {
      // Página pode ter sido reativada / conexão criada depois — transitório, vale re-tentar.
      await this.touchConnectionError(connection?.id, 'Página sem conexão ativa para o lead recebido.');
      return 'transient_error';
    }

    const accessToken = connection.accessTokenCiphertext
      ? this.safeDecrypt(connection.accessTokenCiphertext)
      : null;
    if (!accessToken) {
      // Token pode ser recadastrado pelo admin — transitório.
      await this.touchConnectionError(connection.id, 'Token da página ausente ou inválido.');
      return 'transient_error';
    }

    const lead = await this.graph.fetchLead(change.leadgenId, accessToken);
    if (!lead) {
      // Graph fora do ar / rate limit / token vencido — transitório por definição do sprint.
      await this.touchConnectionError(connection.id, 'Não foi possível buscar o lead no Graph (token/lead).');
      return 'transient_error';
    }

    const mapped = mapMetaLeadFields(lead.fieldData);
    if (!mapped.phone && !mapped.email) {
      // Lead sem forma de contato NUNCA vai melhorar com retry — falha permanente.
      await this.touchConnectionError(connection.id, 'Lead sem telefone nem e-mail — nada para contatar.');
      return 'skipped';
    }

    const assignedUserId = await this.resolveAssignee(connection);
    if (!assignedUserId) {
      // Admin pode definir responsável depois — transitório (não perder o lead pago).
      await this.touchConnectionError(connection.id, 'Nenhum responsável definido para receber leads de anúncio.');
      return 'transient_error';
    }

    // ARQ11 S2 — a metadata de campanha (campaignName/formId/adId) NÃO vai mais improvisada no
    // shortNote; vai estruturada para virar metadata do evento de timeline. O shortNote fica com
    // só o rótulo humano de origem.
    await this.vendas.intakeAdvertisingLead({
      companyId: connection.companyId,
      assignedUserId,
      name: mapped.name,
      phone: mapped.phone,
      email: mapped.email,
      city: mapped.city,
      state: mapped.state,
      shortNote: 'Lead de anúncio (Meta)',
      source: PROVIDER,
      temperature: 'quente',
      opportunityScore: 80,
      campaign: {
        campaignName: lead.campaignName ?? null,
        formId: lead.formId ?? change.formId ?? null,
        adId: lead.adId ?? null,
      },
    });

    await this.webhookLedger.markProcessed(PROVIDER, eventId);
    await this.touchConnectionSuccess(connection.id);
    return 'created';
  }

  private async resolveAssignee(connection: any): Promise<number | null> {
    const explicit = Number(connection?.defaultAssignedUserId || 0);
    if (Number.isInteger(explicit) && explicit > 0) return explicit;
    const admin = await this.prisma.user
      .findFirst({ where: { companyId: connection.companyId, role: 'ADMIN' }, orderBy: { id: 'asc' }, select: { id: true } })
      .catch(() => null);
    return admin?.id ?? null;
  }

  private safeDecrypt(ciphertext: string): string | null {
    try {
      return this.secrets.decryptSecret(ciphertext);
    } catch {
      return null;
    }
  }

  private async touchConnectionSuccess(id: string | undefined) {
    if (!id) return;
    const now = new Date();
    await this.connectionDelegate()
      ?.update({ where: { id }, data: { lastEventAt: now, lastLeadAt: now, lastError: null } })
      .catch(() => null);
  }

  private async touchConnectionError(id: string | undefined, message: string) {
    if (!id) return;
    await this.connectionDelegate()
      ?.update({ where: { id }, data: { lastEventAt: new Date(), lastError: message.slice(0, 500) } })
      .catch(() => null);
  }

  // ---- Admin (config por empresa) ----

  private requireCompanyAdmin(user: any): { companyId: number } {
    const role = String(user?.role || '').trim().toUpperCase();
    const companyId = Number(user?.companyId || user?.company?.id || 0);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new BadRequestException('Usuário sem empresa associada.');
    }
    // USERMASTER (dono do tenant) = admin, igual a ADMIN.
    if (role !== 'ADMIN' && role !== 'USERMASTER') {
      throw new ForbiddenException('Apenas o administrador da empresa pode configurar a integração Meta.');
    }
    return { companyId };
  }

  private serializeConnection(row: any) {
    if (!row) return null;
    return {
      id: row.id,
      companyId: row.companyId,
      pageId: row.pageId,
      pageName: row.pageName ?? null,
      defaultAssignedUserId: row.defaultAssignedUserId ?? null,
      status: row.status,
      hasToken: Boolean(row.accessTokenCiphertext),
      tokenPreview: row.accessTokenPreview ?? null,
      lastEventAt: row.lastEventAt ?? null,
      lastLeadAt: row.lastLeadAt ?? null,
      lastError: row.lastError ?? null,
      // ARQ11 S2 — a tela precisa mostrar se a página já está assinada no webhook.
      webhookSubscribedAt: row.webhookSubscribedAt ?? null,
      createdAt: row.createdAt ?? null,
      updatedAt: row.updatedAt ?? null,
    };
  }

  async listConnectionsForUser(user: any) {
    const { companyId } = this.requireCompanyAdmin(user);
    const rows = await this.connectionDelegate()
      ?.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } })
      .catch(() => []);
    return { connections: (rows || []).map((row: any) => this.serializeConnection(row)) };
  }

  async upsertConnectionForUser(user: any, input: {
    pageId?: unknown;
    pageName?: unknown;
    accessToken?: unknown;
    defaultAssignedUserId?: unknown;
    status?: unknown;
  }) {
    const { companyId } = this.requireCompanyAdmin(user);
    const pageId = String(input.pageId || '').trim();
    if (!pageId) throw new BadRequestException('pageId é obrigatório.');

    const existing = await this.connectionDelegate()?.findUnique({ where: { pageId } }).catch(() => null);
    if (existing && existing.companyId !== companyId) {
      throw new ConflictException('Esta página já está conectada a outra empresa.');
    }

    const token = this.secrets.normalizeSecret(input.accessToken);
    const status = String(input.status || '').trim() === 'paused' ? 'paused' : 'active';
    const defaultAssignedUserId = Number(input.defaultAssignedUserId || 0) || null;

    const data: any = {
      companyId,
      pageId,
      pageName: input.pageName ? String(input.pageName).slice(0, 200) : existing?.pageName ?? null,
      defaultAssignedUserId,
      status,
    };
    if (token) {
      data.accessTokenCiphertext = this.secrets.encryptSecret(token);
      data.accessTokenPreview = this.secrets.previewSecret(token);
    }

    const row = existing
      ? await this.connectionDelegate().update({ where: { pageId }, data })
      : await this.connectionDelegate().create({ data });
    return this.serializeConnection(row);
  }

  async deleteConnectionForUser(user: any, id: string) {
    const { companyId } = this.requireCompanyAdmin(user);
    const row = await this.connectionDelegate()?.findUnique({ where: { id } }).catch(() => null);
    if (!row || row.companyId !== companyId) throw new NotFoundException('Conexão não encontrada.');
    await this.connectionDelegate().delete({ where: { id } });
    return { ok: true, deletedId: id };
  }

  // ---- Assinatura da página no webhook (ARQ11 S1) ----
  // Chamado pelo endpoint admin POST /integrations/meta/connections/:id/subscribe-webhook.
  // Assina a página do Meta no app (subscribed_apps + leadgen) usando o token da conexão e,
  // em sucesso, grava webhookSubscribedAt. CONTRATO FIXO { subscribed, error? }.
  async subscribeConnectionWebhook(user: any, id: string): Promise<{ subscribed: boolean; error?: string }> {
    const { companyId } = this.requireCompanyAdmin(user);
    const row = await this.connectionDelegate()?.findUnique({ where: { id } }).catch(() => null);
    if (!row || row.companyId !== companyId) throw new NotFoundException('Conexão não encontrada.');

    const accessToken = row.accessTokenCiphertext ? this.safeDecrypt(row.accessTokenCiphertext) : null;
    if (!accessToken) return { subscribed: false, error: 'Token da página ausente ou inválido.' };
    if (!row.pageId) return { subscribed: false, error: 'Conexão sem pageId.' };

    const outcome = await this.graph.subscribePage(String(row.pageId), accessToken);
    if (outcome.subscribed) {
      await this.connectionDelegate()
        ?.update({ where: { id }, data: { webhookSubscribedAt: new Date(), lastError: null } })
        .catch(() => null);
    }
    return outcome.error ? { subscribed: outcome.subscribed, error: outcome.error } : { subscribed: outcome.subscribed };
  }

  // ---- Helpers usados pelo WORKER (ARQ11 S1) ----

  // Conexões ativas (para a reconciliação diária varrer forms/leads). Cada item já traz o
  // token DECIFRADO (o worker não tem acesso ao IntegrationSecretsService).
  async listActiveConnectionsForReconciliation(): Promise<Array<{ id: string; companyId: number; pageId: string; accessToken: string }>> {
    const rows = await this.connectionDelegate()
      ?.findMany({ where: { status: 'active' } })
      .catch(() => []);
    const out: Array<{ id: string; companyId: number; pageId: string; accessToken: string }> = [];
    for (const row of rows || []) {
      const token = row.accessTokenCiphertext ? this.safeDecrypt(row.accessTokenCiphertext) : null;
      if (row.pageId && token) {
        out.push({ id: row.id, companyId: row.companyId, pageId: String(row.pageId), accessToken: token });
      }
    }
    return out;
  }

  // Expõe listForms/listLeads ao worker sem vazar o MetaGraphClient para fora do módulo.
  listFormsForPage(pageId: string, accessToken: string) {
    return this.graph.listForms(pageId, accessToken);
  }

  listLeadsForForm(formId: string, accessToken: string, sinceUnix?: number) {
    return this.graph.listLeads(formId, accessToken, sinceUnix);
  }

  // Marca a conexão com erro (usado pelo worker ao mandar um evento para dead_letter).
  async markConnectionError(pageId: string | null | undefined, message: string): Promise<void> {
    if (!pageId) return;
    const row = await this.connectionDelegate()?.findUnique({ where: { pageId } }).catch(() => null);
    await this.touchConnectionError(row?.id, message);
  }
}
