import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../messaging/conversations.service';
import { normalizeBrPhoneE164 } from '../messaging/whatsapp-channel';
import { isCobrancaWhatsEnabled } from './logistica-cobranca.flags';
import { pixBrCode } from './pix-brcode.util';

// ===========================================================================
// S2 COBRANÇA-WHATS (11/07) — a VOZ da cobrança da logística. Dois disparos:
//
//   1. avisarLancamento(companyId, chargeId) — hook chamado pelo LogisticaService
//      logo depois que um FinanceiroCharge de cliente final nasce 'pending'
//      (lancarCobranca / fecharMes). Fire-and-forget do lado de lá; todos os
//      gates vivem AQUI.
//   2. tick() — scheduler (anatomia clonada de contabil/obligation-scheduler:
//      OnModuleInit + setInterval + guard `running` + teto/dia em memória) que
//      varre charges 'pending' de sourceModule logistica_* com dueDate = HOJE e
//      manda 1 lembrete. Vencido DEPOIS disso é papel do hbx-recovery existente
//      (não duplica régua).
//
// ── DORMENTE POR PADRÃO (deploy inerte) ─────────────────────────────────────
// Gate em 2 chaves: HBX_COBRANCA_WHATS_ENABLED (env global, default OFF — sem
// ela o timer NEM é armado e todo método público é no-op imediato, zero leitura
// de banco) E LogisticaConfig.cobrancaWhatsAtiva (por tenant, default false,
// fail-closed em erro de leitura). Padrão canônico flagEnv() && cfg.X.
//
// ── REGRAS DURAS (cicatriz de chip banido) ──────────────────────────────────
// · Envio EXCLUSIVAMENTE via conversations.queueOutboundForCompany com
//   senderType 'system' (passa o gate anti-bot; disjuntor/outbox/1-número=
//   1-conexão são do caminho blindado). NUNCA webwhats-bridge direto.
// · Sem retry próprio, sem loop: falhou, registra e SEGUE.
// · Teto diário POR EMPRESA em memória (default 50): atingiu → para a varredura
//   daquela empresa no tick. O teto protege TRÁFEGO; a idempotência protege
//   duplicata.
// · Sem chip operacional o queueOutbound LANÇA → o aviso não sai e NÃO fica
//   marcado como enviado (o claim é desfeito): o lembrete tenta no próximo tick
//   e o aviso "ao lançar" perdido vira lembrete no vencimento — aceitável.
//
// ── IDEMPOTÊNCIA DURA (restart-proof) ───────────────────────────────────────
// 1 aviso por (chargeId, tipo) persistido em LogisticaCobrancaAviso
// (@@unique([chargeId, tipo])). A linha nasce como CLAIM antes do envio — o
// unique mata corrida entre ticks/processos; envio que falha apaga o claim
// (best-effort) pra próxima tentativa. Restart do container NUNCA reenvia.
// ===========================================================================

const TICK_MS = Number(process.env.HBX_COBRANCA_WHATS_TICK_MS || '') || 6 * 60 * 60 * 1000; // 6h
const RUNNER_FLAG = 'HBX_COBRANCA_WHATS_ENABLED';
// Freio de lote: um tick nunca processa mais que isso (o próximo tick continua).
const MAX_CHARGES_POR_TICK = 500;

/** Teto diário de avisos POR EMPRESA (lido a cada uso p/ testabilidade). */
function tetoDiaPorEmpresa(): number {
  const n = Number(process.env.HBX_COBRANCA_WHATS_TETO_DIA || '');
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 50;
}

export type CobrancaAvisoTipo = 'lancamento' | 'vencimento';

export interface CobrancaAvisoResult {
  status: 'enviado' | 'pulado' | 'falhou';
  motivo: string | null;
}

export interface CobrancaTickResult {
  enviados: number;
  pulados: number;
  falhas: number;
}

interface ChargeAlvo {
  id: string;
  companyId: number;
  amount: number;
  description: string | null;
  customerProfileId: string | null;
}

interface TenantCobrancaCfg {
  ativa: boolean;
  pixChave: string | null;
  pixNome: string | null;
  pixCidade: string | null;
}

function isUniqueViolation(e: any): boolean {
  return String(e?.code) === 'P2002';
}

