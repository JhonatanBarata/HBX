import { Injectable, Logger } from '@nestjs/common';

import {
  isInsideWorkingHours,
  moveIntoWorkingWindow,
  normalizeTimeHHMM,
  type BusinessWindow,
} from '../vendas/business-hours.util';
import { COLD_GATE_SOURCE_MODULES } from './wa-cold-contact-gate.service';

/**
 * TRAVA DE HORÁRIO DO DISPARO AUTOMÁTICO — ordem do dono (31/07/2026, 03:20).
 *
 * A LEI: "mesmo que eu peça o diurno, se estiver fora do horário o trabalho vai pro
 * noturno automaticamente — e clientes também devem ser barrados, pela lei de disparos
 * fora de horário". Ou seja: robô não fala fora da janela comercial da empresa. Nunca.
 *
 * O BURACO QUE ISTO FECHA: o motor de slots (agenda-disparo.service) só respeita a janela
 * na hora de PLANEJAR. No ponto de ENVIO não existia nenhuma pergunta sobre horário — o
 * freio de vazão conta mensagens/minuto, o cold gate conta primeiros contatos/dia, e
 * nenhum dos dois olha o relógio. Uma inscrição que ficasse pendurada (retry, backlog,
 * fila represada, deploy no meio da noite) saía às 03:00 sem nada segurar. Mensagem
 * comercial de madrugada é o vetor de denúncia mais barato que existe — e denúncia é o
 * que expulsa chip.
 *
 * QUEM É BARRADO: disparo AUTOMÁTICO (bot/cadência/campanha) de fonte comercial.
 *   - Automático fora da janela  -> REAGENDA para a próxima abertura (nunca descarta).
 *   - Humano                     -> LIVRE. Gente responde cliente às 21h e isso é certo;
 *                                   a lei do dono é sobre disparo automático.
 *   - Módulo não-comercial       -> fora do gate (logística/recovery/financeiro mandam
 *                                   transacional para cliente conhecido — mesma régua de
 *                                   escopo do cold gate, COLD_GATE_SOURCE_MODULES).
 *
 * FONTE DA JANELA: `VendasComercialConfig` da empresa (a MESMA linha que o motor de slots
 * obedece), com a janela da campanha como rede pra tenant legado que só tem campanha.
 * Uma pergunta, uma fonte — foi divergência de fonte que já custou o "teto tinha 3
 * números" (memória [[teto-da-tela-mentia]]).
 *
 * FLAG: HBX_WA_JANELA_GATE_ENABLED — default LIGADO. Kill-switch explícito
 * ('0'/'false'/'off'/'no'), independente do cold gate: desligar um NÃO desliga o outro.
 */

export type WaJanelaDecision =
  | { allow: true }
  | {
      allow: false;
      action: 'reschedule';
      reason: 'fora_da_janela';
      retryAfterMs: number;
      proximaAberturaAt: Date;
      detail: string;
    };

type PrismaLike = {
  vendasComercialConfig?: { findUnique: (args: any) => Promise<any> };
  vendasAutomationCampaign?: { findFirst: (args: any) => Promise<any> };
};

export const JANELA_PADRAO: BusinessWindow = {
  workingHoursStart: '08:00',
  workingHoursEnd: '18:00',
};

// Espalha as retomadas na abertura: 40 mensagens seguradas de madrugada não podem
// estourar todas às 08:00:00 cravado — isso é carimbo de robô com outro nome.
const JITTER_ABERTURA_MS = 5 * 60 * 1000;

export function janelaGateEnabledFromEnv(): boolean {
  const raw = String(process.env.HBX_WA_JANELA_GATE_ENABLED ?? '').trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(raw);
}

