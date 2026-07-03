import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ensureMasterBillingRuntimeSchema } from '../modules/master-runtime';
import { MasterAlertService } from '../master-alert/master-alert.service';
import { NfseCertService } from './nfse-cert.service';
import { NfseNationalClient, type DpsInput, type NfseAmbiente } from './nfse-national.client';
import { FiscalAutomationLogService } from './fiscal-automation-log.service';

// ===========================================================================
// CONTABIL S6 — Emissor de NFS-e (o job "cada pagamento vira nota").
// ---------------------------------------------------------------------------
// 1) INDEXAÇÃO: cada MasterBillingLedgerEntry revenue APROVADO (líquido de
//    estorno, mesma base do S1/S4) vira 1 FiscalInvoice PENDENTE. Idempotente:
//    paymentRefId @unique → mesmo pagamento nunca gera 2 notas.
// 2) EMISSÃO: processa as PENDENTE/ERRO reprocessáveis → monta+assina+POST via
//    NfseNationalClient. Retry por invoice: máx 3 tentativas (tentativas++), depois
//    marca ERRO e alerta o dono.
// 3) DISJUNTOR (Guardrail duro): 3 ERROs CONSECUTIVOS na varredura PAUSAM a fila
//    (para a varredura, alerta 1x) — NUNCA martela a API oficial. A retomada é
//    manual (dono resolve a causa e re-dispara). Igual à filosofia do disjuntor
//    de reconexão do WhatsApp: a correção é o FREIO, não tapar o sintoma.
//
// ⚠️ FLAG: HBX_CONTABIL_NFSE_ENABLED (default OFF). Com a flag OFF, a EMISSÃO
// (passo 2/3) nem tenta — a fila fica parada e nenhuma chamada externa acontece.
// A INDEXAÇÃO (passo 1) é inofensiva (só escreve FiscalInvoice PENDENTE local),
// mas também só roda sob demanda/flag p/ o deploy OFF ser 100% inerte.
// ===========================================================================

const MAX_TENTATIVAS = 3;
const DISJUNTOR_ERROS_CONSECUTIVOS = 3;
/** backoff simples entre tentativas da MESMA invoice (ms) — cresce com a tentativa. */
const BACKOFF_BASE_MS = 500;

interface LedgerRevenueRow {
  id: string;
  companyId: number;
  competence: string | null;
  amount: number; // reais
  status: string;
  referenceLabel: string | null;
  refundAmountReais: number | null;
}

export interface EmissaoResultado {
  indexadas: number; // novas FiscalInvoice PENDENTE criadas
  emitidas: number; // notas emitidas com sucesso nesta rodada
  falhas: number; // invoices que caíram em ERRO nesta rodada
  disjuntorAbriu: boolean; // true se 3 erros seguidos pausaram a fila
  puladoFlagOff: boolean; // true se a emissão nem tentou (flag OFF)
}

@Injectable()
export class NfseEmitterService {
  private readonly logger = new Logger(NfseEmitterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cert: NfseCertService,
    private readonly client: NfseNationalClient,
    private readonly masterAlert: MasterAlertService,
    private readonly automationLog: FiscalAutomationLogService,
  ) {}

  private assertCompetencia(competencia: string) {
    if (!/^\d{4}-\d{2}$/.test(String(competencia || ''))) {
      throw new Error(`competência inválida: '${competencia}' (esperado 'YYYY-MM')`);
    }
  }

  // -------------------------------------------------------------------------
  // 1) INDEXAÇÃO — pagamento aprovado → FiscalInvoice PENDENTE (idempotente).
  // -------------------------------------------------------------------------

