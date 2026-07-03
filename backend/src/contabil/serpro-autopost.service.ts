import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MasterAlertService } from '../master-alert/master-alert.service';
import { RevenueSyncService } from './revenue-sync.service';
import { FiscalAutomationLogService } from './fiscal-automation-log.service';
import { SerproCredService } from './serpro-cred.service';
import {
  SerproIntegraClient,
  CUSTO_DECLARAR_PGDASD_CENTS,
  CUSTO_GERAR_DAS_CENTS,
  type PgdasdPayload,
} from './serpro-integra.client';

// ===========================================================================
// CONTABIL S7 — Autopost PGDAS-D/DAS (a orquestração do braço robótico #2).
// ---------------------------------------------------------------------------
// É o que o passo PGDAS-D do wizard (S5) chama quando a flag está ON. Dois atos,
// e a fronteira entre eles é a LEI Nº1 (copiloto, não piloto):
//
//   ARMAR (`armar`)      → LEITURA PURA. Monta o payload EXATO (do MOTOR — Lei
//                          nº2, nada recalculado aqui) + o custo estimado da
//                          chamada. NÃO transmite, NÃO chama o Serpro. O dono
//                          revisa na tela.
//   TRANSMITIR (`transmitir`) → AÇÃO DE ESTADO. Declara o PGDAS-D + gera o DAS +
//                          confere automaticamente. SÓ é chamado sob o clique-com-
//                          confirmação do dono (o controller exige aprovadoPor =
//                          userId real + a confirmação "TRANSMITIR"). NUNCA cron,
//                          NUNCA retry de transmissão. Toda chamada → trilha
//                          FiscalAutomationLog (sistema='SERPRO', aprovadoPor=userId).
//
// FALLBACK PERMANENTE: flag OFF, credencial ausente ou API fora → devolve
// `disponivel:false` com o motivo; o wizard degrada pro modo semi-auto do S5
// (deep-link + marcar manual). NUNCA bloqueia o fechamento por Serpro indisponível.
//
// CONFERÊNCIA (disjuntor do S5, reusado): consultarDeclaracao valida que o governo
// gravou o que enviamos e que o DAS oficial == nosso previsto (±R$ 1). Divergência
// → REVISAR + alerta vermelho.
// ===========================================================================

/** Tolerância da conferência DAS oficial × nosso previsto: ±R$ 1,00 (100 cents). */
export const SERPRO_DIVERGENCIA_TOLERANCIA_CENTS = 100;

export interface SerproArmarResult {
  disponivel: boolean; // false → wizard cai no semi-auto (fallback)
  motivoIndisponivel?: string | null; // 'flag-off' | 'sem-credencial' | 'sem-perfil' | 'motor-vazio'
  competencia: string;
  ambiente: 'demo' | 'producao';
  payload: PgdasdPayload | null; // o que SERÁ enviado (revisão do dono)
  custoEstimadoCents: number; // custo total do ciclo (declarar + gerar DAS)
  custoEstimadoLabel: string; // "~R$ 0,72 de API"
}

export interface SerproTransmitirResult {
  ok: boolean;
  competencia: string;
  numeroRecibo: string | null; // recibo real de entrega da declaração
  dasPdfB64: string | null; // guia DAS em PDF
  dasNumeroDocumento: string | null;
  estado: 'TRANSMITIDO' | 'REVISAR' | 'FALLBACK';
  conferencia: {
    conferido: boolean; // governo gravou == enviamos + DAS oficial == nosso (±R$1)
    dasNossoCents: number;
    dasGovernoCents: number | null;
    diffCents: number | null;
    diverge: boolean;
    detalhe: string;
  } | null;
  erro?: string | null;
}

@Injectable()
export class SerproAutopostService {
  private readonly logger = new Logger(SerproAutopostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly revenueSync: RevenueSyncService,
    private readonly cred: SerproCredService,
    private readonly client: SerproIntegraClient,
    private readonly automationLog: FiscalAutomationLogService,
    private readonly masterAlert: MasterAlertService,
  ) {}