function formatarHoraBr(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * A decisão PURA — sem banco, sem relógio implícito, sem aleatoriedade (o jitter é do
 * serviço). É esta função que os testes cobram.
 */
export function decidirJanelaComercial(input: {
  now: Date;
  janela: BusinessWindow;
  /** false = clique de gente. Gente fala quando quiser. */
  automatico: boolean;
}): WaJanelaDecision {
  if (!input.automatico) return { allow: true };
  if (isInsideWorkingHours(input.now, input.janela)) return { allow: true };

  const abertura = moveIntoWorkingWindow(input.now, input.janela);
  const espera = Math.max(60_000, abertura.getTime() - input.now.getTime());
  return {
    allow: false,
    action: 'reschedule',
    reason: 'fora_da_janela',
    retryAfterMs: espera,
    proximaAberturaAt: abertura,
    detail: `Fora do horário comercial (${input.janela.workingHoursStart}–${input.janela.workingHoursEnd}, dias úteis). Disparo automático adiado para ${formatarHoraBr(abertura)}.`,
  };
}

@Injectable()
export class WaJanelaComercialGateService {
  private readonly logger = new Logger(WaJanelaComercialGateService.name);

  constructor(private readonly prisma: PrismaLike) {}

  isEnabled(): boolean {
    return janelaGateEnabledFromEnv();
  }

  isJanelaSource(sourceModule: unknown): boolean {
    const source = String(sourceModule || '').trim().toLowerCase();
    return (COLD_GATE_SOURCE_MODULES as readonly string[]).includes(source);
  }

  /**
   * Janela da empresa. Ordem: config comercial (fonte oficial) -> campanha (tenant
   * legado que nunca abriu a tela nova) -> padrão 08:00–18:00.
   *
   * Erro de banco NÃO libera madrugada: cai no padrão, que é uma janela restritiva.
   * "Não sei o horário" nunca pode virar "manda agora".
   */
  async janelaDaEmpresa(companyId: number): Promise<BusinessWindow> {
    try {
      const config = await this.prisma.vendasComercialConfig?.findUnique?.({
        where: { companyId },
        select: { workingHoursStart: true, workingHoursEnd: true },
      });
      if (config?.workingHoursStart || config?.workingHoursEnd) {
        return {
          workingHoursStart: normalizeTimeHHMM(config.workingHoursStart, JANELA_PADRAO.workingHoursStart),
          workingHoursEnd: normalizeTimeHHMM(config.workingHoursEnd, JANELA_PADRAO.workingHoursEnd),
        };
      }
      const campanha = await this.prisma.vendasAutomationCampaign?.findFirst?.({
        where: { companyId },
        orderBy: { updatedAt: 'desc' },
        select: { workingHoursStart: true, workingHoursEnd: true },
      });
      if (campanha?.workingHoursStart || campanha?.workingHoursEnd) {
        return {
          workingHoursStart: normalizeTimeHHMM(campanha.workingHoursStart, JANELA_PADRAO.workingHoursStart),
          workingHoursEnd: normalizeTimeHHMM(campanha.workingHoursEnd, JANELA_PADRAO.workingHoursEnd),
        };
      }
    } catch (error) {
      this.logger.warn(
        `janela-gate: falha ao ler a janela (company=${companyId}) — usando ${JANELA_PADRAO.workingHoursStart}–${JANELA_PADRAO.workingHoursEnd}: ${String((error as any)?.message || error)}`,
      );
    }
    return { ...JANELA_PADRAO };
  }

  /** Decisão para UM envio, chamada ANTES do despacho. Nunca consome cota de nada. */
  async evaluate(input: {
    companyId: number;
    sourceModule?: string | null;
    senderType?: string | null;
    now?: Date;
  }): Promise<WaJanelaDecision> {
    if (!this.isEnabled() || !this.isJanelaSource(input.sourceModule)) return { allow: true };
    const automatico = String(input.senderType || '').trim().toLowerCase() !== 'human';
    if (!automatico) return { allow: true };

    const now = input.now ?? new Date();
    const janela = await this.janelaDaEmpresa(input.companyId);
    const decisao = decidirJanelaComercial({ now, janela, automatico });
    // `=== false` de propósito: o TS cacheado do build do container não estreita união
    // discriminada com `!x` / truthiness (gotcha pago no publish de 30/07).
    if (decisao.allow === false) {
      return {
        ...decisao,
        retryAfterMs: decisao.retryAfterMs + Math.floor(Math.random() * JITTER_ABERTURA_MS),
      };
    }
    return decisao;
  }
}
