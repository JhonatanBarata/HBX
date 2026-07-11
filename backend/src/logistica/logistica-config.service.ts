import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * LOGÍSTICA-MOBILE M5 (05/07) — REGRAS DO ADMIN.
 *
 * Duas coisas:
 *  1) CRUD de LogisticaConfig (1/empresa): o admin edita o template do aviso de
 *     WhatsApp "entregue", os toggles (avisar global, cobrança na entrega, gerar
 *     dia automático) e os parâmetros de rota (raio de chegada, velocidade média,
 *     tempo de parada). company-scoped; cria um default se ainda não existir.
 *  2) `renderTemplateAviso` (função PURA, testável isolada): troca as variáveis
 *     públicas do template do admin. É o que o
 *     N6 (dispararWhatsappEntregue) passa a usar no lugar da mensagem fixa.
 *
 * ── SEM EFEITO EXTERNO ───────────────────────────────────────────────────────
 * Este serviço só lê/grava a config e formata texto. NÃO dispara WhatsApp, NÃO
 * cria cobrança, NÃO toca o caminho blindado. O disparo continua sendo do N6,
 * atrás de HBX_LOGISTICA_ENABLED (default OFF) + os 2 níveis de aviso (global e
 * por cliente) resolvidos aqui em `avisoHabilitado`.
 */
@Injectable()
export class LogisticaConfigService {
  private readonly logger = new Logger(LogisticaConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── LER (cria default se não existir) ────────────────────────────────────────
  /**
   * Devolve a config da empresa. Se ainda não existe uma linha, cria com os
   * defaults do schema (idempotente — 2 chamadas concorrentes não duplicam por
   * causa do @@unique([companyId])). company-scoped.
   */
  async getConfig(companyId: number): Promise<LogisticaConfigDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    let cfg = await this.prisma.logisticaConfig.findUnique({ where: { companyId } });
    if (!cfg) {
      try {
        cfg = await this.prisma.logisticaConfig.create({ data: { companyId } });
      } catch (e: any) {
        // corrida: outra requisição criou primeiro → relê.
        if (String(e?.code) === 'P2002') {
          cfg = await this.prisma.logisticaConfig.findUnique({ where: { companyId } });
        } else {
          throw e;
        }
      }
    }
    if (!cfg) throw new BadRequestException('Não foi possível carregar a configuração.');
    return serializeConfig(cfg);
  }

  // ── GRAVAR (PATCH parcial; upsert) ───────────────────────────────────────────
  /**
   * Atualiza (ou cria) a config da empresa. PATCH parcial: só os campos enviados
   * mudam. Números são clampados (raio/velocidade/tempo ≥ 1) e o template é
   * limitado no tamanho. company-scoped. NÃO dispara nada.
   */
  async updateConfig(companyId: number, input: UpdateLogisticaConfigInput): Promise<LogisticaConfigDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');

