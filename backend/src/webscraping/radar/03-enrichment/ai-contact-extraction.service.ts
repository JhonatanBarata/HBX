import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'node:dns';
import {
  gateLeadContacts,
  ownerNameExistsInSource,
  type LeadContactCandidate,
} from '../persistence/lead-contact-gate';

/**
 * EXTRAÇÃO DE CONTATO por IA local (Sprint 5 MOTOR-RFB-FILA, 02/07).
 *
 * Roteamento fixo do benchmark 01/07: extração de contato → modelo 30B MoE batch LOCAL
 * (qwen3:30b-a3b; única vitória clara sobre o 7B); saneamento/ICP/mensagem continuam no 7B.
 * Este serviço recebe TEXTO CRAWLEADO (fonte) + nome do lead e devolve contatos JÁ GATEADOS:
 * telefone/e-mail passam formato + proveniência (existem LITERALMENTE na fonte) e nome do
 * dono só sai se estiver escrito na fonte. Alucinação NÃO passa daqui — regra do dono:
 * sem gate, extração por LLM não entra em produção.
 *
 * Cuidados operacionais MEDIDOS (02/07, máquina 32GB):
 *  - `num_ctx` SEMPRE capado (default 8192): o default do modelo (262k) aloca 45,7GB de
 *    KV-cache → swap infinito. Sem cap a máquina morre, não é lentidão.
 *  - `think:false` SEMPRE + `num_predict` capado (sem cap = runaway em texto livre).
 *  - Fonte truncada em HBX_AI_EXTRACTION_MAX_SOURCE_CHARS (default 6000) — página gigante
 *    não estoura o num_ctx.
 *  - Mesmo padrão de rede do ai-saneamento: resolve IPv4 antes (Happy-Eyeballs trava sob
 *    carga), AbortController manual, retry 1x em erro de conexão/timeout, degrade gracioso.
 *
 * "Extração como missão da fila" fica pro sprint 4 — aqui é o motor + gate + contrato,
 * acionável em lote pelo owner (webscraping.service.aiExtractContactsForMaster).
 */

