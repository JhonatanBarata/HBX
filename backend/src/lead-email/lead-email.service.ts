import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptCred,
  emailCredConfigured,
  encryptCred,
  sanitizeSmtpError,
} from './email-cred.util';
import { EMAIL_PROVIDER_PRESETS, findPreset, normalizeProvider } from './email-provider-presets';

// ============================================================================
// LEADS-FINAL/06 — E-MAIL v1 (backend). Conectar a conta SMTP do usuário e
// ENVIAR e-mail da timeline do lead, com histórico do enviado.
//
// ESCOPO v1 (fechado): NÃO tem IMAP/recebimento, NÃO tem fila, NÃO tem template
// nem campanha. 1 e-mail por vez, síncrono, timeout curto (15s), rate leve por
// usuário (~30/h) pra não virar canhão de spam com a marca dos outros.
//
// GUARDRAILS DUROS:
//  - Secret de cifra ausente (HBX_EMAIL_CRED_SECRET) => feature OFF graciosa
//    (nunca crash no boot; grava/testa/envia recusam com mensagem clara).
//  - Senha SMTP NUNCA em log/erro (sanitizeSmtpError) e NUNCA devolvida por
//    endpoint de leitura (nem cifrada) — o estado público só expõe `hasCredentials`.
//  - Envio pelo SMTP do PRÓPRIO usuário (conta dele); deliverability é dele.
// ============================================================================

const SEND_TIMEOUT_MS = 15000;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1h
const RATE_MAX_PER_WINDOW = 30; // ~30/h por usuário
const MAX_SUBJECT = 240;
const MAX_BODY = 20000;

type SaveAccountInput = {
  address?: string | null;
  senderName?: string | null;
  provider?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  username?: string | null;
  password?: string | null;
};

type SendInput = {
  leadId?: string | null;
  to?: string | null;
  subject?: string | null;
  bodyText?: string | null;
};

type AccountRow = {
  id: string;
  companyId: number;
  userId: number;
  address: string;
  senderName: string | null;
  provider: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  credentialsEnc: string | null;
  status: string;
  lastError: string | null;
  lastTestedAt: Date | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}