    const data: Record<string, unknown> = {};
    if (input.avisoWhatsEnabled !== undefined) data.avisoWhatsEnabled = !!input.avisoWhatsEnabled;
    if (input.templateAviso !== undefined) {
      const t = String(input.templateAviso ?? '').trim();
      data.templateAviso = t ? t.slice(0, 1000) : null;
    }
    if (input.raioChegadaM !== undefined) data.raioChegadaM = clampInt(input.raioChegadaM, 10, 5000, 60);
    if (input.velocidadeMediaKmH !== undefined) data.velocidadeMediaKmH = clampInt(input.velocidadeMediaKmH, 1, 200, 25);
    if (input.tempoParadaMin !== undefined) data.tempoParadaMin = clampInt(input.tempoParadaMin, 0, 240, 5);
    if (input.cobrancaNaEntrega !== undefined) data.cobrancaNaEntrega = !!input.cobrancaNaEntrega;
    if (input.moduloFinanceiroAtivo !== undefined) data.moduloFinanceiroAtivo = !!input.moduloFinanceiroAtivo;
    if (input.moduloRecoveryAtivo !== undefined) data.moduloRecoveryAtivo = !!input.moduloRecoveryAtivo;
    if (input.gerarDiaAutomatico !== undefined) data.gerarDiaAutomatico = !!input.gerarDiaAutomatico;
    // TASK 4 — dias de trabalho da empresa: CSV de inteiros 1..7 (ISO, 1=segunda…
    // 7=domingo), dedupe+sort (mesma normalização de ClienteProduto.diasSemana).
    // Vazio/sem dia válido → null (sem restrição configurada).
    if (input.diasTrabalho !== undefined) data.diasTrabalho = normalizeDiasTrabalho(input.diasTrabalho);
    // F1 — Pix direto do tenant (BR Code no app). Vazio limpa (desliga o QR).
    // Nome/cidade entram no payload EMV: sem acento e nos tetos da especificação
    // (25/15) — normalizados AQUI pra o que está salvo ser o que o QR carrega.
    if (input.pixChave !== undefined) {
      const chave = String(input.pixChave ?? '').trim();
      data.pixChave = chave ? chave.slice(0, 77) : null;
    }
    if (input.pixNome !== undefined) {
      const nome = semAcento(String(input.pixNome ?? '').trim());
      data.pixNome = nome ? nome.slice(0, 25) : null;
    }
    if (input.pixCidade !== undefined) {
      const cidade = semAcento(String(input.pixCidade ?? '').trim());
      data.pixCidade = cidade ? cidade.slice(0, 15) : null;
    }
    // AVISO-CHEGANDO (11/07) — toggle INDEPENDENTE do avisoWhatsEnabled (entregue):
    // a empresa liga um, o outro, os dois ou nenhum. Mesmo tratamento de template
    // (trim+slice) do templateAviso; distância clampada 100–2000m (default 500).
    if (input.avisoChegandoEnabled !== undefined) data.avisoChegandoEnabled = !!input.avisoChegandoEnabled;
    if (input.avisoChegandoTemplate !== undefined) {
      const t = String(input.avisoChegandoTemplate ?? '').trim();
      data.avisoChegandoTemplate = t ? t.slice(0, 1000) : null;
    }
    if (input.avisoChegandoDistanciaM !== undefined) {
      data.avisoChegandoDistanciaM = clampInt(input.avisoChegandoDistanciaM, 100, 2000, 500);
    }

