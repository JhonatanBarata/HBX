import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConversationsService } from '../messaging/conversations.service';
import { TicketService } from '../owner/ticket.service';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly conversations: ConversationsService,
    private readonly tickets: TicketService,
  ) {}

  async contactAdmin(input: { companySlug: string; username?: string; phone: string; message?: string }) {
    const adminEmail = process.env.ADMIN_SUPPORT_EMAIL || 'jbinformatica1100@gmail.com';
    const adminPhone = process.env.ADMIN_SUPPORT_PHONE || '++5519997024884';

    const slug = String(input.companySlug || '').trim();
    const company = slug ? await this.prisma.company.findUnique({ where: { slug } }) : null;

    const subject = `Pedido de contato (admin)${company ? ` - ${company.slug}` : ''}`;
    const text = [
      `Empresa: ${company ? `${company.name} (${company.slug})` : slug || 'N/A'}`,
      `Usuário: ${input.username || 'N/A'}`,
      `Telefone: ${input.phone}`,
      `Mensagem: ${input.message || '-'}`,
      `Contato admin (WhatsApp): ${adminPhone}`,
    ].join('\n');

    await this.mail.sendMail({
      to: adminEmail,
      subject,
      text,
    });

    let ticketResult: Awaited<ReturnType<TicketService['createOwnerTicket']>> | null = null;

    // Best-effort: record a WhatsApp outbound message and a support ticket if we have company context.
    if (company) {
      const supportTemplateName = String(process.env.WHATSAPP_SUPPORT_TEMPLATE_NAME || '').trim();
      try {
        await this.conversations.queueOutboundForCompany(company.id, {
          to: adminPhone,
          body: text,
          messageType: supportTemplateName ? 'template' : 'text',
          templateName: supportTemplateName || undefined,
          templateLanguage: supportTemplateName ? String(process.env.WHATSAPP_SUPPORT_TEMPLATE_LANGUAGE || 'pt_BR') : undefined,
          sourceModule: 'support',
        });
      } catch {
        // keep support flow resilient even when WhatsApp setup is incomplete
      }

      try {
        ticketResult = await this.tickets.createOwnerTicket({
          companyId: company.id,
          source: 'support',
          origin: 'support/contact-admin',
          originChannel: 'whatsapp',
          branch: 'technical_support',
          category: 'technical_support',
          customerName: input.username,
          customerPhone: input.phone,
          title: `Atender suporte técnico de ${input.username || input.phone || company.slug || company.name}`,
          description: input.message || text,
          lastCustomerMessage: input.message || '',
          metadata: {
            companySlug: company.slug,
            adminPhone,
          },
        });
      } catch {
        // contact-admin must keep working even if ticket storage is unavailable
      }
    }

    return { ok: true, ticket: ticketResult?.ticket || null };
  }
}
