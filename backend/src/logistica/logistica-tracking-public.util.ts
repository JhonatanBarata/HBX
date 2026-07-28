import * as crypto from 'crypto';

// F3 FULL-POLIDO (27/07, PR27072026-ROTA-3-NIVEIS) — funções PURAS (testáveis
// isoladas) do link público "acompanhe sua entrega" + do ETA fino do aviso de
// chegada. Nenhuma função aqui toca o Prisma.
//
// ── TOKEN: assinado, NÃO armazenado ──────────────────────────────────────────
// Decisão de engenharia (documentada — trade-off honesto): em vez de uma coluna
// nova em Entrega (exigiria migration concorrente com o outro worker mexendo no
// MESMO schema.prisma em paralelo), o token é DERIVADO: `<deliveryId>.<assinatura
// HMAC-SHA256>`. Isso cumpre a regra "nunca id sequencial" (Entrega.id já é cuid
// — não-enumerável, não-sequencial) e adiciona a garantia dura de que ninguém
// forja um token pra outra entrega sem o segredo do servidor (HMAC verificado com
// timingSafeEqual). Zero escrita, zero corrida, funciona pra qualquer entrega
// existente ou futura sem popular nada. Contra: não dá pra revogar 1 link
// isoladamente (só rotacionando o segredo inteiro) — aceitável pra v1; o próprio
// status da entrega (cancelada/entregue) já esvazia o que o link mostra.
//
// Fail-closed: sem HBX_LOGISTICA_TRACKING_LINK_SECRET configurado, nenhum token
// é válido (mesmo padrão do projeto — ver mercado-pago-webhook-signature.ts /
// logistica-pedido.flags.ts: OPT-IN, ausência de segredo NUNCA vira segredo fraco
// hardcoded).

export function getTrackingPublicSecret(): string {
  return String(process.env.HBX_LOGISTICA_TRACKING_LINK_SECRET || '').trim();
}

export function isTrackingPublicConfigured(): boolean {
  return getTrackingPublicSecret().length > 0;
}

// CUID (Entrega.id) é alfanumérico e nunca contém ponto — "." é separador seguro
// entre o id e a assinatura. Faixa generosa (10–40) cobre cuid clássico e cuid2.
const DELIVERY_ID_RE = /^[a-z0-9]{10,40}$/i;

function computeSignature(deliveryId: string, secret: string): string {
  // 22 chars de base64url ≈ 128 bits truncados do HMAC-SHA256 — curto o
  // suficiente pra caber numa URL confortável, longo o suficiente contra força bruta.
  return crypto.createHmac('sha256', secret).update(deliveryId).digest('base64url').slice(0, 22);
}

/** Assina o deliveryId. Retorna null se faltar segredo configurado (fail-closed) ou id inválido. */
export function signDeliveryTrackingToken(deliveryId: string, secret: string = getTrackingPublicSecret()): string | null {
  const id = String(deliveryId || '').trim();
  if (!secret || !DELIVERY_ID_RE.test(id)) return null;
  return `${id}.${computeSignature(id, secret)}`;
}

/** Verifica o token e devolve o deliveryId, ou null (token adulterado/expirado-de-segredo/mal formado). */
export function verifyDeliveryTrackingToken(token: string, secret: string = getTrackingPublicSecret()): string | null {
  if (!secret) return null;
  const raw = String(token || '').trim();
  const idx = raw.lastIndexOf('.');
  if (idx <= 0 || idx === raw.length - 1) return null;
  const deliveryId = raw.slice(0, idx);
  const signature = raw.slice(idx + 1);
  if (!DELIVERY_ID_RE.test(deliveryId)) return null;
  const expected = computeSignature(deliveryId, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? deliveryId : null;
}

// ── ETA FINO (item C — minutos estimados a partir do etaAt existente) ───────
/**
 * Formata `Entrega.etaAt` em texto curto pro cliente ("chegando" | "8 min" |
 * "1h 5min"). null quando não há ETA (Entrega.etaAt ausente/inválido) — o
 * chamador decide o fallback (variável de template vazia / bloco escondido).
 * Pura e determinística: mesmo etaAt + mesmo `now` = mesma saída (testável sem
 * mock de relógio).
 */
export function formatEtaMinutos(etaAt: Date | string | null | undefined, now: Date = new Date()): string | null {
  if (!etaAt) return null;
  const target = etaAt instanceof Date ? etaAt : new Date(etaAt);
  if (Number.isNaN(target.getTime())) return null;
  const diffMinutes = Math.round((target.getTime() - now.getTime()) / 60_000);
  if (diffMinutes <= 1) return 'chegando';
  if (diffMinutes < 60) return `${diffMinutes} min`;
  const horas = Math.floor(diffMinutes / 60);
  const minutosRestantes = diffMinutes % 60;
  return minutosRestantes > 0 ? `${horas}h ${minutosRestantes}min` : `${horas}h`;
}

// ── STATUS PÚBLICO (4 estágios: na fila → a caminho → chegando → entregue) ──
export const PUBLIC_DELIVERY_STATUSES = ['AGENDADA', 'A_CAMINHO', 'CHEGANDO', 'ENTREGUE', 'CANCELADA'] as const;
export type PublicDeliveryStatus = (typeof PUBLIC_DELIVERY_STATUSES)[number];

/**
 * Deriva o estágio visual a partir de dados JÁ existentes — nenhuma lógica de
 * raio/geo nova: reusa `avisoChegandoAt` (a MESMA trava do "tô chegando" por
 * raio, logistica.service.ts) como o sinal de "chegando". `routeActive` = a
 * rota comercial desta entrega está com status ACTIVE agora.
 */
export function computePublicDeliveryStatus(input: {
  status: string;
  avisoChegandoAt: Date | null;
  routeActive: boolean;
}): PublicDeliveryStatus {
  const status = String(input.status || '').trim().toLowerCase();
  if (status === 'cancelada') return 'CANCELADA';
  if (status === 'entregue') return 'ENTREGUE';
  if (input.avisoChegandoAt) return 'CHEGANDO';
  if (status === 'em_rota') return 'A_CAMINHO';
  if (status === 'agendada' && input.routeActive) return 'A_CAMINHO';
  return 'AGENDADA';
}

// ── progresso da rota (paradas concluídas / total) — sem citar OUTROS clientes ──
export function computeRouteProgress(stopStatuses: string[]): { concluidas: number; total: number } {
  const total = stopStatuses.length;
  const concluidas = stopStatuses.filter((s) => String(s || '').trim().toLowerCase() === 'entregue').length;
  return { concluidas, total };
}

// ── primeiro nome só (o link pode ser encaminhado — não expõe o nome completo) ──
export function firstNameOnly(name: string | null | undefined): string | null {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}
