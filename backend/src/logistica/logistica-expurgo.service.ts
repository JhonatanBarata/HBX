import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { expurgarNaoProcessado, JANELA_EXPURGO_MS } from './logistica-expurgo.util';

/**
 * ⛔ A LEI DO DESAPARECER, rodando (10/08/2026 — lei absoluta do dono).
 *
 * A regra e o porquê moram em `logistica-expurgo.util.ts`. Aqui é só o relógio.
 *
 * 🔴 **RODA PRA TODA EMPRESA, sem opt-in — e é o ÚNICO timer desta casa que
 * escreve sozinho.** O irmão mais velho, o `sweepGerarDiaAutomatico`, MORREU em
 * 10/08: ele CRIAVA o dia (51 entregas por passada, a cada boot do backend) numa
 * casa cujo contrato é "quem grava é o dedo". A diferença de propósito é essa, e
 * ela decide quem pode ter timer: **este só APAGA o que já está morto** (não
 * processado, passada a janela de estorno), e apagar lixo não é decisão comercial
 * de tenant nenhum — lei com chavinha fica desligada justamente em quem mais
 * precisa dela.
 *
 * Falha de uma empresa não derruba as outras — e nunca lança pra fora: infra de
 * fundo que explode no boot derruba o backend inteiro por causa de linha morta.
 */
const EXPURGO_INTERVALO_MS = 24 * 60 * 60 * 1000;
/** respiro pós-boot: o backend acabou de subir e tem trabalho de verdade na fila. */
const EXPURGO_BOOT_DELAY_MS = 120_000;

@Injectable()
export class LogisticaExpurgoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticaExpurgoService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  private rodando = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.passada('interval'), EXPURGO_INTERVALO_MS);
    this.timer.unref?.();
    this.bootTimer = setTimeout(() => void this.passada('startup'), EXPURGO_BOOT_DELAY_MS);
    this.bootTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.bootTimer) clearTimeout(this.bootTimer);
    this.timer = null;
    this.bootTimer = null;
  }

  /**
   * Uma passada por TODAS as empresas. Pública porque a prova a chama direto — e
   * porque um dia alguém vai querer rodá-la à mão depois de um incidente.
   */
  async passada(gatilho: 'startup' | 'interval' | 'manual' = 'manual'): Promise<{
    empresas: number; entregas: number; rotas: number; sessoes: number;
  }> {
    // Trava de reentrância: a passada de 24 h e a de boot podem se cruzar num
    // restart, e duas varreduras simultâneas na mesma empresa só disputam lock.
    if (this.rodando) return { empresas: 0, entregas: 0, rotas: 0, sessoes: 0 };
    this.rodando = true;
    const total = { empresas: 0, entregas: 0, rotas: 0, sessoes: 0 };
    try {
      let empresas: Array<{ companyId: number }> = [];
      try {
        empresas = await (this.prisma as any).logisticaConfig.findMany({ select: { companyId: true } });
      } catch (e: any) {
        this.logger.warn(`[expurgo] não consegui listar as empresas (${gatilho}): ${String(e?.message || e)}`);
        return total;
      }
      for (const { companyId } of empresas) {
        try {
          const r = await expurgarNaoProcessado(this.prisma, companyId);
          total.entregas += r.entregasApagadas;
          total.rotas += r.rotasApagadas;
          total.sessoes += r.sessoesEncerradas;
          total.empresas += 1;
          // Log SÓ quando houve o que expirar: passada silenciosa é o estado normal
          // de uma casa limpa, e log de "0 de 0" todo dia treina todo mundo a ignorar.
          if (r.entregasApagadas || r.rotasApagadas || r.sessoesEncerradas) {
            this.logger.log(
              `[expurgo] company=${companyId}: ${r.entregasApagadas} entrega(s) e ${r.rotasApagadas} rota(s) ` +
                `que nunca foram processadas desapareceram; ${r.sessoesEncerradas} sessão(ões) encerrada(s). ` +
                `Janela: ${Math.round(JANELA_EXPURGO_MS / 3600000)} h.`,
            );
          }
        } catch (e: any) {
          this.logger.warn(`[expurgo] company=${companyId} falhou (${gatilho}): ${String(e?.message || e)}`);
        }
      }
    } finally {
      this.rodando = false;
    }
    return total;
  }
}
