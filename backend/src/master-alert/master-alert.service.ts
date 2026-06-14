import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';

// Alerta do MASTER (o dono) quando entra um pedido que ele precisa tocar à mão —
// hoje: HBX Full (implantação assistida, sem self-checkout). Best-effort em 3
// frentes: e-mail, WhatsApp e log (visível na janela Pagamentos do /master).
// NENHUMA falha de canal derruba o fluxo de quem chamou — o pedido continua.
//
// Módulo-folha de propósito: depende só de Prisma + Mail + WebwhatsBridge (que
// por sua vez só usa Prisma). Não importa MessagingModule — assim NÃO cria o
// ciclo CommercialPlans → Messaging → Modules → CommercialPlans.

export type FullPlanRequestInput = {
  companyId: number;
  companyName?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  requestedByEmail?: string | null;
};

@Injectable()
export class MasterAlertService {
  private readonly logger = new Logger(MasterAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly webwhats: WebwhatsBridgeService,
  ) {}

  private normalizeWhatsAppTarget(value: unknown): string | null {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return null;
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  // E-mail do master: env explícito tem prioridade; senão, o usuário system_master.
  private async resolveMasterEmail(): Promise<string | null> {
    const fromEnv = String(process.env.MASTER_ALERT_EMAIL || '').trim();
    if (fromEnv) return fromEnv;
    try {
      const master = await this.prisma.user.findFirst({
        where: { isSystemMaster: true, email: { not: null } },
        select: { email: true },
        orderBy: { id: 'asc' },
      });
      return master?.email || null;
    } catch {
      return null;
    }
  }

  private async recordLog(entry: {
    companyId: number;
    target: string;
    text: string;
    status: 'sent' | 'failed';
    providerMessageId?: string | null;
    errorMessage?: string | null;
  }) {
    try {
      await this.prisma.masterPaymentNotificationLog.create({
        data: {
          companyId: entry.companyId,
          target: entry.target,
          text: entry.text,
          status: entry.status,
          providerMessageId: entry.providerMessageId || null,
          errorMessage: entry.errorMessage || null,
        },
      });
    } catch {
      // tabela indisponível neste ambiente — segue sem histórico
    }
  }

  // Dispara o alerta de pedido de HBX Full. Sempre resolve (best-effort).
  async notifyFullPlanRequested(input: FullPlanRequestInput): Promise<{ email: boolean; whatsapp: boolean }> {
    const companyId = Number(input.companyId || 0);
    const company = String(input.companyName || '').trim() || `empresa #${companyId}`;
    const contact = String(input.contactName || '').trim();
    const phone = String(input.contactPhone || '').trim();
    const requestedBy = String(input.requestedByEmail || '').trim();

    const linhas = [
      '🟣 HBX Full solicitado — implantação assistida',
      `Empresa: ${company}`,
      contact ? `Contato: ${contact}` : '',
      phone ? `Telefone: ${phone}` : '',
      requestedBy ? `Conta: ${requestedBy}` : '',
      '',
      'Um especialista (você) precisa entrar em contato para implantar.',
    ].filter(Boolean);
    const text = linhas.join('\n');

    let emailOk = false;
    let whatsappOk = false;

    // 1) E-mail
    try {
      const to = await this.resolveMasterEmail();
      if (to) {
        const res = await this.mail.sendMail({
          to,
          subject: `HBX Full solicitado — ${company}`,
          text,
        });
        emailOk = Boolean(res?.ok);
        await this.recordLog({
          companyId,
          target: `email:${to}`,
          text,
          status: emailOk ? 'sent' : 'failed',
          errorMessage: emailOk ? null : (res?.errorMessage || 'email não confirmado'),
        });
      } else {
        this.logger.warn('master_alert_full_sem_email — defina MASTER_ALERT_EMAIL ou um usuário system_master com e-mail');
      }
    } catch (error) {
      this.logger.warn(`master_alert_full_email_falhou: ${String((error as Error)?.message || error)}`);
      await this.recordLog({ companyId, target: 'email', text, status: 'failed', errorMessage: String((error as Error)?.message || error) });
    }

    // 2) WhatsApp (best-effort: precisa do nº destino + da empresa HBX com WhatsApp conectado)
    try {
      const to = this.normalizeWhatsAppTarget(process.env.MASTER_ALERT_WHATSAPP_TO || '19997024884');
      const senderCompanyId = Number(process.env.MASTER_ALERT_WA_COMPANY_ID || 0) || 0;
      if (to && senderCompanyId > 0) {
        const sent = await this.webwhats.sendText(senderCompanyId, { to, text });
        whatsappOk = true;
        await this.recordLog({
          companyId,
          target: sent.target,
          text,
          status: 'sent',
          providerMessageId: sent.providerMessageId,
        });
      } else if (!senderCompanyId) {
        this.logger.warn('master_alert_full_sem_whatsapp — defina MASTER_ALERT_WA_COMPANY_ID (empresa HBX com WhatsApp conectado)');
      }
    } catch (error) {
      this.logger.warn(`master_alert_full_whatsapp_falhou: ${String((error as Error)?.message || error)}`);
      await this.recordLog({ companyId, target: 'whatsapp', text, status: 'failed', errorMessage: String((error as Error)?.message || error) });
    }

    return { email: emailOk, whatsapp: whatsappOk };
  }
}
