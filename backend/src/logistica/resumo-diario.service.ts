import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../messaging/conversations.service';
import { normalizeBrPhoneE164 } from '../messaging/whatsapp-channel';
import { LogisticaService } from './logistica.service';
import { saudacaoPorHorario } from './logistica-config.service';
import { isResumoDiarioEnabled } from './resumo-diario.flags';

// ===========================================================================
// S3 RESUMO-DIÁRIO (11/07) — toda manhã o DONO do tenant recebe no WhatsApp
// dele um resumo curto do negócio (entregas na rota hoje, entregues/recebido
// ontem, quem deve), enviado pelo chip DA PRÓPRIA EMPRESA. Retenção pura.
//
// Anatomia clonada de contabil/obligation-scheduler + S2 cobranca-aviso:
// OnModuleInit/OnModuleDestroy + setInterval + guard `running` + tick ~10min
// que checa a HORA-ALVO por empresa (LogisticaConfig.resumoDiarioHora).
//
// ── DORMENTE POR PADRÃO (deploy inerte) ─────────────────────────────────────
// Gate em 2 chaves: HBX_RESUMO_DIARIO_ENABLED (env global, default OFF — sem
// ela o timer NEM é armado e o tick é no-op imediato, zero leitura de banco) E
// LogisticaConfig.resumoDiarioAtivo (por tenant, default false — o findMany do
// tick só enxerga quem ligou). Padrão canônico flagEnv() && cfg.X.
//
// ── REGRAS DURAS (cicatriz de chip banido) ──────────────────────────────────
// · Destino = Company.contactPhone SOMENTE com contactPhoneVerifiedAt != null
//   (LEI DO VENDEDOR: valores financeiros só saem porque o destino é o DONO).
//   Sem telefone verificado → pula em silêncio (log debug). SEM fallback pro
//   telefone de User.
// · Envio EXCLUSIVAMENTE via conversations.queueOutboundForCompany com
//   senderType 'system' (disjuntor/outbox/1-número=1-conexão são do caminho
//   blindado). NUNCA bridge cru.
// · TETO POR CONSTRUÇÃO: 1 resumo/empresa/dia. A marca resumoDiarioUltimoEnvio
//   é PERSISTIDA (só envia se < hoje 00:00 → restart NÃO reenvia) e SÓ é
//   gravada quando o queueOutbound ACEITA. Falha de envio → loga e o tick
//   seguinte do MESMO dia faz NO MÁXIMO 1 retry (2 tentativas/dia em memória),
//   depois desiste até amanhã. Sem loop.
// · Conteúdo 100% read-only e de métodos que JÁ EXISTEM (resumoDia /
//   saldosFinanceiro do LogisticaService + 1 count leve de rota) — nenhuma
//   query pesada nova. Sem moduloFinanceiroAtivo, NENHUM valor vai na mensagem.
// ===========================================================================

const TICK_MS = Number(process.env.HBX_RESUMO_DIARIO_TICK_MS || '') || 10 * 60 * 1000; // 10min
const RUNNER_FLAG = 'HBX_RESUMO_DIARIO_ENABLED';
// Freio de lote: um tick nunca processa mais empresas que isso (o próximo continua).
const MAX_EMPRESAS_POR_TICK = 500;
// 1 envio + no máximo 1 retry no MESMO dia (contador em memória; zera na virada
// do dia e no restart — quem impede reenvio de verdade é a marca persistida).
const MAX_TENTATIVAS_DIA = 2;

export interface ResumoDiarioTickResult {
  enviados: number;
  pulados: number;
  falhas: number;
}

interface ConfigAlvo {
  companyId: number;
  resumoDiarioHora: number;
  resumoDiarioUltimoEnvio: Date | null;
  moduloFinanceiroAtivo: boolean;
}

