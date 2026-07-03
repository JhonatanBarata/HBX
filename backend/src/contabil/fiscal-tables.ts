// ===========================================================================
// CONTABIL — Tabelas fiscais versionadas por vigência (Lei do Contabil nº2)
// ---------------------------------------------------------------------------
// TODAS as constantes tributárias vivem AQUI, com { vigenciaInicio, vigenciaFim?,
// fonte }. Quando o governo mudar uma tabela, a correção é ADICIONAR uma nova
// entrada com a nova vigência — NUNCA um refactor no motor. O motor
// (fiscal-engine.service.ts) só CONSOME estas tabelas via os seletores por data.
//
// UNIDADES (regra dura do sprint):
//   - Dinheiro SEMPRE em cents (Int). Sufixo *Cents.
//   - Percentuais/alíquotas SEMPRE Float decimal (0.06 = 6%).
//   - "parcela a deduzir" das faixas do Simples e do IRRF são VALORES → cents.
//
// FONTES (conferidas 2026):
//   - Simples Nacional Anexos III e V: LC 123/2006 (Anexos com 6 faixas).
//   - INSS contribuinte individual (sócio, pró-labore): 11%, teto 2026.
//   - IRRF mensal 2026: tabela progressiva (Lei 15.191/2025) + isenção/redutor
//     da Lei 15.270/2025 (isento até R$ 5.000; redutor decrescente até R$ 7.350).
//   - Presunção de lucro (serviços) p/ distribuição isenta sem escrituração: 32%.
// ===========================================================================

/** Bloco versionado — todo conjunto de constantes carrega sua vigência + fonte. */
export interface VigenciaMeta {
  /** ISO date 'YYYY-MM-DD' — início da vigência (inclusive). */
  vigenciaInicio: string;
  /** ISO date 'YYYY-MM-DD' — fim da vigência (inclusive). Ausente = vigente. */
  vigenciaFim?: string;
  /** Referência legal / origem do número. */
  fonte: string;
}

// ---------------------------------------------------------------------------
// SIMPLES NACIONAL — Anexos (6 faixas: teto RBT12 + alíquota nominal + dedução)
// ---------------------------------------------------------------------------

export interface SimplesFaixa {
  /** Teto de RBT12 da faixa, em cents (inclusive). */
  rbt12AteCents: number;
  /** Alíquota nominal (decimal). */
  aliquotaNominal: number;
  /** Parcela a deduzir, em cents. */
  parcelaDeduzirCents: number;
}

export interface SimplesAnexoTabela extends VigenciaMeta {
  anexo: 'III' | 'V';
  faixas: SimplesFaixa[];
}

// LC 123/2006 — Anexo III (serviços; aplicado quando Fator R >= 0,28).
const ANEXO_III_2018: SimplesAnexoTabela = {
  anexo: 'III',
  vigenciaInicio: '2018-01-01',
  fonte: 'LC 123/2006, Anexo III (redação LC 155/2016)',
  faixas: [
    { rbt12AteCents: 180_000_00, aliquotaNominal: 0.06, parcelaDeduzirCents: 0 },
    { rbt12AteCents: 360_000_00, aliquotaNominal: 0.112, parcelaDeduzirCents: 9_360_00 },
    { rbt12AteCents: 720_000_00, aliquotaNominal: 0.135, parcelaDeduzirCents: 17_640_00 },
    { rbt12AteCents: 1_800_000_00, aliquotaNominal: 0.16, parcelaDeduzirCents: 35_640_00 },
    { rbt12AteCents: 3_600_000_00, aliquotaNominal: 0.21, parcelaDeduzirCents: 125_640_00 },
    { rbt12AteCents: 4_800_000_00, aliquotaNominal: 0.33, parcelaDeduzirCents: 648_000_00 },
  ],
};

// LC 123/2006 — Anexo V (serviços; aplicado quando Fator R < 0,28).
const ANEXO_V_2018: SimplesAnexoTabela = {
  anexo: 'V',
  vigenciaInicio: '2018-01-01',
  fonte: 'LC 123/2006, Anexo V (redação LC 155/2016)',
  faixas: [
    { rbt12AteCents: 180_000_00, aliquotaNominal: 0.155, parcelaDeduzirCents: 0 },
    { rbt12AteCents: 360_000_00, aliquotaNominal: 0.18, parcelaDeduzirCents: 4_500_00 },
    { rbt12AteCents: 720_000_00, aliquotaNominal: 0.195, parcelaDeduzirCents: 9_900_00 },
    { rbt12AteCents: 1_800_000_00, aliquotaNominal: 0.205, parcelaDeduzirCents: 17_100_00 },
    { rbt12AteCents: 3_600_000_00, aliquotaNominal: 0.23, parcelaDeduzirCents: 62_100_00 },
    { rbt12AteCents: 4_800_000_00, aliquotaNominal: 0.305, parcelaDeduzirCents: 540_000_00 },
  ],
};

export const SIMPLES_ANEXOS: SimplesAnexoTabela[] = [ANEXO_III_2018, ANEXO_V_2018];

/** Fator R mínimo p/ enquadrar no Anexo III (>= 0,28). LC 123/2006 art. 18, §5º-M. */
export const FATOR_R_LIMIAR_ANEXO_III = 0.28;

// ---------------------------------------------------------------------------
// INSS — contribuinte individual (sócio) sobre pró-labore
// ---------------------------------------------------------------------------

export interface InssContribuinteIndividual extends VigenciaMeta {
  aliquota: number; // 0.11
  /** Teto do salário-de-contribuição (base máxima), em cents. */
  tetoBaseCents: number;
  /** Contribuição máxima mensal (teto × alíquota), em cents. */
  contribuicaoMaximaCents: number;
}