  private assertCompetencia(competencia: string): string {
    if (!/^\d{4}-\d{2}$/.test(String(competencia || ''))) {
      throw new BadRequestException(`competência inválida: '${competencia}' (esperado 'YYYY-MM')`);
    }
    return competencia;
  }

  // -------------------------------------------------------------------------
  // GATE + FALLBACK — o wizard consulta isto p/ decidir auto vs semi-auto.
  // -------------------------------------------------------------------------

  /**
   * Estado do braço S7 p/ a competência: ligado? credencial no cofre? Nunca
   * dispara nada. É o que o card do wizard lê p/ mostrar ARMAR (auto) ou cair no
   * semi-auto (deep-link). NÃO lança por indisponibilidade — indisponível é um
   * estado válido (fallback), não um erro.
   */
  async status(): Promise<{ enabled: boolean; ambiente: 'demo' | 'producao'; credencialConfigurada: boolean }> {
    const credStatus = await this.cred.getStatus().catch(() => ({ configurado: false }));
    return {
      enabled: SerproIntegraClient.isEnabled(),
      ambiente: SerproIntegraClient.ambiente(),
      credencialConfigurada: Boolean(credStatus.configurado),
    };
  }

  // -------------------------------------------------------------------------
  // ARMAR — LEITURA PURA (Lei nº1: NÃO transmite). Só monta o payload do motor.
  // -------------------------------------------------------------------------

  /**
   * Monta o payload EXATO do PGDAS-D a partir do MOTOR (FiscalRevenueMonth via
   * syncCompetencia — Lei nº2, nada recalculado aqui) + o custo estimado da
   * chamada. NÃO chama o Serpro, NÃO transmite. Se o braço estiver indisponível
   * (flag OFF / sem credencial / sem perfil / motor vazio), devolve
   * `disponivel:false` com o motivo — o wizard cai no semi-auto.
   */
  async armar(competencia: string): Promise<SerproArmarResult> {
    this.assertCompetencia(competencia);
    const ambiente = SerproIntegraClient.ambiente();
    const custoEstimadoCents = CUSTO_DECLARAR_PGDASD_CENTS + CUSTO_GERAR_DAS_CENTS;
    const base: SerproArmarResult = {
      disponivel: false,
      competencia,
      ambiente,
      payload: null,
      custoEstimadoCents,
      custoEstimadoLabel: this.custoLabel(custoEstimadoCents),
    };

    if (!SerproIntegraClient.isEnabled()) {
      return { ...base, motivoIndisponivel: 'flag-off' };
    }
    const credStatus = await this.cred.getStatus().catch(() => ({ configurado: false }));
    if (!credStatus.configurado) {
      return { ...base, motivoIndisponivel: 'sem-credencial' };
    }

    // Números do MOTOR (fonte única — Lei nº2). syncCompetencia é idempotente.
    const mes = await this.revenueSync.syncCompetencia(competencia);
    const receitaBrutaMesCents = Math.max(
      0,
      Number(mes.receitaCaixaCents ?? 0) + Number(mes.receitaNotasCents ?? 0) + Number(mes.ajusteManualCents ?? 0),
    );
    const rbt12Cents = Math.max(0, Number(mes.rbt12Cents ?? 0));
    const dasPrevistoCents = Math.max(0, Number(mes.dasPrevistoCents ?? 0));
    const anexoAplicado = String(mes.anexoAplicado ?? '');
    if (!anexoAplicado) {
      // Motor ainda não consolidou a cadeia (ex.: competência sem receita/pró-labore
      // rodada) — não há o que armar; cai no semi-auto.
      return { ...base, motivoIndisponivel: 'motor-vazio' };
    }

    const payload: PgdasdPayload = {
      competencia,
      periodoApuracao: this.client.periodoApuracao(competencia),
      receitaBrutaMesCents,
      rbt12Cents,
      folha12mCents: Math.max(0, Number(mes.folha12mCents ?? 0)),
      anexoAplicado,
      aliquotaEfetiva: Number(mes.aliquotaEfetiva ?? 0),
      dasPrevistoCents,
    };

    return { ...base, disponivel: true, motivoIndisponivel: null, payload };
  }

