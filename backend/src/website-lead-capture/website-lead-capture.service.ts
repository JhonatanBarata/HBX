import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ExternalWebhookLedgerService } from '../integrations/external-webhook-ledger.service';
import { VendasService } from '../vendas/vendas.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { getCompanyIdByCaptureToken } from '../website/website-runtime';

const PROVIDER = 'website_form';

// Rate-limit por IP (5/min) vive no controller via @Throttle — mesmo mecanismo padrão do
// projeto (ThrottlerGuard global, ver auth.controller.ts/gerencial.controller.ts), não reinventado
// aqui. Este service cuida só de dedup de conteúdo (double-submit do mesmo form).

// Dedup: mesmo token+telefone/e-mail dentro do mesmo "bucket" de tempo é considerado o mesmo
// envio (double-submit do form, F5, retry de rede do navegador) — não duplica lead nem notificação.
const DEDUP_BUCKET_MS = 5 * 60_000;

export type WebsiteLeadCaptureInput = {
  siteToken: string;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  message?: unknown;
  _hp?: unknown; // honeypot — campo escondido no form; humano nunca preenche
};

export type WebsiteLeadCaptureResult = {
  ok: boolean;
  reason?: string;
};

@Injectable()
export class WebsiteLeadCaptureService {
  private readonly logger = new Logger(WebsiteLeadCaptureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookLedger: ExternalWebhookLedgerService,
    private readonly vendas: VendasService,
    private readonly webwhatsBridge: WebwhatsBridgeService,
  ) {}

  private normalizeString(value: unknown, maxLength = 300): string | null {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;
    return normalized.slice(0, maxLength);
  }

  private normalizePhone(value: unknown): string | null {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length >= 8 ? digits : null;
  }

  private normalizeEmail(value: unknown): string | null {
    const normalized = this.normalizeString(value, 200);
    if (!normalized) return null;
    return /.+@.+\..+/.test(normalized) ? normalized.toLowerCase() : null;
  }

  private buildDedupEventId(siteToken: string, phone: string | null, email: string | null): string {
    const bucket = Math.floor(Date.now() / DEDUP_BUCKET_MS);
    const raw = `${siteToken}:${phone || ''}:${email || ''}:${bucket}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  private async resolveAssignee(companyId: number): Promise<number | null> {
    const admin = await this.prisma.user
      .findFirst({ where: { companyId, role: 'ADMIN' }, orderBy: { id: 'asc' }, select: { id: true } })
      .catch(() => null);
    return admin?.id ?? null;
  }

  // Notificação best-effort pro dono do site via WhatsApp — reusa o caminho de ENVIO já existente
  // (WebwhatsBridgeService.sendText), que exige sessão conectada da própria empresa. NÃO mexe em
  // conexão/reconexão/socket/logout — só chama sendText se a empresa já está com WhatsApp ativo.
  // Atrás de flag OFF por padrão: falha de notificação nunca pode impedir a criação do lead, e a
  // integração é nova o bastante pra preferir ligar de forma explícita e observada.
  private async notifyOwnerBestEffort(companyId: number, assignedUserId: number | null, leadNote: string) {
    const enabled = ['true', '1', 'yes', 'on'].includes(
      String(process.env.HBX_SITE_LEAD_NOTIFY_ENABLED || '').trim().toLowerCase(),
    );
    if (!enabled) return;

    try {
      const hasSession = await this.webwhatsBridge.hasOperationalSession(companyId, { userId: assignedUserId });
      if (!hasSession) return;
      // TODO(COLD-22): mandar pro número do próprio admin (não existe hoje um "self-notify"
      // canônico) — por ora só loga que notificaria; plugar destino real quando a rotina de
      // notificação de sistema (procurada em messaging.service.ts) tiver um alvo definido.
      this.logger.log(
        `Notificacao de lead do site pronta para company=${companyId} (flag ON, sessao ativa) — nota: ${leadNote}`,
      );
    } catch (error: any) {
      this.logger.warn(`Notificacao WhatsApp do lead do site falhou (best-effort): ${String(error?.message || error)}`);
    }
  }

  // ip: reservado para auditoria/observabilidade futura (rate-limit em si vive no @Throttle do
  // controller); não usado em lógica de negócio hoje.
  async captureLead(input: WebsiteLeadCaptureInput, ip: string | null): Promise<WebsiteLeadCaptureResult> {
    void ip;
    const siteToken = this.normalizeString(input.siteToken, 128);
    if (!siteToken) return { ok: false, reason: 'not_found' };

    // Honeypot: bot preencheu o campo escondido. Responde OK sem revelar que foi descartado.
    if (this.normalizeString(input._hp)) {
      return { ok: true };
    }

    const companyId = await getCompanyIdByCaptureToken(this.prisma, siteToken);
    if (!companyId) {
      return { ok: false, reason: 'not_found' };
    }

    const name = this.normalizeString(input.name, 200);
    const phone = this.normalizePhone(input.phone);
    const email = this.normalizeEmail(input.email);
    const message = this.normalizeString(input.message, 1000);

    if (!phone && !email) {
      return { ok: false, reason: 'nothing_to_contact' };
    }

    const eventId = this.buildDedupEventId(siteToken, phone, email);
    if (await this.webhookLedger.wasProcessed(PROVIDER, eventId)) {
      return { ok: true, reason: 'duplicate' };
    }
    await this.webhookLedger.recordReceived(
      PROVIDER,
      eventId,
      { siteToken, phone, email, name },
      { companyId, eventType: 'website_form', signatureStatus: 'token' },
    );

    const assignedUserId = await this.resolveAssignee(companyId);
    if (!assignedUserId) {
      this.logger.warn(`Lead do site sem responsavel definido para company=${companyId} (sem ADMIN ativo).`);
      return { ok: false, reason: 'no_assignee' };
    }

    const noteParts = ['Lead do site'];
    if (message) noteParts.push(message);
    const shortNote = noteParts.join(' — ');

    await this.vendas.intakeAdvertisingLead({
      companyId,
      assignedUserId,
      name,
      phone,
      email,
      shortNote,
      source: 'website_form',
      temperature: 'quente',
      opportunityScore: 80,
    });

    await this.webhookLedger.markProcessed(PROVIDER, eventId);
    await this.notifyOwnerBestEffort(companyId, assignedUserId, shortNote);

    return { ok: true };
  }
}