    const cfg = await this.prisma.logisticaConfig.upsert({
      where: { companyId },
      update: data,
      create: { companyId, ...data },
    });
    return serializeConfig(cfg);
  }

  // ── TOGGLE "avisar entrega" POR CLIENTE ──────────────────────────────────────
  /**
   * Liga/desliga o aviso de entrega de UM cliente (o 2º nível de silêncio, soma
   * com o global). company-scoped: o cliente TEM de ser desta empresa. Não toca
   * mais nada da conta — é um PATCH cirúrgico de 1 campo aditivo (M5), separado do
   * editor de forma de pagamento (M6).
   */
  /** Lê o toggle "avisar entrega" de UM cliente (p/ a ficha). company-scoped. */
  async getAvisarEntregaCliente(companyId: number, customerProfileId: string): Promise<{ id: string; avisarEntrega: boolean } | null> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cid = String(customerProfileId || '').trim();
    if (!cid) throw new BadRequestException('Cliente é obrigatório.');
    const row = await this.prisma.customerProfile.findFirst({
      where: { id: cid, companyId },
      select: { id: true, avisarEntrega: true },
    });
    return row ? { id: row.id, avisarEntrega: row.avisarEntrega } : null;
  }

  async setAvisarEntregaCliente(companyId: number, customerProfileId: string, avisar: boolean): Promise<{ id: string; avisarEntrega: boolean } | null> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cid = String(customerProfileId || '').trim();
    if (!cid) throw new BadRequestException('Cliente é obrigatório.');
    const found = await this.prisma.customerProfile.findFirst({ where: { id: cid, companyId }, select: { id: true } });
    if (!found) return null;
    const updated = await this.prisma.customerProfile.update({
      where: { id: found.id },
      data: { avisarEntrega: !!avisar },
      select: { id: true, avisarEntrega: true },
    });
    return { id: updated.id, avisarEntrega: updated.avisarEntrega };
  }

  /**
   * Resolve os 2 níveis de aviso (global + por cliente) para o N6. Best-effort:
   * qualquer erro de leitura da config = FALLBACK PARA O COMPORTAMENTO ATUAL
   * (avisa), pra M5 não silenciar a rotina que já funciona hoje.
   * Retorna o template a usar (null = usa a mensagem fixa de fallback do N6).
   */
  async resolverAviso(companyId: number, avisarEntregaCliente: boolean | null | undefined): Promise<{ habilitado: boolean; template: string | null }> {
    // por cliente: default true (coluna nova; entregas antigas vêm null → avisa).
    const clienteOk = avisarEntregaCliente !== false;
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { avisoWhatsEnabled: true, templateAviso: true },
      });
      // Sem config = default do schema (avisoWhatsEnabled=true) → avisa.
      const globalOk = cfg ? cfg.avisoWhatsEnabled : true;
      return { habilitado: globalOk && clienteOk, template: cfg?.templateAviso ?? null };
    } catch (e: any) {
      this.logger.warn(`[logistica] resolverAviso company=${companyId} falhou: ${String(e?.message || e)}`);
      // fallback seguro = mantém o comportamento atual (avisa, msg fixa).
      return { habilitado: clienteOk, template: null };
    }
  }

  /**
   * AVISO-CHEGANDO (11/07) — espelho de `resolverAviso`, mas pro toggle/template
   * do "chegando" (avisoChegandoEnabled/avisoChegandoTemplate) — INDEPENDENTE do
   * avisoWhatsEnabled do "entregue" (a empresa liga um, o outro, os dois ou
   * nenhum). O consentimento POR CLIENTE é o MESMO campo (avisarEntrega): quem
   * não quer aviso de entrega também não recebe o "chegando".
   *
   * Diferente de resolverAviso (fallback "avisa" no erro — comportamento legado
   * que já existia): aqui o fallback de erro é FAIL-CLOSED (habilitado=false).
   * "Chegando" é feature NOVA opt-in — uma falha de leitura nunca pode "ligar"
   * um WhatsApp que o admin não configurou.
   */
  async resolverAvisoChegando(
    companyId: number,
    avisarEntregaCliente: boolean | null | undefined,
  ): Promise<{ habilitado: boolean; template: string | null }> {
    const clienteOk = avisarEntregaCliente !== false;
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { avisoChegandoEnabled: true, avisoChegandoTemplate: true },
      });
      // Sem config ainda = default do schema (avisoChegandoEnabled=false) → NÃO avisa
      // (opt-in — diferente do avisoWhatsEnabled legado, que nasce true).
      const globalOk = cfg ? cfg.avisoChegandoEnabled : false;
      return { habilitado: globalOk && clienteOk, template: cfg?.avisoChegandoTemplate ?? null };
    } catch (e: any) {
      this.logger.warn(`[logistica] resolverAvisoChegando company=${companyId} falhou: ${String(e?.message || e)}`);
      // fallback SEGURO = feature opt-in → erro de leitura NÃO liga sozinho.
      return { habilitado: false, template: null };
    }
  }
}

// ── RENDER DO TEMPLATE (função PURA — testável isolada) ─────────────────────────
export interface TemplateVars {
  cliente?: string | null;
  itens?: string | null; // ex.: "2× Galão 20L, 1× Água com gás"
  qtd?: number | string | null; // qtd total
  quantidade?: number | string | null; // alias público de qtd
  produto?: string | null; // produto principal (o primeiro)
  empresa?: string | null;
  now?: Date; // p/ a saudação por horário (default: agora) — injetável no teste
}

/**
 * Troca as variáveis públicas do template do admin.
 *  - {saudacao} = "Bom dia" | "Boa tarde" | "Boa noite" pelo horário de `now`.
 *  - variáveis ausentes viram "" (nunca deixa "{produto}" cru na mensagem).
 *  - qualquer {chave} desconhecida é REMOVIDA (não vaza placeholder pro cliente).
 * Determinística: mesmas vars + mesmo `now` = mesma saída.
 */
