import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * WEBWHATS-ARQ3 Sprint 3 — Fonte única do estado de conexão do chip.
 *
 * PROBLEMA ($): o estado de UM chip vivia em ~5 lugares que divergem — socket do motor (a
 * VERDADE), `Instance.connectionStatus` do motor, a sessão `WhatsAppConnectionSession` do app
 * (com `connectedAt` que não atualizava em reconexão), `Company.whatsappModalStatus` e o cache do
 * front. Resultado: "Conectado fantasma" — o painel Equipe mostra Conectado com o chip morto, o
 * "Derrubar conexão" some quando mais precisa, o selo do admin mente. Cada bug vira suporte +
 * desconfiança e a vendedora perde o dia achando que o problema é o cliente.
 *
 * DESENHO-ALVO: a VERDADE continua sendo o motor ao vivo; o app mantém UMA projeção
 * (`WhatsAppConnectionSession`) com carimbo de frescor (`lastReconciledAt`) e o último estado do
 * socket (`motorState`). Essa projeção é alimentada por DOIS caminhos que já existem:
 *   (a) eventos `connection.update` da espinha durável (push) — `MessagingService`;
 *   (b) o reconciler central (pull, com cooldown) — `WhatsAppModalService`.
 * Todo consumidor de estado (painéis, selos, "Derrubar conexão") lê a PROJEÇÃO via os helpers
 * PUROS deste service — nunca mais um `status === 'active'` cru que mente.
 *
 * ESCOPO DURO (guardrail ARQ3 S3): este service é SÓ leitura/projeção. NÃO conecta, NÃO
 * reconecta, NÃO mexe no disjuntor nem em "1 número = 1 conexão". A única ESCRITA que faz é
 * carimbar `lastReconciledAt`/`motorState` (e opcionalmente re-bumpar `connectedAt` numa
 * transição close→open) numa sessão que os caminhos existentes JÁ resolveram e persistiram.
 */

/** Estados de socket que o motor pode reportar (normalizados). `open` = vivo. */
export type MotorSocketState = 'open' | 'close' | 'connecting' | 'unknown';

/** Forma mínima de uma sessão que os leitores precisam para derivar frescor/liveness. */
export interface ProjectionSessionView {
  status: string | null;
  connectedAt: Date | string | null;
  lastReconciledAt: Date | string | null;
  motorState: string | null;
}

/** Resultado derivado que os consumidores usam no lugar de `status === 'active'`. */
export interface DerivedConnectionState {
  /** Verdade única: o motor tem uma sessão viva para este chip AGORA? */
  live: boolean;
  /** Estado normalizado do socket do motor. */
  motorState: MotorSocketState;
  /** Idade do carimbo de frescor em segundos (null = nunca reconciliado). */
  seenAgoSeconds: number | null;
  /** O carimbo está velho demais para confiar? (projeção sem confirmação recente do motor). */
  stale: boolean;
}

