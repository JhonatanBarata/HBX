import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MasterAlertService } from '../master-alert/master-alert.service';
import { vencimentoDaCompetencia } from './fiscal-calendar.util';
import { LivroCaixaService } from './livro-caixa.service';

// ===========================================================================
// CONTABIL S2 — obligation-scheduler: gerador de obrigações + transições de
// estado + alertador, num tick diário. Mesmo padrão de cron da casa
// (CadenciaSchedulerService): setInterval + flag de gate + best-effort.
//
// FREIO: roda a cada TICK_MS (default 6h) e é IDEMPOTENTE em tudo — gerar 2x
// não duplica (unique competencia+tipo), alertar 2x não duplica (alertasEnviados).
// Nenhuma falha de e-mail/zap derruba o tick (padrão master-alert).
// ===========================================================================

const TICK_MS = Number(process.env.HBX_CONTABIL_TICK_MS || '') || 6 * 60 * 60 * 1000; // 6h
const RUNNER_FLAG = 'HBX_CONTABIL_SCHEDULER_ENABLED';
const MAX_ZAPS_FISCAIS_DIA = 2; // teto anti-spam (mesma filosofia do watcher do Cockpit nº8)

export type ObligationTipo =
  | 'PGDASD'
  | 'DAS'
  | 'ESOCIAL_S1200'
  | 'DCTFWEB'
  | 'DARF_INSS'
  | 'DEFIS'
  | 'LIVRO_CAIXA';

export type ObligationEstado =
  | 'AGUARDANDO_DADOS'
  | 'PRONTO'
  | 'ARMADO'
  | 'TRANSMITIDO'
  | 'PAGO'
  | 'CONFERIDO';

const ESTADOS_FINAIS_SEM_ALERTA = new Set(['CONFERIDO']);

const TIPO_LABEL: Record<ObligationTipo, string> = {
  PGDASD: 'PGDAS-D',
  DAS: 'DAS',
  ESOCIAL_S1200: 'eSocial S-1200',
  DCTFWEB: 'DCTFWeb',
  DARF_INSS: 'DARF INSS',
  DEFIS: 'DEFIS',
  LIVRO_CAIXA: 'Livro Caixa',
};

