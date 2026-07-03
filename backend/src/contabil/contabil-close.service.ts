import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MasterAlertService } from '../master-alert/master-alert.service';
import { FiscalEngineService } from './fiscal-engine.service';
import { RevenueSyncService } from './revenue-sync.service';
import { LivroCaixaService } from './livro-caixa.service';
import type { FecharMesDto } from './dto/contabil.dto';

// ===========================================================================
// CONTABIL S5 — Copiloto "Fechar o mês" (semi-auto, ZERO API paga).
// ---------------------------------------------------------------------------
// Este serviço é o TRILHO do fechamento: monta TODOS os números prontos (via
// FiscalEngineService — Lei nº2, motor é a única autoridade de cálculo), prova
// que receita do DAS == Livro Caixa (reconciliação S4), valida a divergência do
// DAS do governo (o disjuntor do copiloto) e, no clique final do dono, grava o
// estado (fechadoEm + obrigações CONFERIDO) e gera o relatório narrativo.
//
// Lei nº1 (copiloto, não piloto): NADA aqui transmite. O dono marca cada estado
// (TRANSMITIDO/PAGO) pela rotina existente (marcarObrigacao). Este serviço só
// LÊ o motor, reconcilia e finaliza o mês depois que o dono já fez os passos.
// ===========================================================================

/** Tolerância da validação de divergência do DAS: ±R$ 1,00 (100 cents). */
const DIVERGENCIA_TOLERANCIA_CENTS = 100;

export interface PreCloseObligation {
  id: string;
  tipo: string;
  estado: string;
  dueDate: Date;
  naoAplicavel: boolean;
  resultJson: string | null;
}

@Injectable()
export class ContabilCloseService {
  private readonly logger = new Logger(ContabilCloseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: FiscalEngineService,
    private readonly revenueSync: RevenueSyncService,
    private readonly livroCaixa: LivroCaixaService,
    private readonly masterAlert: MasterAlertService,
  ) {}

  private assertCompetencia(competencia: string): string {
    if (!/^\d{4}-\d{2}$/.test(String(competencia || ''))) {
      throw new BadRequestException(`competência inválida: '${competencia}' (esperado 'YYYY-MM')`);
    }
    return competencia;
  }