  // -------------------------------------------------------------------------
  // TRANSMITIR — AÇÃO DE ESTADO (Lei nº1: SÓ sob clique-com-confirmação do dono).
  // -------------------------------------------------------------------------

  /**
   * O ato de transmitir: declara o PGDAS-D + gera o DAS + confere. `aprovadoPor`
   * É OBRIGATÓRIO e deve ser o userId REAL do dono (o controller garante isso a
   * partir do JWT + exige a confirmação "TRANSMITIR" digitada) — este método
   * RECUSA transmitir com aprovadoPor vazio/'auto-flag' (guarda em código da Lei
   * nº1: nenhuma transmissão anônima/automática).
   *
   * Fluxo:
   *   1) re-arma (o payload do motor, agora) — se indisponível, FALLBACK (não
   *      transmite; wizard cai no semi-auto);
   *   2) declararPgdasd (transmissão) — falhou → FALLBACK + trilha, NÃO retry;
   *   3) gerarDas (PDF) — falhou → estado TRANSMITIDO mas sem PDF (dono baixa
   *      manual pelo portal); trilha;
   *   4) conferência (consultarDeclaracao — LEITURA, pode retry): governo gravou
   *      == enviamos? DAS oficial == nosso (±R$1)? divergência → REVISAR + alerta.
   *   5) grava a obrigação PGDAS-D (estado + recibo) e anexa o PDF.
   */
  async transmitir(
    competencia: string,
    opts: { aprovadoPor: string; confirmacao?: string },
  ): Promise<SerproTransmitirResult> {
    this.assertCompetencia(competencia);

    // GUARDA EM CÓDIGO DA LEI Nº1 — nenhuma transmissão sem aprovador humano real.
    const aprovadoPor = String(opts?.aprovadoPor || '').trim();
    if (!aprovadoPor || aprovadoPor === 'auto-flag') {
      throw new BadRequestException(
        'Transmissão do PGDAS-D exige aprovação explícita do dono (Lei nº1: copiloto, não piloto). Nenhuma transmissão automática/anônima.',
      );
    }
    // Confirmação digitada "TRANSMITIR" (o clique-com-confirmação da Lei nº1).
    if (String(opts?.confirmacao || '').trim().toUpperCase() !== 'TRANSMITIR') {
      throw new BadRequestException('Confirme digitando TRANSMITIR para autorizar o envio ao Serpro.');
    }

    // 1) Re-arma agora (fonte = motor). Indisponível → FALLBACK (não transmite).
    const armado = await this.armar(competencia);
    if (!armado.disponivel || !armado.payload) {
      return this.fallback(competencia, `Serpro indisponível (${armado.motivoIndisponivel ?? 'desconhecido'}) — use o modo manual`);
    }
    const payload = armado.payload;

    let cred;
    try {
      cred = await this.cred.getCredencial();
    } catch (err) {
      return this.fallback(competencia, `credencial Serpro ausente/corrompida — use o modo manual`);
    }

    // 2) DECLARAR (transmissão). Falha → FALLBACK + trilha. NÃO retry (Lei nº1).
    let declarar;
    try {
      declarar = await this.client.declararPgdasd(cred, payload);
    } catch (err) {
      await this.trilha('DECLARAR_PGDASD', payload, false, null, null, aprovadoPor, null);
      return this.fallback(competencia, `falha ao declarar (${String((err as Error)?.message || err).slice(0, 120)}) — use o modo manual`);
    }
    await this.trilha('DECLARAR_PGDASD', payload, declarar.ok, declarar.httpStatus, declarar.numeroRecibo ?? null, aprovadoPor, declarar.dasApuradoCents ?? null);
    if (!declarar.ok || !declarar.numeroRecibo) {
      return this.fallback(competencia, `declaração recusada pelo Serpro (${declarar.erro ?? 'sem recibo'}) — use o modo manual`);
    }

    // 3) GERAR DAS (PDF). Falha aqui NÃO desfaz a declaração — segue TRANSMITIDO
    //    sem PDF (o dono baixa o DAS manual pelo portal). NÃO retry de transmissão.
    let dasPdfB64: string | null = null;
    let dasNumeroDocumento: string | null = null;
    try {
      const das = await this.client.gerarDas(cred, competencia);
      await this.trilha('GERAR_DAS', payload, das.ok, das.httpStatus, das.numeroDocumento ?? null, aprovadoPor, das.valorTotalCents ?? null);
      if (das.ok) {
        dasPdfB64 = das.pdfBase64 ?? null;
        dasNumeroDocumento = das.numeroDocumento ?? null;
      }
    } catch (err) {
      await this.trilha('GERAR_DAS', payload, false, null, null, aprovadoPor, null);
      this.logger.warn(`[contabil-serpro] gerar DAS falhou (declaração já entregue): ${String((err as Error)?.message || err)}`);
    }

    // 4) CONFERÊNCIA (leitura, retry permitido): governo gravou o que enviamos?
    const conferencia = await this.conferir(competencia, cred, payload, declarar.dasApuradoCents ?? null, aprovadoPor);

    // 5) Grava a obrigação PGDAS-D (recibo + estado) e anexa o PDF do DAS.
    const estado: SerproTransmitirResult['estado'] = conferencia.diverge ? 'REVISAR' : 'TRANSMITIDO';
    await this.gravarObrigacaoTransmitida(competencia, declarar.numeroRecibo, dasPdfB64, dasNumeroDocumento, estado);

    if (conferencia.diverge) {
      await this.alertarDivergencia(competencia, conferencia);
    }

    return {
      ok: !conferencia.diverge,
      competencia,
      numeroRecibo: declarar.numeroRecibo,
      dasPdfB64,
      dasNumeroDocumento,
      estado,
      conferencia,
    };
  }