function normText(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

@Injectable()
export class LeadEmailService {
  private readonly logger = new Logger(LeadEmailService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Feature-flag: só liga com o secret de cifra presente (OFF gracioso). ──
  get enabled(): boolean {
    return emailCredConfigured();
  }

  status() {
    return { ok: true, enabled: this.enabled };
  }

  private ensureEnabled() {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'O recurso de e-mail não está disponível no momento (configuração pendente no servidor).',
      );
    }
  }

  // ── Estado público da conta — NUNCA devolve a senha (nem cifrada). ──
  async getAccountState(companyId: number, userId: number) {
    if (!this.enabled) {
      return { enabled: false, account: null, presets: EMAIL_PROVIDER_PRESETS };
    }
    const account = (await this.prisma.emailAccount.findUnique({
      where: { companyId_userId: { companyId, userId } },
    })) as AccountRow | null;
    return {
      enabled: true,
      account: account ? this.toPublic(account) : null,
      presets: EMAIL_PROVIDER_PRESETS,
    };
  }

  private toPublic(account: AccountRow) {
    return {
      address: account.address,
      senderName: account.senderName,
      provider: account.provider,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpSecure: account.smtpSecure,
      username: account.username,
      status: account.status,
      lastError: account.lastError,
      lastTestedAt: account.lastTestedAt ? account.lastTestedAt.toISOString() : null,
      hasCredentials: Boolean(account.credentialsEnc),
    };
  }

  // ── Salvar/atualizar a conta do usuário (upsert por company+user). ──
  async saveAccount(companyId: number, userId: number, input: SaveAccountInput) {
    this.ensureEnabled();

    const existing = (await this.prisma.emailAccount.findUnique({
      where: { companyId_userId: { companyId, userId } },
    })) as AccountRow | null;

    const provider = normalizeProvider(input.provider ?? existing?.provider);
    const address = normEmail(input.address ?? existing?.address);
    const username = normText(input.username ?? existing?.username, 180) || address;
    const senderName = input.senderName !== undefined ? normText(input.senderName, 120) : existing?.senderName || null;
    const smtpHost = normText(input.smtpHost ?? existing?.smtpHost, 180);
    const portRaw = input.smtpPort !== undefined ? Math.trunc(Number(input.smtpPort || 0)) : existing?.smtpPort || 0;
    const smtpPort = portRaw > 0 && portRaw <= 65535 ? portRaw : 0;
    const smtpSecure =
      input.smtpSecure !== undefined ? Boolean(input.smtpSecure) : existing?.smtpSecure ?? smtpPort === 465;

    if (!address || !EMAIL_RE.test(address)) {
      throw new BadRequestException('Informe um e-mail de remetente válido.');
    }
    if (!smtpHost) throw new BadRequestException('Informe o servidor SMTP.');
    if (!smtpPort) throw new BadRequestException('Informe a porta SMTP.');

    // Senha: string vazia/ausente = manter a atual; só cifra quando vier valor.
    let credentialsEnc = existing?.credentialsEnc ?? null;
    const passRaw = String(input.password ?? '').trim();
    if (passRaw) credentialsEnc = encryptCred(passRaw);
    if (!credentialsEnc) throw new BadRequestException('Informe a senha (ou senha de app) do e-mail.');

    // Toda gravação volta pra draft: exige um "Testar conexão" explícito p/ virar connected.
    const data = {
      address,
      senderName,
      provider,
      smtpHost,
      smtpPort,
      smtpSecure,
      username,
      credentialsEnc,
      status: 'draft',
      lastError: null,
    };

    const saved = (await this.prisma.emailAccount.upsert({
      where: { companyId_userId: { companyId, userId } },
      create: { companyId, userId, ...data },
      update: data,
    })) as AccountRow;

    return this.toPublic(saved);
  }

  async deleteAccount(companyId: number, userId: number) {
    if (!this.enabled) return { ok: true };
    await this.prisma.emailAccount.deleteMany({ where: { companyId, userId } });
    return { ok: true };
  }

  // ── Testar conexão SMTP (SÓ por ação explícita do usuário). ──
  async testConnection(companyId: number, userId: number) {
    this.ensureEnabled();
    const account = (await this.prisma.emailAccount.findUnique({
      where: { companyId_userId: { companyId, userId } },
    })) as AccountRow | null;
    if (!account) throw new BadRequestException('Conecte uma conta de e-mail primeiro.');

    const pass = account.credentialsEnc ? decryptCred(account.credentialsEnc) : null;
    if (!pass) throw new BadRequestException('Senha do e-mail ausente — salve a conta de novo.');

    try {
      const transporter = this.buildTransporter(account, pass);
      await this.withTimeout(transporter.verify(), SEND_TIMEOUT_MS, 'verify');
      await this.prisma.emailAccount.update({
        where: { id: account.id },
        data: { status: 'connected', lastError: null, lastTestedAt: new Date() },
      });
      return { ok: true, status: 'connected' as const };
    } catch (error) {
      const safe = sanitizeSmtpError(error, pass, account.username);
      this.logger.warn(`lead-email test company ${companyId} user ${userId} falhou: ${safe}`);
      await this.prisma.emailAccount.update({
        where: { id: account.id },
        data: { status: 'error', lastError: safe, lastTestedAt: new Date() },
      });
      return { ok: false, status: 'error' as const, error: safe };
    }
  }

  // ── Enviar e-mail da timeline do lead (síncrono, sem fila). ──
  async send(companyId: number, userId: number, input: SendInput) {
    this.ensureEnabled();

    const leadId = String(input.leadId || '').trim();
    const to = normEmail(input.to);
    const subject = normText(input.subject, MAX_SUBJECT);
    const bodyText = String(input.bodyText ?? '').slice(0, MAX_BODY).trim();

    if (!leadId) throw new BadRequestException('Lead não identificado.');
    if (!to || !EMAIL_RE.test(to)) throw new BadRequestException('Informe um e-mail de destino válido.');
    if (!subject) throw new BadRequestException('Informe o assunto.');
    if (!bodyText) throw new BadRequestException('Escreva a mensagem.');

    const account = (await this.prisma.emailAccount.findUnique({
      where: { companyId_userId: { companyId, userId } },
    })) as AccountRow | null;
    if (!account) throw new BadRequestException('Conecte uma conta de e-mail antes de enviar.');

    // Rate leve por usuário (conta = 1 por usuário, então contar por accountId =
    // contar por usuário). Conta TODAS as tentativas na janela (sent+failed) pra
    // não virar canhão nem em caso de erro repetido.
    const since = new Date(Date.now() - RATE_WINDOW_MS);
    const recent = await this.prisma.emailMessage.count({
      where: { accountId: account.id, sentAt: { gte: since } },
    });
    if (recent >= RATE_MAX_PER_WINDOW) {
      throw new BadRequestException(
        `Limite de ${RATE_MAX_PER_WINDOW} e-mails por hora atingido. Tente de novo mais tarde.`,
      );
    }

    const pass = account.credentialsEnc ? decryptCred(account.credentialsEnc) : null;
    if (!pass) throw new BadRequestException('Senha do e-mail ausente — reconecte a conta.');

    const from = account.senderName ? `${account.senderName} <${account.address}>` : account.address;

    let status: 'sent' | 'failed' = 'sent';
    let error: string | null = null;
    try {
      const transporter = this.buildTransporter(account, pass);
      await this.withTimeout(
        transporter.sendMail({ from, to, subject, text: bodyText }),
        SEND_TIMEOUT_MS,
        'sendMail',
      );
    } catch (err) {
      status = 'failed';
      error = sanitizeSmtpError(err, pass, account.username);
      this.logger.warn(`lead-email send company ${companyId} lead ${leadId} falhou: ${error}`);
    }

    const message = await this.prisma.emailMessage.create({
      data: {
        companyId,
        leadId,
        accountId: account.id,
        userId,
        direction: 'out',
        to,
        subject,
        bodyText,
        status,
        error,
      },
    });

    // Se conectou-e-enviou com sucesso, reflete conta como connected (best-effort).
    if (status === 'sent' && account.status !== 'connected') {
      await this.prisma.emailAccount
        .update({ where: { id: account.id }, data: { status: 'connected', lastError: null } })
        .catch(() => undefined);
    }

    return {
      ok: status === 'sent',
      status,
      error,
      message: this.messageToPublic(message),
    };
  }

  // ── Histórico de e-mails enviados por lead (company-scoped). ──
  async history(companyId: number, leadId: string) {
    if (!this.enabled) return { enabled: false, messages: [] as ReturnType<LeadEmailService['messageToPublic']>[] };
    const id = String(leadId || '').trim();
    if (!id) throw new BadRequestException('Lead não identificado.');
    const rows = await this.prisma.emailMessage.findMany({
      where: { companyId, leadId: id },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });
    return { enabled: true, messages: rows.map((r) => this.messageToPublic(r)) };
  }

  private messageToPublic(row: {
    id: string;
    to: string;
    subject: string;
    status: string;
    error: string | null;
    sentAt: Date;
  }) {
    return {
      id: row.id,
      to: row.to,
      subject: row.subject,
      status: row.status,
      error: row.error,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    };
  }

  // ── Transportador nodemailer (mesma lib do CompanyMailerService). ──
  private buildTransporter(account: AccountRow, pass: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');
    const port = account.smtpPort;
    return nodemailer.createTransport({
      host: account.smtpHost,
      port,
      secure: port === 465 ? true : Boolean(account.smtpSecure),
      family: 4,
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
      auth: { user: account.username, pass },
      tls: { servername: account.smtpHost },
    });
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Tempo esgotado (${label}).`)), ms + 1000);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  // Exposto p/ o front montar a lista de presets sem novo endpoint dedicado.
  presetHint(id: string) {
    return findPreset(id)?.passwordHint || '';
  }
}
