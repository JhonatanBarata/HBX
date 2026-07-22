import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { isBillingOwnerActor, type ActorKindUserLike } from '../access/actor-kind';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { isCobrancaWhatsEnabled } from './logistica-cobranca.flags';
import { isPedidoPublicoEnabled } from './logistica-pedido.flags';
import { isLogisticaTrackingEnabled } from './logistica-tracking.flags';
import { isResumoDiarioEnabled } from './resumo-diario.flags';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
  ) {}

  // ── LER (cria default se não existir) ────────────────────────────────────────
  /**
   * Devolve a config da empresa. Se ainda não existe uma linha, cria com os
   * defaults do schema (idempotente — 2 chamadas concorrentes não duplicam por
   * causa do @@unique([companyId])). company-scoped.
   */
  async getConfig(companyId: number, actor?: ActorKindUserLike): Promise<LogisticaConfigDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cfg = await this.ensureRow(companyId);
    const creditosEsgotados = await this.computeCreditosEsgotados(companyId);
    return serializeConfig(cfg, actor, creditosEsgotados);
  }

  /**
   * S7 (PR22072026-APP-SOUNDS) — deriva o BOOLEANO "acabaram os créditos" a
   * partir do MESMO saldo do extrato admin (CreditWalletService.getBalance),
   * sem vazar o número: este método nunca devolve o saldo, só <= 0 ou não. É
   * consumido por `/logistica/config`, que o app do entregador já lê SEM ser
   * admin (GET sem @Admin()) — assim o motorista finalmente recebe o FATO
   * ("não dá pra rodar hoje") sem precisar do endpoint admin-only do extrato
   * (`/logistica/creditos/extrato`, que devolveria 403 pra ele).
   * Fail-open: qualquer erro na consulta devolve `false` (não tranca) — igual
   * ao `catch (_) { state.creditsLock = null; }` do app: uma falha de leitura
   * de saldo nunca pode travar o app de quem está tentando trabalhar.
   */
  private async computeCreditosEsgotados(companyId: number): Promise<boolean> {
    try {
      const balance = await this.wallet.getBalance(companyId);
      return Number.isFinite(balance) && balance <= 0;
    } catch (e: any) {
      this.logger.warn(`[logistica] computeCreditosEsgotados company=${companyId} falhou: ${String(e?.message || e)}`);
      return false;
    }
  }

  /**
   * Fonte única do modo EFETIVO usado pela inicialização e pela cobrança.
   * A preferência TRACKED fica dormente enquanto qualquer um dos dois gates
   * (flag global + toggle do tenant) estiver desligado.
   */
  async resolveRouteMode(companyId: number): Promise<LogisticaRouteMode> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cfg = await this.ensureRow(companyId);
    return effectiveRouteMode(cfg);
  }

  /** Linha crua da config (cria o default se não existir) — base do getConfig e
   *  dos métodos de token do pedido público (S6). Idempotente sob corrida (P2002). */
  private async ensureRow(companyId: number) {
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
    return cfg;
  }

  // ── S6 PORTAL-PEDIDO — token OPACO do link público /pedido/<token> ───────────
  /**
   * Garante o token do link público (idempotente: emite se a empresa ainda não
   * tiver um; chamadas repetidas devolvem o MESMO token). Molde do
   * ensureWebsiteCaptureToken (website-runtime.ts): randomBytes(24).hex — opaco,
   * não sequencial, NUNCA companyId/slug na URL. Só grava o token; NÃO liga o
   * toggle (pedidoPublicoAtivo é decisão separada do admin).
   */
  async ensurePedidoPublicoToken(companyId: number): Promise<string> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cfg = await this.ensureRow(companyId);
    const atual = String((cfg as any).pedidoPublicoToken || '').trim();
    if (atual) return atual;
    return this.gravarPedidoPublicoToken(companyId);
  }

  /**
   * Rotaciona o token (link antigo MORRE na hora — o lookup público é pelo
   * token). Molde do rotateWebsiteCaptureToken. Não mexe no toggle.
   */
  async rotatePedidoPublicoToken(companyId: number): Promise<string> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    await this.ensureRow(companyId);
    return this.gravarPedidoPublicoToken(companyId);
  }

  /** Grava um token novo com retry na chance (mínima) de colisão do @unique. */
  private async gravarPedidoPublicoToken(companyId: number): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = randomBytes(24).toString('hex'); // 48 chars hex — opaco.
      try {
        await this.prisma.logisticaConfig.update({
          where: { companyId },
          data: { pedidoPublicoToken: token },
        });
        return token;
      } catch (e: any) {
        if (String(e?.code) === 'P2002') continue; // colisão do unique — tenta outro
        throw e;
      }
    }
    throw new BadRequestException('Não foi possível gerar o link. Tente de novo.');
  }

  // ── GRAVAR (PATCH parcial; upsert) ───────────────────────────────────────────
  /**
   * Atualiza (ou cria) a config da empresa. PATCH parcial: só os campos enviados
   * mudam. Números são clampados (raio/velocidade/tempo ≥ 1) e o template é
   * limitado no tamanho. company-scoped. NÃO dispara nada.
   */
  async updateConfig(
    companyId: number,
    input: UpdateLogisticaConfigInput,
    actor?: ActorKindUserLike,
  ): Promise<LogisticaConfigDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');

    const data: Record<string, unknown> = {};
    const changesCommercialConfig = [
      input.trackingAtivo,
      input.modoRotaPadrao,
      input.cobrancaNaEntrega,
      input.moduloFinanceiroAtivo,
      input.moduloRecoveryAtivo,
      input.pixChave,
      input.pixNome,
      input.pixCidade,
      input.cobrancaWhatsAtiva,
      input.resumoDiarioAtivo,
      input.resumoDiarioHora,
    ].some((value) => value !== undefined);
    if (changesCommercialConfig && !isBillingOwnerActor(actor)) {
      throw new ForbiddenException('Somente o responsável financeiro pode alterar esta configuração.');
    }
    if (input.trackingAtivo !== undefined) data.trackingAtivo = !!input.trackingAtivo;
    if (input.modoRotaPadrao !== undefined) {
      const mode = String(input.modoRotaPadrao || '').trim().toUpperCase();
      if (mode !== 'ESSENTIAL' && mode !== 'TRACKED') {
        throw new BadRequestException('Modo de rota inválido.');
      }
      data.modoRotaPadrao = mode;
    }
    if (input.avisoWhatsEnabled !== undefined) data.avisoWhatsEnabled = !!input.avisoWhatsEnabled;
    if (input.templateAviso !== undefined) {
      const t = String(input.templateAviso ?? '').trim();
      data.templateAviso = t ? t.slice(0, 1000) : null;
    }
    if (input.raioChegadaM !== undefined) data.raioChegadaM = clampInt(input.raioChegadaM, 10, 5000, 60);
    if (input.cobrancaSimples !== undefined) data.cobrancaSimples = !!input.cobrancaSimples;
    if (input.velocidadeMediaKmH !== undefined) data.velocidadeMediaKmH = clampInt(input.velocidadeMediaKmH, 1, 200, 25);
    if (input.tempoParadaMin !== undefined) data.tempoParadaMin = clampInt(input.tempoParadaMin, 0, 240, 5);
    if (input.cobrancaNaEntrega !== undefined) data.cobrancaNaEntrega = !!input.cobrancaNaEntrega;
    if (input.moduloFinanceiroAtivo !== undefined) data.moduloFinanceiroAtivo = !!input.moduloFinanceiroAtivo;
    // PR18072026 W-A — toggles operacionais (não exigem billing owner, mesmo
    // padrão do cobrancaSimples): formas de pagamento aceitas + preço por
    // cliente + cobrança automática (painel Avançado).
    if (input.aceitaNaHora !== undefined) data.aceitaNaHora = !!input.aceitaNaHora;
    if (input.aceitaMensal !== undefined) data.aceitaMensal = !!input.aceitaMensal;
    if (input.aceitaFiado !== undefined) data.aceitaFiado = !!input.aceitaFiado;
    if (input.precoPorClienteAtivo !== undefined) data.precoPorClienteAtivo = !!input.precoPorClienteAtivo;
    if (input.cobrancaAutomatica !== undefined) data.cobrancaAutomatica = !!input.cobrancaAutomatica;
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
    // S2 COBRANÇA-WHATS (11/07) — toggle POR TENANT (aviso de cobrança + lembrete
    // de vencimento no zap). Gravar é livre; EFEITO só existe com a flag global
    // HBX_COBRANCA_WHATS_ENABLED ligada (o serviço de aviso checa as duas).
    if (input.cobrancaWhatsAtiva !== undefined) data.cobrancaWhatsAtiva = !!input.cobrancaWhatsAtiva;
    // S3 RESUMO-DIÁRIO (11/07) — toggle POR TENANT + hora local (0-23) do resumo
    // do dono no zap. Gravar é livre; EFEITO só com HBX_RESUMO_DIARIO_ENABLED
    // global ligada (o scheduler checa as duas). A marca resumoDiarioUltimoEnvio
    // NÃO entra aqui de propósito — é interna do scheduler, nunca editável via API.
    if (input.resumoDiarioAtivo !== undefined) data.resumoDiarioAtivo = !!input.resumoDiarioAtivo;
    if (input.resumoDiarioHora !== undefined) data.resumoDiarioHora = clampInt(input.resumoDiarioHora, 0, 23, 7);
    // S6 PORTAL-PEDIDO (11/07) — toggle POR TENANT do pedido público pelo link.
    // Gravar é livre; EFEITO só com HBX_PEDIDO_PUBLICO_ENABLED global ligada (a
    // rota pública checa as duas). O TOKEN não entra aqui de propósito — só
    // ensure/rotatePedidoPublicoToken emitem (nunca editável cru via PATCH).
    if (input.pedidoPublicoAtivo !== undefined) data.pedidoPublicoAtivo = !!input.pedidoPublicoAtivo;
    if (input.comprovanteFotoObrigatoria !== undefined) {
      data.comprovanteFotoObrigatoria = !!input.comprovanteFotoObrigatoria;
    }
    if (input.comprovanteAssinaturaObrigatoria !== undefined) {
      data.comprovanteAssinaturaObrigatoria = !!input.comprovanteAssinaturaObrigatoria;
    }
    if (input.comprovanteCodigoObrigatorio !== undefined) {
      data.comprovanteCodigoObrigatorio = !!input.comprovanteCodigoObrigatorio;
    }

    const cfg = await this.prisma.logisticaConfig.upsert({
      where: { companyId },
      update: data,
      create: { companyId, ...data },
    });
    // PATCH é admin-only (RolesGuard + @Admin() no controller), mas o DTO é o
    // MESMO shape do GET — recalcula o booleano pra não devolver um valor
    // desatualizado pro admin que acabou de editar a config.
    const creditosEsgotados = await this.computeCreditosEsgotados(companyId);
    return serializeConfig(cfg, actor, creditosEsgotados);
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

