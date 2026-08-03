import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalRouteDate } from './logistica-route-billing.service';
import { haversineMeters } from './logistica-tracking.service';

/**
 * 31/07 — "COMEÇOU E DESISTIU": o recado que faltava.
 *
 * O dono só era avisado quando alguém NEGAVA uma rota indicada. Aceitar, sair
 * pra rua e largar no meio — ou pior, dar Iniciar e sumir com o app fechado —
 * não gerava aviso NENHUM: o painel dizia "na rua" até a meia-noite e os
 * clientes ficavam sem entrega sem ninguém saber.
 *
 * Duas portas alimentam este serviço:
 *   1) SAÍDA PELA PORTA (`registrarSaida`) — o app chamou encerrar/descartar/
 *      limpar-dia. Chamado pelo controller DEPOIS do commit, best-effort:
 *      falhar aqui não pode desfazer o que já aconteceu com as entregas.
 *   2) VIGIA (`varrer`) — tick de 10min atrás do abandono SILENCIOSO: rota viva,
 *      iniciada há mais de 90min, sem nenhuma entrega concluída.
 *
 * RÉGUA AFIADA (senão vira alarme que ninguém lê):
 *   · `abandonada` = saiu pra rua (rota com `startedAt`) e entregou ZERO.
 *   · `parcial`    = entregou alguma coisa e deixou parada aberta pra trás.
 *   · `parada`     = o vigia achou rota viva sem sinal de vida (só o vigia usa).
 *   · Rota que nem saiu (sem `startedAt`) e montagem desfeita NÃO viram recado —
 *     desistir antes de sair é o fluxo normal de quem não aceitou.
 *
 * FREIO: `@@unique(companyId, motoristaUserId, routeDate, tipo)` — o mesmo
 * abandono nunca vira dois avisos, e o vigia pode rodar de 10 em 10 minutos
 * sem nunca virar spam. Colisão (P2002) é sucesso silencioso, não erro.
 */

const TICK_MS = Number(process.env.HBX_ROTA_VIGIA_TICK_MS || '') || 10 * 60 * 1000;
/** Minutos de rota iniciada sem NADA entregue até o vigia acusar. */
const SILENCIO_MIN = Number(process.env.HBX_ROTA_VIGIA_SILENCIO_MIN || '') || 90;
const STATUS_ABERTO = ['agendada', 'em_rota'] as const;
const ROTA_VIVA_STATUS = ['ACTIVE', 'INITIALIZING'] as const;

/**
 * SENTINELA (03/08) — o raio que decide "ele não saiu do lugar". Menor que
 * qualquer raio de chegada de cliente: a pergunta aqui é sobre o VEÍCULO parado,
 * não sobre estar perto de uma porta.
 */
const RAIO_PARADO_M = 80;
/** Teto de pontos lidos por sessão na checagem de parado (freio de query). */
const MAX_PONTOS_PARADO = 240;

export type RotaAvisoTipo =
  | 'abandonada'
  | 'parcial'
  | 'parada'
  // ── SENTINELA (03/08) ──
  | 'sem_sinal'
  | 'parado_demais'
  | 'atraso';

export interface RotaAvisoDTO {
  id: string;
  tipo: RotaAvisoTipo;
  motoristaNome: string;
  motoristaUserId: number;
  rotaNome: string | null;
  rotaModeloId: string | null;
  total: number;
  entregues: number;
  abertas: number;
  detalhe: string | null;
  createdAt: string;
}