  /**
   * Varre os pagamentos revenue APROVADOS da competência e garante 1 FiscalInvoice
   * PENDENTE por pagamento (valor LÍQUIDO de estorno). Não emite nada — só cria a
   * fila local. Idempotente: paymentRefId @unique (2ª passada não duplica). Pula
   * pagamentos 100% estornados (valor líquido 0 → nada a faturar).
   */
  async indexarCompetencia(competencia: string): Promise<number> {
    this.assertCompetencia(competencia);
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const rows = await this.prisma.$queryRaw<LedgerRevenueRow[]>(Prisma.sql`
      SELECT mble."id" AS "id", mble."companyId" AS "companyId", mble."competence" AS "competence",
             mble."amount" AS "amount", mble."status" AS "status", mble."referenceLabel" AS "referenceLabel",
             fc."refundAmount" AS "refundAmountReais"
      FROM "MasterBillingLedgerEntry" mble
      LEFT JOIN "FinanceiroCharge" fc ON fc."ledgerEntryId" = mble."id"
      WHERE mble."entryGroup" = 'revenue'
        AND UPPER(mble."status") IN ('APPROVED', 'REFUNDED', 'PARTIALLY_REFUNDED')
        AND mble."competence" = ${competencia}
    `);

    let criadas = 0;
    for (const row of rows) {
      const brutoCents = Math.max(0, Math.round(Number(row.amount || 0) * 100));
      const refundCents = Math.max(0, Math.round(Number(row.refundAmountReais || 0) * 100));
      const liquidoCents = Math.max(0, brutoCents - refundCents);
      if (liquidoCents <= 0) continue; // 100% estornado → não emite nota.

      const existente = await (this.prisma as any).fiscalInvoice.findUnique({ where: { paymentRefId: row.id } });
      if (existente) {
        // Ajuste de estorno tardio (só enquanto ainda PENDENTE — nota emitida
        // não muda de valor; correção de nota emitida é cancelamento MANUAL).
        if (existente.status === 'PENDENTE' && existente.valorCents !== liquidoCents) {
          await (this.prisma as any).fiscalInvoice.update({ where: { id: existente.id }, data: { valorCents: liquidoCents } });
        }
        continue;
      }

      const tomador = await this.resolverTomador(row.companyId);
      await (this.prisma as any).fiscalInvoice.create({
        data: {
          paymentRefId: row.id,
          competencia,
          companyId: row.companyId,
          tomadorNome: tomador.nome,
          tomadorDoc: tomador.doc,
          valorCents: liquidoCents,
          status: 'PENDENTE',
          tentativas: 0,
        },
      });
      criadas += 1;
    }
    return criadas;
  }

  // -------------------------------------------------------------------------
  // 2+3) EMISSÃO com retry + DISJUNTOR.
  // -------------------------------------------------------------------------

  /**
   * Processa a fila de FiscalInvoice reprocessáveis (PENDENTE ou ERRO com
   * tentativas < MAX). Para cada uma: monta+assina+POST. DISJUNTOR: ao acumular
   * 3 ERROs CONSECUTIVOS, PARA a varredura, alerta o dono e retorna (não martela).
   *
   * Flag OFF → retorna imediatamente sem tocar a fila nem a rede (deploy inerte).
   */
  async emitirPendentes(opts: { competencia?: string; aprovadoPor?: string; limite?: number } = {}): Promise<EmissaoResultado> {
    const base: EmissaoResultado = { indexadas: 0, emitidas: 0, falhas: 0, disjuntorAbriu: false, puladoFlagOff: false };

    if (!NfseNationalClient.isEnabled()) {
      this.logger.log('[contabil] NFS-e DESLIGADA (HBX_CONTABIL_NFSE_ENABLED=0) — emissão inerte');
      return { ...base, puladoFlagOff: true };
    }

    const perfil = await (this.prisma as any).fiscalProfile.findUnique({ where: { id: 1 } });
    const prestador = this.montarPrestador(perfil);
    if (!prestador) {
      this.logger.warn('[contabil] NFS-e ligada mas FiscalProfile sem CNPJ/razão — emissão abortada');
      return base;
    }

    let cert;
    try {
      cert = await this.cert.getSigningMaterial();
    } catch {
      this.logger.warn('[contabil] NFS-e ligada mas certificado A1 não configurado no cofre — emissão abortada');
      return base;
    }

    const ambiente = NfseNationalClient.ambiente();
    const limite = Math.max(1, Math.min(200, Math.trunc(opts.limite || 50)));

    const where: Record<string, unknown> = { status: { in: ['PENDENTE', 'ERRO'] }, tentativas: { lt: MAX_TENTATIVAS } };
    if (opts.competencia) { this.assertCompetencia(opts.competencia); where.competencia = opts.competencia; }
    const fila = await (this.prisma as any).fiscalInvoice.findMany({ where, orderBy: { createdAt: 'asc' }, take: limite });

    let errosConsecutivos = 0;
    const result: EmissaoResultado = { ...base };

    for (const inv of fila) {
      const ok = await this.emitirUma(inv, prestador, cert, ambiente, opts.aprovadoPor || 'auto-flag');
      if (ok) {
        result.emitidas += 1;
        errosConsecutivos = 0; // sucesso reseta o disjuntor.
      } else {
        result.falhas += 1;
        errosConsecutivos += 1;
        if (errosConsecutivos >= DISJUNTOR_ERROS_CONSECUTIVOS) {
          result.disjuntorAbriu = true;
          await this.alertarDisjuntor(errosConsecutivos);
          this.logger.error(`[contabil] DISJUNTOR NFS-e ABERTO: ${errosConsecutivos} erros consecutivos — fila PAUSADA (retomada manual)`);
          break; // NUNCA uma 4ª tentativa em cima do disjuntor aberto.
        }
      }
    }

    return result;
  }

