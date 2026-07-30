import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ================================================================
// S7 LEAD-CENTRICO (07-pool-raiz.md, item 1 "marquinha/supressão global").
// Lead que morre volta pro pool com MARQUINHA — o backend não re-seleciona
// aquele CONTATO (cnpj/telefone/e-mail) no período, mas o histórico PRIVADO
// (motivo, empresa que marcou, quando) nunca vaza pra outra empresa: quem
// consulta de FORA só recebe um boolean "não recebe" (ver isSuppressedFor,
// que corta o resultado antes de devolver ao chamador).
//
// Dosagem aprovada pelo dono (25/07, 00-FRENTE.md decisão 7 + 07-pool-raiz.md):
//   sem_interesse        -> supressão ~12 meses (negou o contato)
//   nao_atendeu          -> resfriamento ~90 dias (silêncio é 80%+ da prospecção
//                            fria; excluir pra sempre derreteria a base)
//   contato_invalido     -> invalida O DADO (permanente pra aquela chave
//                            específica; NÃO é o CNPJ inteiro — só o telefone/
//                            e-mail que provou ser ruim)
//   opt_out              -> permanente (pedido explícito de "não enviar mais")
//   convertido / outro   -> NÃO gera marca automática (sinal fraco/positivo
//                            demais pra travar prospecção futura de terceiros)
//
// Dosagem dos motivos do /atendimento (dono confirmou 30/07 — item 4 do dia de
// vendedor; antes os três abaixo caíam no genérico sem_interesse/12m):
//   ja_tem     -> ~90 dias (quem tem fornecedor hoje troca amanhã)
//   preco      -> ~60 dias (preço muda, condição volta)
//   sem_perfil -> permanente (não é o cliente; insistir queima chip)
//   nao_ligar  -> já era opt_out permanente (ladder do inbox.service)
//
// Instanciado à mão (`new VendasContactSuppressionService(this.prisma)`) nos
// pontos de escrita/leitura — mesmo padrão de EventRuleService
// (cadencia-gatilho.service.ts) pra não abrir dependência de módulo Nest
// entre Vendas e Webscraping só por causa disto.
// ================================================================

export type SuppressionReason =
  | 'sem_interesse'
  | 'nao_atendeu'
  | 'contato_invalido'
  | 'opt_out'
  | 'ja_tem'
  | 'preco'
  | 'sem_perfil';
export type SuppressionContactType = 'cnpj' | 'phone' | 'email';

const REASONS_THAT_SUPPRESS: readonly SuppressionReason[] = [
  'sem_interesse',
  'nao_atendeu',
  'contato_invalido',
  'opt_out',
  'ja_tem',
  'preco',
  'sem_perfil',
];

function envDays(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : fallback;
}

// Janelas em DIAS, configuráveis por env (defaults = dosagem do dono acima).
// null = permanente (não hardcode de dias — resolveExpiresAt trata à parte).
function windowDaysForReason(reason: SuppressionReason): number | null {
  switch (reason) {
    case 'sem_interesse':
      return envDays('HBX_SUPPRESSION_SEM_INTERESSE_DIAS', 365);
    case 'nao_atendeu':
      return envDays('HBX_SUPPRESSION_NAO_ATENDEU_DIAS', 90);
    case 'contato_invalido':
      return null; // permanente pra aquela chave
    case 'opt_out':
      return null; // permanente
    case 'ja_tem':
      return envDays('HBX_SUPPRESSION_JA_TEM_DIAS', 90);
    case 'preco':
      return envDays('HBX_SUPPRESSION_PRECO_DIAS', 60);
    case 'sem_perfil':
      return null; // permanente — não é o cliente, insistir queima chip
    default:
      return null;
  }
}

export function normalizeSuppressionPhone(raw: unknown): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  const tail = digits.slice(-13);
  return tail || null;
}

export function normalizeSuppressionEmail(raw: unknown): string | null {
  const text = String(raw || '').trim().toLowerCase();
  return text || null;
}