function competenciaLabel(competencia: string): string {
  if (/^\d{4}-ANUAL$/.test(competencia)) return competencia.replace('-ANUAL', '');
  const m = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!m) return competencia;
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const idx = Number(m[2]) - 1;
  return `${meses[idx] ?? m[2]}/${m[1]}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

@Injectable()
export class ObligationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ObligationSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly masterAlert: MasterAlertService,
    // Opcional p/ não quebrar o construtor de testes existentes (S2) que
    // instanciam só com (prisma, masterAlert) — sem o Livro Caixa (S4) o tick
    // simplesmente pula o espelhamento de ENTRADAS (self-contido, best-effort).
    private readonly livroCaixa?: LivroCaixaService,
  ) {}

  private get enabled(): boolean {
    const v = String(process.env[RUNNER_FLAG] || '1').trim().toLowerCase();
    return v === '1' || v === 'true';
  }

  onModuleInit() {
    if (this.enabled) {
      this.logger.log(`[contabil] scheduler LIGADO (${RUNNER_FLAG}) — tick ${TICK_MS}ms`);
    } else {
      this.logger.log(`[contabil] scheduler DESLIGADO (${RUNNER_FLAG}=0) — nada auto-gera/alerta`);
    }
    this.timer = setInterval(() => {
      void this.tick().catch((e) => this.logger.warn(`[contabil] tick falhou: ${String((e as Error)?.message || e)}`));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Ciclo diário completo: gera → transiciona → alerta. Chamável direto (testes/manual). */
  async tick(referencia: Date = new Date()): Promise<{ geradas: number; transicionadas: number; alertadas: number }> {
    if (!this.enabled) return { geradas: 0, transicionadas: 0, alertadas: 0 };
    if (this.running) return { geradas: 0, transicionadas: 0, alertadas: 0 };
    this.running = true;
    try {
      // GATE DE ATIVAÇÃO: a flag pode estar ON (o app "já vem armado"), mas sem
      // um FiscalProfile com CNPJ preenchido NÃO existe obrigação fiscal legal
      // (Fase 0 do manual do dono: o relógio só começa quando ele cadastra o
      // CNPJ). Sem isso, o gerador criaria PGDAS-D/DAS de uma empresa que o dono
      // ainda nem abriu e o alertador dispararia zap sobre ela — ruído no
      // WhatsApp do dono, e a casa tem histórico de ban por disparo indevido.
      // Fica SILENCIOSO até ter CNPJ. Transições de obrigações já existentes
      // não geram zap por si só, mas com o gate fechado nem existem obrigações,
      // então nada roda mesmo.
      if (!(await this.temFiscalProfileAtivo())) {
        this.logger.log('[contabil] scheduler ativo mas SEM FiscalProfile/CNPJ — inerte até cadastro');
        return { geradas: 0, transicionadas: 0, alertadas: 0 };
      }

      const competenciaAtual = this.competenciaDe(referencia);
      const geradas = await this.gerarObrigacoesDaCompetencia(competenciaAtual);
      const transicionadas = await this.aplicarTransicoesAutomaticas(referencia);
      const alertadas = await this.rodarAlertador(referencia);

      // CONTABIL S4 — espelha ENTRADAS do Livro Caixa (mês corrente + anterior,
      // cobre pagamento que chegou virado o mês). Best-effort: nunca derruba o
      // tick fiscal principal (gerador/transições/alertador já rodaram acima).
      if (this.livroCaixa) {
        for (const comp of [this.competenciaAnteriorDe(competenciaAtual), competenciaAtual]) {
          try {
            await this.livroCaixa.espelharCompetencia(comp);
          } catch (e) {
            this.logger.warn(`[contabil] espelhamento Livro Caixa (${comp}) falhou: ${String((e as Error)?.message || e)}`);
          }
        }
      }

      if (geradas || transicionadas || alertadas) {
        this.logger.log(`[contabil] tick — geradas=${geradas} transicionadas=${transicionadas} alertadas=${alertadas}`);
      }
      return { geradas, transicionadas, alertadas };
    } finally {
      this.running = false;
    }
  }

  private competenciaDe(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private competenciaAnteriorDe(competencia: string): string {
    const [y, m] = competencia.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * true se existe empresa fiscal ativa = FiscalProfile (singleton do S1) com
   * CNPJ preenchido (não-nulo, não-vazio). É o gate de ativação do Contabil.
   * Só LÊ o FiscalProfile (não toca no motor do S1). Fail-closed: qualquer erro
   * de leitura → inativo (não gera/alerta sobre o nada).
   */
  private async temFiscalProfileAtivo(): Promise<boolean> {
    try {
      const perfil = await (this.prisma as any).fiscalProfile.findFirst({
        where: { cnpj: { not: null } },
        select: { cnpj: true },
      });
      return Boolean(String(perfil?.cnpj || '').trim());
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // GERADOR — cria as obrigações da competência (idempotente via unique key).
  // -------------------------------------------------------------------------

  /**
   * Gera as obrigações da competência 'YYYY-MM' informada. `folhaMesCents`
   * decide se ESOCIAL_S1200/DCTFWEB/DARF_INSS existem (Fase 0 do manual: sem
   * pró-labore, sem essas obrigações — naoAplicavel=true). Idempotente: já
   * existente não é recriado (upsert só ajusta dueDate/naoAplicavel se o
   * cadastro mudar de ideia sobre a folha, nunca mexe em estado avançado).
   */
  async gerarObrigacoesDaCompetencia(competencia: string): Promise<number> {
    const folhaMesCents = await this.folhaMesCentsDe(competencia);
    const temFolha = folhaMesCents > 0;

    const alvos: Array<{ tipo: ObligationTipo; dueDate: Date; naoAplicavel: boolean }> = [
      { tipo: 'PGDASD', dueDate: vencimentoDaCompetencia(competencia, 20), naoAplicavel: false },
      { tipo: 'DAS', dueDate: vencimentoDaCompetencia(competencia, 20), naoAplicavel: false },
      { tipo: 'ESOCIAL_S1200', dueDate: vencimentoDaCompetencia(competencia, 15), naoAplicavel: !temFolha },
      { tipo: 'DCTFWEB', dueDate: vencimentoDaCompetencia(competencia, 15), naoAplicavel: !temFolha },
      { tipo: 'DARF_INSS', dueDate: vencimentoDaCompetencia(competencia, 20), naoAplicavel: !temFolha },
      // LIVRO_CAIXA: lembrete soft mensal, dia 20 também (nunca vira ATRASADO crítico —
      // ver rodarAlertador/aplicarTransicoesAutomaticas, que pulam ATRASADO p/ este tipo).
      { tipo: 'LIVRO_CAIXA', dueDate: vencimentoDaCompetencia(competencia, 20), naoAplicavel: false },
    ];

    let geradas = 0;
    for (const alvo of alvos) {
      const created = await this.criarSeNaoExiste(competencia, alvo.tipo, alvo.dueDate, alvo.naoAplicavel);
      if (created) geradas += 1;
    }

    // DEFIS: 1x/ano, competência "AAAA-ANUAL", vence 31/03 do ano SEGUINTE ao
    // ano-base. Só gera quando a competência corrente cruza a virada de ano
    // fiscal (mês 01) — evita recriar em todo tick de todo mês.
    const { ano, mes } = this.parseYm(competencia);
    if (mes === 1) {
      const anoBase = ano - 1;
      const defisCompetencia = `${anoBase}-ANUAL`;
      const defisDueDate = vencimentoDaCompetencia(`${ano}-03`, 31);
      const created = await this.criarSeNaoExiste(defisCompetencia, 'DEFIS', defisDueDate, false);
      if (created) geradas += 1;
    }

    return geradas;
  }

  private parseYm(competencia: string): { ano: number; mes: number } {
    const m = /^(\d{4})-(\d{2})$/.exec(competencia);
    if (!m) throw new Error(`competencia inválida p/ geração: '${competencia}'`);
    return { ano: Number(m[1]), mes: Number(m[2]) };
  }

  private async criarSeNaoExiste(
    competencia: string,
    tipo: ObligationTipo,
    dueDate: Date,
    naoAplicavel: boolean,
  ): Promise<boolean> {
    const existente = await (this.prisma as any).fiscalObligation.findUnique({
      where: { competencia_tipo: { competencia, tipo } },
    });
    if (existente) return false;
    await (this.prisma as any).fiscalObligation.create({
      data: {
        competencia,
        tipo,
        dueDate,
        naoAplicavel,
        estado: naoAplicavel ? 'CONFERIDO' : 'AGUARDANDO_DADOS',
      },
    });
    return true;
  }

  /** folhaMesCents do FiscalRevenueMonth da competência (0 se não existir linha ainda). */
  private async folhaMesCentsDe(competencia: string): Promise<number> {
    try {
      const row = await (this.prisma as any).fiscalRevenueMonth.findUnique({ where: { competencia } });
      return Math.max(0, Number(row?.folhaMesCents ?? 0));
    } catch {
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // TRANSIÇÕES AUTOMÁTICAS
  // -------------------------------------------------------------------------

  /**
   * AGUARDANDO_DADOS -> PRONTO quando o motor já tem os números do mês
   * (linha FiscalRevenueMonth consolidada e com DAS previsto calculado).
   * ATRASADO é OVERLAY textual sobre o estado — não substitui o estado real
   * (fica marcado via alertasEnviados conter "ATRASADO:<estado>" pro alertador
   * saber que já cruzou o vencimento); LIVRO_CAIXA e naoAplicavel nunca atrasam.
   */
  async aplicarTransicoesAutomaticas(referencia: Date = new Date()): Promise<number> {
    const pendentes = await (this.prisma as any).fiscalObligation.findMany({
      where: { estado: 'AGUARDANDO_DADOS', naoAplicavel: false },
    });
    let transicionadas = 0;
    for (const ob of pendentes) {
      const pronto = await this.temNumerosProntos(ob.competencia);
      if (pronto) {
        await (this.prisma as any).fiscalObligation.update({
          where: { id: ob.id },
          data: { estado: 'PRONTO' },
        });
        transicionadas += 1;
      }
    }
    return transicionadas;
  }

  private async temNumerosProntos(competencia: string): Promise<boolean> {
    try {
      const row = await (this.prisma as any).fiscalRevenueMonth.findUnique({ where: { competencia } });
      if (!row) return false;
      // "número pronto" = já consolidou receita do mês (dasPrevistoCents calculado).
      return row.dasPrevistoCents != null;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // ALERTADOR — D-7, D-3, D-1, D0, ATRASADO. Idempotente via alertasEnviados.
  // Teto global MAX_ZAPS_FISCAIS_DIA (só conta o canal WhatsApp).
  // -------------------------------------------------------------------------

  async rodarAlertador(referencia: Date = new Date()): Promise<number> {
    // Gate de ativação também AQUI: rodarAlertador é público (pode ser chamado
    // fora do tick) e é o único ponto que dispara zap — se auto-protege pra
    // nunca alertar sem empresa fiscal ativa, independente do chamador.
    if (!(await this.temFiscalProfileAtivo())) return 0;

    const abertas = await (this.prisma as any).fiscalObligation.findMany({
      where: { naoAplicavel: false, estado: { notIn: Array.from(ESTADOS_FINAIS_SEM_ALERTA) } },
    });

    // Teto anti-spam: no máximo MAX_ZAPS_FISCAIS_DIA disparos de WhatsApp por
    // execução do alertador (o tick roda poucas vezes/dia — ver TICK_MS — então
    // na prática isto já é o teto diário; contador simples em memória do loop,
    // sem depender de query por timestamp que seria imprecisa).
    let zapsFiscaisHoje = 0;
    let alertadas = 0;

    for (const ob of abertas) {
      // Livro Caixa é lembrete SOFT — nunca vira ATRASADO crítico (Guardrail do sprint).
      const isLivroCaixa = ob.tipo === 'LIVRO_CAIXA';
      const chave = this.chaveAlerta(ob, referencia, isLivroCaixa);
      if (!chave) continue;

      const enviados: string[] = this.parseAlertasEnviados(ob.alertasEnviados);
      if (enviados.includes(chave)) continue; // idempotência: já mandado

      // Teto de ATRASADO diário: máx 3 avisos consecutivos (Guardrail do contrato).
      if (chave === 'ATRASADO') {
        const atrasadosJaEnviados = enviados.filter((c) => c.startsWith('ATRASADO')).length;
        if (atrasadosJaEnviados >= 3) continue;
      }

      const podeZap = zapsFiscaisHoje < MAX_ZAPS_FISCAIS_DIA;
      const texto = this.textoAlerta(ob, chave, referencia);

      // TODO(cockpit-n8): migrar p/ trilha MasterEvent quando aterrissar.
      const resultado = await this.masterAlert.fiscalObligationAlert({
        competencia: ob.competencia,
        tipo: ob.tipo,
        estado: ob.estado,
        dueDate: new Date(ob.dueDate),
        texto,
        permitirWhatsapp: podeZap,
      });

      if (resultado.whatsapp) zapsFiscaisHoje += 1;

      const chaveGravada = chave === 'ATRASADO' ? `ATRASADO:${referencia.toISOString().slice(0, 10)}` : chave;
      await (this.prisma as any).fiscalObligation.update({
        where: { id: ob.id },
        data: { alertasEnviados: JSON.stringify([...enviados, chaveGravada]) },
      });
      alertadas += 1;
    }

    return alertadas;
  }

  private parseAlertasEnviados(raw: string | null | undefined): string[] {
    try {
      const parsed = JSON.parse(String(raw || '[]'));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  /** D-7/D-3/D-1/D0/ATRASADO conforme a diferença de dias até dueDate. null = nenhum alerta hoje. */
  private chaveAlerta(
    ob: { dueDate: Date; estado: string; naoAplicavel: boolean },
    referencia: Date,
    isLivroCaixa: boolean,
  ): string | null {
    const due = new Date(ob.dueDate);
    const hojeUtc = Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), referencia.getUTCDate());
    const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
    const diffDias = Math.round((dueUtc - hojeUtc) / (24 * 60 * 60 * 1000));

    if (diffDias === 7) return 'D-7';
    if (diffDias === 3) return 'D-3';
    if (diffDias === 1) return 'D-1';
    if (diffDias === 0) return 'D0';
    if (diffDias < 0 && !isLivroCaixa) return 'ATRASADO';
    return null;
  }

  private textoAlerta(
    ob: { competencia: string; tipo: ObligationTipo; dueDate: Date },
    chave: string,
    referencia: Date,
  ): string {
    const label = TIPO_LABEL[ob.tipo as ObligationTipo] ?? ob.tipo;
    const comp = competenciaLabel(ob.competencia);
    const dueStr = fmtDate(new Date(ob.dueDate));
    const prefixo =
      chave === 'ATRASADO'
        ? `🔴 ATRASADO`
        : chave === 'D0'
        ? `⚠️ VENCE HOJE`
        : `⚠️ ${chave}`;
    const quando =
      chave === 'ATRASADO'
        ? `venceu em ${dueStr} e ainda não foi marcado como pago`
        : chave === 'D0'
        ? `vence hoje (${dueStr})`
        : `vence em ${dueStr}`;
    return [
      `${prefixo}: ${label} de ${comp} ${quando}.`,
      `Abrir Contabil → Fechar o mês.`,
    ].join(' ');
  }

}