@Injectable()
export class LogisticaRotaAvisoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticaRotaAvisoService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Entregue LIGADO: o vigia é a única coisa que enxerga o abandono
    // silencioso, e um vigia atrás de chavinha é um vigia dormindo.
    this.timer = setInterval(() => {
      void this.varrer().catch((e) =>
        this.logger.warn(`[logistica] vigia de rota falhou: ${String((e as Error)?.message || e)}`),
      );
    }, TICK_MS);
    this.logger.log(`[logistica] vigia de rota parada LIGADO — tick ${TICK_MS}ms, silêncio ${SILENCIO_MIN}min`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ── PORTA 1: o app avisou que saiu ────────────────────────────────────────
  /**
   * Chamado depois de encerrar/descartar/limpar-dia, SÓ quando dá pra atribuir
   * a saída a uma pessoa (admin encerrando a rota dos outros não vira recado de
   * ninguém). Decide o tipo lendo o dia daquele motorista.
   */
  async registrarSaida(companyId: number, entregadorId: number, dateInput?: string): Promise<RotaAvisoTipo | null> {
    if (!companyId || !Number.isInteger(entregadorId) || entregadorId <= 0) return null;
    try {
      const routeDate = this.diaSeguro(dateInput);
      const rota = await this.prisma.logisticaRoute.findFirst({
        where: { companyId, entregadorId, routeDate },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { startedAt: true },
      });
      // Não saiu pra rua = não abandonou nada. Desfazer montagem antes de sair
      // é o fluxo normal de quem não aceitou (e esse já tem o aviso de rota
      // indicada devolvida).
      if (!rota?.startedAt) return null;

      const contagem = await this.contarDia(companyId, entregadorId, routeDate);
      // Entregou tudo o que tinha: rota encerrada com sucesso, sem recado.
      if (contagem.abertas === 0 && contagem.entregues > 0) return null;
      if (contagem.total === 0) return null;
      const tipo: RotaAvisoTipo = contagem.entregues === 0 ? 'abandonada' : 'parcial';
      return await this.gravar(companyId, entregadorId, routeDate, tipo, contagem);
    } catch (e: any) {
      this.logger.warn(`[logistica] registrarSaida falhou entregador=${entregadorId}: ${String(e?.message || e)}`);
      return null;
    }
  }

  // ── PORTA 2: o vigia do abandono SILENCIOSO ───────────────────────────────
  /**
   * Rota VIVA (não encerrada), iniciada há mais de `SILENCIO_MIN` minutos, com
   * ZERO entrega concluída → recado 'parada'. É o caso que nenhum endpoint
   * denuncia: o motorista deu Iniciar e fechou o app.
   */
  async varrer(agora: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const routeDate = canonicalRouteDate(undefined, agora);
      const limite = new Date(agora.getTime() - SILENCIO_MIN * 60 * 1000);
      const rotas = await this.prisma.logisticaRoute.findMany({
        where: {
          routeDate,
          status: { in: [...ROTA_VIVA_STATUS] },
          operationalEndedAt: null,
          startedAt: { not: null, lte: limite },
        },
        select: { companyId: true, entregadorId: true },
        take: 200,
      });
      let criados = 0;
      for (const rota of rotas) {
        const contagem = await this.contarDia(rota.companyId, rota.entregadorId, routeDate);
        // Entregou alguma coisa = está trabalhando, mesmo devagar. O vigia é pro
        // silêncio TOTAL — acusar quem está na rua seria o alarme que ninguém lê.
        if (contagem.entregues > 0 || contagem.abertas === 0) continue;
        const gravado = await this.gravar(rota.companyId, rota.entregadorId, routeDate, 'parada', contagem);
        if (gravado) criados++;
      }
      if (criados) this.logger.log(`[logistica] vigia de rota: ${criados} recado(s) de rota parada`);
      return criados;
    } finally {
      this.running = false;
    }
  }

  // ── Leitura pro web ───────────────────────────────────────────────────────
  async listar(companyId: number): Promise<RotaAvisoDTO[]> {
    if (!companyId) return [];
    const rows = await this.prisma.logisticaRotaAviso.findMany({
      where: { companyId, vistoEm: null },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map((row) => ({
      id: row.id,
      tipo: row.tipo as RotaAvisoTipo,
      motoristaNome: row.motoristaNome,
      motoristaUserId: row.motoristaUserId,
      rotaNome: row.rotaNome,
      rotaModeloId: row.rotaModeloId,
      total: row.total,
      entregues: row.entregues,
      abertas: row.abertas,
      detalhe: row.detalhe ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** O × do banner: some da tela, fica no histórico. */
  async visto(companyId: number, id: string): Promise<boolean> {
    if (!companyId || !id) return false;
    const res = await this.prisma.logisticaRotaAviso.updateMany({
      where: { id: String(id).trim(), companyId, vistoEm: null },
      data: { vistoEm: new Date() },
    });
    return res.count > 0;
  }

  // ── Internos ──────────────────────────────────────────────────────────────
  /** Conta o dia DAQUELE motorista + a rota salva de origem, quando existe. */
  private async contarDia(companyId: number, entregadorId: number, routeDate: string) {
    const { start, end } = rangeDoDia(routeDate);
    const entregas = await this.prisma.entrega.findMany({
      where: {
        companyId,
        entregadorId,
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null, status: { in: [...STATUS_ABERTO] } }],
      },
      select: { status: true, rotaModeloId: true },
      take: 500,
    });
    let entregues = 0;
    let abertas = 0;
    const modelos = new Map<string, number>();
    for (const entrega of entregas) {
      if (entrega.status === 'entregue') entregues++;
      else if (entrega.status === 'agendada' || entrega.status === 'em_rota') abertas++;
      if (entrega.rotaModeloId) modelos.set(entrega.rotaModeloId, (modelos.get(entrega.rotaModeloId) ?? 0) + 1);
    }
    let rotaModeloId: string | null = null;
    let maior = 0;
    for (const [id, quantas] of modelos) if (quantas > maior) { rotaModeloId = id; maior = quantas; }
    return { total: entregas.length, entregues, abertas, rotaModeloId };
  }

  private async gravar(
    companyId: number,
    motoristaUserId: number,
    routeDate: string,
    tipo: RotaAvisoTipo,
    contagem: { total: number; entregues: number; abertas: number; rotaModeloId: string | null },
    detalhe?: string | null,
  ): Promise<RotaAvisoTipo | null> {
    const [pessoa, modelo] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: motoristaUserId, companyId },
        select: { name: true, username: true, email: true },
      }),
      contagem.rotaModeloId
        ? this.prisma.logisticaRotaModelo.findFirst({
            where: { id: contagem.rotaModeloId, companyId },
            select: { id: true, nome: true },
          })
        : Promise.resolve(null),
    ]);
    try {
      await this.prisma.logisticaRotaAviso.create({
        data: {
          companyId,
          tipo,
          motoristaUserId,
          motoristaNome: (pessoa?.name || pessoa?.username || pessoa?.email || `Usuário ${motoristaUserId}`).slice(0, 120),
          rotaModeloId: modelo?.id ?? null,
          rotaNome: modelo?.nome ?? null,
          routeDate,
          total: contagem.total,
          entregues: contagem.entregues,
          abertas: contagem.abertas,
          detalhe: detalhe ? String(detalhe).slice(0, 160) : null,
        },
      });
      this.logger.log(
        `[logistica] recado de rota ${tipo} company=${companyId} motorista=${motoristaUserId} dia=${routeDate}` +
          ` (${contagem.entregues}/${contagem.total} entregues, ${contagem.abertas} abertas)`,
      );
      return tipo;
    } catch (e: any) {
      // P2002 = já existe recado deste tipo pra este motorista HOJE. É o freio
      // funcionando, não erro: o vigia roda a cada 10min de propósito.
      if (String(e?.code) === 'P2002') return null;
      throw e;
    }
  }

  private diaSeguro(dateInput?: string): string {
    try {
      return canonicalRouteDate(dateInput);
    } catch {
      return canonicalRouteDate();
    }
  }
}

/** Janela local do dia de uma chave 'YYYY-MM-DD' (mesma semântica do resolveDayRange). */
function rangeDoDia(routeDate: string): { start: Date; end: Date } {
  const [ano, mes, dia] = routeDate.split('-').map(Number);
  const start = new Date(ano, (mes || 1) - 1, dia || 1, 0, 0, 0, 0);
  const end = new Date(ano, (mes || 1) - 1, dia || 1, 23, 59, 59, 999);
  return { start, end };
}
