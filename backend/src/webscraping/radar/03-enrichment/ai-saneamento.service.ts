import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'node:dns';

/**
 * PR4a (30/06, docs/PLANEJAMENTOS/PR30062026/arvore-final-owner-enriquecimento.md)
 * "Worker de saneamento IA" — LIMPA nome + deduz SEGMENTO de leads crus via Ollama LOCAL.
 *
 * Distinção importante (travada pelo dono): isto é PREPARO/saneamento (nome sujo do scraping →
 * nome limpo + segmento), NÃO é "enriquecimento de contato" (CNPJ/e-mail/telefone/dono — outra
 * frente, já existe em `webscraping.service.ts`) e NÃO é a "nota ICP" (score — decisão de negócio
 * adiada). Aditivo, reversível, default OFF.
 *
 * Reuso do MESMO padrão de chamada ao Ollama de `vendas/ai-intent-classifier.service.ts`:
 * endpoint via `HBX_LLM_CLASSIFIER_URL` (não hardcoda outra URL), `think:false` + `format:"json"`,
 * timeout + degrade gracioso (nunca joga exceção pra cima).
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
  // Mesma env do classificador de intenção (vendas/ai-intent-classifier.service.ts) —
  // NÃO hardcodar outra URL/endpoint do Ollama.
  return envStr('HBX_LLM_CLASSIFIER_URL', 'http://host.docker.internal:11434').replace(/\/+$/, '');
}

/**
 * `host.docker.internal` resolve pra IPv4 E IPv6 no Docker Desktop local; sob carga o
 * Happy-Eyeballs do fetch/undici às vezes trava tentando a rota IPv6 e estoura o connect-timeout
 * interno (~10s) antes do fallback IPv4 completar — mesmo com orçamento de tempo sobrando no
 * timeout do request como um todo. Resolve o host ANTES e prefere IPv4 explicitamente; cai pro
 * hostname original se o lookup falhar (produção pode apontar pra IP/túnel direto sem esse problema).
 *
 * `dns.promises.resolve4` (c-ares, assíncrono de verdade) — NÃO `dns.promises.lookup` (getaddrinfo
 * via libuv threadpool, default 4 threads compartilhadas com bcrypt/crypto/fs). Sob o NestJS com
 * várias operações concorrentes disputando a threadpool, `lookup` ficou preso indefinidamente
 * (reproduzido: nunca resolveu nem rejeitou dentro de 60s+). `resolve4` não usa a threadpool.
 */
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
  'Voce e um assistente de enriquecimento de leads B2B no Brasil.',
  'Recebe o nome bruto de uma empresa (com ruido do scraping) e devolve SOMENTE JSON valido,',
  'nada fora dele, com: nome_limpo (nome comercial limpo, sem LTDA/ME/EIRELI/matriz/filial/',
  'telefone/url/ruido) e segmento (categoria em pt-br).',
  'Formato exato: {"nome_limpo":"...","segmento":"..."}',
  '',
  'Exemplos:',
  'Nome bruto: "PADARIA DOIS IRMAOS LTDA ME - matriz" => {"nome_limpo":"Padaria Dois Irmaos","segmento":"Padaria"}',
  'Nome bruto: "AUTO PECAS SILVA EIRELI - (85) 3222-1100" => {"nome_limpo":"Auto Pecas Silva","segmento":"Autopecas"}',
  'Nome bruto: "CLINICA ODONTOLOGICA SORRISO LTDA - www.sorriso.com.br" => {"nome_limpo":"Clinica Odontologica Sorriso","segmento":"Odontologia"}',
].join('\n');

export type AiSaneamentoInput = {
  name: string;
  city?: string | null;
  state?: string | null;
  segmentHint?: string | null;
};

