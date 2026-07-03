import { Injectable } from '@nestjs/common';
import {
  anexoVigente,
  inssVigente,
  irrfVigente,
  presuncaoVigente,
  FATOR_R_LIMIAR_ANEXO_III,
  type SimplesFaixa,
} from './fiscal-tables';

// ===========================================================================
// CONTABIL — Motor fiscal (Lei do Contabil nº2: 100% determinístico, testado)
// ---------------------------------------------------------------------------
// FUNÇÕES PURAS: entrada → saída, SEM I/O, SEM banco, SEM data-de-hoje implícita.
// A competência ('YYYY-MM') entra por parâmetro para selecionar a tabela vigente
// (default '2026-07' — competência de referência dos golden tests).
//
// UNIDADES: dinheiro em cents (Int); percentuais em Float decimal. Toda saída
// monetária é Int (cents) arredondado com Math.round (meio-para-cima).
//
// IA NÃO calcula imposto — este serviço é a ÚNICA autoridade de cálculo.
// ===========================================================================

/** Competência de referência default (golden tests). */
export const COMPETENCIA_REF = '2026-07';

export type AnexoAplicado = 'III' | 'V';

export interface CenarioTributos {
  dasCents: number;
  inssCents: number;
  irrfCents: number;
  totalTributosCents: number;
}

/** Arredondamento monetário determinístico (cents), meio-para-cima, sem negativos. */
function roundCents(v: number): number {
  return Math.max(0, Math.round(v));
}

@Injectable()
export class FiscalEngineService {
  // -------------------------------------------------------------------------
  // RBT12 / folha 12m — com proporcionalização de início de atividade
  // -------------------------------------------------------------------------

  /**
   * Receita Bruta dos 12 meses anteriores. Empresa com histórico completo:
   * soma direta dos 12 valores. Empresa com < 12 meses de atividade (regra do
   * PGDAS-D): média dos meses existentes × 12. `mesesAtividade` opcional força
   * o divisor (útil quando há competências ainda sem receita registrada).
   */
  rbt12(receitasMensaisCents: number[], mesesAtividade?: number): number {
    return this.somaProporcionalizada(receitasMensaisCents, mesesAtividade);
  }

  /** Folha (pró-labore bruto) dos 12 meses anteriores — mesma regra do RBT12. */
  folha12m(folhasMensaisCents: number[], mesesAtividade?: number): number {
    return this.somaProporcionalizada(folhasMensaisCents, mesesAtividade);
  }

  private somaProporcionalizada(valoresCents: number[], mesesAtividade?: number): number {
    const valores = (valoresCents || []).map((v) => Math.max(0, Math.trunc(v)));
    const meses =
      mesesAtividade !== undefined && mesesAtividade > 0
        ? Math.min(Math.trunc(mesesAtividade), 12)
        : valores.length;
    if (meses <= 0) return 0;
    const soma = valores.slice(0, meses).reduce((a, b) => a + b, 0);
    if (meses >= 12) return soma;
    // Proporcionalização: média dos meses existentes × 12.
    return roundCents((soma / meses) * 12);
  }

  // -------------------------------------------------------------------------
  // Fator R → anexo aplicado
  // -------------------------------------------------------------------------

  /** folha12m / rbt12. rbt12 = 0 → 0 (evita divisão por zero). */
  fatorR(folha12mCents: number, rbt12Cents: number): number {
    if (rbt12Cents <= 0) return 0;
    return folha12mCents / rbt12Cents;
  }

  /** Fator R >= 0,28 → Anexo III; senão Anexo V. */
  anexoPorFatorR(fatorR: number): AnexoAplicado {
    return fatorR >= FATOR_R_LIMIAR_ANEXO_III ? 'III' : 'V';
  }

  // -------------------------------------------------------------------------
  // Alíquota efetiva e DAS
  // -------------------------------------------------------------------------

  private faixaSimples(rbt12Cents: number, anexo: AnexoAplicado, competencia: string): SimplesFaixa {
    const tabela = anexoVigente(anexo, competencia);
    const faixa = tabela.faixas.find((f) => rbt12Cents <= f.rbt12AteCents);
    // Acima do teto do Simples: usa a última faixa (limite de enquadramento é
    // problema de elegibilidade, não deste cálculo).
    return faixa ?? tabela.faixas[tabela.faixas.length - 1];
  }

  /**
   * Alíquota efetiva do Simples = (RBT12 × alíqNominal − parcelaDeduzir) / RBT12.
   * Retorna Float decimal (0.06 = 6%). rbt12 = 0 → 0.
   */
  aliquotaEfetiva(rbt12Cents: number, anexo: AnexoAplicado, competencia = COMPETENCIA_REF): number {
    if (rbt12Cents <= 0) return 0;
    const faixa = this.faixaSimples(rbt12Cents, anexo, competencia);
    const efetiva = (rbt12Cents * faixa.aliquotaNominal - faixa.parcelaDeduzirCents) / rbt12Cents;
    return Math.max(0, efetiva);
  }

  /** DAS do mês = receita do mês × alíquota efetiva. Saída em cents. */
  dasDoMes(receitaMesCents: number, aliquotaEfetiva: number): number {
    return roundCents(receitaMesCents * aliquotaEfetiva);
  }

  // -------------------------------------------------------------------------
  // INSS e IRRF sobre pró-labore
  // -------------------------------------------------------------------------

