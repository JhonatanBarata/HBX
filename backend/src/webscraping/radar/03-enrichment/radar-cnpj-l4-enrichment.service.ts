import { Injectable } from '@nestjs/common';

/**
 * L4 — Cofre CNPJ público (grátis).
 *
 * Quando um lead tem CNPJ mas falta razão/CNAE/sócio/endereço/situação,
 * busca no dataset LOCAL (tabela CnpjPublicCompany) e preenche.
 * É 100 % grátis → roda ANTES de qualquer provider pago.
 *
 * Resultado gravado no metadataJson do RadarLeadPool (sem migration).
 * Campos opcionais: o card antigo sem eles continua renderizando normalmente.
 */

function normalizeCnpj(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function parseMaybeJson(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function pickOwnerName(rawJson: Record<string, any> | null): { ownerName: string | null; ownerNames: string[] } {
  if (!rawJson) return { ownerName: null, ownerNames: [] };
  // rawJson pode ter campo "socios", "qsa", "partners" — tenta tudo
  const candidates: string[] = [];
  for (const key of ['socios', 'qsa', 'partners', 'quadroSocietario']) {
    const list = rawJson[key];
    if (Array.isArray(list)) {
      for (const item of list) {
        const name = String(item?.nome || item?.name || item?.razaoSocial || '').trim();
        if (name && !candidates.includes(name)) candidates.push(name);
      }
      break;
    }
  }
  // fallback: campo direto "proprietario"/"owner"
  const direct = String(rawJson.proprietario || rawJson.owner || rawJson.responsavel || '').trim();
  if (direct && !candidates.includes(direct)) candidates.unshift(direct);
  return { ownerName: candidates[0] || null, ownerNames: candidates };
}

export type CnpjL4Result = {
  found: boolean;
  cnpj: string | null;
  razaoSocial: string | null;
  cnae: string | null;
  cnaeDescription: string | null;
  companySituation: string | null;
  address: string | null;
  ownerName: string | null;
  ownerNames: string[];
  email: string | null;
  website: string | null;
};

@Injectable()
export class RadarCnpjL4EnrichmentService {
  private static readonly brasilApiCache = new Map<string, CnpjL4Result>();

  /**
   * Lookup by CNPJ: dataset local primeiro (bulk, instantâneo), depois BrasilAPI
   * (pública e GRÁTIS) que complementa com o quadro de sócios — o nome do dono que
   * o dataset local não guarda. Tudo grátis → roda ANTES de qualquer provider pago.
   * Returns null when the CNPJ is invalid or nothing is found.
   */
  async lookup(prisma: any, cnpjRaw: unknown): Promise<CnpjL4Result | null> {
    const cnpj = normalizeCnpj(cnpjRaw);
    if (cnpj.length < 14) return null;

    let local: CnpjL4Result | null = null;
    if (prisma?.cnpjPublicCompany?.findUnique) {
      try {
        const row = await prisma.cnpjPublicCompany.findUnique({ where: { cnpj } });
        if (row) {
          const { ownerName, ownerNames } = pickOwnerName(parseMaybeJson(row.rawJson));
          local = {
            found: true,
            cnpj: row.cnpj || cnpj,
            razaoSocial: row.razaoSocial || null,
            cnae: row.cnae || null,
            cnaeDescription: row.cnaeDescription || null,
            companySituation: String(row.situacao || '').toLowerCase() || null,
            address: row.address || null,
            ownerName,
            ownerNames,
            email: row.email || null,
            website: row.website || null,
          };
        }
      } catch {
        local = null;
      }
    }

    // BrasilAPI traz o `qsa` (sócios) que o dataset local não tem. Complementa o
    // local; vira a fonte inteira quando ele está vazio/sem o registro.
    const missingOwner = !local || !local.razaoSocial || !(local.ownerNames && local.ownerNames.length);
    if (missingOwner) {
      const api = await this.lookupBrasilApi(cnpj);
      if (api) {
        if (!local) {
          local = api;
          await this.cacheIntoLocal(prisma, api);
        } else {
          local.ownerName = local.ownerName || api.ownerName;
          local.ownerNames = local.ownerNames && local.ownerNames.length ? local.ownerNames : api.ownerNames;
          local.razaoSocial = local.razaoSocial || api.razaoSocial;
          local.cnae = local.cnae || api.cnae;
          local.cnaeDescription = local.cnaeDescription || api.cnaeDescription;
          local.companySituation = local.companySituation || api.companySituation;
          local.address = local.address || api.address;
          local.email = local.email || api.email;
        }
      }
    }
    return local;
  }

  private brasilApiEnabled() {
    return String(process.env.HBX_CNPJ_BRASILAPI_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
  }

  /** Consulta pública grátis na BrasilAPI (razão + CNAE + situação + sócios). */
  private async lookupBrasilApi(cnpj: string): Promise<CnpjL4Result | null> {
    if (!this.brasilApiEnabled()) return null;
    const cached = RadarCnpjL4EnrichmentService.brasilApiCache.get(cnpj);
    if (cached) return cached;
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: {
          Accept: 'application/json',
          // BrasilAPI devolve 403 Forbidden sem User-Agent.
          'User-Agent': 'HBX-Radar/1.0 (+contato@hbxsystem.com.br)',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;
      const data: any = await resp.json();
      const qsa: any[] = Array.isArray(data?.qsa) ? data.qsa : [];
      const rank = (q: string) => (/administrad|titular/i.test(String(q || '')) ? 0 : 1);
      const owners = qsa
        .map((s) => ({ name: String(s?.nome_socio || '').trim(), qual: String(s?.qualificacao_socio || '') }))
        .filter((s) => s.name)
        .sort((a, b) => rank(a.qual) - rank(b.qual));
      const ownerNames = owners.map((o) => o.name).filter((v, i, arr) => arr.indexOf(v) === i);
      const address = [data?.logradouro, data?.numero, data?.bairro, data?.municipio, data?.uf]
        .map((p) => String(p || '').trim())
        .filter(Boolean)
        .join(', ') || null;
      const result: CnpjL4Result = {
        found: true,
        cnpj,
        razaoSocial: String(data?.razao_social || '').trim() || null,
        cnae: data?.cnae_fiscal != null ? String(data.cnae_fiscal) : null,
        cnaeDescription: String(data?.cnae_fiscal_descricao || '').trim() || null,
        companySituation: String(data?.descricao_situacao_cadastral || '').trim().toLowerCase() || null,
        address,
        ownerName: ownerNames[0] || null,
        ownerNames,
        email: String(data?.email || '').trim().toLowerCase() || null,
        website: null,
      };
      if (result.razaoSocial) {
        RadarCnpjL4EnrichmentService.brasilApiCache.set(cnpj, result);
        return result;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Best-effort: grava o resultado da API no dataset local p/ ele crescer sozinho. */
  private async cacheIntoLocal(prisma: any, r: CnpjL4Result): Promise<void> {
    if (!prisma?.cnpjPublicCompany?.upsert || !r.cnpj || !r.razaoSocial) return;
    const rawJson = JSON.stringify({ qsa: (r.ownerNames || []).map((nome) => ({ nome })) });
    await prisma.cnpjPublicCompany.upsert({
      where: { cnpj: r.cnpj },
      create: {
        cnpj: r.cnpj,
        razaoSocial: r.razaoSocial,
        cnae: r.cnae,
        cnaeDescription: r.cnaeDescription,
        situacao: r.companySituation || 'ativa',
        address: r.address,
        email: r.email,
        rawJson,
      },
      update: {},
    }).catch(() => null);
  }

  /**
   * Enrich a RadarLeadPool row in-place: if it has a CNPJ in metadataJson/evidenceJson
   * and is missing razaoSocial/cnae, do the lookup and persist the delta to metadataJson.
   * No-op when nothing is missing or dataset not available.
   */
  async enrichRow(prisma: any, row: any): Promise<string | null> {
    const meta = parseMaybeJson(row?.metadataJson);
    const evidence = parseMaybeJson(row?.evidenceJson);
    // CNPJ may come from metadataJson (written by persistRadarLeadPoolBatch)
    // or from evidenceJson.cnpjPublic (written by CnpjPublicProviderService)
    const cnpjRaw = meta?.cnpj
      || evidence?.cnpjPublic?.cnpj
      || row?.cnpj
      || null;
    const cnpj = normalizeCnpj(cnpjRaw);
    if (cnpj.length < 14) return null;

    // Skip if already fully enriched
    const alreadyHasRazao = Boolean(meta?.razaoSocial);
    const alreadyHasCnae = Boolean(meta?.cnae);
    const alreadyHasSituation = Boolean(meta?.companySituation);
    if (alreadyHasRazao && alreadyHasCnae && alreadyHasSituation) return null;

    const l4 = await this.lookup(prisma, cnpj);
    if (!l4?.found) return null;

    const patch: Record<string, any> = {
      ...meta,
      cnpj: meta?.cnpj || l4.cnpj || cnpj,
    };
    if (!alreadyHasRazao && l4.razaoSocial) patch.razaoSocial = l4.razaoSocial;
    if (!alreadyHasCnae && l4.cnae) patch.cnae = l4.cnae;
    if (l4.cnaeDescription && !meta?.cnaeDescription) patch.cnaeDescription = l4.cnaeDescription;
    if (!alreadyHasSituation && l4.companySituation) patch.companySituation = l4.companySituation;
    if (l4.ownerName && !meta?.ownerName) patch.ownerName = l4.ownerName;
    if (l4.ownerNames?.length && !meta?.ownerNames?.length) patch.ownerNames = l4.ownerNames;
    if (l4.address && !row?.address && !meta?.l4Address) patch.l4Address = l4.address;
    if (l4.email && !row?.email && !meta?.l4Email) patch.l4Email = l4.email;

    const nextMetadataJson = JSON.stringify(patch);
    if (!row?.id || !prisma?.radarLeadPool?.update) return nextMetadataJson;

    await prisma.radarLeadPool.update({
      where: { id: row.id },
      data: { metadataJson: nextMetadataJson },
    }).catch(() => null); // additive — ignora falha

    return nextMetadataJson;
  }
}