export type AiSaneamentoResult = {
  ok: boolean;
  nomeLimpo: string | null;
  segmento: string | null;
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

function buildUserPrompt(input: AiSaneamentoInput): string {
  const parts = [`Nome bruto: ${String(input.name || '').trim()}`];
  const city = String(input.city || '').trim();
  const state = String(input.state || '').trim();
  if (city || state) parts.push(`Local: ${[city, state].filter(Boolean).join('/')}`);
  const hint = String(input.segmentHint || '').trim();
  if (hint) parts.push(`Segmento (pista, pode confirmar/corrigir): ${hint}`);
  return parts.join('\n');
}

@Injectable()
export class AiSaneamentoService {
  private readonly logger = new Logger(AiSaneamentoService.name);

  /**
   * Limpa nome + deduz segmento pela IA local. Degrada gracioso: Ollama offline, timeout ou
   * JSON invalido → `{ ok:false, nomeLimpo:null, segmento:null }`. NUNCA joga exceção pra cima —
   * caller decide o que fazer (skip, retry depois, etc).
   */
  async saneia(input: AiSaneamentoInput): Promise<AiSaneamentoResult> {
    const name = String(input?.name || '').trim();
    if (!name) return { ok: false, nomeLimpo: null, segmento: null };

    const baseUrl = await resolvePreferIPv4BaseUrl(ollamaBaseUrl());
    const model = envStr('HBX_AI_SANEAMENTO_MODEL', 'qwen2.5:7b');
    const timeoutMs = envInt('HBX_AI_SANEAMENTO_TIMEOUT_MS', 20000);

    // Retry único com pequeno backoff: o Node/undici embutido tem um connect-timeout interno
    // (~10s) mais curto que o timeout do request como um todo — sob carga (Ollama local
    // processando outra inferência) o TCP connect pode estourar esse teto isoladamente mesmo
    // com orçamento de tempo sobrando. Uma segunda tentativa cobre esse caso intermitente sem
    // precisar de dispatcher customizado (indisponível nesta versão do Node).
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      // AbortController manual (setTimeout/clearTimeout) em vez de AbortSignal.timeout() — mesmo
      // padrão já usado em `webSearch` deste arquivo. Sob o event loop do NestJS com muitos
      // intervals concorrentes (governor/factoryPump), AbortSignal.timeout() observado travando
      // sem nunca resolver/rejeitar a promise do fetch (reproduzido isolado funciona, dentro do
      // Nest não).
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
            options: { temperature: 0.2 },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: buildUserPrompt(input) },
            ],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          this.logger.warn(`saneamento IA respondeu HTTP ${response.status} para "${name}"`);
          return { ok: false, nomeLimpo: null, segmento: null };
        }

        const data = (await response.json()) as { message?: { content?: string } };
        const raw = String(data?.message?.content || '');
        const parsed = safeParseJson(raw);
        if (!parsed) {
          this.logger.warn(`saneamento IA devolveu JSON invalido para "${name}"`);
          return { ok: false, nomeLimpo: null, segmento: null };
        }

        const nomeLimpo = String((parsed as any).nome_limpo || '').trim() || null;
        const segmento = String((parsed as any).segmento || '').trim() || null;
        if (!nomeLimpo && !segmento) return { ok: false, nomeLimpo: null, segmento: null };

        return { ok: true, nomeLimpo, segmento };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Cobre erro de conexão E timeout/abort — modelo local pode levar >timeoutMs em cold-load
        // (visto ~12-15s pra carregar na RAM antes de inferir); um retry cobre esse caso comum
        // sem exigir um timeout fixo maior (que penalizaria toda chamada com o modelo já quente).
        const isRetryable = /connect timeout|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|aborted/i.test(message)
          || /connect timeout/i.test(String((error as any)?.cause || ''));
        if (attempt === 1 && isRetryable) {
          this.logger.warn(`saneamento IA falhou (${message}) para "${name}" — retry 1x`);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        this.logger.warn(`saneamento IA indisponivel (${message}) para "${name}"`);
        return { ok: false, nomeLimpo: null, segmento: null };
      } finally {
        clearTimeout(timeoutHandle);
      }
    }
    return { ok: false, nomeLimpo: null, segmento: null };
  }
}
