import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ExternalWebhookLedgerService } from '../integrations/external-webhook-ledger.service';
import { IntegrationSecretsService } from '../integrations/integration-secrets.service';
import { VendasService } from '../vendas/vendas.service';
import { MetaGraphClient, mapMetaLeadFields } from './meta-graph.client';

const PROVIDER = 'meta_lead_ads';

type LeadgenChange = {
  pageId: string;
  leadgenId: string;
  formId: string | null;
  createdTime: string | null;
};

export type MetaWebhookResult = {
  ok: boolean;
  reason?: string;
  received: number;
  created: number;
  duplicates: number;
  skipped: number;
};

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

  async processWebhook(input: {
    rawBody: Buffer | string | undefined;
    signatureHeader: string | undefined;
    body: any;
  }): Promise<MetaWebhookResult> {
    const result: MetaWebhookResult = { ok: true, received: 0, created: 0, duplicates: 0, skipped: 0 };

    if (!this.verifySignature(input.rawBody, input.signatureHeader)) {
      return { ...result, ok: false, reason: 'invalid_signature' };
    }

    const changes = this.extractLeadgenChanges(input.body);
    result.received = changes.length;

    for (const change of changes) {
      try {
        const handled = await this.processLeadgenChange(change);
        if (handled === 'created') result.created += 1;
        else if (handled === 'duplicate') result.duplicates += 1;
        else result.skipped += 1;
      } catch {
        result.skipped += 1;
      }
    }

    return result;
  }

  private async processLeadgenChange(change: LeadgenChange): Promise<'created' | 'duplicate' | 'skipped'> {
    const eventId = change.leadgenId;

    if (await this.webhookLedger.wasProcessed(PROVIDER, eventId)) {
      return 'duplicate';
    }

    const connection = change.pageId
      ? await this.connectionDelegate()?.findUnique({ where: { pageId: change.pageId } }).catch(() => null)
      : null;

    await this.webhookLedger.recordReceived(PROVIDER, eventId, change, {
      companyId: connection?.companyId ?? null,
      eventType: 'leadgen',
      signatureStatus: 'valid',
    });

    if (!connection || connection.status !== 'active') {
      await this.touchConnectionError(connection?.id, 'Página sem conexão ativa para o lead recebido.');
      return 'skipped';
    }

    const accessToken = connection.accessTokenCiphertext
      ? this.safeDecrypt(connection.accessTokenCiphertext)
      : null;
    if (!accessToken) {
      await this.touchConnectionError(connection.id, 'Token da página ausente ou inválido.');
      return 'skipped';
    }

    const lead = await this.graph.fetchLead(change.leadgenId, accessToken);
    if (!lead) {
      await this.touchConnectionError(connection.id, 'Não foi possível buscar o lead no Graph (token/lead).');
      return 'skipped';
    }

    const mapped = mapMetaLeadFields(lead.fieldData);
    if (!mapped.phone && !mapped.email) {
      await this.touchConnectionError(connection.id, 'Lead sem telefone nem e-mail — nada para contatar.');
      return 'skipped';
    }

    const assignedUserId = await this.resolveAssignee(connection);
    if (!assignedUserId) {
      await this.touchConnectionError(connection.id, 'Nenhum responsável definido para receber leads de anúncio.');
      return 'skipped';
    }

    const noteParts = ['Lead de anúncio (Meta)'];
    if (lead.campaignName) noteParts.push(lead.campaignName);
    else if (lead.formId) noteParts.push(`formulário ${lead.formId}`);

    await this.vendas.intakeAdvertisingLead({
      companyId: connection.companyId,
      assignedUserId,
      name: mapped.name,
      phone: mapped.phone,
      email: mapped.email,
      city: mapped.city,
      state: mapped.state,
      shortNote: noteParts.join(' — '),
      source: PROVIDER,
      temperature: 'quente',
      opportunityScore: 80,
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
    if (role !== 'ADMIN') {
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
}