  /**
   * Emite UMA invoice. Retorna true=sucesso, false=falha (já registrou tentativa,
   * ERRO+alerta se estourou o máximo). Retry por invoice com backoff crescente
   * até MAX_TENTATIVAS — mas 1 chamada de rede por passada (o loop externo é que
   * repassa em rodadas; aqui incrementamos tentativas e paramos na falha desta).
   */
  private async emitirUma(inv: any, prestador: any, cert: any, ambiente: NfseAmbiente, aprovadoPor: string): Promise<boolean> {
    const tentativaAtual = Number(inv.tentativas || 0) + 1;
    // backoff antes da tentativa (protege a API; 0 na 1ª).
    if (tentativaAtual > 1) await this.sleep(BACKOFF_BASE_MS * (tentativaAtual - 1));

    const dps: DpsInput = {
      serie: 'HBX1',
      numero: this.numeroDpsDe(inv),
      competencia: inv.competencia,
      prestador,
      tomador: { documento: String(inv.tomadorDoc || ''), nome: String(inv.tomadorNome || 'Tomador') },
      servico: {
        descricao: 'Licenciamento de uso de software (SaaS HBX)',
        valorCents: inv.valorCents,
        codigoTributacaoNacional: '01.05', // licenciamento de software (lista LC 116)
        cnae: '6203100', // CNAE 6203-1/00
        codigoMunicipio: prestador.codigoMunicipio,
        aliquotaIss: 0,
      },
      ambiente,
    };

    let transportStatus = 0;
    try {
      const { result, xmlAssinado } = await this.client.emitir(dps, cert);
      transportStatus = result.httpStatus;
      if (result.ok && result.chaveAcesso) {
        await (this.prisma as any).fiscalInvoice.update({
          where: { id: inv.id },
          data: {
            status: 'EMITIDA',
            chaveAcesso: result.chaveAcesso,
            numeroDps: String(dps.numero),
            xmlGzB64: result.xmlRetornoGzB64 ?? this.client.montarPayload(xmlAssinado),
            erroMsg: null,
            tentativas: tentativaAtual,
            emitidaEm: new Date(),
          },
        });
        await this.marcarReceitaNotas(inv.competencia);
        await this.automationLog.registrar({
          sistema: 'NFSE',
          operacao: 'EMITIR_DPS',
          requestResumo: this.resumoSemSegredo(inv, dps),
          httpStatus: transportStatus,
          sucesso: true,
          resultRef: result.chaveAcesso,
          aprovadoPor,
        });
        return true;
      }
      // Falha "de negócio" (HTTP não-2xx ou sem chave).
      return await this.registrarFalha(inv, tentativaAtual, result.erro || `HTTP ${transportStatus}`, transportStatus, dps, aprovadoPor);
    } catch (err) {
      return await this.registrarFalha(inv, tentativaAtual, String((err as Error)?.message || err).slice(0, 200), transportStatus, dps, aprovadoPor);
    }
  }