export function normalizeSuppressionCnpj(raw: unknown): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits || null;
}

export type ContactKeys = {
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
};

@Injectable()
export class VendasContactSuppressionService {
  private readonly logger = new Logger(VendasContactSuppressionService.name);

  constructor(private readonly prisma: PrismaService) {}

  private buildKeyEntries(contacts: ContactKeys): Array<{ contactType: SuppressionContactType; contactKey: string }> {
    const entries: Array<{ contactType: SuppressionContactType; contactKey: string }> = [];
    const cnpj = normalizeSuppressionCnpj(contacts.cnpj);
    const phone = normalizeSuppressionPhone(contacts.phone);
    const email = normalizeSuppressionEmail(contacts.email);
    if (cnpj) entries.push({ contactType: 'cnpj', contactKey: cnpj });
    if (phone) entries.push({ contactType: 'phone', contactKey: phone });
    if (email) entries.push({ contactType: 'email', contactKey: email });
    return entries;
  }

  // Grava a marca (best-effort, nunca lança — encerrar um lead não pode
  // falhar por causa da marquinha). 'convertido'/'outro' e reasons fora da
  // lista chamam isto só se o caller decidir — este método SEMPRE grava o
  // que receber; quem filtra 'convertido'/'outro' é o chamador
  // (applyAutoSuppressionForClosedLead abaixo).
  async mark(
    contacts: ContactKeys,
    reason: SuppressionReason,
    origin: { companyId?: number | null; leadId?: string | null } = {},
  ): Promise<number> {
    const entries = this.buildKeyEntries(contacts);
    if (!entries.length) return 0;
    const windowDays = windowDaysForReason(reason);
    const suppressedAt = new Date();
    const expiresAt = windowDays ? new Date(suppressedAt.getTime() + windowDays * 24 * 60 * 60 * 1000) : null;
    try {
      const result = await this.prisma.vendasContactSuppression.createMany({
        data: entries.map((entry) => ({
          contactType: entry.contactType,
          contactKey: entry.contactKey,
          reason,
          suppressedAt,
          expiresAt,
          originCompanyId: origin.companyId ?? null,
          originLeadId: origin.leadId ?? null,
        })),
      });
      return result.count;
    } catch (error: any) {
      this.logger.warn(`[contact-suppression] mark falhou reason=${reason}: ${String(error?.message || error)}`);
      return 0;
    }
  }

  // Hook único pro fechamento de lead (S4 closureReason). 'convertido'/'outro'
  // não geram marca (sinal fraco/positivo demais). Best-effort.
  async applyAutoSuppressionForClosedLead(
    contacts: ContactKeys,
    closureReason: string | null | undefined,
    origin: { companyId?: number | null; leadId?: string | null } = {},
  ): Promise<number> {
    const reason = String(closureReason || '').trim() as SuppressionReason;
    if (!REASONS_THAT_SUPPRESS.includes(reason)) return 0;
    return this.mark(contacts, reason, origin);
  }

  // Leitura: qualquer chave ativa (expiresAt null OU no futuro) suprime.
  // Nunca devolve reason/origin pro chamador externo — só um boolean + o tipo
  // de chave que bateu (uso interno, pra log/contador). Fail-OPEN (mesma
  // lógica de filterSuppressed): falha na query nunca derruba quem chama.
  async isSuppressed(contacts: ContactKeys): Promise<{ suppressed: boolean; matchedType: SuppressionContactType | null }> {
    const entries = this.buildKeyEntries(contacts);
    if (!entries.length) return { suppressed: false, matchedType: null };
    const now = new Date();
    try {
      const hit = await this.prisma.vendasContactSuppression.findFirst({
        where: {
          OR: entries.map((entry) => ({ contactType: entry.contactType, contactKey: entry.contactKey })),
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        },
        select: { contactType: true },
        orderBy: { createdAt: 'desc' },
      });
      return { suppressed: Boolean(hit), matchedType: (hit?.contactType as SuppressionContactType) || null };
    } catch (error: any) {
      this.logger.warn(`[contact-suppression] isSuppressed falhou (fail-open): ${String(error?.message || error)}`);
      return { suppressed: false, matchedType: null };
    }
  }