/** Meia-noite LOCAL do dia de `ref` (mesma semântica do rangeDoDia do S2). */
function inicioDoDiaLocal(ref: Date): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Janela LOCAL do dia de `ref` (cópia do padrão resolveDayRange/rangeDoDia da casa). */
function rangeDoDia(ref: Date): { start: Date; end: Date } {
  const start = inicioDoDiaLocal(ref);
  const end = new Date(ref);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** "YYYY-MM-DD" LOCAL (chave do contador de tentativas + data pro resumoDia). */
function diaLocalISO(ref: Date): string {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(ref.getDate()).padStart(2, '0')}`;
}

/** "R$ 12,50" — mesmo formato do resto do app (vírgula decimal). */
function fmtValorBR(v: number): string {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

/** Hora-alvo defensiva: fora de 0..23 (ou lixo) volta pro default 7. */
function horaAlvo(raw: unknown): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return 7;
  return Math.min(23, Math.max(0, n));
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

@Injectable()
export class ResumoDiarioService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResumoDiarioService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  // Tentativas de ENVIO por empresa em MEMÓRIA (chave = dia local). Só a chamada
  // real do queueOutbound consome tentativa — hora-alvo/idempotência/sem-telefone
  // são "pulado", não tentativa. Perder o contador no restart é aceitável: quem
  // impede reenvio é resumoDiarioUltimoEnvio (persistido), não o contador.
  private readonly tentativasDia = new Map<number, { dia: string; count: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly logistica: LogisticaService,
  ) {}

  private get enabled(): boolean {
    return isResumoDiarioEnabled();
  }

  onModuleInit() {
    // DEPLOY INERTE: sem a env o timer NEM é armado — nenhum tick, nenhuma
    // leitura de banco, zero comportamento novo (padrão S2 cobranca-aviso).
    if (!this.enabled) {
      this.logger.log(`[resumo-diario] DORMENTE (${RUNNER_FLAG} off) — scheduler não armado`);
      return;
    }
    this.logger.log(`[resumo-diario] scheduler LIGADO (${RUNNER_FLAG}) — tick ${TICK_MS}ms`);
    this.timer = setInterval(() => {
      void this.tick().catch((e) =>
        this.logger.warn(`[resumo-diario] tick falhou: ${String((e as Error)?.message || e)}`),
      );
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ── TICK (~10min): checa hora-alvo por empresa opt-in ───────────────────────
  /**
   * Varre as empresas com resumoDiarioAtivo=true e, pra cada uma que já passou
   * da hora-alvo E ainda não recebeu o resumo de hoje, monta e envia 1 mensagem
   * pelo caminho blindado. Chamável direto (testes/manual) com `referencia`
   * injetável (relógio LOCAL do servidor; VPS = America/Sao_Paulo).
   */
  async tick(referencia: Date = new Date()): Promise<ResumoDiarioTickResult> {
    const zero: ResumoDiarioTickResult = { enviados: 0, pulados: 0, falhas: 0 };
    if (!this.enabled) return zero; // flag OFF = no-op TOTAL (nem lê banco)
    if (this.running) return zero;
    this.running = true;
    try {
      // Só quem LIGOU o toggle entra (tenant OFF nem aparece — fail-closed por
      // construção). Tabela pequena (1 linha/empresa) + freio de lote.
      const alvos: ConfigAlvo[] = await this.prisma.logisticaConfig.findMany({
        where: { resumoDiarioAtivo: true },
        select: {
          companyId: true,
          resumoDiarioHora: true,
          resumoDiarioUltimoEnvio: true,
          moduloFinanceiroAtivo: true,
        },
        orderBy: { companyId: 'asc' },
        take: MAX_EMPRESAS_POR_TICK,
      });

      const result = { ...zero };
      if (alvos.length === 0) return result;

      const hoje00 = inicioDoDiaLocal(referencia);
      for (const alvo of alvos) {
        // Best-effort POR EMPRESA: uma empresa quebrada nunca derruba o tick
        // das outras (padrão obligation-scheduler).
        const r = await this.processarEmpresa(alvo, referencia, hoje00).catch((e: any) => {
          this.logger.warn(
            `[resumo-diario] company=${alvo.companyId} falhou: ${String(e?.message || e)}`,
          );
          return 'falhou' as const;
        });
        if (r === 'enviado') result.enviados += 1;
        else if (r === 'falhou') result.falhas += 1;
        else result.pulados += 1;
      }

      if (result.enviados || result.falhas) {
        this.logger.log(
          `[resumo-diario] tick — enviados=${result.enviados} pulados=${result.pulados} falhas=${result.falhas}`,
        );
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  // ── MIOLO: hora-alvo → idempotência → teto → destino verificado → envio ─────
  private async processarEmpresa(
    alvo: ConfigAlvo,
    referencia: Date,
    hoje00: Date,
  ): Promise<'enviado' | 'pulado' | 'falhou'> {
    const companyId = Number(alvo.companyId);

    // HORA-ALVO: tick antes da hora local configurada NÃO envia. `>=` (não `===`)
    // de propósito: restart/downtime na janela exata não perde o resumo do dia —
    // sai no primeiro tick DEPOIS da hora (a idempotência abaixo segura o resto).
    if (referencia.getHours() < horaAlvo(alvo.resumoDiarioHora)) return 'pulado';

    // IDEMPOTÊNCIA DURA (persistida): já enviou hoje → nada. Restart não reenvia.
    const ultimo = alvo.resumoDiarioUltimoEnvio ? new Date(alvo.resumoDiarioUltimoEnvio) : null;
    if (ultimo && !Number.isNaN(ultimo.getTime()) && ultimo >= hoje00) return 'pulado';

    // Teto de tentativas do MESMO dia (memória): 1 envio + no máx 1 retry,
    // depois desiste até amanhã. Sem retry em loop — regra dura do sprint.
    if (!this.aindaTentaHoje(companyId, referencia)) return 'pulado';

    // DESTINO: telefone do DONO no cadastro, SOMENTE verificado por OTP
    // (contactPhoneVerifiedAt != null). Sem fallback pro telefone de User.
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { contactPhone: true, contactPhoneVerifiedAt: true },
    });
    const telefone = String(company?.contactPhone || '').trim();
    if (!telefone || !company?.contactPhoneVerifiedAt) {
      this.logger.debug(`[resumo-diario] company=${companyId} sem telefone verificado — pulada em silêncio`);
      return 'pulado';
    }

    const body = await this.montarResumo(companyId, referencia, !!alvo.moduloFinanceiroAtivo);

    // Daqui pra frente é TENTATIVA real: consome o teto ANTES do envio (falha
    // adiante também conta — 2 falhas no dia = silêncio até amanhã).
    this.consumirTentativa(companyId, referencia);

    const to = normalizeBrPhoneE164(telefone) || telefone;
    try {
      // ÚNICO caminho permitido (regra dura de chip): queueOutboundForCompany
      // com senderType 'system' — disjuntor, 1-número=1-conexão, outbox e gate
      // de conexão viva são de lá. Sem chip operacional → LANÇA (tratado abaixo).
      await this.conversations.queueOutboundForCompany(companyId, {
        to,
        contactId: to,
        body,
        messageType: 'text',
        sourceModule: 'resumo_diario',
        senderType: 'system',
        variables: { module: 'logistica', event: 'resumo_diario', dia: diaLocalISO(referencia) },
        flowState: { botActive: false, humanAssigned: false, flowResult: null },
      });
    } catch (e: any) {
      // Envio NÃO saiu → NÃO grava a marca (o retry do próximo tick do MESMO
      // dia cobre; a 2ª falha desiste até amanhã). Loga e SEGUE — zero loop.
      this.logger.warn(
        `[resumo-diario] envio company=${companyId} falhou: ${String(e?.message || e)}`,
      );
      return 'falhou';
    }

    // queueOutbound ACEITOU → grava a marca persistida (regra do sprint: só
    // marcar ultimoEnvio quando o envio for aceito). Se ESTA gravação falhar, o
    // teto em memória (2/dia) ainda limita o pior caso a 1 duplicata.
    await this.prisma.logisticaConfig.update({
      where: { companyId },
      data: { resumoDiarioUltimoEnvio: referencia },
    });
    return 'enviado';
  }

  // ── CONTEÚDO: PT-BR curto (3 linhas), só métodos/consultas que já existem ───
  /**
   * Monta o resumo com dados 100% read-only:
   *   · hoje na rota  = count leve de entregas ABERTAS ('agendada'|'em_rota',
   *     scheduledAt no dia OU null) — MESMA janela/status do motor de rota.
   *   · ontem         = resumoDia(companyId, ontem) do LogisticaService
   *     (entregues + recebido) — método EXISTENTE, zero query nova.
   *   · em aberto     = saldosFinanceiro(companyId) — fonte única do "quem me
   *     deve" (já vem FAIL-CLOSED pelo moduloFinanceiroAtivo de lá).
   * LEI DO VENDEDOR/M4: sem moduloFinanceiroAtivo NENHUM valor entra na mensagem
   * (nem o "recebido ontem" — só contagens de entrega).
   */
  private async montarResumo(companyId: number, referencia: Date, moduloFinanceiroAtivo: boolean): Promise<string> {
    const { start, end } = rangeDoDia(referencia);
    const ontem = new Date(referencia);
    ontem.setDate(ontem.getDate() - 1);

    const naRotaHoje = await this.prisma.entrega.count({
      where: {
        companyId,
        status: { in: ['agendada', 'em_rota'] },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
    });

    const resumoOntem = await this.logistica.resumoDia(companyId, diaLocalISO(ontem));

    const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);
    const linhas: string[] = [];
    linhas.push(
      `${saudacaoPorHorario(referencia)}! Resumo de hoje: ${naRotaHoje} ${plural(naRotaHoje, 'entrega', 'entregas')} na rota.`,
    );

    if (moduloFinanceiroAtivo) {
      linhas.push(
        `Ontem: ${resumoOntem.entregues} ${plural(resumoOntem.entregues, 'entregue', 'entregues')}, ${fmtValorBR(resumoOntem.recebidoHoje)} recebidos.`,
      );
      const saldos = await this.logistica.saldosFinanceiro(companyId);
      const totalAberto = round2(saldos.clientes.reduce((s, c) => s + (Number(c.saldoAberto) || 0), 0));
      const devedores = saldos.clientes.length;
      if (devedores > 0) {
        linhas.push(`Em aberto: ${fmtValorBR(totalAberto)} (${devedores} ${plural(devedores, 'cliente', 'clientes')}).`);
      }
    } else {
      // Financeiro do tenant OFF → SÓ contagens, nenhum R$ (regra do M4).
      linhas.push(`Ontem: ${resumoOntem.entregues} ${plural(resumoOntem.entregues, 'entregue', 'entregues')}.`);
    }

    return linhas.join('\n');
  }

  // ── Teto de tentativas por empresa (em memória; chave = dia local) ──────────
  private aindaTentaHoje(companyId: number, ref: Date): boolean {
    const dia = diaLocalISO(ref);
    const atual = this.tentativasDia.get(companyId);
    const count = atual && atual.dia === dia ? atual.count : 0;
    return count < MAX_TENTATIVAS_DIA;
  }

  private consumirTentativa(companyId: number, ref: Date): void {
    const dia = diaLocalISO(ref);
    const atual = this.tentativasDia.get(companyId);
    const count = atual && atual.dia === dia ? atual.count : 0;
    this.tentativasDia.set(companyId, { dia, count: count + 1 });
  }
}
