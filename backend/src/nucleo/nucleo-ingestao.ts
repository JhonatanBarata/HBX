import type {
  NucleoCadastroService,
  UpsertContaFromCnpjInput,
} from './nucleo-cadastro.service';

/**
 * NÚCLEO-CRM N2 (04/07, estendido 05/07) — INGESTÃO no PULL.
 *
 * Quando um lead é "puxado" para o módulo Vendas, materializa a ESPINHA: Conta(PJ) = o
 * lugar (nomeFantasia/razaoSocial/nome do lead) + Contato principal = a pessoa. É ADITIVO
 * e SÓ-LATERAL: roda DEPOIS que o VendasLead já foi criado/entregue, num único choke
 * (`importRadarLeadToVendasForUser`), e NUNCA quebra o fluxo do pull — qualquer erro é
 * engolido pelo caller (fire-and-forget).
 *
 * Gate DURO: `HBX_NUCLEO_INGESTAO_ENABLED` default OFF. Enquanto OFF, esta função é um
 * no-op COMPLETO (nem lê banco). Isso protege o refab "Buscar empresas" do dono: com a
 * flag desligada o comportamento do pull é EXATAMENTE o de hoje, zero escrita nova.
 *
 * Dois ramos (05/07 — TODO lead puxado materializa, pedido do dono):
 *  - COM CNPJ (base RFB): o CNPJ sobrevive do `materialize` da Base Receita em dois
 *    lugares do pool row: `sourceUrl = internal://cnpj-base/<cnpj>` e/ou
 *    `evidenceJson = { evidence: { cnpj } }`. Chave de idempotência = (companyId, cnpj)
 *    via `upsertContaFromCnpj`.
 *  - SEM CNPJ (lead WEB — Google Maps/scraping): chave de idempotência = (companyId,
 *    phoneNormalized) via `upsertContaFromRadarWebLead`. Sem telefone normalizável não dá
 *    pra deduplicar com segurança → skip (`no_key`).
 *
 * Contato principal em AMBOS os ramos (pra aparecer na janela Contatos): se a RFB conhece
 * o sócio (ownerName), o Contato é o dono; senão, reaproveita o NOME DO LUGAR (business
 * name) + telefone do lead como canal — nunca inventamos CPF/pessoa fictícia.
 *
 * Idempotência: puxar o mesmo lead de novo NÃO duplica (upsert por cnpj OU phoneNormalized).
 */

export const NUCLEO_INGESTAO_FLAG = 'HBX_NUCLEO_INGESTAO_ENABLED';

/** True só quando a flag está explicitamente ligada (default OFF). */
export function nucleoIngestaoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return ['true', '1', 'yes', 'on'].includes(
    String(env[NUCLEO_INGESTAO_FLAG] || '').trim().toLowerCase(),
  );
}

/** Só os dados do pool row que a ingestão precisa (contrato mínimo, testável). */
export type NucleoRadarLeadRow = {
  sourceUrl?: string | null;
  evidenceJson?: unknown;
  metadataJson?: unknown;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  /** telefone bruto do lead (Radar) — usado como chave de dedup do ramo WEB (sem CNPJ). */
  phone?: string | null;
  /** telefone só-dígitos (já normalizado no pool); fallback quando `phone` está ausente. */
  phoneDigits?: string | null;
};

/** Linha da base RFB (CnpjPublicCompany) — leitura opcional pra enriquecer a Conta/Contato. */
export type NucleoCnpjPublicRow = {
  cnpj: string;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  ownerName?: string | null;
  ownerQualification?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
} | null;

export type NucleoIngestaoDeps = {
  /** Serviço da espinha (upsert idempotente Conta+Contato). */
  cadastro: Pick<
    NucleoCadastroService,
    'upsertContaFromCnpj' | 'upsertContaFromRadarWebLead' | 'upsertContatoPrincipal'
  >;
  /** Leitura opcional da base RFB p/ nome do dono/qualificação/endereço. Pode faltar. */
  loadCnpjPublic?: (cnpj: string) => Promise<NucleoCnpjPublicRow>;
  /** Flag override (default lê process.env). */
  enabled?: boolean;
  logger?: { warn?: (message: string) => void };
};

export type NucleoIngestaoOutcome = {
  status: 'skipped' | 'materialized' | 'error';
  reason?: string;
  contaId?: string;
  contatoId?: string;
};

/** Extrai só os dígitos (mesma normalização do serviço). */
function digits(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '');
}

function parseMaybeJsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Recupera o CNPJ (14 dígitos) do pool row. Fonte 1: `sourceUrl` (internal://cnpj-base/<cnpj>).
 * Fonte 2: `evidenceJson.evidence.cnpj` (ou `evidenceJson.cnpj`). Fonte 3: `metadataJson.cnpj`.
 * Devolve '' quando não há CNPJ (lead web) — sem lançar.
 */
export function extractCnpjFromRadarLead(row: NucleoRadarLeadRow | null | undefined): string {
  if (!row) return '';
  const fromUrl = String(row.sourceUrl || '');
  const urlMatch = fromUrl.match(/cnpj-base\/(\d{6,14})/i) || fromUrl.match(/cnpj[:/](\d{6,14})/i);
  if (urlMatch && digits(urlMatch[1]).length === 14) return digits(urlMatch[1]);

  const evidence = parseMaybeJsonObject(row.evidenceJson);
  const evCnpj =
    digits((evidence?.evidence as any)?.cnpj) ||
    digits(evidence?.cnpj);
  if (evCnpj.length === 14) return evCnpj;

  const metadata = parseMaybeJsonObject(row.metadataJson);
  const metaCnpj = digits(metadata?.cnpj);
  if (metaCnpj.length === 14) return metaCnpj;

  // aceita 14 dígitos vindos da URL mesmo sem checagem estrita acima (fallback final)
  if (urlMatch && digits(urlMatch[1]).length >= 8) return digits(urlMatch[1]);
  return '';
}

/**
 * Materializa Conta(PJ) + Contato(dono) a partir de um lead do Radar recém-puxado.
 * NUNCA lança — devolve `{ status }`. Caller (mixin) chama fire-and-forget.
 */
export async function materializeNucleoFromRadarLead(
  deps: NucleoIngestaoDeps,
  companyId: number,
  row: NucleoRadarLeadRow | null | undefined,
): Promise<NucleoIngestaoOutcome> {
  try {
    const enabled = deps.enabled ?? nucleoIngestaoEnabled();
    if (!enabled) return { status: 'skipped', reason: 'flag_off' };
    if (!companyId) return { status: 'skipped', reason: 'no_company' };

    const cnpj = extractCnpjFromRadarLead(row);

    // ── Ramo SEM CNPJ (lead WEB — Google Maps/scraping): TODO lead puxado materializa,
    // pedido do dono 05/07. Chave de idempotência = phoneNormalized; sem telefone não dá
    // pra deduplicar com segurança → skip explícito 'no_key'.
    if (!cnpj) {
      const phone = (row?.phone ? String(row.phone) : '') || (row?.phoneDigits ? String(row.phoneDigits) : '');
      if (!digits(phone)) return { status: 'skipped', reason: 'no_key' };

      const nomeLugar = row?.name ? String(row.name) : null;
      const contaId = await deps.cadastro.upsertContaFromRadarWebLead({
        companyId,
        nome: nomeLugar || undefined,
        phone,
        endereco: row?.address ?? undefined,
        cidade: row?.city ?? undefined,
        uf: row?.state ?? undefined,
      });
      if (!contaId) return { status: 'skipped', reason: 'no_key' };

      // Contato principal: nunca inventa CPF/pessoa — reaproveita nome-do-lugar + telefone
      // do lead como canal (a RFB não existe pra lead web, então não há ownerName aqui).
      let contatoId: string | undefined;
      if (nomeLugar) {
        contatoId = await deps.cadastro.upsertContatoPrincipal({
          companyId,
          customerProfileId: contaId,
          nome: nomeLugar,
          phone,
          source: 'radar',
        });
      }
      return { status: 'materialized', contaId, contatoId };
    }

    // ── Ramo COM CNPJ (base RFB) ────────────────────────────────────────────────
    // Enriquecimento opcional pela base RFB (nome do dono/endereço). Degrada gracioso.
    let base: NucleoCnpjPublicRow = null;
    if (deps.loadCnpjPublic) {
      base = await deps.loadCnpjPublic(cnpj).catch(() => null);
    }

    const nome =
      base?.nomeFantasia ||
      base?.razaoSocial ||
      (row?.name ? String(row.name) : null) ||
      null;

    const contaInput: UpsertContaFromCnpjInput = {
      companyId,
      cnpj,
      nome: nome || undefined,
      endereco: base?.address ?? row?.address ?? undefined,
      cidade: base?.city ?? row?.city ?? undefined,
      uf: (base?.state ?? row?.state ?? undefined) || undefined,
      isLead: true,
      origin: 'radar',
    };

    const contaId = await deps.cadastro.upsertContaFromCnpj(contaInput);

    // Contato principal: se a RFB conhece o sócio (ownerName), o Contato é o dono (pedido
    // do dono: nome do dono → Contato). SEM ownerName conhecido, reaproveita o nome do
    // lugar (business name) + telefone do lead como canal — assim a Conta SEMPRE aparece
    // em Contatos também, sem inventar pessoa fictícia.
    let contatoId: string | undefined;
    const ownerName = String(base?.ownerName || '').trim();
    const phone = (row?.phone ? String(row.phone) : '') || (row?.phoneDigits ? String(row.phoneDigits) : '');
    if (contaId && ownerName) {
      contatoId = await deps.cadastro.upsertContatoPrincipal({
        companyId,
        customerProfileId: contaId,
        nome: ownerName,
        cargo: base?.ownerQualification || null,
        source: 'cnpj_socio',
      });
    } else if (contaId) {
      const nomeLugar = nome || (row?.name ? String(row.name) : null);
      if (nomeLugar) {
        contatoId = await deps.cadastro.upsertContatoPrincipal({
          companyId,
          customerProfileId: contaId,
          nome: nomeLugar,
          phone: phone || undefined,
          source: 'radar',
        });
      }
    }

    return { status: 'materialized', contaId, contatoId };
  } catch (error: any) {
    deps.logger?.warn?.(
      `[nucleo-ingestao] falha ao materializar Conta+Contato (ignorada): ${
        error?.message || error
      }`,
    );
    return { status: 'error', reason: String(error?.message || error) };
  }
}
