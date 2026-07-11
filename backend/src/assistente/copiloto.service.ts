import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { assistenteModel, callAssistenteOllama } from './assistente-ollama';
import type {
  CopilotoFichaDto,
  CopilotoMensagemDto,
  CopilotoRascunhoDto,
  CopilotoResumoDto,
  CopilotoSugestaoDto,
} from './dto/assistente.dto';

// ============================================================================
// LEADS-FINAL/05 — COPILOTO NO LEAD (backend).
//
// Expoe a IA local que JA roda em prod (frente "assistente", qwen na VPS) como
// 3 acoes de SUPERFICIE na pagina do lead — SEM tocar o motor. Reusa o MESMO
// cliente Ollama do sandbox (./assistente-ollama): mesmas envs (modelo/timeout
// PROPRIOS do assistente, NAO a faixa do bot classificador) e a MESMA faixa
// `realtime` do GOVERNOR-IA.
//
// GUARDRAILS DUROS (do plano):
//  - Copiloto NUNCA envia WhatsApp. Este service so GERA TEXTO (rascunho/resumo/
//    sugestao) e devolve JSON. Persistir (nota/atividade) e outro caminho, no
//    front, reusando endpoints ja existentes e freados.
//  - 1 clique = 1 chamada; timeout da frente assistente (20s em prod); SEM retry
//    automatico. JSON malformado = erro gracioso ({ ok:false }) — o front mostra
//    "Copiloto indisponível" e a tela segue 100% funcional.
//  - Por construcao NAO importa Webwhats/Conversations/Messaging/socket: o
//    contexto (ultimas mensagens + ficha RFB) chega PRONTO no body, vindo do
//    front. Nada aqui conecta chip nem dispara envio.
//
// Flag propria: HBX_COPILOTO_ENABLED (default ON local; o dono liga/desliga em
// prod). OFF => endpoints devolvem { ok:false, disabled:true } e o painel some.
// ============================================================================

const COPILOTO_FLAG = 'HBX_COPILOTO_ENABLED';
const TRUTHY = new Set(['true', '1', 'yes', 'on', 'sim']);

// Limite de mensagens de contexto passadas ao modelo (ultimas N da conversa).
const MAX_CONTEXT_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 600;
const TIPOS_ATIVIDADE = new Set(['ligacao', 'whatsapp', 'email', 'reuniao', 'visita']);

function requireCompanyId(user: any): number {
  const companyId = Number(
    user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId || 0,
  );
  if (!companyId) throw new BadRequestException('Empresa não identificada.');
  return companyId;
}

export type CopilotoResult =
  | { ok: true; kind: 'rascunho'; rascunho: string; model: string; latencyMs: number }
  | { ok: true; kind: 'resumo'; bullets: string[]; model: string; latencyMs: number }
  | {
      ok: true;
      kind: 'sugestao';
      titulo: string;
      prazoDias: number;
      tipo: string;
      motivo: string;
      model: string;
      latencyMs: number;
    }
  | { ok: false; error: string; disabled?: boolean };

@Injectable()
export class CopilotoService {
  private readonly logger = new Logger(CopilotoService.name);

  get enabled(): boolean {
    const raw = String(process.env[COPILOTO_FLAG] ?? '').trim().toLowerCase();
    if (!raw) return true; // default ON
    return TRUTHY.has(raw);
  }

  status() {
    return { ok: true, enabled: this.enabled };
  }