function serializeConfig(c: any, actor?: ActorKindUserLike, creditosEsgotados = false): LogisticaConfigDTO {
  const operational: LogisticaConfigDTO = {
    // S7 (PR22072026-APP-SOUNDS) — BOOLEANO, nunca o saldo: vai pra TODO ator
    // (inclusive motorista, que não é billing owner) porque é o único jeito de
    // ele saber "não dá pra rodar hoje" sem bater no endpoint admin-only do
    // extrato. Mesma linha da LEI DO VENDEDOR — o fato pode aparecer, o
    // dinheiro da empresa não.
    creditosEsgotados: !!creditosEsgotados,
    avisoWhatsEnabled: !!c.avisoWhatsEnabled,
    templateAviso: c.templateAviso ?? null,
    raioChegadaM: c.raioChegadaM,
    velocidadeMediaKmH: c.velocidadeMediaKmH,
    tempoParadaMin: c.tempoParadaMin,
    gerarDiaAutomatico: !!c.gerarDiaAutomatico,
    diasTrabalho: c.diasTrabalho ?? null,
    avisoChegandoEnabled: !!c.avisoChegandoEnabled,
    avisoChegandoTemplate: c.avisoChegandoTemplate ?? null,
    avisoChegandoDistanciaM: c.avisoChegandoDistanciaM ?? 500,
    comprovanteFotoObrigatoria: !!c.comprovanteFotoObrigatoria,
    comprovanteAssinaturaObrigatoria: !!c.comprovanteAssinaturaObrigatoria,
    comprovanteCodigoObrigatorio: !!c.comprovanteCodigoObrigatorio,
    cobrancaSimples: !!c.cobrancaSimples,
    // PR18072026 W-A — módulo Financeiro liga/desliga (3 níveis) + painel
    // Avançado. moduloFinanceiroAtivo e os 5 toggles abaixo são OPERACIONAIS
    // (lidos por QUALQUER ator): o app do entregador precisa saber o nível da
    // folha de chegada e quais formas mostrar no editar cliente MESMO sem ser
    // billing owner (motorista/vendedor não é dono nem gerente). É o TOGGLE
    // (liga/desliga), não valor financeiro — LEI DO VENDEDOR segue protegendo
    // saldo/valor, não este booleano.
    moduloFinanceiroAtivo: !!c.moduloFinanceiroAtivo,
    aceitaNaHora: c.aceitaNaHora === undefined ? true : !!c.aceitaNaHora,
    aceitaMensal: c.aceitaMensal === undefined ? true : !!c.aceitaMensal,
    aceitaFiado: c.aceitaFiado === undefined ? true : !!c.aceitaFiado,
    precoPorClienteAtivo: c.precoPorClienteAtivo === undefined ? true : !!c.precoPorClienteAtivo,
    cobrancaAutomatica: !!c.cobrancaAutomatica,
  };

  // O GET também é consumido pelo app do entregador. Campos administrativos,
  // financeiros e comerciais precisam estar AUSENTES (não apenas null) para
  // gerente, vendedor e motorista.
  if (!isBillingOwnerActor(actor)) return operational;

  return {
    ...operational,
    cobrancaNaEntrega: !!c.cobrancaNaEntrega,
    moduloRecoveryAtivo: !!c.moduloRecoveryAtivo,
    pixChave: c.pixChave ?? null,
    pixNome: c.pixNome ?? null,
    pixCidade: c.pixCidade ?? null,
    cobrancaWhatsAtiva: !!c.cobrancaWhatsAtiva,
    cobrancaWhatsDisponivel: isCobrancaWhatsEnabled(),
    resumoDiarioAtivo: !!c.resumoDiarioAtivo,
    resumoDiarioHora: typeof c.resumoDiarioHora === 'number' ? c.resumoDiarioHora : 7,
    resumoDiarioDisponivel: isResumoDiarioEnabled(),
    pedidoPublicoAtivo: !!c.pedidoPublicoAtivo,
    pedidoPublicoToken: c.pedidoPublicoToken ?? null,
    pedidoPublicoDisponivel: isPedidoPublicoEnabled(),
    trackingAtivo: !!c.trackingAtivo,
    trackingDisponivel: isLogisticaTrackingEnabled(),
    // Preferência salva (não o modo efetivo): a UI continua mostrando TRACKED
    // enquanto a flag global está OFF. Inicialização/cobrança usam resolveRouteMode.
    modoRotaPadrao: storedRouteMode(c.modoRotaPadrao),
  };
}