// 2026: teto R$ 8.475,55 → 11% = R$ 932,31 (arredondado ao centavo).
export const INSS_CONTRIBUINTE_INDIVIDUAL_2026: InssContribuinteIndividual = {
  vigenciaInicio: '2026-01-01',
  fonte: 'Portaria Interministerial teto RGPS 2026; INSS CI 11% (pró-labore)',
  aliquota: 0.11,
  tetoBaseCents: 8_475_55,
  contribuicaoMaximaCents: 932_31,
};

export const INSS_TABELAS: InssContribuinteIndividual[] = [INSS_CONTRIBUINTE_INDIVIDUAL_2026];

// ---------------------------------------------------------------------------
// IRRF — tabela mensal 2026 + isenção/redutor Lei 15.270/2025
// ---------------------------------------------------------------------------

export interface IrrfFaixa {
  /** Base de cálculo até (inclusive), em cents. Number.MAX_SAFE_INTEGER = última. */
  baseAteCents: number;
  aliquota: number;
  parcelaDeduzirCents: number;
}

export interface IrrfTabela extends VigenciaMeta {
  faixas: IrrfFaixa[];
  /**
   * Lei 15.270/2025 — redução do IRPF mensal:
   *  - rendimento bruto <= isencaoAteCents            → IRRF 0 (isenção total);
   *  - isencaoAteCents < bruto <= redutorFimCents      → IRRF = max(0, tabela − redutor),
   *    redutor = redutorBaseCents − round(redutorFator × brutoCents);
   *  - bruto > redutorFimCents                          → sem redução (tabela pura).
   */
  isencaoAteCents: number;
  redutorFimCents: number;
  redutorBaseCents: number;
  redutorFator: number;
}

export const IRRF_MENSAL_2026: IrrfTabela = {
  vigenciaInicio: '2026-01-01',
  fonte:
    'Tabela progressiva mensal 2026 (Lei 15.191/2025) + isenção/redutor Lei 15.270/2025 ' +
    '(isento até R$ 5.000; redutor 978,62 − 0,133145×bruto até R$ 7.350)',
  faixas: [
    { baseAteCents: 2_428_80, aliquota: 0, parcelaDeduzirCents: 0 },
    { baseAteCents: 2_826_65, aliquota: 0.075, parcelaDeduzirCents: 182_16 },
    { baseAteCents: 3_751_05, aliquota: 0.15, parcelaDeduzirCents: 394_16 },
    { baseAteCents: 4_664_68, aliquota: 0.225, parcelaDeduzirCents: 675_49 },
    { baseAteCents: Number.MAX_SAFE_INTEGER, aliquota: 0.275, parcelaDeduzirCents: 908_73 },
  ],
  isencaoAteCents: 5_000_00,
  redutorFimCents: 7_350_00,
  redutorBaseCents: 978_62,
  redutorFator: 0.133145,
};

export const IRRF_TABELAS: IrrfTabela[] = [IRRF_MENSAL_2026];

// ---------------------------------------------------------------------------
// PRESUNÇÃO DE LUCRO — distribuição isenta sem escrituração completa
// ---------------------------------------------------------------------------

export interface PresuncaoLucro extends VigenciaMeta {
  /** Percentual de presunção sobre a receita bruta de SERVIÇOS. */
  percentualServicos: number; // 0.32
}

// Serviços em geral: 32% (mesma presunção do IRPJ/Lucro Presumido).
export const PRESUNCAO_LUCRO_SERVICOS: PresuncaoLucro = {
  vigenciaInicio: '1996-01-01',
  fonte: 'Lei 9.249/1995 art. 15 (presunção 32% serviços); distribuição isenta art. 10',
  percentualServicos: 0.32,
};

export const PRESUNCAO_TABELAS: PresuncaoLucro[] = [PRESUNCAO_LUCRO_SERVICOS];

// ---------------------------------------------------------------------------
// SELETORES POR VIGÊNCIA (o motor pede a tabela válida numa competência)
// ---------------------------------------------------------------------------

/** 'YYYY-MM' (competência) → 'YYYY-MM-01' p/ comparar com vigências. */
function competenciaToDate(competencia: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!m) throw new Error(`competencia inválida: '${competencia}' (esperado 'YYYY-MM')`);
  return `${m[1]}-${m[2]}-01`;
}

function vigente<T extends VigenciaMeta>(tabelas: T[], competencia: string, label: string): T {
  const ref = competenciaToDate(competencia);
  // Mais recente cuja vigência cobre a competência.
  const candidatos = tabelas
    .filter((t) => t.vigenciaInicio <= ref && (!t.vigenciaFim || ref <= t.vigenciaFim))
    .sort((a, b) => (a.vigenciaInicio < b.vigenciaInicio ? 1 : -1));
  if (!candidatos.length) throw new Error(`sem tabela ${label} vigente para ${competencia}`);
  return candidatos[0];
}

export function anexoVigente(anexo: 'III' | 'V', competencia: string): SimplesAnexoTabela {
  const doAnexo = SIMPLES_ANEXOS.filter((t) => t.anexo === anexo);
  return vigente(doAnexo, competencia, `Simples Anexo ${anexo}`);
}

export function inssVigente(competencia: string): InssContribuinteIndividual {
  return vigente(INSS_TABELAS, competencia, 'INSS');
}

export function irrfVigente(competencia: string): IrrfTabela {
  return vigente(IRRF_TABELAS, competencia, 'IRRF');
}

export function presuncaoVigente(competencia: string): PresuncaoLucro {
  return vigente(PRESUNCAO_TABELAS, competencia, 'presunção');
}