  // ── Acao 1: rascunhar resposta (vai pro campo de digitacao — NUNCA envia). ──
  async rascunho(user: any, dto: CopilotoRascunhoDto): Promise<CopilotoResult> {
    const companyId = requireCompanyId(user);
    if (!this.enabled) return { ok: false, error: 'Copiloto desativado.', disabled: true };

    const ficha = this.fichaBlock(dto?.ficha);
    const transcript = this.transcript(dto?.mensagens);
    const instrucao = this.clean(dto?.instrucao, 400);

    const system =
      'Você é o Copiloto de vendas de um CRM brasileiro. Escreva UM rascunho curto de resposta ' +
      'no WhatsApp para o VENDEDOR enviar a este lead (no máximo 2 frases, tom cordial e direto, ' +
      'português do Brasil). Não invente preço, prazo ou dado que não esteja no contexto. Não ' +
      'assine. Responda SOMENTE com JSON válido no formato {"rascunho":"<texto>"}.\n' +
      ficha;
    const userMsg =
      (transcript
        ? `Conversa recente (mais antiga em cima):\n${transcript}\n\n`
        : 'Ainda não há conversa com este lead — faça uma primeira abordagem.\n\n') +
      (instrucao ? `Instrução do vendedor: ${instrucao}\n\n` : '') +
      'Escreva o rascunho.';

    return this.run(companyId, 'rascunho', system, userMsg, (obj) => {
      const rascunho = this.clean(obj?.rascunho, 1500);
      if (!rascunho) return null;
      return { rascunho };
    });
  }

  // ── Acao 2: resumir a conversa em 3-5 bullets. ──
  async resumo(user: any, dto: CopilotoResumoDto): Promise<CopilotoResult> {
    const companyId = requireCompanyId(user);
    if (!this.enabled) return { ok: false, error: 'Copiloto desativado.', disabled: true };

    const transcript = this.transcript(dto?.mensagens);
    if (!transcript) {
      return { ok: false, error: 'Sem conversa para resumir ainda.' };
    }
    const ficha = this.fichaBlock(dto?.ficha);
    const system =
      'Você é o Copiloto de vendas de um CRM brasileiro. Resuma a conversa em 3 a 5 tópicos ' +
      'curtos e factuais (português do Brasil). Não invente nada além do que está na conversa. ' +
      'Responda SOMENTE com JSON válido no formato {"bullets":["...","..."]}.\n' +
      ficha;
    const userMsg = `Conversa (mais antiga em cima):\n${transcript}\n\nResuma.`;

    return this.run(companyId, 'resumo', system, userMsg, (obj) => {
      const bullets = Array.isArray(obj?.bullets)
        ? obj.bullets.map((b: unknown) => this.clean(b, 240)).filter((b): b is string => Boolean(b)).slice(0, 5)
        : [];
      if (!bullets.length) return null;
      return { bullets };
    });
  }

  // ── Acao 3: proxima acao sugerida (o que fazer, em quantos dias, por que). ──
  async sugestao(user: any, dto: CopilotoSugestaoDto): Promise<CopilotoResult> {
    const companyId = requireCompanyId(user);
    if (!this.enabled) return { ok: false, error: 'Copiloto desativado.', disabled: true };

    const ficha = this.fichaBlock(dto?.ficha);
    const transcript = this.transcript(dto?.mensagens);
    const system =
      'Você é o Copiloto de vendas de um CRM brasileiro. Sugira a PRÓXIMA AÇÃO do vendedor com ' +
      'este lead: o que fazer, em quantos dias e por quê. Curto e prático (português do Brasil). ' +
      'Não invente dados. Responda SOMENTE com JSON válido no formato ' +
      '{"titulo":"<ação curta>","prazoDias":<inteiro 0 a 30>,"tipo":"ligacao|whatsapp|email|reuniao|visita","motivo":"<motivo curto>"}.\n' +
      ficha;
    const userMsg =
      (transcript
        ? `Conversa recente (mais antiga em cima):\n${transcript}\n\n`
        : 'Ainda não há conversa registrada com este lead.\n\n') + 'Sugira a próxima ação.';

    return this.run(companyId, 'sugestao', system, userMsg, (obj) => {
      const titulo = this.clean(obj?.titulo, 160);
      if (!titulo) return null;
      let prazoDias = Math.trunc(Number(obj?.prazoDias));
      if (!Number.isFinite(prazoDias) || prazoDias < 0) prazoDias = 1;
      if (prazoDias > 30) prazoDias = 30;
      const tipoRaw = String(obj?.tipo || '').trim().toLowerCase();
      const tipo = TIPOS_ATIVIDADE.has(tipoRaw) ? tipoRaw : 'ligacao';
      const motivo = this.clean(obj?.motivo, 240) || '';
      return { titulo, prazoDias, tipo, motivo };
    });
  }