export type LogisticaRouteMode = 'ESSENTIAL' | 'TRACKED';

function storedRouteMode(value: unknown): LogisticaRouteMode {
  return String(value || '').trim().toUpperCase() === 'TRACKED' ? 'TRACKED' : 'ESSENTIAL';
}

function effectiveRouteMode(c: any): LogisticaRouteMode {
  if (!isLogisticaTrackingEnabled() || !c?.trackingAtivo) return 'ESSENTIAL';
  return storedRouteMode(c?.modoRotaPadrao);
}

// ── tipos ─────────────────────────────────────────────────────────────────────
export interface UpdateLogisticaConfigInput {
  trackingAtivo?: boolean;
  modoRotaPadrao?: LogisticaRouteMode;
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
  // S2 COBRANÇA-WHATS — toggle por tenant (efeito só com a env global ligada).
  cobrancaWhatsAtiva?: boolean;
  // S3 RESUMO-DIÁRIO — toggle por tenant + hora local 0-23 (efeito só com a env).
  resumoDiarioAtivo?: boolean;
  resumoDiarioHora?: number;
  // S6 PORTAL-PEDIDO — toggle por tenant do pedido público (efeito só com a env).
  pedidoPublicoAtivo?: boolean;
  comprovanteFotoObrigatoria?: boolean;
  comprovanteAssinaturaObrigatoria?: boolean;
  comprovanteCodigoObrigatorio?: boolean;
  // W1-BACKEND (18/07) — toggle "Cobrança simples na chegada" do app do entregador.
  cobrancaSimples?: boolean;
  // PR18072026 W-A — módulo Financeiro (3 níveis) + painel Avançado. Todos
  // operacionais: não exigem billing owner (mesmo padrão do cobrancaSimples).
  aceitaNaHora?: boolean;
  aceitaMensal?: boolean;
  aceitaFiado?: boolean;
  precoPorClienteAtivo?: boolean;
  cobrancaAutomatica?: boolean;
}

