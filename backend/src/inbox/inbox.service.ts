import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockMessageDto } from './dto/mock-message.dto';
import { ConversationsService } from '../messaging/conversations.service';

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
  ) {}

  private requireCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Company context required');
    return companyId;
  }

  private requireTrimmed(value: string, field: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) throw new BadRequestException(`${field} is required`);
    return normalized;
  }

  private async ensureConversation(companyId: number, id: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, companyId } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async listConversations(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    return this.prisma.conversation.findMany({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  private async getConversationByIdForCompany(companyId: number, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, companyId },
      include: {
        customer: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async getConversationById(user: any, id: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    return this.getConversationByIdForCompany(companyId, id);
  }

  async updateConversationStatus(user: any, id: string, status: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    await this.ensureConversation(companyId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: { status },
      include: {
        customer: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async sendMessage(user: any, conversationId: string, content: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      include: { customer: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const normalizedContent = this.requireTrimmed(content, 'content');
    const toPhone = this.requireTrimmed(conversation.customer?.phone || '', 'customer phone');

    await this.conversations.queueOutboundForCompany(companyId, {
      to: toPhone,
      body: normalizedContent,
      messageType: 'text',
      sourceModule: 'atendimento',
      contactId: conversation.customerId,
    });

    await this.prisma.message.create({
      data: {
        conversationId,
        direction: 'outbound',
        content: normalizedContent,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: conversation.status === 'closed' ? 'open' : conversation.status },
    });

    return this.getConversationByIdForCompany(companyId, conversationId);
  }

  async mockMessage(user: any, dto: MockMessageDto) {
    const companyId = this.requireCompanyIdFromUser(user);
    const phone = this.requireTrimmed(dto.phone, 'phone');
    const content = this.requireTrimmed(dto.message, 'message');

    const customer = await this.prisma.customer.upsert({
      where: { phone },
      create: { phone },
      update: {},
    });

    let conversation = await this.prisma.conversation.findFirst({
      where: { companyId, customerId: customer.id, status: { in: ['new', 'open'] } },
      orderBy: { updatedAt: 'desc' },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          companyId,
          customerId: customer.id,
          status: 'new',
        },
      });
    }

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'inbound',
        content,
      },
    });

    await this.conversations.recordInboundMessage({
      companyId,
      from: phone,
      body: content,
    });

    // Touch conversation so listing reflects latest inbound activity.
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: conversation.status },
    });

    return this.getConversationByIdForCompany(companyId, conversation.id);
  }
}