  private async registrarFalha(inv: any, tentativa: number, erro: string, httpStatus: number, dps: DpsInput, aprovadoPor: string): Promise<boolean> {
    const estourou = tentativa >= MAX_TENTATIVAS;
    await (this.prisma as any).fiscalInvoice.update({
      where: { id: inv.id },
      data: { status: estourou ? 'ERRO' : 'PENDENTE', tentativas: tentativa, erroMsg: erro },
    });
    await this.automationLog.registrar({
      sistema: 'NFSE',
      operacao: 'EMITIR_DPS',
      requestResumo: this.resumoSemSegredo(inv, dps),
      httpStatus: httpStatus || null,
      sucesso: false,
      resultRef: null,
      aprovadoPor,
    });
    if (estourou) {
      await this.alertarInvoiceErro(inv, erro);
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // RECONCILIAÇÃO pagamentos × notas + receitaNotasCents.
  // -------------------------------------------------------------------------

  /**
   * Reconcilia: quais pagamentos da competência têm nota emitida e quais não.
   * `semNota` (🔴 na janela) = pagamentos indexados ainda sem EMITIDA. Também
   * expõe a divergência caixa × notas (receita do ledger × soma das notas emitidas).
   */
  async reconciliar(competencia: string) {
    this.assertCompetencia(competencia);
    await this.indexarCompetencia(competencia); // garante a fila atualizada (idempotente).

    const invoices = await (this.prisma as any).fiscalInvoice.findMany({ where: { competencia } });
    const emitidas = invoices.filter((i: any) => i.status === 'EMITIDA');
    const pendentes = invoices.filter((i: any) => i.status === 'PENDENTE');
    const comErro = invoices.filter((i: any) => i.status === 'ERRO');

    const receitaNotasCents = emitidas.reduce((s: number, i: any) => s + Number(i.valorCents || 0), 0);
    const receitaFaturavelCents = invoices
      .filter((i: any) => i.status !== 'CANCELADA')
      .reduce((s: number, i: any) => s + Number(i.valorCents || 0), 0);

    return {
      competencia,
      totalPagamentos: invoices.length,
      emitidas: emitidas.length,
      pendentes: pendentes.length,
      comErro: comErro.length,
      receitaNotasCents,
      receitaFaturavelCents,
      divergenciaCents: receitaFaturavelCents - receitaNotasCents,
      semNota: [...pendentes, ...comErro].map((i: any) => ({
        id: i.id,
        paymentRefId: i.paymentRefId,
        tomadorNome: i.tomadorNome,
        valorCents: i.valorCents,
        status: i.status,
        tentativas: i.tentativas,
        erroMsg: i.erroMsg ?? null,
      })),
    };
  }

  /** Espelha a soma das notas emitidas em FiscalRevenueMonth.receitaNotasCents (S1 zera hoje). */
  private async marcarReceitaNotas(competencia: string): Promise<void> {
    try {
      const emitidas = await (this.prisma as any).fiscalInvoice.findMany({ where: { competencia, status: 'EMITIDA' } });
      const receitaNotasCents = emitidas.reduce((s: number, i: any) => s + Number(i.valorCents || 0), 0);
      const row = await (this.prisma as any).fiscalRevenueMonth.findUnique({ where: { competencia } });
      if (row) {
        await (this.prisma as any).fiscalRevenueMonth.update({ where: { competencia }, data: { receitaNotasCents } });
      }
    } catch (err) {
      this.logger.warn(`[contabil] falha ao espelhar receitaNotasCents (${competencia}): ${String((err as Error)?.message || err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private montarPrestador(perfil: any): { cnpj: string; razaoSocial: string; codigoMunicipio: string; inscricaoMunicipal: string | null; regimeTributario: string | null } | null {
    const cnpj = String(perfil?.cnpj || '').replace(/\D/g, '');
    const razaoSocial = String(perfil?.razaoSocial || '').trim();
    if (cnpj.length !== 14 || !razaoSocial) return null;
    return {
      cnpj,
      razaoSocial,
      // Município do prestador: env (IBGE 7 díg) — no perfil não há campo; default vazio força config no gate LIVE.
      codigoMunicipio: String(process.env.HBX_CONTABIL_MUNICIPIO_IBGE || '').replace(/\D/g, '') || '0000000',
      inscricaoMunicipal: null,
      regimeTributario: '1', // Simples Nacional
    };
  }

  private async resolverTomador(companyId: number): Promise<{ nome: string | null; doc: string | null }> {
    try {
      const company = await (this.prisma as any).company.findUnique({
        where: { id: companyId },
        select: { name: true, taxDocument: true },
      });
      const nome = String(company?.name || '').trim() || null;
      const doc = String(company?.taxDocument || '').replace(/\D/g, '') || null;
      return { nome, doc };
    } catch {
      return { nome: null, doc: null };
    }
  }

  private numeroDpsDe(inv: any): number {
    // Nº determinístico e estável por invoice (não colide entre invoices distintas).
    if (inv.numeroDps && Number(inv.numeroDps) > 0) return Number(inv.numeroDps);
    let h = 0;
    for (const ch of String(inv.id)) h = (h * 31 + ch.charCodeAt(0)) % 900000000;
    return h + 1;
  }

  private resumoSemSegredo(inv: any, dps: DpsInput): string {
    const valorReais = (Number(inv.valorCents || 0) / 100).toFixed(2);
    const tomador = String(inv.tomadorNome || 'tomador').slice(0, 24);
    return `NFS-e ${dps.ambiente} comp=${inv.competencia} valor=R$${valorReais} tomador=${tomador} pagamento=${String(inv.paymentRefId).slice(0, 10)}`;
  }

  private async alertarInvoiceErro(inv: any, erro: string): Promise<void> {
    try {
      const valorReais = (Number(inv.valorCents || 0) / 100).toFixed(2);
      await this.masterAlert.fiscalObligationAlert({
        competencia: inv.competencia,
        tipo: 'NFSE_ERRO',
        estado: 'ERRO',
        dueDate: new Date(),
        texto: `🔴 NFS-e falhou (3 tentativas): pagamento ${String(inv.paymentRefId).slice(0, 10)} — R$${valorReais} (${String(inv.tomadorNome || 'tomador')}). Motivo: ${erro}. Emitir manual pelo portal ou revisar.`,
        permitirWhatsapp: true,
      });
    } catch { /* best-effort */ }
  }

  private async alertarDisjuntor(erros: number): Promise<void> {
    try {
      await this.masterAlert.fiscalObligationAlert({
        competencia: new Date().toISOString().slice(0, 7),
        tipo: 'NFSE_DISJUNTOR',
        estado: 'ERRO',
        dueDate: new Date(),
        texto: `🔴 DISJUNTOR NFS-e ABERTO: ${erros} erros seguidos ao emitir. A fila foi PAUSADA para não martelar a API oficial. Resolva a causa e re-dispare a emissão.`,
        permitirWhatsapp: true,
      });
    } catch { /* best-effort */ }
  }

  private sleep(ms: number): Promise<void> {
    // Backoff real protege a API oficial em produção; em teste (NODE_ENV=test) é
    // no-op p/ a suíte não gastar segundos em timers (o comportamento testado é a
    // sequência de tentativas/disjuntor, não a espera em si).
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'test') return Promise.resolve();
    return new Promise((r) => setTimeout(r, Math.max(0, ms)));
  }
}
