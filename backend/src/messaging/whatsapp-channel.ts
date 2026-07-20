export type WhatsAppNormalizedMessageType =
  | 'text'
  | 'template'
  | 'interactive'
  | 'button'
  | 'image'
  | 'video'
  | 'document'
  | 'audio'
  | 'sticker'
  | 'reaction'
  | 'deleted';

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

export function normalizeWhatsAppDigits(valueRaw: string | null | undefined) {
  return String(valueRaw || '').replace(/\D/g, '');
}

export function normalizeWhatsAppPhone(valueRaw: string | null | undefined) {
  const digits = normalizeWhatsAppDigits(valueRaw);
  if (!digits) return '';
  if (digits.length >= 10) return `+${digits}`;
  return digits;
}

/**
 * BUGFIX (09/07, incidente Josefino) — `normalizeWhatsAppPhone` só prefixa `+` nos
 * dígitos recebidos; NÃO garante o DDI 55. Quando o valor de origem é um telefone
 * BR "cru" (DDD+número, 10 ou 11 dígitos, sem 55 — ex.: CustomerProfile.phone ou
 * Contato.whatsapp gravados sem país), o resultado sai `+19996015804` em vez de
 * `+5519996015804` e o Webwhats recusa (Bad Request). O caminho do atendimento
 * nunca sofre isso porque `conversation.contact` já nasce do JID inbound (que o
 * WhatsApp sempre entrega com o país); quem PARTE de um telefone cru (ex.: um
 * disparo que INICIA conversa) precisa desta normalização ANTES de virar `to`.
 *
 * Mesmo algoritmo já usado (duplicado) em `messaging.service.ts#normalizeSelfAlertPhone`
 * e `vendas-automation.service.ts#normalizePhoneDigits/normalizeContact` — comprovado
 * correto nesses dois caminhos. Centralizado aqui (o módulo "dono" da normalização
 * de telefone WhatsApp) para os módulos que INICIAM conversa (ex.: logística)
 * reusarem em vez de reinventar.
 *
 * BUGFIX (20/07, incidente chip vazado — Bloco B) — a condição antiga também
 * exigia `!digits.startsWith('55')` antes de prefixar. Isso é ambíguo: um celular
 * de DDD 55 (Rio Grande do Sul — Santa Maria, Uruguaiana, Bagé) TAMBÉM começa com
 * "55", então `55999923190` (DDD 55, 11 dígitos, SEM país) era lido como "já tem
 * DDI" e saía sem o 55 → `+55999923190` de 11 dígitos, DDD comido, Webwhats recusa.
 * A decisão certa nunca olha o prefixo: telefone BR sem país tem SEMPRE 10 (fixo)
 * ou 11 (celular) dígitos; com país tem 12 ou 13. Logo, comprimento 10/11 já basta
 * para saber que falta o 55 — decidir só por COMPRIMENTO.
 */
export function normalizeBrPhoneDigits(valueRaw: string | null | undefined): string {
  const digits = normalizeWhatsAppDigits(valueRaw);
  if (!digits) return '';
  // BR sem país = 10 (fixo DDD+8) ou 11 (celular DDD+9) dígitos; nunca contém DDI.
  // Decidir por COMPRIMENTO, não por prefixo — DDD 55 (RS) colide com DDI 55.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** `normalizeBrPhoneDigits` + prefixo `+` (o formato E.164 que o Webwhats/Cloud API espera). */
export function normalizeBrPhoneE164(valueRaw: string | null | undefined): string {
  const digits = normalizeBrPhoneDigits(valueRaw);
  return digits ? `+${digits}` : '';
}

export function buildWhatsAppPhoneCandidates(valueRaw: string | null | undefined) {
  const digits = normalizeWhatsAppDigits(valueRaw);
  if (!digits) return [] as string[];
  const candidates = new Set<string>();
  candidates.add(`+${digits}`);
  candidates.add(digits);
  // BUGFIX (20/07, Bloco B) — comprimento 10/11 sempre falta o DDI, MESMO quando o
  // número já começa com "55" (DDD 55/RS colide com o prefixo do DDI 55). Não checar
  // `startsWith('55')` aqui: senão um celular de Santa Maria/Uruguaiana/Bagé nunca
  // ganhava a variante com país.
  if (digits.length === 10 || digits.length === 11) {
    candidates.add(`+55${digits}`);
    candidates.add(`55${digits}`);
  }
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
  if (normalized === 'video' || normalized === 'ptv') return 'video';
  if (normalized === 'document') return 'document';
  if (normalized === 'audio') return 'audio';
  if (normalized === 'sticker') return 'sticker';
  if (normalized === 'reaction') return 'reaction';
  if (normalized === 'deleted' || normalized === 'protocol' || normalized === 'revoke') return 'deleted';
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
  if (type === 'video') {
    return String(message?.video?.caption || '[video recebido]').trim() || '[video recebido]';
  }
  if (type === 'document') {
    const fileName = String(message?.document?.filename || '').trim();
    const caption = String(message?.document?.caption || '').trim();
    return caption || fileName || '[documento recebido]';
  }
  if (type === 'audio') {
    return '[audio recebido]';
  }
  if (type === 'sticker') return '[figurinha recebida]';
  if (type === 'reaction') {
    return String(message?.reaction?.emoji || message?.reaction?.text || '').trim() || '[reacao recebida]';
  }
  if (type === 'deleted') return '[mensagem apagada]';
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