@Injectable()
export class WhatsAppConnectionProjectionService {
  private readonly logger = new Logger(WhatsAppConnectionProjectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Janela padrão de frescor: se o app não reconcilia a sessão contra o motor há mais que isto,
   * a projeção é considerada STALE (o leitor deixa de confiar no `active` cru). Configurável por
   * env (segundos), com piso/teto sãos. Default 180s = 3 min: o webhook (push) chega em segundos
   * e o reconciler (pull) roda no caminho quente, então uma sessão viva é recarimbada bem antes
   * disso; passar de 3 min sem NENHUM sinal do motor é sinal honesto de "não sei, não afirmo vivo".
   */
  static freshnessWindowSeconds(): number {
    const raw = Number(process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS || 180);
    return Number.isFinite(raw) ? Math.max(30, Math.min(3600, Math.trunc(raw))) : 180;
  }

  /** Normaliza qualquer string de estado de socket (do motor ou do rawStatus) para o vocabulário fixo. */
  static normalizeMotorState(value: unknown): MotorSocketState {
    const v = String(value ?? '').trim().toLowerCase();
    if (!v) return 'unknown';
    // O motor (Baileys) fala open/close/connecting; o app fala connected/disconnected/reconnecting.
    if (v === 'open' || v === 'connected' || v === 'active') return 'open';
    if (v === 'connecting' || v === 'reconnecting' || v === 'pairing' || v === 'qr' || v === 'waiting_qr') return 'connecting';
    if (v === 'close' || v === 'closed' || v === 'disconnected' || v === 'offline' || v === 'error') return 'close';
    return 'unknown';
  }

  private static toDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /**
   * DERIVA o estado de conexão a partir da PROJEÇÃO — a única função que os consumidores devem
   * usar para decidir "está conectado?". Regra (fonte = motor ao vivo, carimbada na projeção):
   *   - `live` só é `true` quando a sessão está `active` E o carimbo de frescor NÃO está velho E
   *     o `motorState` não diz explicitamente `close`. Sem carimbo (`lastReconciledAt` null) NÃO
   *     derruba sozinho o `active` (compat retro: sessões pré-migração ainda não têm carimbo — o
   *     push/pull recarimba na primeira reconciliação), mas o consumidor recebe `stale: true`
   *     para poder sinalizar "visto há —" e oferecer reconferir.
   *   - `motorState` explicitamente `close` sempre vence: mata o "Conectado fantasma".
   */
  static derive(session: ProjectionSessionView | null | undefined, nowMs: number = Date.now()): DerivedConnectionState {
    if (!session) {
      return { live: false, motorState: 'unknown', seenAgoSeconds: null, stale: true };
    }
    const status = String(session.status ?? '').trim().toLowerCase();
    const isActive = status === 'active';
    const motorState = WhatsAppConnectionProjectionService.normalizeMotorState(session.motorState);
    const reconciledAt = WhatsAppConnectionProjectionService.toDate(session.lastReconciledAt);
    const seenAgoSeconds = reconciledAt ? Math.max(0, Math.floor((nowMs - reconciledAt.getTime()) / 1000)) : null;
    const windowS = WhatsAppConnectionProjectionService.freshnessWindowSeconds();
    // "stale" = não confirmamos a verdade recentemente. Sem carimbo OU carimbo velho.
    const stale = seenAgoSeconds === null || seenAgoSeconds > windowS;

    // Motor diz close explícito → morto, sem discussão (fantasma resolvido).
    if (motorState === 'close') {
      return { live: false, motorState, seenAgoSeconds, stale };
    }

    // active + carimbo fresco + motor não-close → vivo de verdade.
    if (isActive && !stale) {
      return { live: true, motorState, seenAgoSeconds, stale: false };
    }

    // active mas SEM carimbo (retrocompat pré-migração): mantém o legado `active`=vivo, porém
    // marca stale para o consumidor sinalizar "visto há —". Não regride comportamento existente.
    if (isActive && seenAgoSeconds === null) {
      return { live: true, motorState, seenAgoSeconds: null, stale: true };
    }

    // active + carimbo VELHO → não afirma vivo (é justamente o fantasma). live=false, stale=true.
    return { live: false, motorState, seenAgoSeconds, stale };
  }

  /** Atalho booleano para os muitos call-sites que só perguntam "está vivo?". */
  static isLive(session: ProjectionSessionView | null | undefined, nowMs: number = Date.now()): boolean {
    return WhatsAppConnectionProjectionService.derive(session, nowMs).live;
  }

  /**
   * WRITER ÚNICO da projeção. Carimba `lastReconciledAt` (= agora) e `motorState` numa sessão que
   * os caminhos existentes JÁ resolveram/persistiram (por id). NÃO cria/derruba/reconecta sessão —
   * isso continua sendo responsabilidade dos caminhos de conexão (que este sprint não toca).
   *
   * `bumpConnectedAtOnOpen`: quando o motor reporta `open` e o caller sabe que houve transição
   * close→open, re-bumpa o `connectedAt` para AGORA (mata a "data velha" que o freio de warm-up
   * do S4 lia errado). Best-effort/fire-and-forget: falha de banco só loga, nunca crasha o
   * caminho de conexão que chamou.
   */
  async stampProjection(
    sessionId: string,
    motorState: string | null | undefined,
    opts: { at?: Date; bumpConnectedAtOnOpen?: boolean } = {},
  ): Promise<void> {
    const id = String(sessionId || '').trim();
    if (!id) return;
    const normalized = WhatsAppConnectionProjectionService.normalizeMotorState(motorState);
    const at = opts.at instanceof Date ? opts.at : new Date();
    const data: { lastReconciledAt: Date; motorState: string; connectedAt?: Date } = {
      lastReconciledAt: at,
      motorState: normalized,
    };
    if (opts.bumpConnectedAtOnOpen && normalized === 'open') {
      data.connectedAt = at;
    }
    try {
      await this.prisma.whatsAppConnectionSession.update({ where: { id }, data });
    } catch (error) {
      this.logger.warn(
        `Falha ao carimbar projeção da sessão ${id} (motorState=${normalized}): ${String((error as any)?.message || error)}`,
      );
    }
  }
}
