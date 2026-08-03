// S5 LEAD-CENTRICO (docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/05-agenda-slots.md) —
// Serviço de slots de disparo: dado empresa (+ opcionalmente sender/chip), devolve o
// próximo horário livre respeitando janela de horário + teto/dia + intervalo mínimo +
// o que já está agendado. Fonte da config: VendasComercialConfig (1 linha por empresa,
// aditiva — ver schema.prisma). "Já agendado" é lido de CadenciaInscricao.nextStepAt
// (status 'ativa') — é o que a Automação por lead (S4) e o runner da cadência usam pra saber
// quando o próximo passo de cada lead está devido.
//
// Plain class instanciada manualmente (mesmo padrão de CommercialContactControlService
// em backend/src/vendas/commercial-contact-control.service.ts) — evita import circular
// entre VendasModule e CadenciaModule; cada service que precisa faz
// `new AgendaDisparoService(this.prisma)` no próprio construtor.
//
// NÃO mexe nos freios físicos de envio (CADENCIA_WHATS_DAILY_CAP_PER_COMPANY/EMAIL em
// cadencia.service.ts, disjuntor/warmup/1-numero=1-conexao em queueOutboundForCompany) —
// esses continuam intocados, protegendo o chip em tempo real. Este serviço decide QUANDO
// agendar (planejamento), não SE pode enviar agora (isso é do freio físico).

import { PrismaService } from '../prisma/prisma.service';
import {
  catalogoEstaPronto,
  lacunasDoCatalogo,
  normalizeCatalogo,
  type CatalogoComercial,
} from './vendas-catalogo';
import {
  addBusinessCalendarDays,
  dayKeyOf,
  moveIntoWorkingWindow,
  moveToBusinessDay,
  normalizeTimeHHMM,
  parseTimeOnDate,
  type BusinessWindow,
} from './business-hours.util';
import { coldGateEnabledFromEnv, coldGateMaxPerDayFromEnv } from '../messaging/wa-cold-contact-gate.service';
import { jitterHumanoMinutos } from './vendas-copy-reserva';

const DEFAULT_WORKING_HOURS_START = '08:00';
const DEFAULT_WORKING_HOURS_END = '18:00';
const DEFAULT_DAILY_LIMIT_PER_SENDER = 10;
const DEFAULT_INTERVAL_MINUTES = 15;
// Defaults = nível MÉDIO (vendas-nivel-disparo.ts) — mesma régua da migration
// 20260801000000_casa_risco_identidade.
const DEFAULT_INTERVAL_VARIANCE_MINUTES = 15;
const DEFAULT_MAX_ATTEMPTS_PER_LEAD = 1;
const DEFAULT_TYPING_SECONDS = 8;
const DEFAULT_TYPING_VARIANCE_SECONDS = 12;

// Horizonte de busca pra frente — evita varrer o calendário pra sempre se a config
// estiver contraditória (ex.: janela de 1 minuto/dia). Disjuntor da própria conta.
const HORIZON_DAYS = 30;
const MAX_SLOT_ITERATIONS = 2000;

export type SlotConflictReason = 'fora_da_janela' | 'teto_do_dia' | 'intervalo_minimo' | null;

export interface VendasComercialConfigDto extends BusinessWindow {
  dailyLimitPerSender: number;
  intervalMinutes: number;
  // CASA DO RISCO (31/07/2026): os campos abaixo saíram da campanha — risco de
  // chip é da empresa. Quem só precisa de janela+teto+intervalo continua usando
  // os 3 de cima; o DTO é um só de propósito (uma leitura, uma verdade).
  intervalVarianceMinutes: number;
  maxAttemptsPerLead: number;
  typingSeconds: number;
  typingVarianceSeconds: number;
  // TRAVA DE AQUECIMENTO REMOVÍVEL (04/08/2026): true = a pessoa forçou o limite
  // configurado cheio; a rampa do chip novo (6→12, metade do teto) não opina.
  // Opcional no tipo (ausente = trava ligada) pra não obrigar todo construtor
  // de config de teste a conhecer a trava — o getConfig sempre preenche.
  coldWarmupOff?: boolean;
}