  // ── Núcleo: 1 chamada de IA + parse JSON tolerante (SEM retry). ──
  private async run(
    companyId: number,
    kind: 'rascunho' | 'resumo' | 'sugestao',
    system: string,
    userMsg: string,
    shape: (obj: any) => Record<string, unknown> | null,
  ): Promise<CopilotoResult> {
    const startedAt = Date.now();
    const model = assistenteModel();
    let raw: string;
    try {
      raw = await callAssistenteOllama(
        [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
        { companyId, actionKey: 'ai_realtime', temperature: kind === 'rascunho' ? 0.5 : 0.3, numPredict: 260 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`copiloto ${kind}: IA indisponível (${message})`);
      return { ok: false, error: 'Copiloto indisponível. Tente de novo em instantes.' };
    }

    const parsed = this.parseFirstJson(raw);
    const shaped = parsed ? shape(parsed) : null;
    if (!shaped) {
      this.logger.warn(`copiloto ${kind}: resposta malformada (sem retry)`);
      return { ok: false, error: 'Copiloto não conseguiu montar a resposta. Tente de novo.' };
    }
    return { ok: true, kind, ...(shaped as any), model, latencyMs: Date.now() - startedAt };
  }

  // ── Helpers ──
  private clean(value: unknown, max: number): string {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, max);
  }

  private fichaBlock(ficha?: CopilotoFichaDto): string {
    const f = ficha || {};
    const linhas: string[] = [];
    const push = (rotulo: string, valor: unknown) => {
      const v = this.clean(valor, 160);
      if (v) linhas.push(`- ${rotulo}: ${v}`);
    };
    push('Empresa', f.nome);
    push('Razão social', f.razaoSocial);
    push('CNPJ', f.cnpj);
    push('CNAE (ramo)', f.cnae);
    push('Segmento', f.segmento);
    push('Cidade/UF', [this.clean(f.cidade, 80), this.clean(f.uf, 8)].filter(Boolean).join('/'));
    push('Situação cadastral', f.situacao);
    if (!linhas.length) return 'Ficha da empresa (Receita Federal): não informada.\n';
    return `Ficha da empresa (Receita Federal):\n${linhas.join('\n')}\n`;
  }

  private transcript(mensagens?: CopilotoMensagemDto[]): string {
    if (!Array.isArray(mensagens) || !mensagens.length) return '';
    return mensagens
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((m) => {
        const texto = this.clean(m?.texto, MAX_MESSAGE_CHARS);
        if (!texto) return '';
        const autor =
          String(m?.direcao || m?.autor || '').trim().toLowerCase() === 'voce' ||
          String(m?.direcao || '').trim().toLowerCase() === 'outbound'
            ? 'Você'
            : 'Lead';
        return `${autor}: ${texto}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Parse JSON tolerante — UMA passada, SEM retry ao modelo. Tira cercas ```json,
   * pega o primeiro bloco {...} e tenta JSON.parse. Falhou = null (erro gracioso).
   */
  private parseFirstJson(raw: string): any | null {
    const text = String(raw || '').trim();
    if (!text) return null;
    const noFence = text.replace(/```(?:json)?/gi, '').trim();
    const start = noFence.indexOf('{');
    const end = noFence.lastIndexOf('}');
    const candidate = start >= 0 && end > start ? noFence.slice(start, end + 1) : noFence;
    try {
      const obj = JSON.parse(candidate);
      return obj && typeof obj === 'object' ? obj : null;
    } catch {
      return null;
    }
  }
}