/** Janela LOCAL do dia de `ref` (mesma semântica do resolveDayRange da rota). */
function rangeDoDia(ref: Date): { start: Date; end: Date } {
  const start = new Date(ref);
  start.setHours(0, 0, 0, 0);
  const end = new Date(ref);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** "R$ 12,50" — mesmo formato do resto do app (vírgula decimal). */
function fmtValorBR(v: number): string {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

@Injectable()
export class LogisticaCobrancaAvisoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticaCobrancaAvisoService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  // Teto diário POR EMPRESA em MEMÓRIA (padrão obligation-scheduler): zera na
  // virada do dia (chave = dia local) e no restart. Perder o contador no restart
  // é aceitável — quem impede reenvio é a tabela de idempotência, não o teto.
  private readonly contadorDia = new Map<number, { dia: string; count: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
  ) {}

  private get enabled(): boolean {
    return isCobrancaWhatsEnabled();
  }

  onModuleInit() {
    // DEPLOY INERTE: sem a env o timer NEM é armado — nenhum tick, nenhuma
    // leitura de banco, zero comportamento novo. (Ligar exige restart com a env,
    // que é exatamente como o dono opera flags na VPS.)
    if (!this.enabled) {
      this.logger.log(`[cobranca-whats] DORMENTE (${RUNNER_FLAG} off) — scheduler não armado`);
      return;
    }
    this.logger.log(`[cobranca-whats] scheduler LIGADO (${RUNNER_FLAG}) — tick ${TICK_MS}ms`);
    this.timer = setInterval(() => {
      void this.tick().catch((e) =>
        this.logger.warn(`[cobranca-whats] tick falhou: ${String((e as Error)?.message || e)}`),
      );
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ── LEMBRETE DE VENCIMENTO (tick diário) ───────────────────────────────────
  /**
   * Varre os charges 'pending' da logística com dueDate = HOJE e manda 1
   * lembrete por charge (idempotente por (chargeId,'vencimento') — rodar N ticks
   * no mesmo dia não duplica). Chamável direto (testes/manual).
   */
  async tick(referencia: Date = new Date()): Promise<CobrancaTickResult> {
    const zero: CobrancaTickResult = { enviados: 0, pulados: 0, falhas: 0 };
    if (!this.enabled) return zero; // flag OFF = no-op TOTAL (nem lê banco)
    if (this.running) return zero;
    this.running = true;
    try {
      const { start, end } = rangeDoDia(referencia);
      const charges: ChargeAlvo[] = await this.prisma.financeiroCharge.findMany({
        where: {
          status: 'pending',
          sourceModule: { startsWith: 'logistica_' },
          dueDate: { gte: start, lte: end },
          customerProfileId: { not: null },
        },
        select: { id: true, companyId: true, amount: true, description: true, customerProfileId: true },
        orderBy: [{ companyId: 'asc' }, { createdAt: 'asc' }],
        take: MAX_CHARGES_POR_TICK,
      });

      const result = { ...zero };
      if (charges.length === 0) return result;

      // Config por empresa lida UMA vez por tick (toggle + Pix na mesma leitura).
      const cfgPorEmpresa = new Map<number, TenantCobrancaCfg>();
      // Empresa que bateu o teto do dia: para a varredura dela (regra dura).
      const esgotadas = new Set<number>();

      for (const charge of charges) {
        if (esgotadas.has(charge.companyId)) {
          result.pulados += 1;
          continue;
        }
        let cfg = cfgPorEmpresa.get(charge.companyId);
        if (!cfg) {
          cfg = await this.lerConfigTenant(charge.companyId);
          cfgPorEmpresa.set(charge.companyId, cfg);
        }
        if (!cfg.ativa) {
          // Toggle do tenant OFF → pula a empresa inteira (charges dela caem aqui).
          result.pulados += 1;
          continue;
        }
        const r = await this.enviarAviso(charge, 'vencimento', cfg).catch((e: any) => {
          this.logger.warn(
            `[cobranca-whats] lembrete charge=${charge.id} falhou: ${String(e?.message || e)}`,
          );
          return { status: 'falhou', motivo: 'erro' } as CobrancaAvisoResult;
        });
        if (r.status === 'enviado') result.enviados += 1;
        else if (r.status === 'falhou') result.falhas += 1;
        else result.pulados += 1;
        if (r.motivo === 'teto_dia') esgotadas.add(charge.companyId);
      }

      if (result.enviados || result.falhas) {
        this.logger.log(
          `[cobranca-whats] tick — enviados=${result.enviados} pulados=${result.pulados} falhas=${result.falhas}`,
        );
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  // ── AVISO AO LANÇAR (hook do lancarCobranca/fecharMes) ─────────────────────
  /**
   * Aviso do charge recém-nascido 'pending'. Auto-protegido de ponta a ponta:
   * flag global OFF, toggle do tenant OFF, charge não-pendente/inexistente,
   * opt-out do cliente, sem telefone e já-avisado → tudo vira no-op ('pulado').
   * Falha de envio (ex.: sem chip) NÃO marca como enviado — o aviso perdido
   * vira lembrete no vencimento (documentado no S2). Nunca lança pro chamador.
   */
  async avisarLancamento(companyId: number, chargeId: string): Promise<CobrancaAvisoResult> {
    if (!this.enabled) return { status: 'pulado', motivo: 'flag_off' };
    const cid = Number(companyId);
    const id = String(chargeId || '').trim();
    if (!cid || !id) return { status: 'pulado', motivo: 'invalido' };

    const cfg = await this.lerConfigTenant(cid);
    if (!cfg.ativa) return { status: 'pulado', motivo: 'tenant_off' };

    const charge: ChargeAlvo | null = await this.prisma.financeiroCharge.findFirst({
      where: { id, companyId: cid, status: 'pending', customerProfileId: { not: null } },
      select: { id: true, companyId: true, amount: true, description: true, customerProfileId: true },
    });
    if (!charge) return { status: 'pulado', motivo: 'charge_nao_pendente' };

    return this.enviarAviso(charge, 'lancamento', cfg).catch((e: any) => {
      this.logger.warn(`[cobranca-whats] aviso lançamento charge=${id} falhou: ${String(e?.message || e)}`);
      return { status: 'falhou', motivo: 'erro' } as CobrancaAvisoResult;
    });
  }

  // ── MIOLO: consentimento → teto → claim → mensagem → caminho blindado ──────
  private async enviarAviso(
    charge: ChargeAlvo,
    tipo: CobrancaAvisoTipo,
    cfg: TenantCobrancaCfg,
  ): Promise<CobrancaAvisoResult> {
    // Consentimento POR CLIENTE (não consome teto nem cria claim):
    // opt-out explícito (avisarCobranca=false) OU sem telefone = silêncio.
    const cliente = await this.prisma.customerProfile.findFirst({
      where: { id: String(charge.customerProfileId), companyId: charge.companyId },
      select: { id: true, name: true, phoneNormalized: true, avisarCobranca: true },
    });
    if (!cliente) return { status: 'pulado', motivo: 'cliente_nao_encontrado' };
    if (cliente.avisarCobranca === false) return { status: 'pulado', motivo: 'opt_out' };
    const telefone = String(cliente.phoneNormalized || '').trim();
    if (!telefone) return { status: 'pulado', motivo: 'sem_telefone' };

    // Teto diário por empresa: atingiu → nada mais sai HOJE desta empresa
    // (o tick para a varredura dela ao ver este motivo).
    if (!this.aindaCabeHoje(charge.companyId)) return { status: 'pulado', motivo: 'teto_dia' };

    // IDEMPOTÊNCIA DURA — claim ANTES do envio: o @@unique([chargeId, tipo]) mata
    // corrida e duplicata (restart não reenvia). Já existe = já avisado/avisando.
    try {
      await this.prisma.logisticaCobrancaAviso.create({
        data: { companyId: charge.companyId, chargeId: charge.id, tipo },
      });
    } catch (e: any) {
      if (isUniqueViolation(e)) return { status: 'pulado', motivo: 'ja_avisado' };
      throw e;
    }

    // O claim passou → a tentativa vai sair: conta no teto (protege TRÁFEGO,
    // mesmo quando o envio falha adiante).
    this.consumirTetoDia(charge.companyId);

    const body = this.montarMensagem(charge, tipo, cliente.name, cfg);
    const to = normalizeBrPhoneE164(telefone) || telefone;
    try {
      // ÚNICO caminho permitido (regra dura de chip): queueOutboundForCompany com
      // senderType 'system' — disjuntor, 1-número=1-conexão, outbox e gate de
      // conexão viva são de lá. Sem chip operacional → LANÇA (tratado abaixo).
      await this.conversations.queueOutboundForCompany(charge.companyId, {
        to,
        contactId: to,
        body,
        messageType: 'text',
        sourceModule: 'logistica_cobranca',
        senderType: 'system',
        variables: { module: 'logistica', event: `cobranca_${tipo}`, chargeId: charge.id },
        flowState: { botActive: false, humanAssigned: false, flowResult: null },
      });
    } catch (e: any) {
      // Envio NÃO saiu → desfaz o claim (best-effort) pra o próximo tick poder
      // tentar. Sem retry próprio, sem loop: falhou, registra e SEGUE. Se o
      // delete falhar, o viés é NÃO reenviar (anti-spam > aviso perdido).
      await this.prisma.logisticaCobrancaAviso
        .delete({ where: { chargeId_tipo: { chargeId: charge.id, tipo } } })
        .catch(() => undefined);
      this.logger.warn(
        `[cobranca-whats] envio ${tipo} charge=${charge.id} company=${charge.companyId} falhou: ${String(e?.message || e)}`,
      );
      return { status: 'falhou', motivo: 'envio' };
    }
    return { status: 'enviado', motivo: null };
  }

  /**
   * Toggle + Pix do tenant numa leitura só. FAIL-CLOSED: config ausente ou erro
   * de leitura = { ativa:false } — feature opt-in nunca "liga" por falha.
   */
  private async lerConfigTenant(companyId: number): Promise<TenantCobrancaCfg> {
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { cobrancaWhatsAtiva: true, pixChave: true, pixNome: true, pixCidade: true },
      });
      return {
        ativa: !!cfg?.cobrancaWhatsAtiva,
        pixChave: cfg?.pixChave ?? null,
        pixNome: cfg?.pixNome ?? null,
        pixCidade: cfg?.pixCidade ?? null,
      };
    } catch (e: any) {
      this.logger.warn(`[cobranca-whats] lerConfig company=${companyId} falhou: ${String(e?.message || e)}`);
      return { ativa: false, pixChave: null, pixNome: null, pixCidade: null };
    }
  }

  /**
   * Mensagem PT-BR CURTA: valor + referência (a MESMA description do extrato) +
   * Pix copia-e-cola do tenant (BR Code EMV, port do gerador F1). Sem chave Pix
   * configurada o aviso ainda sai — só sem o bloco do Pix. Sem emoji.
   */
  private montarMensagem(
    charge: ChargeAlvo,
    tipo: CobrancaAvisoTipo,
    nomeCliente: string | null,
    cfg: TenantCobrancaCfg,
  ): string {
    const nome = String(nomeCliente || '').trim();
    const valor = fmtValorBR(charge.amount);
    const ref = String(charge.description || 'Cobrança').trim();
    const cabecalho =
      tipo === 'vencimento'
        ? `${nome ? `Olá, ${nome}! ` : 'Olá! '}Vence hoje: ${ref} — ${valor}.`
        : `${nome ? `Olá, ${nome}! ` : 'Olá! '}Cobrança registrada: ${ref} — ${valor}.`;
    const codigo = cfg.pixChave
      ? pixBrCode({ chave: cfg.pixChave, valor: charge.amount, nome: cfg.pixNome, cidade: cfg.pixCidade })
      : '';
    return codigo ? `${cabecalho}\nPix copia e cola:\n${codigo}` : cabecalho;
  }

  // ── Teto diário por empresa (em memória; chave = dia local) ────────────────
  private diaLocal(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private aindaCabeHoje(companyId: number): boolean {
    const dia = this.diaLocal();
    const atual = this.contadorDia.get(companyId);
    const count = atual && atual.dia === dia ? atual.count : 0;
    return count < tetoDiaPorEmpresa();
  }

  private consumirTetoDia(companyId: number): void {
    const dia = this.diaLocal();
    const atual = this.contadorDia.get(companyId);
    const count = atual && atual.dia === dia ? atual.count : 0;
    this.contadorDia.set(companyId, { dia, count: count + 1 });
  }
}