export interface SlotSearchResult {
  slot: Date;
  requested: Date;
  conflito: boolean;
  motivoConflito: SlotConflictReason;
}

export interface ReservaResult extends SlotSearchResult {
  updatedCount: number;
}

function clampPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.trunc(numeric), min), max);
}

// ================================================================
// Algoritmo puro — sem I/O, testável isoladamente. Caminha slot a slot
// (intervalMinutes) dentro da janela até achar um horário sem conflito de
// interval nem de teto diário. `occupiedTimes` já vem carregado do banco.
// ================================================================
export function findNextFreeSlot(
  desiredAt: Date,
  config: VendasComercialConfigDto,
  occupiedTimes: Date[],
  now: Date = new Date(),
): SlotSearchResult {
  const requested = desiredAt;
  const intervalMs = Math.max(1, config.intervalMinutes) * 60000;
  const dailyLimit = Math.max(1, config.dailyLimitPerSender);

  let cursor = desiredAt.getTime() < now.getTime() ? new Date(now) : new Date(desiredAt);
  let conflito = false;
  let motivoConflito: SlotConflictReason = null;

  const windowed = moveIntoWorkingWindow(cursor, config);
  if (windowed.getTime() !== cursor.getTime()) {
    conflito = true;
    motivoConflito = 'fora_da_janela';
  }
  cursor = windowed;

  for (let i = 0; i < MAX_SLOT_ITERATIONS; i += 1) {
    const dayKey = dayKeyOf(cursor);
    const countToday = occupiedTimes.reduce((acc, t) => (dayKeyOf(t) === dayKey ? acc + 1 : acc), 0);

    if (countToday >= dailyLimit) {
      if (!conflito) {
        conflito = true;
        motivoConflito = 'teto_do_dia';
      }
      const nextDay = addBusinessCalendarDays(cursor, 1);
      cursor = parseTimeOnDate(moveToBusinessDay(nextDay), config.workingHoursStart, DEFAULT_WORKING_HOURS_START);
      continue;
    }

    const hasCloseNeighbor = occupiedTimes.some((t) => Math.abs(t.getTime() - cursor.getTime()) < intervalMs);
    if (hasCloseNeighbor) {
      if (!conflito) {
        conflito = true;
        motivoConflito = 'intervalo_minimo';
      }
      cursor = moveIntoWorkingWindow(new Date(cursor.getTime() + intervalMs), config);
      continue;
    }

    return { slot: cursor, requested, conflito, motivoConflito };
  }

  // Disjuntor: config contraditória (ex.: janela menor que o intervalo mínimo) não
  // trava o processo num loop — devolve o melhor cursor achado, marcado com conflito.
  return { slot: cursor, requested, conflito: true, motivoConflito: motivoConflito ?? 'teto_do_dia' };
}