export interface LogisticaConfigDTO {
  // S7 (PR22072026-APP-SOUNDS) — ver comentário em `serializeConfig`: booleano
  // operacional (todo ator lê), nunca o saldo.
  creditosEsgotados: boolean;
  avisoWhatsEnabled: boolean;
  templateAviso: string | null;
  raioChegadaM: number;
  velocidadeMediaKmH: number;
  tempoParadaMin: number;
  cobrancaNaEntrega?: boolean;
  moduloRecoveryAtivo?: boolean;
  gerarDiaAutomatico: boolean;
  diasTrabalho: string | null;
  pixChave?: string | null;
  pixNome?: string | null;
  pixCidade?: string | null;
  avisoChegandoEnabled: boolean;
  avisoChegandoTemplate: string | null;
  avisoChegandoDistanciaM: number;
  // S2 COBRANÇA-WHATS — toggle do tenant + derivado da env (read-only pro front).
  cobrancaWhatsAtiva?: boolean;
  cobrancaWhatsDisponivel?: boolean;
  // S3 RESUMO-DIÁRIO — toggle+hora do tenant + derivado da env (read-only pro front).
  resumoDiarioAtivo?: boolean;
  resumoDiarioHora?: number;
  resumoDiarioDisponivel?: boolean;
  // S6 PORTAL-PEDIDO — toggle do tenant + token do link + derivado da env
  // (pedidoPublicoToken/Disponivel são read-only pro front; token muda só por
  // ensure/rotate nos endpoints admin).
  pedidoPublicoAtivo?: boolean;
  pedidoPublicoToken?: string | null;
  pedidoPublicoDisponivel?: boolean;
  trackingAtivo?: boolean;
  trackingDisponivel?: boolean;
  modoRotaPadrao?: LogisticaRouteMode;
  comprovanteFotoObrigatoria: boolean;
  comprovanteAssinaturaObrigatoria: boolean;
  comprovanteCodigoObrigatorio: boolean;
  // W1-BACKEND (18/07) — toggle "Cobrança simples na chegada" do app do entregador.
  // Operacional (não financeiro): precisa estar visível pro motorista, não só billing owner.
  cobrancaSimples: boolean;
  // PR18072026 W-A — módulo Financeiro (3 níveis) + painel Avançado. Todos
  // OPERACIONAIS (lidos por QUALQUER ator, mesmo padrão do cobrancaSimples):
  // o app do entregador usa pra decidir o nível da folha de chegada e quais
  // formas de pagamento mostrar no editar cliente.
  moduloFinanceiroAtivo: boolean;
  aceitaNaHora: boolean;
  aceitaMensal: boolean;
  aceitaFiado: boolean;
  precoPorClienteAtivo: boolean;
  cobrancaAutomatica: boolean;
}
