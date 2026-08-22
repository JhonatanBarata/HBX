import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ExternalWebhookLedgerService } from '../integrations/external-webhook-ledger.service';
import { VendasService } from '../vendas/vendas.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { MailService } from '../mail/mail.service';
import { getCompanyIdByCaptureToken } from '../website/website-runtime';
import { resolveHbxPlatformCompanyId } from '../common/hbx-platform-company';
import { supportEmail } from '../common/hbx-support-contact';

const PROVIDER = 'website_form';
// PR22082026-CLIENTE-ME-ACHA — "Quero que a HBX me ligue", de DENTRO do app do entregador.
const APP_CONTACT_PROVIDER = 'app_contact';

export type AppContactInput = {
  assunto?: unknown;
  telefone?: unknown;
  mensagem?: unknown;
};

export type AppContactResult = {
  ok: boolean;
  lead: boolean;
  email: boolean;
  reason?: string;
};

const APP_CONTACT_SUBJECTS: Record<string, string> = {
  creditos: 'Créditos e plano',
  plano: 'Créditos e plano',
  fiscal: 'Nota fiscal / fiscal',
  vendas: 'Vendas e clientes novos',
  prospector: 'Prospector (empresas no caminho da rota)',
  app: 'Dúvida no app',
  outro: 'Outro assunto',
};

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
    // PR22082026 — e-mail pro suporte no pedido de contato vindo do app. @Optional pra não
    // quebrar quem instancia o service direto (testes) sem MailModule.
    @Optional() private readonly mail?: MailService,
  ) {}

  /**
   * PR22082026-CLIENTE-ME-ACHA — "QUERO QUE A HBX ME LIGUE", de dentro do app.
   *
   * Por que este caminho existe: dentro do binário da Google Play o app não pode ter
   * preço, botão de compra nem link pro site. Pode ter SUPORTE e PEDIDO DE CONTATO. Então
   * o cliente toca, diz o assunto e a HBX liga — e a ligação acontece fora do app, onde
   * a Google não manda. Sem isto, "créditos acabaram" era um beco.
   *
   * Pra onde vai: vira LEAD no /vendas da própria HBX (tenant "HBX", mesmo
   * `intakeAdvertisingLead` do formulário do site), atribuído ao 1º ADMIN da HBX, com
   * origem `app_logistica` — é ele que os vendedores puxam na Central do Lead. E, em
   * paralelo, um e-mail pro ADMIN_SUPPORT_EMAIL (best-effort): duas trilhas, porque
   * pedido de contato que se perde é cliente que acha que a HBX não responde.
   *
   * Dedup: mesma empresa + mesmo assunto em 5 min = um pedido só (duplo toque).
   * Nunca lança pra dentro do app por erro de lead: se pelo menos uma trilha saiu,
   * `ok:true`; só quando NADA saiu o controller responde 503 com mensagem.
   */
  async captureAppContact(
    actor: { id?: unknown; companyId?: unknown; email?: string | null; name?: string | null; role?: unknown },
    input: AppContactInput,
  ): Promise<AppContactResult> {
    const companyId = Math.trunc(Number(actor?.companyId || 0));
    const userId = Math.trunc(Number(actor?.id || 0));
    if (!companyId) return { ok: false, lead: false, email: false, reason: 'sem_empresa' };

    const assuntoKey = String(input?.assunto ?? '').trim().toLowerCase().slice(0, 40) || 'outro';
    const assunto = APP_CONTACT_SUBJECTS[assuntoKey] || this.normalizeString(input?.assunto, 80) || 'Outro assunto';
    const telefonePedido = this.normalizePhone(input?.telefone);
    const mensagem = this.normalizeString(input?.mensagem, 600);

    const [company, user] = await Promise.all([
      this.prisma.company
        .findUnique({ where: { id: companyId }, select: { id: true, name: true, contactPhone: true, contactEmail: true } })
        .catch(() => null),
      userId
        ? this.prisma.user
            .findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true } })
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    const empresaNome = String(company?.name || `Empresa #${companyId}`).trim();
    const quemNome = String(user?.name || actor?.name || '').trim();
    const quemEmail = this.normalizeEmail(user?.email || actor?.email || company?.contactEmail || null);
    const telefone = telefonePedido || this.normalizePhone(company?.contactPhone);
    const papel = String(user?.role || actor?.role || '').toUpperCase();

    const linhas = [
      `Pediu contato pelo app HBX Logística — ${assunto}`,
      `Empresa: ${empresaNome} (#${companyId})`,
      quemNome || quemEmail ? `Quem: ${[quemNome, quemEmail ? `<${quemEmail}>` : '', papel ? `(${papel})` : ''].filter(Boolean).join(' ')}` : '',
      telefone ? `Telefone: ${telefone}` : 'Telefone: não informado (usar o e-mail)',
      mensagem ? `Mensagem: ${mensagem}` : '',
    ].filter(Boolean);
    const shortNote = linhas.join(' — ');

    // Dedup do duplo toque (5 min): mesma empresa + mesmo assunto.
    const bucket = Math.floor(Date.now() / DEDUP_BUCKET_MS);
    const eventId = createHash('sha256').update(`${companyId}:${assuntoKey}:${bucket}`).digest('hex');
    if (await this.webhookLedger.wasProcessed(APP_CONTACT_PROVIDER, eventId).catch(() => false)) {
      return { ok: true, lead: true, email: true, reason: 'duplicate' };
    }
    await this.webhookLedger
      .recordReceived(APP_CONTACT_PROVIDER, eventId, { companyId, assunto: assuntoKey, telefone, email: quemEmail }, {
        companyId,
        eventType: 'app_contact',
        signatureStatus: 'jwt',
      })
      .catch(() => undefined);

    // Trilha 1 — lead no /vendas da HBX.
    let lead = false;
    try {
      const hbxCompanyId = await resolveHbxPlatformCompanyId(this.prisma);
      if (!hbxCompanyId) throw new Error('tenant HBX não encontrado');
      const assignedUserId = await this.resolveAssignee(hbxCompanyId);
      if (!assignedUserId) throw new Error('tenant HBX sem ADMIN');
      if (!telefone && !quemEmail) throw new Error('sem telefone nem e-mail pra contatar');
      await this.vendas.intakeAdvertisingLead({
        companyId: hbxCompanyId,
        assignedUserId,
        name: quemNome ? `${empresaNome} — ${quemNome}` : empresaNome,
        phone: telefone,
        email: quemEmail,
        segment: 'Distribuidora (app HBX Logística)',
        shortNote,
        source: 'app_logistica',
        temperature: 'quente',
        opportunityScore: 90,
      });
      lead = true;
    } catch (error: any) {
      this.logger.warn(`app_contact_lead_failed company=${companyId} error=${String(error?.message || error)}`);
    }

    // Trilha 2 — e-mail pro suporte (best-effort).
    let email = false;
    if (this.mail) {
      try {
        const to = supportEmail();
        if (to) {
          const result: any = await this.mail.sendMail({
            to,
            subject: `[HBX app] ${empresaNome} pediu contato — ${assunto}`,
            text: [...linhas, '', 'Origem: botão "Quero que a HBX me ligue" no app HBX Logística.'].join('\n'),
          });
          email = result?.ok !== false;
        }
      } catch (error: any) {
        this.logger.warn(`app_contact_email_failed company=${companyId} error=${String(error?.message || error)}`);
      }
    }

    if (lead || email) {
      await this.webhookLedger.markProcessed(APP_CONTACT_PROVIDER, eventId).catch(() => undefined);
    }
    return { ok: lead || email, lead, email, reason: lead || email ? undefined : 'nenhuma_trilha_saiu' };
  }

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
