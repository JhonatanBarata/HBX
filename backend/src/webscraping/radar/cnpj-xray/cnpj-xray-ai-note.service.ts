import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'node:dns';

/**
 * CAMADA 3 (opcional) do RAIO-X EM LOTE (HOT-04, 02/07): nota ICP (0-100) + resumo de 1 linha
 * por lead, via qwen2.5:7b LOCAL (Ollama :11434) — o classificador já usado no bot, ~23s/lead,
 * dentro do teto do dono ("≥1min/lead = descartado", benchmark 01/07 docs/PLANEJAMENTOS).
 * NÃO usa o 30B (esse é reservado à extração de contato/gate anti-alucinação — sprint 5).
 * Falha/timeout degrada gracioso: nota null, resumo null — nunca derruba o job do lote.
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
  'Você avalia leads B2B brasileiros pra um vendedor.',
  'Devolva SOMENTE JSON válido, nada fora dele, no formato:',
  '{"nota_icp": 0-100, "resumo": "..."}',
  'nota_icp: quanto esse negócio parece um bom cliente (site no ar, WhatsApp confirmado, porte,',
  'segmento definido = nota alta; dado pobre/empresa inativa = nota baixa).',
  'resumo: 1 frase curta (até 140 caracteres) explicando o porquê da nota, em português.',
].join('\n');

export type CnpjXrayAiNoteInput = {
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  situacao?: string | null;
  cnaeDescription?: string | null;
  porte?: string | null;
  city?: string | null;
  state?: string | null;
  hasWebsite: boolean;
  hasWhatsappValidado: boolean;
  hasEmail: boolean;
};

export type CnpjXrayAiNoteResult = {
  ok: boolean;
  notaIcp: number | null;
  resumo: string | null;
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

const EMPTY_RESULT: CnpjXrayAiNoteResult = { ok: false, notaIcp: null, resumo: null };

@Injectable()
export class CnpjXrayAiNoteService {
  private readonly logger = new Logger(CnpjXrayAiNoteService.name);

  static enabled(): boolean {
    return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_XRAY_AI_NOTE_ENABLED ?? 'true').trim().toLowerCase());
  }

  async note(input: CnpjXrayAiNoteInput): Promise<CnpjXrayAiNoteResult> {
    const baseUrl = await resolvePreferIPv4BaseUrl(ollamaBaseUrl());
    const model = envStr('HBX_XRAY_AI_NOTE_MODEL', 'qwen2.5:7b');
    const timeoutMs = envInt('HBX_XRAY_AI_NOTE_TIMEOUT_MS', 60000); // teto do dono: 1min/lead
    const numCtx = envInt('HBX_XRAY_AI_NOTE_NUM_CTX', 4096);
    const numPredict = envInt('HBX_XRAY_AI_NOTE_MAX_TOKENS', 150);

    const lines = [
      input.razaoSocial ? `Razão social: ${input.razaoSocial}` : null,
      input.nomeFantasia ? `Nome fantasia: ${input.nomeFantasia}` : null,
      input.situacao ? `Situação cadastral: ${input.situacao}` : null,
      input.cnaeDescription ? `Ramo: ${input.cnaeDescription}` : null,
      input.porte ? `Porte: ${input.porte}` : null,
      input.city || input.state ? `Local: ${[input.city, input.state].filter(Boolean).join('/')}` : null,
      `Site: ${input.hasWebsite ? 'sim' : 'não'}`,
      `WhatsApp validado: ${input.hasWhatsappValidado ? 'sim' : 'não'}`,
      `E-mail: ${input.hasEmail ? 'sim' : 'não'}`,
    ].filter(Boolean);
    if (lines.length <= 3) return EMPTY_RESULT; // dado pobre demais pra avaliar com sentido

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
            { role: 'user', content: lines.join('\n') },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(`nota IA respondeu HTTP ${response.status}`);
        return EMPTY_RESULT;
      }
      const data = (await response.json()) as { message?: { content?: string } };
      const parsed = safeParseJson(String(data?.message?.content || ''));
      if (!parsed) return EMPTY_RESULT;
      const notaRaw = Number((parsed as any).nota_icp);
      const nota = Number.isFinite(notaRaw) ? Math.max(0, Math.min(100, Math.round(notaRaw))) : null;
      const resumo = String((parsed as any).resumo || '').trim().slice(0, 140) || null;
      return { ok: nota != null, notaIcp: nota, resumo };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`nota IA indisponível (${message})`);
      return EMPTY_RESULT;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