  /** INSS contribuinte individual: 11% do pró-labore bruto, limitado ao teto. */
  inssProlabore(brutoCents: number, competencia = COMPETENCIA_REF): number {
    const t = inssVigente(competencia);
    const baseCents = Math.min(Math.max(0, brutoCents), t.tetoBaseCents);
    const inss = roundCents(baseCents * t.aliquota);
    return Math.min(inss, t.contribuicaoMaximaCents);
  }

  /**
   * IRRF mensal sobre pró-labore (base = bruto − INSS), com isenção/redutor 2026:
   *  - bruto <= 5.000            → 0 (isenção total, Lei 15.270/2025);
   *  - 5.000 < bruto <= 7.350    → max(0, tabela − redutor);
   *  - bruto > 7.350             → tabela pura.
   */
  irrfProlabore(brutoCents: number, inssCents: number, competencia = COMPETENCIA_REF): number {
    const bruto = Math.max(0, brutoCents);
    const t = irrfVigente(competencia);

    // Isenção total até o piso.
    if (bruto <= t.isencaoAteCents) return 0;

    const baseCents = Math.max(0, bruto - Math.max(0, inssCents));
    const faixa = t.faixas.find((f) => baseCents <= f.baseAteCents) ?? t.faixas[t.faixas.length - 1];
    const impostoTabela = roundCents(baseCents * faixa.aliquota - faixa.parcelaDeduzirCents);

    // Banda de redutor decrescente (isenção parcial).
    if (bruto <= t.redutorFimCents) {
      const redutor = roundCents(t.redutorBaseCents - t.redutorFator * bruto);
      return Math.max(0, impostoTabela - Math.max(0, redutor));
    }

    // Acima de 7.350: sem redução.
    return impostoTabela;
  }

  // -------------------------------------------------------------------------
  // Pró-labore recomendado (o "pensa comigo" nº1)
  // -------------------------------------------------------------------------

  /**
   * Menor pró-labore (cents) na competência que mantém Fator R >= 0,28, dado o
   * RBT12 projetado (que já inclui a receita prevista do mês) e a folha dos 11
   * meses anteriores. Fórmula: folha12m_alvo = 0,28 × rbt12 → pró-labore do mês
   * = folha12m_alvo − folha dos 11 meses. Arredonda PARA CIMA (ceil) ao centavo
   * p/ garantir >= 0,2800 exato (nunca 0,2799…).
   */
  prolaboreRecomendado(
    rbt12ProjetadoCents: number,
    folha11mAnterioresCents: number,
    limiar = FATOR_R_LIMIAR_ANEXO_III,
  ): number {
    const folhaAlvo = Math.ceil(limiar * Math.max(0, rbt12ProjetadoCents));
    const doMes = folhaAlvo - Math.max(0, folha11mAnterioresCents);
    return Math.max(0, doMes);
  }

  // -------------------------------------------------------------------------
  // Simulador de cenário (base do simulador da UI — S3)
  // -------------------------------------------------------------------------

  /**
   * Simula os tributos de uma competência. Se `rbt12Cents` não vier, usa a
   * própria receita do mês como RBT12 (cenário simplificado da UI). O anexo pode
   * ser forçado; caso contrário deriva do Fator R a partir de `folha12mCents`.
   */
  simulaCenario(input: {
    receitaMesCents: number;
    prolaboreCents: number;
    rbt12Cents?: number;
    folha12mCents?: number;
    anexo?: AnexoAplicado;
    competencia?: string;
  }): CenarioTributos & { anexoAplicado: AnexoAplicado; aliquotaEfetiva: number; fatorR: number } {
    const competencia = input.competencia ?? COMPETENCIA_REF;
    const rbt12 = input.rbt12Cents ?? input.receitaMesCents;
    const folha12 = input.folha12mCents ?? 0;
    const fr = this.fatorR(folha12, rbt12);
    const anexo = input.anexo ?? this.anexoPorFatorR(fr);
    const efetiva = this.aliquotaEfetiva(rbt12, anexo, competencia);
    const das = this.dasDoMes(input.receitaMesCents, efetiva);
    const inss = this.inssProlabore(input.prolaboreCents, competencia);
    const irrf = this.irrfProlabore(input.prolaboreCents, inss, competencia);
    return {
      dasCents: das,
      inssCents: inss,
      irrfCents: irrf,
      totalTributosCents: das + inss + irrf,
      anexoAplicado: anexo,
      aliquotaEfetiva: efetiva,
      fatorR: fr,
    };
  }

  // -------------------------------------------------------------------------
  // Lucro isento disponível para distribuição
  // -------------------------------------------------------------------------

  /**
   * Lucro isento distribuível (presunção, sem escrituração completa):
   *   32% × receita acumulada − DAS pago acumulado − já distribuído.
   * Nunca negativo.
   */
  lucroIsentoDisponivel(
    receitaAcumuladaCents: number,
    dasPagoAcumuladoCents: number,
    jaDistribuidoCents = 0,
    competencia = COMPETENCIA_REF,
  ): number {
    const p = presuncaoVigente(competencia);
    const presumido = roundCents(receitaAcumuladaCents * p.percentualServicos);
    return Math.max(
      0,
      presumido - Math.max(0, dasPagoAcumuladoCents) - Math.max(0, jaDistribuidoCents),
    );
  }
}