  // -------------------------------------------------------------------------
  // CONFERÊNCIA — consultarDeclaracao (leitura) valida gravado × enviado + DAS.
  // -------------------------------------------------------------------------

  private async conferir(
    competencia: string,
    cred: any,
    payload: PgdasdPayload,
    dasGovernoDaDeclaracaoCents: number | null,
    aprovadoPor: string,
  ): Promise<NonNullable<SerproTransmitirResult['conferencia']>> {
    const dasNossoCents = payload.dasPrevistoCents;
    let dasGovernoCents: number | null = dasGovernoDaDeclaracaoCents;
    let detalhe = 'DAS conferido pela resposta da declaração';

    // Retry SÓ de CONSULTA (leitura idempotente) — nunca de transmissão.
    try {
      const cons = await this.client.consultarDeclaracao(cred, competencia);
      await this.trilha('CONSULTAR_DECLARACAO', payload, cons.ok, cons.httpStatus, cons.numeroRecibo ?? null, aprovadoPor, cons.dasApuradoCents ?? null);
      if (cons.ok && cons.encontrada && cons.dasApuradoCents != null) {
        dasGovernoCents = cons.dasApuradoCents;
        detalhe = 'DAS conferido pela consulta oficial da declaração gravada';
      }
    } catch (err) {
      this.logger.warn(`[contabil-serpro] conferência (consulta) falhou — usa o DAS da declaração: ${String((err as Error)?.message || err)}`);
    }

    if (dasGovernoCents == null) {
      // Sem valor do governo p/ comparar — não afirma que bate; marca p/ revisar
      // (o dono confere no portal). Divergência conservadora.
      return {
        conferido: false,
        dasNossoCents,
        dasGovernoCents: null,
        diffCents: null,
        diverge: true,
        detalhe: 'não foi possível obter o DAS oficial p/ conferir — revise no portal antes de pagar',
      };
    }

    const diffCents = Math.abs(dasGovernoCents - dasNossoCents);
    const diverge = diffCents > SERPRO_DIVERGENCIA_TOLERANCIA_CENTS;
    return {
      conferido: !diverge,
      dasNossoCents,
      dasGovernoCents,
      diffCents,
      diverge,
      detalhe: diverge
        ? `DAS oficial ${this.brl(dasGovernoCents)} ≠ nosso previsto ${this.brl(dasNossoCents)} (diferença ${this.brl(diffCents)}) — REVISAR`
        : detalhe,
    };
  }

