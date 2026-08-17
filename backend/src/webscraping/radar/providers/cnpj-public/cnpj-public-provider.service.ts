import { Injectable, Logger } from '@nestjs/common';
import type { WebscrapingContactResult } from '../../shared/radar-core-shared';
import { cleanRfbLegalName, normalizeLegacyBrCellphone } from './cnpj-public-types';
import type { CnpjPublicCompanyRecord, CnpjPublicProviderResult, CnpjPublicSearchInput } from './cnpj-public-types';
import { findRadarSegmentExclusionMatchWithEvidence } from '../../shared/radar-segment-exclusion.util';
import { buildSegmentTextMatcher } from '../../shared/radar-segment-match.util';
import { buildRadarSegmentCnaeMatcher } from '../../shared/radar-segment-cnae-map.util';

// Log dos rejeitados da porta receita (P1, 02/07 — docs/PLANEJAMENTOS/PR02072026/W1-cutover-ordem-fixa.md,
// tarefa 7): cada registro rejeitado pelos filtros (DV inválido, situação não-ativa, cidade/UF
// fora) loga o motivo — sem PII além do necessário (CNPJ mascarado, sem nome/telefone/endereço
// do registro rejeitado).
//
// Segmento explícito volta a ser filtro DURO (S2 LEAD-CENTRICO, 25/07 —
// docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/02-radar-limpo.md): a decisão de 03/07
// (docs/PLANEJAMENTOS/PR03072026/C1-porta-receita-cnae-nao-descarta.md, "CNAE sem match não
// descarta, só avisa") foi REVERTIDA pelo dono — "pedi distribuidora no segmento e chegou cada
// lixo". Quando o cliente pede um segmento explícito, candidato sem match de CNAE OU cujo
// CNAE/nome cai numa exclusão do segmento (mapa em radar-segment-exclusion.util.ts — exclusão
// vence similaridade de nome) é REJEITADO (rejectedCount++ + log). Sem segmento pedido, o
// comportamento continua intacto (segmentMatches é sempre true quando `segment` está vazio).
function maskCnpjForLog(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return digits ? `${digits.slice(0, 2)}***` : '(sem_cnpj)';
  return `${digits.slice(0, 2)}.***.***/****-${digits.slice(-2)}`;
}

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhoneDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCnpj(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

// DV do CNPJ — mod-11 clássico (2 dígitos verificadores), pesos padrão da Receita.
// CNPJ com todos os dígitos iguais (ex. "00000000000000") é sequência degenerada, não passa.
const CNPJ_DV_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_DV_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function cnpjCheckDigit(digits: string, weights: number[]) {
  const sum = weights.reduce((acc, weight, index) => acc + weight * Number(digits[index]), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpjCheckDigits(value: unknown): boolean {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const base = digits.slice(0, 12);
  const dv1 = cnpjCheckDigit(base, CNPJ_DV_WEIGHTS_1);
  const dv2 = cnpjCheckDigit(base + String(dv1), CNPJ_DV_WEIGHTS_2);
  return digits === `${base}${dv1}${dv2}`;
}

function isActiveCompany(record: CnpjPublicCompanyRecord) {
  const status = normalizeText(record.situacao || 'ativa');
  return !status || ['ativa', 'ativo', 'active'].includes(status);
}

// Match de segmento pela lei única de radar-segment-match.util (28/07 — conserto do
// "distribuidora de agua trouxe igreja/academia/partido"): TODAS as palavras do segmento
// (AND), palavra INTEIRA (\b, "agua" não casa "AGUAI"), e o nome da cidade pedida não conta
// como texto ("IGREJA ... DE AGUAS DE LINDOIA" não vira match de "agua"). Código CNAE
// explícito no segmento continua resolvendo por prefixo do código, sem passar pelo texto.
function segmentMatches(
  record: CnpjPublicCompanyRecord,
  segment: unknown,
  matcher: (haystack: unknown) => boolean,
  cnaeAllowed?: (input: { cnae: unknown; haystack: unknown }) => boolean,
) {
  const requested = normalizeText(segment);
  if (!requested) return true;
  const cnaeCode = (requested.match(/\b\d{4,7}\b/) || [])[0] || null;
  if (cnaeCode && String(record.cnae || '').replace(/\D/g, '').startsWith(cnaeCode)) return true;
  const haystack = [
    record.nomeFantasia,
    record.razaoSocial,
    record.cnae,
    record.cnaeDescription,
  ].filter(Boolean).join(' ');
  // LOTE 1 (17/08): a MESMA trava textual do WHERE se repetia aqui. Vencer a exclusão não
  // bastava — ACQUARELLA/VEGAS/RICCI não dizem 'distribuidora' nem 'agua' e morriam nesta
  // linha com `segmento_sem_match_cnae`. CNAE do mapa curado do pedido é evidência positiva:
  // o código JÁ É o pedido, mesma lei do código CNAE digitado logo acima.
  if (cnaeAllowed?.({ cnae: record.cnae, haystack })) return true;
  return matcher(haystack);
}

function locationMatches(record: CnpjPublicCompanyRecord, city: unknown, state: unknown) {
  const requestedCity = normalizeText(city);
  const requestedState = String(state || '').trim().toUpperCase();
  const recordCity = normalizeText(record.city);
  const recordState = String(record.state || '').trim().toUpperCase();
  if (requestedCity && recordCity && requestedCity !== recordCity) return false;
  if (requestedState && recordState && requestedState !== recordState) return false;
  return true;
}

/**
 * A7 (LOTE 1, 17/08): "a base não respondeu" e "a base respondeu ZERO linha" eram o MESMO
 * motivo mentiroso (`cnpj_public_provider_sem_base_configurada`) — e o motivo honesto da linha
 * de baixo (`cnpj_public_sem_registros_compativeis`, que significa "a base entregou linhas e
 * TODAS morreram na porta") era inalcançável pelo early-return.
 *
 * `datasetQueried = true` significa: o dataset FOI consultado nesta chamada e respondeu, ainda
 * que com zero linha. Ausente/false = ninguém consultou a base (registros injetados por teste
 * ou por caller, ou processo sem prisma) — só aí "sem base configurada" é verdade.
 *
 * Mora AQUI, e não no `CnpjPublicSearchInput` de cnpj-public-types.ts, porque aquele arquivo
 * está fora do recorte deste lote (edição paralela). O campo é aditivo e opcional: quem chama
 * sem ele compila e se comporta exatamente como antes.
 */
export type CnpjPublicSearchInputComRastroDeConsulta = CnpjPublicSearchInput & {
  datasetQueried?: boolean;
};

@Injectable()
export class CnpjPublicProviderService {
  private readonly logger = new Logger(CnpjPublicProviderService.name);

  private logRejected(record: CnpjPublicCompanyRecord, reasonCode: string) {
    this.logger.log(
      `[porta-receita] rejeitado cnpj=${maskCnpjForLog(record.cnpj)} motivo=${reasonCode} `
      + `cidade=${record.city || '-'} uf=${record.state || '-'} cnae=${record.cnae || '-'}`,
    );
  }

  async search(input: CnpjPublicSearchInputComRastroDeConsulta): Promise<CnpjPublicProviderResult> {
    const records = Array.isArray(input.records) ? input.records : [];
    if (!records.length) {
      return {
        status: 'skipped',
        retryable: false,
        // A7 (17/08): a base de 23 GB estava DE PÉ e respondeu ZERO linha — dizer "sem base
        // configurada" mandava o operador caçar problema de infra que não existe (deu isso em
        // Pinhal e Estiva Gerbi). Agora 'sem_base_configurada' só quando a base NÃO foi
        // consultada. `status: 'skipped'` fica nos dois casos de propósito: mexer no status
        // mudaria retryable/classificação do run item, que é outro assunto.
        reason: input.datasetQueried
          ? 'cnpj_public_sem_match_na_base'
          : 'cnpj_public_provider_sem_base_configurada',
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        consumedCount: 0,
        results: [],
      };
    }

    const limit = Math.max(1, Math.min(100, Number(input.limit || 20) || 20));
    // Matcher compilado UMA vez pro lote inteiro (regex por grupo de palavra do segmento).
    const segmentMatcher = buildSegmentTextMatcher(input.normalized.segment, input.normalized.city);
    // Idem pro mapa curado segmento→CNAE (LOTE 1): uma compilação por lote, não por registro.
    const cnaeAllowlistMatcher = buildRadarSegmentCnaeMatcher(input.normalized.segment, input.normalized.city);
    const accepted: WebscrapingContactResult[] = [];
    let rejectedCount = 0;
    // ATÉ ONDE ESTE LAÇO CHEGOU (17/08 — cura de "a drenagem joga fora a cauda da página"). O
    // `break` do limite lá embaixo abandona o resto de `records` sem avaliar; quem drena precisa
    // saber DISSO pra não ancorar o cursor depois de linha que ninguém olhou. Conta no topo do
    // laço porque o registro que estoura o limite TAMBÉM foi consumido — é ele a âncora.
    let percorridos = 0;
    for (const record of records) {
      percorridos += 1;
      if (!isValidCnpjCheckDigits(record.cnpj)) {
        rejectedCount += 1;
        this.logRejected(record, 'dv_invalido');
        continue;
      }
      if (!isActiveCompany(record)) {
        rejectedCount += 1;
        this.logRejected(record, 'situacao_nao_ativa');
        continue;
      }
      if (!locationMatches(record, input.normalized.city, input.normalized.state)) {
        rejectedCount += 1;
        this.logRejected(record, 'cidade_uf_fora_do_pedido');
        continue;
      }
      if (input.normalized.segment) {
        // Exclusão vence similaridade (S2, 25/07): checa PRIMEIRO, independente do resultado
        // do match por token — "Distribuidora de Energia X" tem "distribuidora" no nome, mas
        // é do segmento excluído energia/água/combustível, não entra em "distribuidora".
        //
        // MENOS quando o CNAE oficial do registro está na allowlist curada do pedido (LOTE 1,
        // 17/08): 4723-7/00 "Comércio varejista de bebidas" é onde a distribuidora de água
        // REALMENTE mora, e era a regra varejo_puro que matava justamente ela. O CNAE vai em
        // campo PRÓPRIO, nunca no blob de texto — nome que diz "água" não desarma exclusão.
        // Saneamento/energia/roupa/transporte continuam fora porque o CNAE deles NÃO está na
        // allowlist de nenhum segmento.
        const exclusionMatch = findRadarSegmentExclusionMatchWithEvidence({
          segment: input.normalized.segment,
          cnae: record.cnae,
          city: input.normalized.city,
          texts: [record.nomeFantasia, record.razaoSocial, record.cnae, record.cnaeDescription],
        });
        if (exclusionMatch) {
          rejectedCount += 1;
          this.logRejected(record, `segmento_excluido_${exclusionMatch.code}`);
          continue;
        }
        if (!segmentMatches(record, input.normalized.segment, segmentMatcher, cnaeAllowlistMatcher)) {
          rejectedCount += 1;
          this.logRejected(record, 'segmento_sem_match_cnae');
          continue;
        }
      }
      const mapped = this.toContactResult(record, input.normalized);
      if (!mapped) {
        rejectedCount += 1;
        this.logRejected(record, 'sem_cnpj_ou_nome_utilizavel');
        continue;
      }
      accepted.push(mapped);
      if (accepted.length >= limit) break;
    }

    return {
      status: 'completed',
      retryable: false,
      reason: accepted.length ? 'cnpj_public_records_normalizados' : 'cnpj_public_sem_registros_compativeis',
      foundCount: records.length,
      acceptedCount: accepted.length,
      rejectedCount,
      consumedCount: percorridos,
      results: accepted,
    };
  }

  toContactResult(record: CnpjPublicCompanyRecord, normalized: { city?: string | null; state?: string | null; segment?: string | null }): WebscrapingContactResult | null {
    const cnpj = normalizeCnpj(record.cnpj);
    // MEI/EI da RFB grava a razão como "<CNPJ básico> <NOME>" e sem fantasia — limpa o prefixo
    // pro nome do card não nascer com o número na frente (o CNPJ tem campo próprio no detalhe).
    const legalName = cleanRfbLegalName(record.razaoSocial, cnpj);
    const name = String(record.nomeFantasia || legalName || '').trim();
    if (!cnpj || !name) return null;
    // Fonte cnpj_public: cadastro pode ser celular legado (10 dig, 3º dígito 6-9) —
    // normaliza pra nono-dígito atual da Anatel na FONTE, nunca no filtro.
    const phoneDigits = normalizeLegacyBrCellphone(normalizePhoneDigits(record.phone));
    const phone = phoneDigits || record.phone || '';
    return {
      placeId: `cnpj_public:${cnpj}`,
      name,
      legalName: legalName || null,
      phone,
      phoneDigits,
      rating: null,
      reviews: null,
      address: record.address || null,
      website: record.website || null,
      email: record.email || null,
      city: record.city || normalized.city || null,
      state: record.state || normalized.state || null,
      segment: normalized.segment || null,
      cnpj,
      cnae: record.cnae || null,
      cnaeDescription: record.cnaeDescription || null,
      // Categoria VISÍVEL do card = atividade REAL da Receita (28/07): antes herdava o termo
      // da busca e "IGREJA ..." aparecia carimbada de "distribuidora de agua" na vitrine. O
      // `segment` continua sendo o bucket da pesquisa (dedup/carteira usam), mas a categoria
      // fala a verdade do CNAE.
      businessCategory: record.cnaeDescription || null,
      companySize: record.porte || null,
      companyBranchType: record.matrizFilial || null,
      source: 'cnpj_public',
      sourceEngine: 'cnpj_public',
      evidenceJson: {
        cnpjPublic: {
          cnpj,
          situacao: record.situacao || 'ativa',
          cnae: record.cnae || null,
          cnaeDescription: record.cnaeDescription || null,
          porte: record.porte || null,
          matrizFilial: record.matrizFilial || null,
          // sócio-administrador do dump RFB — opcional, o L4 promove pro metadataJson
          ownerName: record.ownerName || null,
          ownerQualification: record.ownerQualification || null,
          raw: record.raw || null,
        },
      },
    } as any;
  }
}
