import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AssistantOverride = {
  visualEnabled?: boolean;
  smartRepliesEnabled?: boolean;
  autoSendEnabled?: boolean;
};

type InsightTone = 'info' | 'warning' | 'success' | 'danger';

type AssistantInsight = {
  id: string;
  title: string;
  description: string;
  tone: InsightTone;
  actionLabel?: string;
  conversationId?: string | null;
  leadId?: string | null;
};

const assistantOverrides = new Map<number, AssistantOverride>();

function parseEnvFlag(value: unknown, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled', 'ligado'].includes(normalized);
}

function toCompanyId(user: any) {
  const companyId = Number(user?.companyId || user?.company?.id);
  if (!Number.isFinite(companyId) || companyId <= 0) {
    throw new BadRequestException('Empresa nao identificada para o Assistente IA.');
  }
  return Math.trunc(companyId);
}

function safeString(value: unknown, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function parseJsonRecord(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function formatPhone(phone: unknown) {
  const digits = normalizeDigits(phone);
  if (!digits) return '';
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return String(phone || digits);
}

function hoursAgo(date: Date | null | undefined) {
  if (!date) return null;
  return (Date.now() - date.getTime()) / 36e5;
}

@Injectable()
export class AiAssistantService {
  constructor(private readonly prisma: PrismaService) {}

  private envStatus() {
    // Flags globais do Assistente IA. Ajuste no ambiente do backend:
    // HBX_AI_ASSISTANT_VISUAL_ENABLED, HBX_AI_SMART_REPLIES_ENABLED, HBX_AI_AUTO_SEND_ENABLED.
    return {
      visualFeatureEnabled: parseEnvFlag(process.env.HBX_AI_ASSISTANT_VISUAL_ENABLED, false),
      smartRepliesFeatureEnabled: parseEnvFlag(process.env.HBX_AI_SMART_REPLIES_ENABLED, false),
      autoSendFeatureEnabled: parseEnvFlag(process.env.HBX_AI_AUTO_SEND_ENABLED, false),
      openAiAvailable: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
      model: String(process.env.OPENAI_MODEL || 'gpt-4.1-mini').trim(),
    };
  }

  async getStatus(user: any) {
    const companyId = toCompanyId(user);
    const env = this.envStatus();
    const override = assistantOverrides.get(companyId) || {};
    const visualEnabled = env.visualFeatureEnabled && (override.visualEnabled ?? true);
    const smartRepliesEnabled = env.smartRepliesFeatureEnabled && (override.smartRepliesEnabled ?? true);
    const autoSendEnabled = env.autoSendFeatureEnabled && (override.autoSendEnabled ?? false);
    return {
      visualFeatureEnabled: env.visualFeatureEnabled,
      smartRepliesFeatureEnabled: env.smartRepliesFeatureEnabled,
      autoSendFeatureEnabled: env.autoSendFeatureEnabled,
      visualEnabled,
      smartRepliesEnabled,
      autoSendEnabled,
      openAiAvailable: env.openAiAvailable,
      modelConfigured: Boolean(env.model),
      availabilityLabel: env.openAiAvailable ? 'Assistente HBX IA — Online' : 'IA indisponível',
      safeMode: true,
    };
  }

  async toggle(user: any, body: AssistantOverride) {
    const companyId = toCompanyId(user);
    const current = assistantOverrides.get(companyId) || {};
    const next: AssistantOverride = { ...current };
    if (typeof body.visualEnabled === 'boolean') next.visualEnabled = body.visualEnabled;
    if (typeof body.smartRepliesEnabled === 'boolean') next.smartRepliesEnabled = body.smartRepliesEnabled;
    if (typeof body.autoSendEnabled === 'boolean') next.autoSendEnabled = body.autoSendEnabled;
    assistantOverrides.set(companyId, next);
    await this.writeAudit(companyId, {
      event: 'toggle',
      status: 'success',
      metadata: { requested: body, override: next },
    });
    return this.getStatus(user);
  }

  async getNextProspect(user: any) {
    const companyId = toCompanyId(user);
    const candidates = await this.prisma.vendasLead.findMany({
      where: {
        companyId,
        status: { notIn: ['encerrado', 'perdido', 'cancelado'] },
      },
      include: { customerProfile: true },
      orderBy: [
        { status: 'asc' },
        { lastContactAt: 'asc' },
        { updatedAt: 'asc' },
      ],
      take: 80,
    });

    const ranked = candidates
      .filter((lead: any) => !this.isLeadBlockedForProspect(lead))
      .map((lead: any) => {
        let score = 0;
        const status = String(lead.status || '').toLowerCase();
        if (['novo', 'pendente', 'prospeccao', 'prospect'].includes(status)) score += 100;
        if (!lead.lastContactAt && Number(lead.attemptCount || 0) === 0) score += 70;
        const silenceHours = hoursAgo(lead.lastContactAt);
        if (silenceHours && silenceHours > 24) score += Math.min(60, silenceHours / 2);
        if (lead.returnAt && new Date(lead.returnAt).getTime() <= Date.now()) score += 35;
        return { lead, score };
      })
      .sort((left, right) => right.score - left.score);

    for (const item of ranked) {
      const personal = await this.isLeadPersonalContact(companyId, item.lead);
      if (personal) continue;
      const reason = this.buildNextProspectReason(item.lead);
      return {
        available: true,
        leadId: String(item.lead.id),
        name: item.lead.name || item.lead.customerProfile?.name || item.lead.customerProfile?.profileName || 'Prospect sem nome',
        phone: formatPhone(item.lead.phone || item.lead.phoneNormalized),
        status: String(item.lead.status || 'novo'),
        statusLabel: this.formatLeadStatus(item.lead.status),
        reason,
        score: Math.round(item.score),
        action: {
          label: 'Iniciar conversa',
          href: `/vendas?leadId=${encodeURIComponent(String(item.lead.id))}`,
        },
      };
    }

    return {
      available: false,
      message: 'Nenhum prospect elegivel agora.',
    };
  }

  async getInsights(user: any) {
    const companyId = toCompanyId(user);
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 36e5);
    const twoDaysAgo = new Date(now.getTime() - 48 * 36e5);

    const [longMessages, staleLeads, coldLeads, hotConversations, recentInboundMessages, latestRun, pendingLeads] =
      await Promise.all([
        this.prisma.companyMessage.findMany({
          where: { companyId, direction: 'OUTBOUND', timestamp: { gte: twoDaysAgo } },
          orderBy: { timestamp: 'desc' },
          take: 80,
        }),
        this.prisma.vendasLead.findMany({
          where: {
            companyId,
            status: { in: ['contato', 'retorno', 'novo'] },
            lastContactAt: { lt: dayAgo },
          },
          orderBy: { lastContactAt: 'asc' },
          take: 12,
        }),
        this.prisma.vendasLead.findMany({
          where: {
            companyId,
            status: { in: ['contato', 'retorno'] },
            attemptCount: { gte: 2 },
            lastContactAt: { lt: twoDaysAgo },
          },
          orderBy: { lastContactAt: 'asc' },
          take: 12,
        }),
        this.prisma.companyConversation.findMany({
          where: {
            companyId,
            OR: [
              { flowResult: { contains: 'interested' } },
              { flowResult: { contains: 'prospection_interested' } },
            ],
          },
          orderBy: { lastMessageAt: 'desc' },
          take: 8,
        }),
        this.prisma.companyMessage.findMany({
          where: { companyId, direction: 'INBOUND', timestamp: { gte: new Date(now.getTime() - 14 * 24 * 36e5) } },
          select: { timestamp: true },
          orderBy: { timestamp: 'desc' },
          take: 250,
        }),
        this.prisma.webscrapingSearchRun.findFirst({
          where: { companyId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.vendasLead.count({
          where: { companyId, status: { in: ['novo', 'contato', 'retorno'] } },
        }),
      ]);

    const insights: AssistantInsight[] = [];
    const oversized = longMessages.find((message: any) => String(message.body || '').length > 520);
    if (oversized) {
      insights.push({
        id: 'long_message',
        title: 'Mensagens muito longas',
        description: 'Existe resposta recente acima do ideal para WhatsApp. Prefira blocos curtos e uma pergunta por vez.',
        tone: 'warning',
        actionLabel: 'Ajustar abordagem',
        conversationId: String(oversized.conversationId),
      });
    }
    if (staleLeads.length) {
      insights.push({
        id: 'no_reply_24h',
        title: 'Sem resposta ha mais de 24h',
        description: `${staleLeads.length} lead(s) precisam de retorno ou reclassificacao.`,
        tone: 'warning',
        actionLabel: 'Ver fila',
        leadId: String(staleLeads[0].id),
      });
    }
    if (coldLeads.length) {
      insights.push({
        id: 'cold_leads',
        title: 'Lead frio',
        description: `${coldLeads.length} contato(s) com varias tentativas e baixa resposta. Vale trocar a abordagem.`,
        tone: 'info',
        actionLabel: 'Melhorias sugeridas',
        leadId: String(coldLeads[0].id),
      });
    }
    if (hotConversations.length) {
      insights.push({
        id: 'high_conversion',
        title: 'Alta chance de conversao',
        description: 'Ha conversa marcada como interessada. Priorize follow-up humano antes de novos disparos.',
        tone: 'success',
        actionLabel: 'Abrir conversa',
        conversationId: String(hotConversations[0].id),
      });
    }

    const latestRunStatus = String(latestRun?.status || '').toLowerCase();
    if (latestRun && ['failed', 'partial_error'].includes(latestRunStatus)) {
      insights.push({
        id: 'search_errors',
        title: 'Erros detectados',
        description: safeString(
          latestRun.errorMessage || latestRun.lastBatchError || 'A ultima busca de leads terminou com alerta operacional.',
          180,
        ),
        tone: 'danger',
        actionLabel: 'Ver busca',
      });
    }

    const bestHour = this.resolveBestResponseHour(recentInboundMessages.map((item) => item.timestamp));
    if (bestHour) {
      insights.push({
        id: 'best_hour',
        title: 'Melhor horario',
        description: `Maior volume de respostas entre ${bestHour}. Agende prospeccao nesse intervalo quando possivel.`,
        tone: 'success',
      });
    }

    const currentSearchCompleted = ['completed', 'partial_error', 'failed', 'canceled'].includes(latestRunStatus);
    const requestMoreVisible = Boolean(currentSearchCompleted && pendingLeads <= 3);
    return {
      generatedAt: now.toISOString(),
      requestMoreVisible,
      requestMoreMessage: requestMoreVisible
        ? 'Sua busca atual foi concluida e nao ha novos leads no momento.'
        : null,
      queue: { pendingLeads },
      bestHour,
      bubbles: [
        { id: 'errors', label: 'Erros detectados', count: insights.filter((item) => item.tone === 'danger').length },
        { id: 'improvements', label: 'Melhorias sugeridas', count: insights.filter((item) => item.id === 'long_message' || item.id === 'cold_leads').length },
        { id: 'cold', label: 'Lead frio', count: coldLeads.length },
        { id: 'no_reply', label: 'Sem resposta', count: staleLeads.length },
        { id: 'approach', label: 'Ajustar abordagem', count: oversized ? 1 : 0 },
      ],
      insights,
    };
  }

  async suggestReply(user: any, body: any) {
    const companyId = toCompanyId(user);
    const status = await this.getStatus(user);
    const conversationId = Number(body?.conversationId);
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      throw new BadRequestException('Conversa invalida para sugestao IA.');
    }
    if (!status.smartRepliesEnabled) {
      await this.writeSuggestionAudit(companyId, conversationId, null, null, 'disabled', null);
      return { available: false, status: 'disabled', message: 'Respostas inteligentes desligadas.' };
    }
    if (!status.openAiAvailable) {
      await this.writeSuggestionAudit(companyId, conversationId, null, null, 'unavailable', 'OPENAI_API_KEY ausente');
      return { available: false, status: 'unavailable', message: 'IA indisponível' };
    }

    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: conversationId, companyId },
      include: { messages: { orderBy: { timestamp: 'desc' }, take: 16 } },
    });
    if (!conversation) throw new BadRequestException('Conversa nao encontrada.');

    const lead = await this.findLeadForConversation(companyId, conversation.contact);
    const promptInput = this.buildSuggestionInput(conversation, conversation.messages.reverse(), lead);
    let suggestion = '';
    let aiStatus = 'suggested';
    let aiError: string | null = null;
    try {
      suggestion = await this.callOpenAi(promptInput);
      suggestion = this.sanitizeSuggestion(suggestion);
      if (!suggestion) {
        aiStatus = 'fallback';
        suggestion = this.buildNeutralSuggestion(lead);
      }
    } catch (error) {
      aiStatus = 'error';
      aiError = error instanceof Error ? error.message : 'Erro desconhecido';
      suggestion = this.buildNeutralSuggestion(lead);
    }

    await this.writeSuggestionAudit(companyId, conversationId, lead?.id || null, suggestion, aiStatus, aiError);
    return {
      available: true,
      status: aiStatus,
      suggestion,
      autoSendEnabled: false,
      requiresHumanApproval: true,
      leadId: lead?.id || null,
    };
  }

  async requestMoreLeads(user: any, _body: any) {
    const companyId = toCompanyId(user);
    const [latestRun, pendingLeads] = await Promise.all([
      this.prisma.webscrapingSearchRun.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.vendasLead.count({ where: { companyId, status: { in: ['novo', 'contato', 'retorno'] } } }),
    ]);
    const currentSearchCompleted = ['completed', 'partial_error', 'failed', 'canceled'].includes(String(latestRun?.status || '').toLowerCase());
    await this.writeAudit(companyId, {
      event: 'request_more_leads',
      status: 'success',
      metadata: { latestRunId: latestRun?.id || null, pendingLeads },
    });
    return {
      status: 'open_config',
      currentSearchCompleted,
      noNewLeadsAvailable: pendingLeads <= 0,
      queueLow: pendingLeads <= 3,
      message: 'Sua busca atual foi concluida e nao ha novos leads no momento.',
      action: {
        label: 'Pedir Mais Leads',
        href: '/webscraping?from=ai_assistant&intent=request_more_leads',
      },
    };
  }

  private async isLeadPersonalContact(companyId: number, lead: any) {
    const digits = normalizeDigits(lead.phoneNormalized || lead.phone);
    if (!digits) return false;
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { companyId, contact: { contains: digits.slice(-8) } },
      select: { metadata: true },
      orderBy: { updatedAt: 'desc' },
    });
    const metadata = parseJsonRecord(conversation?.metadata);
    return [metadata.inboxPersonalContact, metadata.personalContact, metadata.whatsappPersonalContact].some((value) =>
      parseEnvFlag(value, false),
    );
  }

  private isLeadBlockedForProspect(lead: any) {
    if (lead?.customerProfile?.botOff) return true;
    const haystack = [
      lead?.status,
      lead?.lastResult,
      lead?.shortNote,
      lead?.nextAction,
      lead?.customerProfile?.botOffReason,
      lead?.customerProfile?.notes,
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .join(' ');
    return [
      'não ligar mais',
      'nao ligar mais',
      'nao chamar mais',
      'não chamar mais',
      'opt out',
      'opt-out',
      'remover contato',
      'sem interesse',
    ].some((term) => haystack.includes(term));
  }

  private buildNextProspectReason(lead: any) {
    if (!lead.lastContactAt && Number(lead.attemptCount || 0) === 0) return 'Ainda nao recebeu primeira mensagem.';
    const silence = hoursAgo(lead.lastContactAt);
    if (silence && silence > 24) return `Sem resposta ha ${Math.floor(silence)}h.`;
    if (lead.returnAt && new Date(lead.returnAt).getTime() <= Date.now()) return 'Retorno agendado para agora.';
    return 'Pendente de prospeccao.';
  }

  private formatLeadStatus(status: unknown) {
    const normalized = String(status || 'novo').toLowerCase();
    const labels: Record<string, string> = {
      novo: 'Novo',
      contato: 'Em contato',
      retorno: 'Retorno',
      qualificado: 'Qualificado',
      encerrado: 'Encerrado',
    };
    return labels[normalized] || safeString(status, 60) || 'Novo';
  }

  private resolveBestResponseHour(dates: Date[]) {
    if (!dates.length) return null;
    const buckets = new Map<number, number>();
    dates.forEach((date) => {
      const hour = new Date(date).getHours();
      buckets.set(hour, (buckets.get(hour) || 0) + 1);
    });
    const best = [...buckets.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
    if (best == null) return null;
    const end = Math.min(23, best + 2);
    return `${String(best).padStart(2, '0')}h-${String(end).padStart(2, '0')}h`;
  }

  private async findLeadForConversation(companyId: number, contact: string) {
    const digits = normalizeDigits(contact);
    if (!digits) return null;
    return this.prisma.vendasLead.findFirst({
      where: {
        companyId,
        OR: [
          { phoneNormalized: digits },
          { phoneNormalized: digits.slice(-11) },
          { phone: { contains: digits.slice(-8) } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private buildSuggestionInput(conversation: any, messages: any[], lead: any) {
    const history = messages
      .slice(-12)
      .map((message: any) => {
        const direction = String(message.direction || '').toUpperCase() === 'OUTBOUND' ? 'OPERADOR' : 'LEAD';
        return `${direction}: ${safeString(message.body, 600)}`;
      })
      .join('\n');
    return [
      'Voce e o Assistente HBX IA para apoiar um operador humano no WhatsApp.',
      'Gere apenas uma sugestao curta em PT-BR. Nao envie. Nao invente preco, prazo, garantia ou promessa.',
      'Se faltar contexto, faca uma resposta neutra, educada e com pergunta de avancar conversa.',
      'Bloqueie linguagem ofensiva, pressao indevida, promessa falsa e dados nao confirmados.',
      `Lead: ${safeString(lead?.name || 'sem nome', 120)} | Status: ${safeString(lead?.status || 'indefinido', 80)} | Segmento: ${safeString(lead?.segment || 'nao informado', 120)}`,
      `Contato: ${safeString(conversation.contact, 80)}`,
      'Historico:',
      history || 'Sem historico suficiente.',
    ].join('\n');
  }

  private async callOpenAi(input: string) {
    const key = String(process.env.OPENAI_API_KEY || '').trim();
    const model = String(process.env.OPENAI_MODEL || 'gpt-4.1-mini').trim();
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input,
        store: false,
        max_output_tokens: 180,
        text: { format: { type: 'text' } },
      }),
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(safeString(payload?.error?.message || `OpenAI HTTP ${response.status}`, 240));
    }
    if (typeof payload.output_text === 'string') return payload.output_text;
    const content = Array.isArray(payload.output)
      ? payload.output.flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
      : [];
    const text = content.map((item: any) => item?.text || '').join('\n').trim();
    return text;
  }

  private sanitizeSuggestion(value: unknown) {
    const text = safeString(value, 900).replace(/\s{3,}/g, ' ');
    if (!text) return '';
    const lower = text.toLowerCase();
    const blocked = ['idiota', 'burro', 'garantido', '100%', 'preco final', 'preço final'];
    if (blocked.some((term) => lower.includes(term))) return '';
    if (/(r\$|\b\d+[,.]\d{2}\b)/i.test(text) && !lower.includes('confirmar')) return '';
    return text;
  }

  private buildNeutralSuggestion(lead: any) {
    const name = safeString(lead?.name, 80);
    return `${name ? `${name}, ` : ''}obrigado pelo retorno. Para eu te orientar sem passar informacao errada, pode me confirmar qual ponto voce quer resolver agora?`;
  }

  private async writeSuggestionAudit(
    companyId: number,
    conversationId: number,
    leadId: string | null,
    suggestion: string | null,
    status: string,
    error: string | null,
  ) {
    return this.writeAudit(companyId, {
      event: 'suggest_reply',
      status,
      metadata: {
        conversa_id: conversationId,
        lead_id: leadId,
        sugestao: suggestion,
        status,
        erro: error,
        data: new Date().toISOString(),
      },
    });
  }

  private async writeAudit(companyId: number, input: { event: string; status: string; metadata: Record<string, any> }) {
    try {
      await this.prisma.whatsAppAuditLog.create({
        data: {
          companyId,
          scope: 'ai_assistant',
          event: input.event,
          level: input.status === 'error' ? 'ERROR' : 'INFO',
          message: `AI Assistant ${input.event}: ${input.status}`,
          metadata: JSON.stringify(input.metadata || {}),
        },
      });
    } catch {
      // O assistente nunca deve quebrar o atendimento por falha de log.
    }
  }
}