export function renderTemplateAviso(template: string, vars: TemplateVars = {}): string {
  const saudacao = saudacaoPorHorario(vars.now ?? new Date());
  const map: Record<string, string> = {
    saudacao,
    cliente: String(vars.cliente ?? '').trim(),
    itens: String(vars.itens ?? '').trim(),
    qtd: vars.qtd == null ? '' : String(vars.qtd).trim(),
    quantidade: vars.quantidade == null ? (vars.qtd == null ? '' : String(vars.qtd).trim()) : String(vars.quantidade).trim(),
    produto: String(vars.produto ?? '').trim(),
    empresa: String(vars.empresa ?? '').trim(),
  };
  const out = String(template ?? '').replace(/\{(\w+)\}/g, (_full, key: string) => {
    const k = String(key).toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : '';
  });
  // Limpa espaços deixados por variáveis vazias: colapsa espaços duplos, tira o
  // espaço órfão antes de pontuação (ex.: "entregamos ." → "entregamos.") e apara
  // espaço no fim de linha — sem estragar quebras de linha.
  return out
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[^\S\n]+([.,;:!?])/g, '$1')
    .replace(/[^\S\n]+\n/g, '\n')
    .trim();
}

/** Saudação por faixa horária LOCAL: 5–11h bom dia, 12–17h boa tarde, senão boa noite. */
export function saudacaoPorHorario(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// ── helpers ─────────────────────────────────────────────────────────────────────
/** Remove diacríticos ("São Paulo" → "Sao Paulo") — exigência prática do EMV. */
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// TASK 4 — normaliza "dias de trabalho": CSV de inteiros 1..7 (ISO, 1=segunda…
// 7=domingo), dedupe+sort (mesma regra de normalizeDiasSemana em
// logistica-recorrencia.service.ts, duplicada aqui de propósito — arquivo
// isolado, sem acoplar os dois serviços). Vazio/sem dia válido → null.
function normalizeDiasTrabalho(raw: unknown): string | null {
  const dias = Array.from(
    new Set(
      String(raw ?? '')
        .split(',')
        .map((s) => Math.trunc(Number(s.trim())))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7),
    ),
  ).sort((a, b) => a - b);
  return dias.length > 0 ? dias.join(',') : null;
}

function serializeConfig(c: any): LogisticaConfigDTO {
  return {
    avisoWhatsEnabled: !!c.avisoWhatsEnabled,
    templateAviso: c.templateAviso ?? null,
    raioChegadaM: c.raioChegadaM,
    velocidadeMediaKmH: c.velocidadeMediaKmH,
    tempoParadaMin: c.tempoParadaMin,
    cobrancaNaEntrega: !!c.cobrancaNaEntrega,
    moduloFinanceiroAtivo: !!c.moduloFinanceiroAtivo,
    moduloRecoveryAtivo: !!c.moduloRecoveryAtivo,
    gerarDiaAutomatico: !!c.gerarDiaAutomatico,
    diasTrabalho: c.diasTrabalho ?? null,
    pixChave: c.pixChave ?? null,
    pixNome: c.pixNome ?? null,
    pixCidade: c.pixCidade ?? null,
    avisoChegandoEnabled: !!c.avisoChegandoEnabled,
    avisoChegandoTemplate: c.avisoChegandoTemplate ?? null,
    avisoChegandoDistanciaM: c.avisoChegandoDistanciaM ?? 500,
  };
}

// ── tipos ─────────────────────────────────────────────────────────────────────
export interface UpdateLogisticaConfigInput {
  avisoWhatsEnabled?: boolean;
  templateAviso?: string | null;
  raioChegadaM?: number;
  velocidadeMediaKmH?: number;
  tempoParadaMin?: number;
  cobrancaNaEntrega?: boolean;
  moduloFinanceiroAtivo?: boolean;
  moduloRecoveryAtivo?: boolean;
  gerarDiaAutomatico?: boolean;
  diasTrabalho?: string | null;
  pixChave?: string | null;
  pixNome?: string | null;
  pixCidade?: string | null;
  avisoChegandoEnabled?: boolean;
  avisoChegandoTemplate?: string | null;
  avisoChegandoDistanciaM?: number;
}

export interface LogisticaConfigDTO {
  avisoWhatsEnabled: boolean;
  templateAviso: string | null;
  raioChegadaM: number;
  velocidadeMediaKmH: number;
  tempoParadaMin: number;
  cobrancaNaEntrega: boolean;
  moduloFinanceiroAtivo: boolean;
  moduloRecoveryAtivo: boolean;
  gerarDiaAutomatico: boolean;
  diasTrabalho: string | null;
  pixChave: string | null;
  pixNome: string | null;
  pixCidade: string | null;
  avisoChegandoEnabled: boolean;
  avisoChegandoTemplate: string | null;
  avisoChegandoDistanciaM: number;
}