function envStr(name: string, fallback: string) {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

function envInt(name: string, fallback: number) {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ollamaBaseUrl() {
  // Mesma env do classificador/saneamento — NUNCA hardcodar/expor :11434 cru em outro lugar.
  return envStr('HBX_LLM_CLASSIFIER_URL', 'http://host.docker.internal:11434').replace(/\/+$/, '');
}

async function resolvePreferIPv4BaseUrl(baseUrl: string): Promise<string> {
  try {
    const parsed = new URL(baseUrl);
    if (!/^host\.docker\.internal$/i.test(parsed.hostname)) return baseUrl;
    const addresses = await dns.promises.resolve4(parsed.hostname);
    const ipv4 = addresses[0];
    if (!ipv4) return baseUrl;
    parsed.hostname = ipv4;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return baseUrl;
  }
}

const SYSTEM_PROMPT = [
  'Você extrai contatos de textos de sites de empresas brasileiras.',
  'Devolva SOMENTE JSON válido, nada fora dele, no formato:',
  '{"telefones":["..."],"emails":["..."],"nome_dono":"..." }',
  '(nome_dono é string ou null)',
  '',
  'REGRAS DURAS:',
  '- Só extraia o que está LITERALMENTE escrito no texto. NUNCA invente, complete ou deduza dígitos que não estão lá.',
  '- Se não houver telefone no texto, devolva "telefones":[]. Se não houver email, "emails":[]. Se o texto não disser explicitamente quem é o dono/proprietário/responsável, "nome_dono":null.',
  '- Telefone: apenas números de telefone/WhatsApp do próprio negócio, com DDD quando presente. NÃO extraia CNPJ, CPF, CEP, inscrição estadual, preços, quilometragem, datas, horários, protocolos, notas fiscais, coordenadas, versões de software ou números de endereço como telefone.',
  '- Email: apenas emails do próprio negócio. Ignore emails de plataformas/exemplos.',
  '- Nome do negócio NÃO é nome do dono.',
].join('\n');

export type AiContactExtractionInput = {
  leadName?: string | null;
  sourceText: string;
};

export type AiContactExtractionResult = {
  ok: boolean;
  /** contatos APROVADOS no gate (formato + literal na fonte), prontos pro LeadContactWriteService */
  contacts: LeadContactCandidate[];
  /** nome do dono APENAS se existir literalmente na fonte */
  ownerName: string | null;
  /** reprovados no gate (auditoria/telemetria de alucinação) */
  rejected: Array<{ kind: string; value: string; reason: string }>;
};

function safeParseJson(raw: string): Record<string, unknown> | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

const EMPTY_RESULT: AiContactExtractionResult = { ok: false, contacts: [], ownerName: null, rejected: [] };

@Injectable()
export class AiContactExtractionService {
  private readonly logger = new Logger(AiContactExtractionService.name);

  async extract(input: AiContactExtractionInput): Promise<AiContactExtractionResult> {
    const maxSourceChars = envInt('HBX_AI_EXTRACTION_MAX_SOURCE_CHARS', 6000);
    const sourceText = String(input?.sourceText || '').slice(0, maxSourceChars);
    if (!sourceText.trim()) return EMPTY_RESULT;

    const baseUrl = await resolvePreferIPv4BaseUrl(ollamaBaseUrl());
    const model = envStr('HBX_AI_EXTRACTION_MODEL', 'qwen3:30b-a3b-instruct-2507-q4_K_M');
    const timeoutMs = envInt('HBX_AI_EXTRACTION_TIMEOUT_MS', 90000);
    const numCtx = envInt('HBX_AI_EXTRACTION_NUM_CTX', 8192);
    const numPredict = envInt('HBX_AI_EXTRACTION_MAX_TOKENS', 300);
    const leadName = String(input?.leadName || '').trim();

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            think: false,
            format: 'json',
            options: { temperature: 0, num_predict: numPredict, num_ctx: numCtx },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              {
                role: 'user',
                content: `${leadName ? `NEGÓCIO: ${leadName}\n` : ''}TEXTO DO SITE:\n"""${sourceText}"""`,
              },
            ],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          this.logger.warn(`extração IA respondeu HTTP ${response.status}`);
          return EMPTY_RESULT;
        }

        const data = (await response.json()) as { message?: { content?: string } };
        const parsed = safeParseJson(String(data?.message?.content || ''));
        if (!parsed) {
          this.logger.warn('extração IA devolveu JSON inválido');
          return EMPTY_RESULT;
        }
        return this.gateParsedOutput(parsed, sourceText);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isRetryable = /connect timeout|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|aborted/i.test(message)
          || /connect timeout/i.test(String((error as any)?.cause || ''));
        if (attempt === 1 && isRetryable) {
          this.logger.warn(`extração IA falhou (${message}) — retry 1x`);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        this.logger.warn(`extração IA indisponível (${message})`);
        return EMPTY_RESULT;
      } finally {
        clearTimeout(timeoutHandle);
      }
    }
    return EMPTY_RESULT;
  }

  /** Gate pós-LLM: formato + proveniência LITERAL contra a fonte. Alucinação morre aqui. */
  private gateParsedOutput(parsed: Record<string, unknown>, sourceText: string): AiContactExtractionResult {
    const rawPhones = Array.isArray((parsed as any).telefones) ? (parsed as any).telefones.map(String) : [];
    const rawEmails = Array.isArray((parsed as any).emails) ? (parsed as any).emails.map(String) : [];
    const rawOwner = (parsed as any).nome_dono == null ? null : String((parsed as any).nome_dono).trim() || null;

    const candidates: LeadContactCandidate[] = [
      ...rawPhones.map((value: string, idx: number) => ({
        kind: 'phone' as const,
        value,
        source: 'ai_extraction',
        confidence: 60,
        rank: idx + 1,
      })),
      ...rawEmails.map((value: string, idx: number) => ({
        kind: 'email' as const,
        value,
        source: 'ai_extraction',
        confidence: 60,
        rank: idx + 1,
      })),
    ];
    const { approved, rejected } = gateLeadContacts(candidates, { sourceText });

    let ownerName: string | null = null;
    const rejectedAll: AiContactExtractionResult['rejected'] = [...rejected];
    if (rawOwner) {
      if (ownerNameExistsInSource(rawOwner, sourceText)) ownerName = rawOwner;
      else rejectedAll.push({ kind: 'owner_name', value: rawOwner, reason: 'nao_literal_na_fonte' });
    }
    if (rejectedAll.length) {
      this.logger.warn(
        `gate reprovou ${rejectedAll.length} item(ns) da extração IA: `
        + rejectedAll.map((r) => `${r.kind}:${r.value}(${r.reason})`).join(', '),
      );
    }
    return { ok: true, contacts: approved, ownerName, rejected: rejectedAll };
  }
}