  // -------------------------------------------------------------------------
  // FALLBACK — nunca bloqueia o fechamento; wizard cai no semi-auto do S5.
  // -------------------------------------------------------------------------

  private fallback(competencia: string, motivo: string): SerproTransmitirResult {
    this.logger.log(`[contabil-serpro] FALLBACK semi-auto em ${competencia}: ${motivo}`);
    return {
      ok: false,
      competencia,
      numeroRecibo: null,
      dasPdfB64: null,
      dasNumeroDocumento: null,
      estado: 'FALLBACK',
      conferencia: null,
      erro: motivo,
    };
  }

  // -------------------------------------------------------------------------
  // DEFIS assistida (anual) — SEMI-AUTO por decisão do sprint.
  // -------------------------------------------------------------------------

  /**
   * Monta os totais do ano prontos p/ a DEFIS (Declaração de Informações
   * Socioeconômicas e Fiscais, entregue jan–mar do ano seguinte): receita por
   * mês (do motor — FiscalRevenueMonth), folha e distribuição de lucro do ano
   * (do Livro Caixa S4). Formatado na ordem das telas da DEFIS + deep-link.
   *
   * DECISÃO REGISTRADA (sprint S7): a transmissão da DEFIS via API fica SEMI-AUTO
   * (o dono digita no portal, ~3 min/ano) — a operação DEFIS não está no ciclo
   * mínimo que automatizamos (PGDAS-D/DAS mensal, alto valor/frequência), e
   * automatizar 1 declaração/ano de baixo esforço não paga o risco. Se o catálogo
   * contratado expuser `TRANSDECLARACAO` de DEFIS trivial, religar aqui é aditivo.
   * Este método NÃO chama o Serpro — é LEITURA pura (monta o dossiê).
   */
  async defisDossie(ano: string): Promise<{
    ano: string;
    modo: 'semi-auto';
    receitaTotalAnoCents: number;
    receitasPorMes: Array<{ competencia: string; receitaCents: number }>;
    folhaAnoCents: number;
    distribuicaoLucroAnoCents: number;
    deepLink: string;
    nota: string;
  }> {
    if (!/^\d{4}$/.test(String(ano || ''))) {
      throw new BadRequestException(`ano inválido: '${ano}' (esperado 'YYYY')`);
    }
    // Receita por mês (motor). FiscalRevenueMonth é a fonte consolidada.
    const meses = await (this.prisma as any).fiscalRevenueMonth.findMany({
      where: { competencia: { startsWith: `${ano}-` } },
      orderBy: { competencia: 'asc' },
    });
    const receitasPorMes = meses.map((m: any) => ({
      competencia: m.competencia,
      receitaCents: Math.max(
        0,
        Number(m.receitaCaixaCents ?? 0) + Number(m.receitaNotasCents ?? 0) + Number(m.ajusteManualCents ?? 0),
      ),
    }));
    const receitaTotalAnoCents = receitasPorMes.reduce((s: number, r: any) => s + r.receitaCents, 0);
    const folhaAnoCents = meses.reduce((s: number, m: any) => s + Math.max(0, Number(m.folhaMesCents ?? 0)), 0);

    // Distribuição de lucro do ano (Livro Caixa S4).
    let distribuicaoLucroAnoCents = 0;
    try {
      const dist = await (this.prisma as any).fiscalLedgerEntry.findMany({
        where: { competencia: { startsWith: `${ano}-` }, tipo: 'SAIDA', categoria: 'DISTRIBUICAO_LUCRO' },
      });
      distribuicaoLucroAnoCents = dist.reduce((s: number, r: any) => s + Number(r.valorCents || 0), 0);
    } catch {
      /* best-effort */
    }

    return {
      ano,
      modo: 'semi-auto',
      receitaTotalAnoCents,
      receitasPorMes,
      folhaAnoCents,
      distribuicaoLucroAnoCents,
      deepLink: 'https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/defis.app/',
      nota: 'DEFIS é semi-auto: use os totais prontos acima e digite no portal (poucos minutos/ano).',
    };
  }