export class AgendaDisparoService {
  // Mutex por empresa: serializa cálculo+reserva dentro do MESMO processo pra 2
  // chamadas concorrentes (ex.: runner + ação manual quase simultâneos) nunca lerem
  // o mesmo "já ocupado" antes de uma delas escrever — a segunda só calcula depois
  // que a primeira já persistiu. Concorrência ENTRE processos/réplicas fica pro
  // futuro (hoje o backend roda single-instance por VPS — ver docs/Rules/INFRA.md).
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly prisma: PrismaService | Record<string, any>) {}

  private async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.locks.get(key) ?? Promise.resolve();
    const run = prior.then(fn, fn);
    this.locks.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  // ── TETO EFETIVO (31/07/2026, turno noturno 2) ────────────────────────────
  // Achado N1: este motor reservava horário até o limite do TENANT (40/dia)
  // enquanto o freio anti-ban entregava 10 — a agenda aceitava 40 disparos pra
  // amanhã sabendo que 30 iam ser cancelados no envio, um por um. O teto que
  // vale aqui é o MENOR entre "o que o dono pediu" e "o que o freio deixa sair".
  // Sem env de freio (ou com ele desligado), nada muda.
  private comTetoEfetivo(config: VendasComercialConfigDto): VendasComercialConfigDto {
    if (!coldGateEnabledFromEnv()) return config;
    // Trava removida (04/08): direito da pessoa — a agenda reserva o limite
    // configurado CHEIO, sem o teto físico da rampa por cima.
    if (config.coldWarmupOff === true) return config;
    const fisico = coldGateMaxPerDayFromEnv();
    if (!Number.isFinite(fisico) || fisico >= config.dailyLimitPerSender) return config;
    return { ...config, dailyLimitPerSender: fisico };
  }

  // Tira o disparo do "minuto redondo" SEM nunca encurtar a distância pro
  // vizinho: só adia, e desiste do deslocamento se ele quebrar o intervalo
  // mínimo ou sair da janela. Dez disparos em 08:00/08:15/08:30 têm cara de
  // máquina; 08:03/08:19/08:32 têm cara de gente.
  private aplicarJitterHumano(
    slot: Date,
    occupied: Date[],
    config: VendasComercialConfigDto,
    chave: string,
  ): Date {
    const minutos = jitterHumanoMinutos(chave);
    if (!minutos) return slot;
    const candidato = new Date(slot.getTime() + minutos * 60000);
    if (moveIntoWorkingWindow(candidato, config).getTime() !== candidato.getTime()) return slot;
    const intervalMs = Math.max(1, config.intervalMinutes) * 60000;
    const colide = occupied.some((t) => Math.abs(t.getTime() - candidato.getTime()) < intervalMs);
    return colide ? slot : candidato;
  }

  async getConfig(companyId: number): Promise<VendasComercialConfigDto> {
    const row = await (this.prisma as any).vendasComercialConfig?.findUnique?.({ where: { companyId } }).catch(() => null);
    return {
      workingHoursStart: normalizeTimeHHMM(row?.workingHoursStart, DEFAULT_WORKING_HOURS_START),
      workingHoursEnd: normalizeTimeHHMM(row?.workingHoursEnd, DEFAULT_WORKING_HOURS_END),
      dailyLimitPerSender: clampPositiveInt(row?.dailyLimitPerSender, DEFAULT_DAILY_LIMIT_PER_SENDER, 1, 200),
      intervalMinutes: clampPositiveInt(row?.intervalMinutes, DEFAULT_INTERVAL_MINUTES, 1, 240),
      intervalVarianceMinutes: clampPositiveInt(row?.intervalVarianceMinutes, DEFAULT_INTERVAL_VARIANCE_MINUTES, 0, 180),
      maxAttemptsPerLead: clampPositiveInt(row?.maxAttemptsPerLead, DEFAULT_MAX_ATTEMPTS_PER_LEAD, 1, 3),
      typingSeconds: clampPositiveInt(row?.typingSeconds, DEFAULT_TYPING_SECONDS, 0, 45),
      typingVarianceSeconds: clampPositiveInt(row?.typingVarianceSeconds, DEFAULT_TYPING_VARIANCE_SECONDS, 0, 30),
      coldWarmupOff: row?.coldWarmupOff === true,
    };
  }

  async saveConfig(companyId: number, dto: Partial<VendasComercialConfigDto>): Promise<VendasComercialConfigDto> {
    const current = await this.getConfig(companyId);
    const next: VendasComercialConfigDto = {
      workingHoursStart: dto.workingHoursStart !== undefined ? normalizeTimeHHMM(dto.workingHoursStart, current.workingHoursStart) : current.workingHoursStart,
      workingHoursEnd: dto.workingHoursEnd !== undefined ? normalizeTimeHHMM(dto.workingHoursEnd, current.workingHoursEnd) : current.workingHoursEnd,
      dailyLimitPerSender: dto.dailyLimitPerSender !== undefined ? clampPositiveInt(dto.dailyLimitPerSender, current.dailyLimitPerSender, 1, 200) : current.dailyLimitPerSender,
      intervalMinutes: dto.intervalMinutes !== undefined ? clampPositiveInt(dto.intervalMinutes, current.intervalMinutes, 1, 240) : current.intervalMinutes,
      intervalVarianceMinutes: dto.intervalVarianceMinutes !== undefined ? clampPositiveInt(dto.intervalVarianceMinutes, current.intervalVarianceMinutes, 0, 180) : current.intervalVarianceMinutes,
      maxAttemptsPerLead: dto.maxAttemptsPerLead !== undefined ? clampPositiveInt(dto.maxAttemptsPerLead, current.maxAttemptsPerLead, 1, 3) : current.maxAttemptsPerLead,
      typingSeconds: dto.typingSeconds !== undefined ? clampPositiveInt(dto.typingSeconds, current.typingSeconds, 0, 45) : current.typingSeconds,
      typingVarianceSeconds: dto.typingVarianceSeconds !== undefined ? clampPositiveInt(dto.typingVarianceSeconds, current.typingVarianceSeconds, 0, 30) : current.typingVarianceSeconds,
      coldWarmupOff: dto.coldWarmupOff !== undefined ? dto.coldWarmupOff === true : current.coldWarmupOff,
    };
    await (this.prisma as any).vendasComercialConfig.upsert({
      where: { companyId },
      create: { companyId, ...next },
      update: { ...next },
    });
    return next;
  }

  // ---------------------------------------------------------------- CATÁLOGO
  // Mora na mesma linha de VendasComercialConfig (catalogoJson), mas em métodos
  // próprios: salvar horário/teto NUNCA toca o catálogo e vice-versa.

  async getCatalogo(companyId: number): Promise<{ catalogo: CatalogoComercial | null; pronto: boolean; lacunas: string[] }> {
    const row = await (this.prisma as any).vendasComercialConfig
      ?.findUnique?.({ where: { companyId }, select: { catalogoJson: true } })
      .catch(() => null);
    let catalogo: CatalogoComercial | null = null;
    const texto = String(row?.catalogoJson || '').trim();
    if (texto) {
      try {
        catalogo = normalizeCatalogo(JSON.parse(texto));
      } catch {
        catalogo = null; // JSON podre no banco = mesmo efeito de não ter catálogo
      }
    }
    return { catalogo, pronto: catalogoEstaPronto(catalogo), lacunas: lacunasDoCatalogo(catalogo) };
  }

  async saveCatalogo(companyId: number, raw: unknown): Promise<{ catalogo: CatalogoComercial | null; pronto: boolean; lacunas: string[] }> {
    const normalizado = raw == null ? null : normalizeCatalogo(raw);
    const vazio =
      !normalizado ||
      (!normalizado.oQueVendemos && !normalizado.capacidades.length && !normalizado.paraQuem.length && !normalizado.ancoraDePreco);
    // Catálogo vazio grava NULL de propósito: NULO é o estado que proíbe a IA de
    // afirmar produto (ver schema) — string '{}' órfã não pode virar "catálogo".
    const catalogoJson = vazio ? null : JSON.stringify(normalizado);
    await (this.prisma as any).vendasComercialConfig.upsert({
      where: { companyId },
      create: { companyId, catalogoJson },
      update: { catalogoJson },
    });
    const catalogo = catalogoJson ? (normalizado as CatalogoComercial) : null;
    return { catalogo, pronto: catalogoEstaPronto(catalogo), lacunas: lacunasDoCatalogo(catalogo) };
  }

  // Carrega os horários já ocupados (nextStepAt de inscrições ativas) num horizonte
  // pra frente/um pouco pra trás (mesmo dia). Não conta sends já concluídos hoje (o
  // freio físico de teto diário técnico continua sendo o dono disso, em
  // cadencia.service.ts / vendas-automation.service.ts) — aqui é só "o que já está
  // reservado pra rodar", pra não empilhar agendamentos futuros em cima uns dos outros.
  private async loadOccupiedTimes(companyId: number, from: Date, excludeInscricaoId?: string | null): Promise<Date[]> {
    const rangeStart = new Date(from.getTime() - 24 * 60 * 60 * 1000);
    const rangeEnd = new Date(from.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
    const where: Record<string, any> = {
      companyId,
      status: 'ativa',
      nextStepAt: { gte: rangeStart, lte: rangeEnd },
    };
    if (excludeInscricaoId) where.id = { not: excludeInscricaoId };
    const rows = await (this.prisma as any).cadenciaInscricao.findMany({ where, select: { nextStepAt: true } });
    return (rows || []).map((r: any) => new Date(r.nextStepAt)).filter((d: Date) => !Number.isNaN(d.getTime()));
  }

  // Leitura pura (sem side-effect) — usada pelo GET /vendas/agenda-disparo/proximo-slot.
  async proximoSlotLivre(
    companyId: number,
    opts?: { desiredAt?: Date; excludeInscricaoId?: string | null; now?: Date },
  ): Promise<SlotSearchResult & { config: VendasComercialConfigDto }> {
    const now = opts?.now ?? new Date();
    const desired = opts?.desiredAt ?? now;
    const config = await this.getConfig(companyId);
    const efetiva = this.comTetoEfetivo(config);
    const occupied = await this.loadOccupiedTimes(companyId, desired, opts?.excludeInscricaoId ?? null);
    const result = findNextFreeSlot(desired, efetiva, occupied, now);
    // Devolve a config EFETIVA (não a crua): quem lê o preview tem que ver o
    // mesmo teto que a reserva vai obedecer.
    return { ...result, config: efetiva };
  }

  // Reserva o próximo slot livre PARA uma inscrição de cadência (grava nextStepAt na
  // hora, dentro do lock por empresa — ver comentário do `locks`). Usado pelo runner
  // (cadencia.service.ts) ao avançar um passo com sucesso.
  async reservarProximoSlot(params: {
    companyId: number;
    inscricaoId: string;
    desiredAt: Date;
    now?: Date;
    extraData?: Record<string, any>;
  }): Promise<ReservaResult> {
    return this.runExclusive(`slot:${params.companyId}`, async () => {
      const now = params.now ?? new Date();
      const config = this.comTetoEfetivo(await this.getConfig(params.companyId));
      const occupied = await this.loadOccupiedTimes(params.companyId, params.desiredAt, params.inscricaoId);
      const result = findNextFreeSlot(params.desiredAt, config, occupied, now);
      const slot = this.aplicarJitterHumano(
        result.slot,
        occupied,
        config,
        `${params.inscricaoId}|${result.slot.toISOString()}`,
      );
      const updated = await (this.prisma as any).cadenciaInscricao.updateMany({
        where: { id: params.inscricaoId, status: 'ativa' },
        data: { nextStepAt: slot, ...(params.extraData || {}) },
      });
      return { ...result, slot, updatedCount: Number(updated?.count || 0) };
    });
  }

  // Adia pro próximo dia útil NO HORÁRIO configurado (substitui o antigo "amanhã
  // nesta mesma hora", que podia cair fora da janela/fim de semana). Usado quando o
  // runner detecta teto físico de chip/e-mail estourado no ciclo (freio técnico
  // intocado — só o "quando tenta de novo" passa a respeitar a janela).
  async reservarProximoDiaUtil(params: {
    companyId: number;
    inscricaoId: string;
    from: Date;
    extraData?: Record<string, any>;
  }): Promise<Date> {
    return this.runExclusive(`slot:${params.companyId}`, async () => {
      const config = await this.getConfig(params.companyId);
      const nextDay = addBusinessCalendarDays(params.from, 1);
      const businessDay = moveToBusinessDay(nextDay);
      const slot = parseTimeOnDate(businessDay, config.workingHoursStart, DEFAULT_WORKING_HOURS_START);
      await (this.prisma as any).cadenciaInscricao.updateMany({
        where: { id: params.inscricaoId, status: 'ativa' },
        data: { nextStepAt: slot, ...(params.extraData || {}) },
      });
      return slot;
    });
  }
}
