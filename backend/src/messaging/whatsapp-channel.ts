export type WhatsAppNormalizedMessageType =
  | 'text'
  | 'template'
  | 'interactive'
  | 'button'
  | 'image'
  | 'document'
  | 'audio';

export type WhatsAppTemplateNormalized = {
  name: string;
  language: string;
  category: string;
  status: string;
  header: {
    type: 'NONE' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
    text: string | null;
    mediaUrl: string | null;
  };
  body: {
    text: string;
    variables: string[];
    examples: Record<string, string>;
  };
  footer: {
    text: string | null;
  };
  buttons: Array<{
    type: string;
    text: string | null;
    url: string | null;
    phoneNumber: string | null;
  }>;
};

export type WhatsAppInboundNormalized = {
  companyId: number;
  customerPhone: string;
  conversationId: number | null;
  direction: 'inbound';
  senderType: 'customer';
  messageType: Exclude<WhatsAppNormalizedMessageType, 'template'>;
  text: string;
  rawPayload: unknown;
  externalMessageId: string | null;
  timestamp: Date;
  receivedOnEndpointId?: string | null;
  receivedOnPhoneNumberId?: string | null;
  receivedOnDisplayNumber?: string | null;
  receivedOnModuleKey?: string | null;
  receivedOnEndpointLabel?: string | null;
};

export type WhatsAppOutboundNormalized = {
  conversationId: number | null;
  companyId: number;
  to: string;
  messageType: 'text' | 'template' | 'interactive';
  payload: Record<string, unknown>;
  providerResponse: Record<string, unknown> | null;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  externalMessageId: string | null;
};

export function normalizeWhatsAppDigits(valueRaw: string | null | undefined) {
  return String(valueRaw || '').replace(/\D/g, '');
}

export function normalizeWhatsAppPhone(valueRaw: string | null | undefined) {
  const digits = normalizeWhatsAppDigits(valueRaw);
  if (!digits) return '';
  if (digits.length >= 10) return `+${digits}`;
  return digits;
}

export function buildWhatsAppPhoneCandidates(valueRaw: string | null | undefined) {
  const digits = normalizeWhatsAppDigits(valueRaw);
  if (!digits) return [] as string[];
  const candidates = new Set<string>();
  candidates.add(`+${digits}`);
  candidates.add(digits);
  if (digits.startsWith('55') && digits.length > 11) {
    candidates.add(digits.slice(2));
    candidates.add(`+${digits.slice(2)}`);
  }
  return [...candidates];
}

export function normalizeWhatsAppMessageType(typeRaw: string | null | undefined): WhatsAppNormalizedMessageType {
  const normalized = String(typeRaw || 'text').trim().toLowerCase();
  if (normalized === 'template') return 'template';
  if (normalized === 'interactive') return 'interactive';
  if (normalized === 'button') return 'button';
  if (normalized === 'image') return 'image';
  if (normalized === 'document') return 'document';
  if (normalized === 'audio') return 'audio';
  return 'text';
}

export function extractInboundTextFromPayload(message: any) {
  const type = normalizeWhatsAppMessageType(message?.type);
  if (type === 'text') return String(message?.text?.body ?? '').trim();
  if (type === 'button') {
    return String(message?.button?.text || message?.button?.payload || '').trim();
  }
  if (type === 'interactive') {
    return String(
      message?.interactive?.button_reply?.title ||
        message?.interactive?.button_reply?.id ||
        message?.interactive?.list_reply?.title ||
        message?.interactive?.list_reply?.id ||
        '',
    ).trim();
  }
  if (type === 'image') {
    return String(message?.image?.caption || '[imagem recebida]').trim() || '[imagem recebida]';
  }
  if (type === 'document') {
    const fileName = String(message?.document?.filename || '').trim();
    const caption = String(message?.document?.caption || '').trim();
    return caption || fileName || '[documento recebido]';
  }
  if (type === 'audio') {
    return '[audio recebido]';
  }
  return String(message?.text?.body ?? '').trim();
}

export function normalizeMetaProviderError(error: any, fallback: string) {
  const provider = error?.response?.data?.error || error?.response?.data || error || {};
  const providerMessage = String(
    provider?.error_user_msg ||
      provider?.error_user_title ||
      provider?.message ||
      provider?.error_data?.details ||
      provider?.title ||
      '',
  ).trim();
  if (providerMessage) return providerMessage;
  const status = Number(error?.response?.status || provider?.code || 0);
  if (status === 401) return 'Token ou sessao do WhatsApp invalido na Meta.';
  if (status === 403) return 'A Meta recusou o envio para esta empresa.';
  if (status === 404) return 'Destino ou recurso do WhatsApp nao encontrado na Meta.';
  if (status === 409) return 'Conflito no envio do WhatsApp. Tente novamente apos atualizar a conversa.';
  if (status > 0) return `${fallback} (HTTP ${status})`;
  return String(error?.message || fallback);
}

export function buildStructuredWhatsAppLog(input: {
  companyId?: number | null;
  customerId?: string | null;
  conversationId?: number | null;
  phone?: string | null;
  templateName?: string | null;
  messageType?: string | null;
  provider?: string | null;
  flowStep?: string | null;
  result?: string | null;
  reason?: string | null;
  extra?: Record<string, unknown> | null;
}) {
  return {
    companyId: input.companyId ?? null,
    customerId: input.customerId ?? null,
    conversationId: input.conversationId ?? null,
    phoneNormalized: normalizeWhatsAppPhone(input.phone),
    templateName: input.templateName ?? null,
    messageType: input.messageType ?? null,
    provider: input.provider ?? 'WHATSAPP_CLOUD',
    flowStep: input.flowStep ?? null,
    result: input.result ?? null,
    reason: input.reason ?? null,
    ...(input.extra || {}),
  };
}