  // Filtro em lote (Radar delivery / import pra vendas): recebe uma lista de
  // candidatos com suas chaves de contato e devolve os que NÃO estão
  // suprimidos + a contagem pulada (visibilidade porta-a-porta, contador
  // logado no chamador). Uma query só (IN em cada tipo de chave), não N+1.
  async filterSuppressed<T>(
    items: T[],
    keysOf: (item: T) => ContactKeys,
  ): Promise<{ allowed: T[]; suppressedCount: number }> {
    if (!items.length) return { allowed: items, suppressedCount: 0 };
    const cnpjSet = new Set<string>();
    const phoneSet = new Set<string>();
    const emailSet = new Set<string>();
    for (const item of items) {
      const keys = keysOf(item);
      const cnpj = normalizeSuppressionCnpj(keys.cnpj);
      const phone = normalizeSuppressionPhone(keys.phone);
      const email = normalizeSuppressionEmail(keys.email);
      if (cnpj) cnpjSet.add(cnpj);
      if (phone) phoneSet.add(phone);
      if (email) emailSet.add(email);
    }
    if (!cnpjSet.size && !phoneSet.size && !emailSet.size) return { allowed: items, suppressedCount: 0 };

    const now = new Date();
    const orClauses: any[] = [];
    if (cnpjSet.size) orClauses.push({ contactType: 'cnpj', contactKey: { in: Array.from(cnpjSet) } });
    if (phoneSet.size) orClauses.push({ contactType: 'phone', contactKey: { in: Array.from(phoneSet) } });
    if (emailSet.size) orClauses.push({ contactType: 'email', contactKey: { in: Array.from(emailSet) } });

    // Fail-OPEN de propósito: a marquinha é uma camada de proteção NOVA por
    // cima de um funil que já funcionava sem ela (import/Radar). Se a query
    // falhar (schema não migrado num ambiente, mock de teste sem a tabela,
    // banco fora do ar), a entrega/importação não pode travar por causa
    // disto — melhor um lead escapar da supressão uma vez do que derrubar o
    // funil comercial inteiro.
    let rows: Array<{ contactType: string; contactKey: string }> = [];
    try {
      rows = await this.prisma.vendasContactSuppression.findMany({
        where: {
          OR: orClauses,
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        },
        select: { contactType: true, contactKey: true },
      });
    } catch (error: any) {
      this.logger.warn(`[contact-suppression] filterSuppressed falhou (fail-open): ${String(error?.message || error)}`);
      return { allowed: items, suppressedCount: 0 };
    }
    if (!rows.length) return { allowed: items, suppressedCount: 0 };

    const suppressedCnpj = new Set(rows.filter((r) => r.contactType === 'cnpj').map((r) => r.contactKey));
    const suppressedPhone = new Set(rows.filter((r) => r.contactType === 'phone').map((r) => r.contactKey));
    const suppressedEmail = new Set(rows.filter((r) => r.contactType === 'email').map((r) => r.contactKey));

    const allowed: T[] = [];
    let suppressedCount = 0;
    for (const item of items) {
      const keys = keysOf(item);
      const cnpj = normalizeSuppressionCnpj(keys.cnpj);
      const phone = normalizeSuppressionPhone(keys.phone);
      const email = normalizeSuppressionEmail(keys.email);
      const isSuppressed =
        (cnpj && suppressedCnpj.has(cnpj)) ||
        (phone && suppressedPhone.has(phone)) ||
        (email && suppressedEmail.has(email));
      if (isSuppressed) {
        suppressedCount += 1;
      } else {
        allowed.push(item);
      }
    }
    return { allowed, suppressedCount };
  }
}