  // -------------------------------------------------------------------------
  // Persistência da obrigação + trilha + alerta.
  // -------------------------------------------------------------------------

  /**
   * Marca a obrigação PGDAS-D da competência com o recibo real + estado
   * (TRANSMITIDO ou REVISAR) e guarda o PDF do DAS no resultJson. Best-effort:
   * a falha de gravação não desfaz a transmissão (que já aconteceu no governo).
   */
  private async gravarObrigacaoTransmitida(
    competencia: string,
    numeroRecibo: string,
    dasPdfB64: string | null,
    dasNumeroDocumento: string | null,
    estado: 'TRANSMITIDO' | 'REVISAR',
  ): Promise<void> {
    try {
      const ob = await (this.prisma as any).fiscalObligation.findUnique({
        where: { competencia_tipo: { competencia, tipo: 'PGDASD' } },
      });
      const resultJson = JSON.stringify({
        via: 'serpro',
        numeroRecibo,
        dasNumeroDocumento,
        dasPdfB64: dasPdfB64 || null, // PDF anexado à obrigação (auditoria/impressão)
        transmitidoEm: new Date().toISOString(),
      });
      if (ob) {
        await (this.prisma as any).fiscalObligation.update({ where: { id: ob.id }, data: { estado, resultJson } });
      } else {
        this.logger.warn(`[contabil-serpro] obrigação PGDASD de ${competencia} não encontrada p/ marcar (transmissão OK).`);
      }
    } catch (err) {
      this.logger.warn(`[contabil-serpro] falha ao gravar obrigação PGDASD de ${competencia}: ${String((err as Error)?.message || err)}`);
    }
  }

  /**
   * Grava a trilha (Lei nº4). requestResumo SEM segredo: só competência/valores/
   * anexo — nunca credencial, token ou CNPJ completo.
   */
  private async trilha(
    operacao: string,
    payload: PgdasdPayload,
    sucesso: boolean,
    httpStatus: number | null,
    resultRef: string | null,
    aprovadoPor: string,
    valorGovernoCents: number | null,
  ): Promise<void> {
    const resumo =
      `PGDAS-D ${SerproIntegraClient.ambiente()} comp=${payload.competencia} ` +
      `receita=${this.brl(payload.receitaBrutaMesCents)} anexo=${payload.anexoAplicado} ` +
      `dasNosso=${this.brl(payload.dasPrevistoCents)}` +
      (valorGovernoCents != null ? ` dasGov=${this.brl(valorGovernoCents)}` : '');
    await this.automationLog.registrar({
      sistema: 'SERPRO',
      operacao,
      requestResumo: resumo,
      httpStatus: httpStatus ?? null,
      sucesso,
      resultRef: resultRef ?? null,
      aprovadoPor,
    });
  }

  private async alertarDivergencia(competencia: string, conf: NonNullable<SerproTransmitirResult['conferencia']>): Promise<void> {
    try {
      await this.masterAlert.fiscalObligationAlert({
        competencia,
        tipo: 'SERPRO_DIVERGENCIA',
        estado: 'REVISAR',
        dueDate: new Date(),
        texto:
          `🔴 PGDAS-D transmitido, MAS o DAS oficial divergiu do previsto: ${conf.detalhe}. ` +
          `A obrigação foi marcada como REVISAR — confira no portal do Simples Nacional antes de pagar.`,
        permitirWhatsapp: true,
      });
    } catch {
      /* best-effort */
    }
  }

  // -------------------------------------------------------------------------
  // Helpers de exibição.
  // -------------------------------------------------------------------------

  private brl(cents: number): string {
    return (Math.max(0, Math.round(cents)) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private custoLabel(cents: number): string {
    return `~${this.brl(cents)} de API`;
  }

  static readonly DIVERGENCIA_TOLERANCIA_CENTS = SERPRO_DIVERGENCIA_TOLERANCIA_CENTS;
}