  private competenciaAnterior(competencia: string): string {
    const [y, m] = competencia.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  // -------------------------------------------------------------------------
  // PRÉ-FECHAMENTO — monta o dossiê do wizard (tudo pronto p/ os 6 passos).
  // -------------------------------------------------------------------------

  /**
   * Reúne TUDO que o wizard precisa numa competência:
   *  - o mês consolidado (receita, RBT12, folha12m, Fator R, anexo, DAS/INSS/IRRF
   *    previstos) — recalculado pela cadeia do motor (syncCompetencia);
   *  - a reconciliação DAS↔Livro Caixa (prova de que não divergem, S4);
   *  - as obrigações da competência (estados atuais);
   *  - a detecção de Fase 0 (receita 0 e folha 0 → fluxo curto);
   *  - o pró-labore recomendado do motor (Fator R alvo).
   * NÃO grava fechamento — só LÊ e reconcilia (espelhar é idempotente).
   */
  async preClose(competencia: string) {
    this.assertCompetencia(competencia);

    // 1) Recalcula a cadeia do mês (fonte dos números — motor).
    const mes = await this.revenueSync.syncCompetencia(competencia);

    // 2) Reconciliação DAS base × Livro Caixa (S4) — espelha e compara.
    let reconciliacao: { dasBaseCents: number; livroCaixaCents: number; bate: boolean };
    try {
      reconciliacao = await this.livroCaixa.reconciliarReceita(competencia);
    } catch (err) {
      this.logger.warn(`[contabil-close] reconciliação falhou em ${competencia}: ${String((err as Error)?.message || err)}`);
      reconciliacao = { dasBaseCents: mes.receitaCaixaCents ?? 0, livroCaixaCents: 0, bate: false };
    }

    // 3) Obrigações da competência (estados atuais).
    const obrigacoes: PreCloseObligation[] = (
      await (this.prisma as any).fiscalObligation.findMany({
        where: { competencia },
        orderBy: { dueDate: 'asc' },
      })
    ).map((o: any) => ({
      id: o.id,
      tipo: o.tipo,
      estado: o.estado,
      dueDate: o.dueDate,
      naoAplicavel: o.naoAplicavel,
      resultJson: o.resultJson ?? null,
    }));

    // 4) Números derivados (todos do motor — nada recalculado à mão aqui).
    const folhaMesCents = Math.max(0, Number(mes.folhaMesCents ?? 0));
    const receitaMesCents = Math.max(
      0,
      Number(mes.receitaCaixaCents ?? 0) + Number(mes.receitaNotasCents ?? 0) + Number(mes.ajusteManualCents ?? 0),
    );
    const dasPrevistoCents = Number(mes.dasPrevistoCents ?? 0);
    const inssPrevistoCents = Number(mes.inssPrevistoCents ?? 0);
    const irrfPrevistoCents = Number(mes.irrfPrevistoCents ?? 0);
    const tributosTotalCents = dasPrevistoCents + inssPrevistoCents + irrfPrevistoCents;

    // Pró-labore recomendado do mês (menor pró-labore que mantém Fator R >= 0,28).
    const folha11mAnterioresCents = Math.max(0, Number(mes.folha12mCents ?? 0) - folhaMesCents);
    const prolaboreRecomendadoCents = this.engine.prolaboreRecomendado(
      Number(mes.rbt12Cents ?? 0),
      folha11mAnterioresCents,
    );

    // Fase 0: sem receita e sem pró-labore → só PGDAS-D sem apuração (transmitir zerado).
    const fase0 = receitaMesCents === 0 && folhaMesCents === 0;

    const comprovantes = await this.contarComprovantesPorObrigacao(competencia);

    // Lucro isento gerado NO MÊS (presunção 32% − DAS do mês) — do motor (Lei nº2).
    // É o "quanto sobrou isento" deste mês; o painel anual do S4 já mostra o do ano.
    const lucroIsentoMesCents = this.engine.lucroIsentoDisponivel(
      receitaMesCents,
      dasPrevistoCents,
      0,
      competencia,
    );

    return {
      competencia,
      fase0,
      fechadoEm: mes.fechadoEm ?? null,
      lucroIsentoMesCents,
      receita: {
        receitaCaixaCents: Number(mes.receitaCaixaCents ?? 0),
        receitaNotasCents: Number(mes.receitaNotasCents ?? 0),
        ajusteManualCents: Number(mes.ajusteManualCents ?? 0),
        ajusteMotivo: mes.ajusteMotivo ?? null,
        receitaMesCents,
      },
      folhaMesCents,
      prolaboreRecomendadoCents,
      folha11mAnterioresCents,
      cadeia: {
        rbt12Cents: Number(mes.rbt12Cents ?? 0),
        folha12mCents: Number(mes.folha12mCents ?? 0),
        fatorR: Number(mes.fatorR ?? 0),
        anexoAplicado: mes.anexoAplicado ?? null,
        aliquotaEfetiva: Number(mes.aliquotaEfetiva ?? 0),
      },
      tributos: {
        dasPrevistoCents,
        inssPrevistoCents,
        irrfPrevistoCents,
        tributosTotalCents,
      },
      reconciliacao,
      obrigacoes,
      comprovantes,
    };
  }

  /**
   * Simula os tributos do mês com um pró-labore hipotético — mantém a cadeia
   * REAL do mês (RBT12/folha12m/anexo do motor), só troca o pró-labore do mês
   * para o dono ver o impacto ao vivo no passo 2 do wizard. Números do motor.
   */
  async impactoProlabore(competencia: string, prolaboreCents: number) {
    this.assertCompetencia(competencia);
    const mes = await (this.prisma as any).fiscalRevenueMonth.findUnique({ where: { competencia } });
    if (!mes) throw new NotFoundException(`competência ${competencia} ainda não consolidada`);

    const prolabore = Math.max(0, Math.trunc(prolaboreCents));
    const receitaMesCents = Math.max(
      0,
      Number(mes.receitaCaixaCents ?? 0) + Number(mes.receitaNotasCents ?? 0) + Number(mes.ajusteManualCents ?? 0),
    );
    const rbt12Cents = Number(mes.rbt12Cents ?? 0);
    // folha12m com ESTE pró-labore no lugar do pró-labore do mês (o resto dos 11m fica).
    const folha11m = Math.max(0, Number(mes.folha12mCents ?? 0) - Number(mes.folhaMesCents ?? 0));
    const folha12mCents = folha11m + prolabore;

    const cenario = this.engine.simulaCenario({
      receitaMesCents,
      prolaboreCents: prolabore,
      rbt12Cents,
      folha12mCents,
      competencia,
    });

    return {
      competencia,
      prolaboreCents: prolabore,
      dasCents: cenario.dasCents,
      inssCents: cenario.inssCents,
      irrfCents: cenario.irrfCents,
      totalTributosCents: cenario.totalTributosCents,
      anexoAplicado: cenario.anexoAplicado,
      aliquotaEfetiva: cenario.aliquotaEfetiva,
      fatorR: cenario.fatorR,
    };
  }

  /**
   * Grava o pró-labore do mês (folhaMesCents) — input do dono no passo 2 do
   * wizard. Recomputa a cadeia (DAS/INSS/IRRF do motor) via syncCompetencia.
   * Nunca transmite nada; só persiste o valor e recalcula os previstos.
   */
  async definirProlabore(competencia: string, prolaboreCents: number) {
    this.assertCompetencia(competencia);
    const prolabore = Math.max(0, Math.trunc(prolaboreCents));
    // Garante linha antes do update.
    await this.revenueSync.syncCompetencia(competencia);
    await (this.prisma as any).fiscalRevenueMonth.update({
      where: { competencia },
      data: { folhaMesCents: prolabore },
    });
    return this.revenueSync.syncCompetencia(competencia);
  }

  // -------------------------------------------------------------------------
  // VALIDADOR DE DIVERGÊNCIA — o disjuntor do copiloto (passo 4 do wizard).
  // -------------------------------------------------------------------------

  /**
   * Compara o DAS que o GOVERNO calculou (digitado pelo dono) com o DAS previsto
   * pelo motor (fonte de verdade). Se |gov − nosso| > R$ 1,00 → diverge (o wizard
   * TRAVA o avanço e manda revisar antes de pagar). Pega tanto erro de digitação
   * quanto bug nosso. NÃO grava nada — é uma checagem pura de leitura.
   */
  async validarDivergenciaDas(competencia: string, dasGovernoCents: number) {
    this.assertCompetencia(competencia);
    const mes = await (this.prisma as any).fiscalRevenueMonth.findUnique({ where: { competencia } });
    if (!mes) throw new NotFoundException(`competência ${competencia} ainda não consolidada`);

    const nossoDasCents = Math.max(0, Number(mes.dasPrevistoCents ?? 0));
    const governoCents = Math.max(0, Math.trunc(dasGovernoCents));
    const diffCents = Math.abs(governoCents - nossoDasCents);
    const diverge = diffCents > DIVERGENCIA_TOLERANCIA_CENTS;

    return {
      competencia,
      nossoDasCents,
      governoCents,
      diffCents,
      toleranciaCents: DIVERGENCIA_TOLERANCIA_CENTS,
      diverge,
    };
  }

  // -------------------------------------------------------------------------
  // COMPROVANTES — contagem por obrigação (o dossiê do card).
  // -------------------------------------------------------------------------

  private async contarComprovantesPorObrigacao(competencia: string): Promise<Record<string, number>> {
    try {
      const rows = await (this.prisma as any).fiscalComprovante.findMany({
        where: { competencia, status: { not: 'deleted' } },
        select: { obligationId: true },
      });
      const out: Record<string, number> = {};
      for (const r of rows) out[r.obligationId] = (out[r.obligationId] ?? 0) + 1;
      return out;
    } catch {
      return {};
    }
  }

  // -------------------------------------------------------------------------
  // FECHAMENTO — o clique final do dono (passo 6 do wizard).
  // -------------------------------------------------------------------------

  /**
   * Fecha o mês: grava fechadoEm, marca as obrigações aplicáveis da competência
   * como CONFERIDO (transição do dono, não automática de fisco) e gera o
   * relatório narrativo determinístico (guardado no histórico + disparo best-
   * effort no zap do dono, 1 por fechamento).
   *
   * PRÉ-CONDIÇÃO opcional: `dasGovernoCents` — se vier, revalida a divergência e
   * RECUSA fechar se divergir (o disjuntor também guarda o fechamento). Lei nº1:
   * este método NÃO transmite nada — só consolida o estado que o dono já marcou.
   */
  async fecharMes(competencia: string, dto: FecharMesDto) {
    this.assertCompetencia(competencia);

    // Revalida divergência se o dono passou o DAS do governo (guarda dupla).
    if (dto?.dasGovernoCents !== undefined && dto.dasGovernoCents !== null) {
      const check = await this.validarDivergenciaDas(competencia, Number(dto.dasGovernoCents));
      if (check.diverge) {
        throw new BadRequestException(
          `divergência de DAS não resolvida (governo ${check.governoCents} × nosso ${check.nossoDasCents}, diferença ${check.diffCents} cents) — revise antes de fechar`,
        );
      }
    }

    // Snapshot final dos números (motor) para o relatório e auditoria.
    const dossie = await this.preClose(competencia);

    // 1) Marca as obrigações aplicáveis como CONFERIDO (transição do dono).
    const obrigacoesAplicaveis = dossie.obrigacoes.filter(
      (o) => !o.naoAplicavel && o.estado !== 'CONFERIDO',
    );
    for (const ob of obrigacoesAplicaveis) {
      try {
        await (this.prisma as any).fiscalObligation.update({
          where: { id: ob.id },
          data: { estado: 'CONFERIDO' },
        });
      } catch (err) {
        this.logger.warn(`[contabil-close] falha ao conferir obrigação ${ob.id}: ${String((err as Error)?.message || err)}`);
      }
    }

    // 2) Grava fechadoEm no mês.
    const fechadoEm = new Date();
    await (this.prisma as any).fiscalRevenueMonth.update({
      where: { competencia },
      data: { fechadoEm },
    });

    // 3) Gera relatório narrativo determinístico + guarda no histórico.
    const relatorio = await this.gerarRelatorioNarrativo(competencia, dossie);
    const enviadoZap = await this.persistirEDispararRelatorio(competencia, relatorio, dossie);

    return {
      competencia,
      fechadoEm: fechadoEm.toISOString(),
      obrigacoesConferidas: obrigacoesAplicaveis.length,
      relatorio,
      enviadoZap,
    };
  }

  // -------------------------------------------------------------------------
  // RELATÓRIO NARRATIVO DETERMINÍSTICO (template string, SEM IA por padrão).
  // -------------------------------------------------------------------------

  private brl(cents: number): string {
    return (Math.max(0, Math.round(cents)) / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private pct(v: number, casas = 1): string {
    return `${(v * 100).toFixed(casas)}%`;
  }

  private competenciaLabel(competencia: string): string {
    const m = /^(\d{4})-(\d{2})$/.exec(competencia);
    if (!m) return competencia;
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1]}`;
  }

  /**
   * Monta o texto do relatório mensal (determinístico) a partir do dossiê do
   * fechamento (números do motor) + comparativo com o mês anterior + avisos
   * inteligentes (RBT12 perto da 2ª faixa; folga do Fator R p/ baixar pró-labore).
   * NENHUM número é calculado aqui — só formatados. Se a flag da IA estiver ON,
   * SÓ o texto é reescrito (números seguem do motor — Lei nº2).
   */
  async gerarRelatorioNarrativo(competencia: string, dossiePreCarregado?: Awaited<ReturnType<ContabilCloseService['preClose']>>) {
    const d = dossiePreCarregado ?? (await this.preClose(competencia));
    const compLabel = this.competenciaLabel(competencia);

    const receita = d.receita.receitaMesCents;
    const das = d.tributos.dasPrevistoCents;
    const inss = d.tributos.inssPrevistoCents;
    const irrf = d.tributos.irrfPrevistoCents;
    const total = d.tributos.tributosTotalCents;
    const pctReceita = receita > 0 ? total / receita : 0;
    const fatorR = d.cadeia.fatorR;
    const anexo = d.cadeia.anexoAplicado;
    const rbt12 = d.cadeia.rbt12Cents;

    // Fase 0: relatório curto.
    if (d.fase0) {
      const texto = [
        `📒 Fechamento de ${compLabel} — Fase 0 (sem apuração).`,
        `Sem receita e sem pró-labore no mês: PGDAS-D transmitido zerado, nada a pagar.`,
        `O relógio fiscal segue em dia. Nada mais a fazer neste mês.`,
      ].join('\n');
      return { texto, avisos: [] as string[], comparativo: null as string | null };
    }

    // Comparativo com o mês anterior (se houver linha consolidada).
    const anteriorComp = this.competenciaAnterior(competencia);
    let comparativo: string | null = null;
    try {
      const ant = await (this.prisma as any).fiscalRevenueMonth.findUnique({ where: { competencia: anteriorComp } });
      if (ant) {
        const receitaAnt = Math.max(
          0,
          Number(ant.receitaCaixaCents ?? 0) + Number(ant.receitaNotasCents ?? 0) + Number(ant.ajusteManualCents ?? 0),
        );
        if (receitaAnt > 0 || receita > 0) {
          const deltaCents = receita - receitaAnt;
          const sinal = deltaCents >= 0 ? '+' : '−';
          const pctVar = receitaAnt > 0 ? Math.abs(deltaCents) / receitaAnt : 0;
          comparativo =
            `Receita ${deltaCents >= 0 ? 'subiu' : 'caiu'} ${sinal}${this.brl(Math.abs(deltaCents))}` +
            (receitaAnt > 0 ? ` (${this.pct(pctVar)}) vs ${this.competenciaLabel(anteriorComp)}` : ` vs ${this.competenciaLabel(anteriorComp)}`) +
            ` (era ${this.brl(receitaAnt)}).`;
        }
      }
    } catch {
      comparativo = null;
    }

    // Avisos inteligentes (determinísticos).
    const avisos = this.montarAvisos(d);

    const selo = fatorR >= 0.28 ? '🟢' : '🔴';
    const linhas = [
      `📊 Fechamento de ${compLabel}`,
      ``,
      `Receita: ${this.brl(receita)}`,
      `Tributos: ${this.brl(total)} (${this.pct(pctReceita)} da receita)`,
      `  • DAS ${this.brl(das)} · INSS ${this.brl(inss)} · IRRF ${this.brl(irrf)}`,
      `Fator R: ${this.pct(fatorR, 2)} ${selo} → Anexo ${anexo ?? '—'} (alíquota efetiva ${this.pct(d.cadeia.aliquotaEfetiva, 2)})`,
    ];
    if (comparativo) linhas.push('', comparativo);
    if (avisos.length) linhas.push('', ...avisos.map((a) => `⚠️ ${a}`));
    linhas.push('', `Reconciliação receita×Livro Caixa: ${d.reconciliacao.bate ? 'OK ✅' : 'DIVERGENTE ❗'}`);

    return { texto: linhas.join('\n'), avisos, comparativo };
  }

  /**
   * Avisos determinísticos do relatório:
   *  - RBT12 perto da 2ª faixa do Simples (R$ 180.000): alerta de aproximação;
   *  - Fator R folgou (> 0,29): quanto dá pra baixar de pró-labore SEM sair do III.
   */
  private montarAvisos(d: Awaited<ReturnType<ContabilCloseService['preClose']>>): string[] {
    const avisos: string[] = [];

    // RBT12 perto da 2ª faixa (180k). Alerta quando >= 90% do teto da 1ª faixa.
    const teto1aFaixaCents = 180_000_00;
    const rbt12 = d.cadeia.rbt12Cents;
    if (rbt12 > 0 && rbt12 >= Math.round(teto1aFaixaCents * 0.9) && rbt12 <= teto1aFaixaCents) {
      const faltaCents = teto1aFaixaCents - rbt12;
      avisos.push(
        `RBT12 (${this.brl(rbt12)}) está a ${this.brl(faltaCents)} da 2ª faixa do Simples (R$ 180.000) — a alíquota efetiva sobe ao cruzar.`,
      );
    } else if (rbt12 > teto1aFaixaCents) {
      avisos.push(
        `RBT12 (${this.brl(rbt12)}) já passou a 1ª faixa do Simples (R$ 180.000) — a alíquota efetiva agora usa a faixa seguinte.`,
      );
    }

    // Fator R folgou: quanto dá pra baixar de pró-labore sem sair do Anexo III.
    // pró-labore mínimo do mês = recomendado (0,28); folga = folhaMes − recomendado.
    if (d.cadeia.fatorR >= 0.29 && d.folhaMesCents > d.prolaboreRecomendadoCents) {
      const folgaCents = d.folhaMesCents - d.prolaboreRecomendadoCents;
      if (folgaCents > 0) {
        avisos.push(
          `Fator R folgou (${this.pct(d.cadeia.fatorR, 2)}). Dá para baixar o pró-labore em até ${this.brl(folgaCents)} e ainda manter o Anexo III (mínimo ${this.brl(d.prolaboreRecomendadoCents)}).`,
        );
      }
    }

    // Fator R abaixo do limiar: já é 🔴, mas o relatório aponta o remédio.
    if (d.cadeia.fatorR < 0.28) {
      const faltaCents = Math.max(0, d.prolaboreRecomendadoCents - d.folhaMesCents);
      if (faltaCents > 0) {
        avisos.push(
          `Fator R abaixo de 28% — subir o pró-labore em ${this.brl(faltaCents)} recupera o Anexo III (recomendado ${this.brl(d.prolaboreRecomendadoCents)}).`,
        );
      }
    }

    return avisos;
  }

  /**
   * Guarda o relatório no histórico (upsert por competência) e dispara best-
   * effort no zap do dono (1 por fechamento). Opcional: reescrita amigável via
   * Ollama local atrás de flag default OFF — SÓ o texto passa pela IA; se falhar,
   * cai no texto determinístico (nunca bloqueia o fechamento).
   */
  private async persistirEDispararRelatorio(
    competencia: string,
    relatorio: { texto: string; avisos: string[]; comparativo: string | null },
    dossie: Awaited<ReturnType<ContabilCloseService['preClose']>>,
  ): Promise<boolean> {
    let texto = relatorio.texto;
    let geradoViaIa = false;

    // Reescrita amigável opcional (flag OFF por padrão). Números NÃO passam pela
    // IA — só a prosa; a fonte dos valores continua o motor (Lei nº2).
    if (this.iaReescritaHabilitada()) {
      try {
        const reescrito = await this.reescreverComOllama(texto);
        if (reescrito && reescrito.trim().length > 20) {
          texto = reescrito.trim();
          geradoViaIa = true;
        }
      } catch (err) {
        this.logger.warn(`[contabil-close] reescrita IA falhou (segue determinístico): ${String((err as Error)?.message || err)}`);
      }
    }

    const payloadJson = JSON.stringify({
      receitaMesCents: dossie.receita.receitaMesCents,
      tributos: dossie.tributos,
      cadeia: dossie.cadeia,
      reconciliacao: dossie.reconciliacao,
      avisos: relatorio.avisos,
    });

    // Persiste no histórico (upsert por competência).
    try {
      await (this.prisma as any).fiscalMonthlyReport.upsert({
        where: { competencia },
        create: { competencia, texto, payloadJson, geradoViaIa, enviadoZap: false },
        update: { texto, payloadJson, geradoViaIa },
      });
    } catch (err) {
      this.logger.warn(`[contabil-close] falha ao guardar relatório de ${competencia}: ${String((err as Error)?.message || err)}`);
    }

    // Dispara best-effort no zap do dono (1 disparo por fechamento).
    let enviadoZap = false;
    try {
      const res = await this.masterAlert.fiscalObligationAlert({
        competencia,
        tipo: 'RELATORIO_MENSAL',
        estado: 'CONFERIDO',
        dueDate: new Date(),
        texto,
        permitirWhatsapp: true,
      });
      enviadoZap = Boolean(res?.whatsapp);
    } catch (err) {
      this.logger.warn(`[contabil-close] disparo do relatório falhou: ${String((err as Error)?.message || err)}`);
    }

    if (enviadoZap) {
      try {
        await (this.prisma as any).fiscalMonthlyReport.update({
          where: { competencia },
          data: { enviadoZap: true },
        });
      } catch {
        /* best-effort: o disparo já aconteceu, o flag é só espelho */
      }
    }

    return enviadoZap;
  }

  /** GET do histórico de relatório (o dono relê o que foi mandado). */
  async getRelatorioHistorico(competencia: string) {
    this.assertCompetencia(competencia);
    const row = await (this.prisma as any).fiscalMonthlyReport.findUnique({ where: { competencia } });
    if (!row) return null;
    return {
      competencia: row.competencia,
      texto: row.texto,
      enviadoZap: row.enviadoZap,
      geradoViaIa: row.geradoViaIa,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // -------------------------------------------------------------------------
  // IA opcional (Ollama local) — flag OFF por padrão. SÓ reescreve o texto.
  // -------------------------------------------------------------------------

  private iaReescritaHabilitada(): boolean {
    const v = String(process.env.HBX_CONTABIL_REPORT_AI_ENABLED || '0').trim().toLowerCase();
    return v === '1' || v === 'true';
  }

  private async reescreverComOllama(textoDeterministico: string): Promise<string | null> {
    const base = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const model = String(process.env.HBX_CONTABIL_REPORT_AI_MODEL || 'qwen2.5:7b');
    const prompt = [
      'Reescreva o relatório fiscal abaixo em português do Brasil, tom amigável e claro,',
      'para o dono de uma empresa (leigo em contabilidade). REGRAS DURAS:',
      '- NÃO altere NENHUM número, valor em reais, percentual, nome de anexo ou data.',
      '- NÃO invente informação que não esteja no texto.',
      '- Mantenha o mesmo significado; só melhore a redação.',
      '',
      'RELATÓRIO:',
      textoDeterministico,
    ].join('\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const resp = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.3 } }),
        signal: controller.signal,
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { response?: string };
      return typeof data?.response === 'string' ? data.response : null;
    } finally {
      clearTimeout(timeout);
    }
  }

  // -------------------------------------------------------------------------
  // Constante exportável (usada por testes e pelo controller de validação).
  // -------------------------------------------------------------------------

  static readonly DIVERGENCIA_TOLERANCIA_CENTS = DIVERGENCIA_TOLERANCIA_CENTS;
}
