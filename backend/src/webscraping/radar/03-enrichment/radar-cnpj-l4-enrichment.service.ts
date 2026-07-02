import { Injectable } from '@nestjs/common';
import { normalizeLegacyBrCellphone } from '../providers/cnpj-public/cnpj-public-types';

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
  phone: string | null;
  website: string | null;
  // Aditivos (01/07, ver docs/PLANEJAMENTOS/PR01072026/30-motor-receita.md) — BrasilAPI:
  // nome_fantasia, municipio, uf, porte, descricao_identificador_matriz_filial.
  nomeFantasia: string | null;
  city: string | null;
  state: string | null;
  porte: string | null;
  matrizFilial: string | null;
};

/** minúsculo, sem acento — mesmo padrão de normalização usado em cnpj-public-provider/dataset. */
function normalizeSearchText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class RadarCnpjL4EnrichmentService {
  private static readonly brasilApiCache = new Map<string, CnpjL4Result>();

  // --- Throttle global da BrasilAPI ---
  // Garante: 1 chamada em voo por vez + intervalo mínimo de 700 ms entre disparos.
  // Todas as chamadas entram numa fila promise-chain única (estática = compartilhada
  // entre instâncias do serviço).
  private static readonly BRASILAPI_MIN_INTERVAL_MS = 700;
  private static _brasilApiQueue: Promise<void> = Promise.resolve();
  private static _brasilApiLastCallAt = 0;

  private static enqueueThrottled<T>(fn: () => Promise<T>): Promise<T> {
    const queued = RadarCnpjL4EnrichmentService._brasilApiQueue.then(async () => {
      const now = Date.now();
      const elapsed = now - RadarCnpjL4EnrichmentService._brasilApiLastCallAt;
      const wait = RadarCnpjL4EnrichmentService.BRASILAPI_MIN_INTERVAL_MS - elapsed;
      if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
      RadarCnpjL4EnrichmentService._brasilApiLastCallAt = Date.now();
      return fn();
    });
    // A fila só avança quando a chamada anterior terminar (sucesso ou erro).
    // Usamos .then(noop, noop) para que um erro num item não quebre a fila.
    RadarCnpjL4EnrichmentService._brasilApiQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

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
            phone: row.phone || null,
            website: row.website || null,
            nomeFantasia: row.nomeFantasia || null,
            city: row.city || null,
            state: row.state || null,
            porte: row.porte || null,
            matrizFilial: row.matrizFilial || null,
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
          local.phone = local.phone || api.phone;
          local.nomeFantasia = local.nomeFantasia || api.nomeFantasia;
          local.city = local.city || api.city;
          local.state = local.state || api.state;
          local.porte = local.porte || api.porte;
          local.matrizFilial = local.matrizFilial || api.matrizFilial;
          // Dataset local ganhou dado novo via BrasilAPI (mesmo já existindo a linha) — persiste
          // pra próxima leitura já vir completa (grátis, best-effort).
          await this.cacheIntoLocal(prisma, local);
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
    // Throttle: entra na fila global (1 chamada em voo + 700 ms entre disparos).
    return RadarCnpjL4EnrichmentService.enqueueThrottled(() =>
      this._fetchBrasilApi(cnpj),
    );
  }

  /** Chamada de rede isolada (executada dentro do throttle). */
  private async _fetchBrasilApi(cnpj: string): Promise<CnpjL4Result | null> {
    // Checar cache novamente — outro item da fila pode ter populado enquanto esperava.
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
      // 429 Too Many Requests: backoff gracioso — devolve null sem cachear o erro.
      if (resp.status === 429) return null;
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
      // Telefone do registro público (DDD + número). BrasilAPI manda em `ddd_telefone_1/2`.
      // Cadastro pode ser anterior ao nono-dígito (celular 10-dig, 3º dígito 6-9) —
      // normaliza pra formato atual da Anatel na FONTE (só este caminho BrasilAPI).
      const phoneDigits = normalizeLegacyBrCellphone(data?.ddd_telefone_1 || data?.ddd_telefone_2 || '');
      const phone = phoneDigits.length >= 10 ? phoneDigits : null;
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
        phone,
        website: null,
        nomeFantasia: String(data?.nome_fantasia || '').trim() || null,
        city: String(data?.municipio || '').trim() || null,
        state: String(data?.uf || '').trim().toUpperCase() || null,
        porte: String(data?.porte || '').trim() || null,
        matrizFilial: String(data?.descricao_identificador_matriz_filial || '').trim() || null,
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

  /**
   * Best-effort: grava o resultado da API no dataset local p/ ele crescer sozinho.
   *
   * Furo comprovado 01/07 (docs/PLANEJAMENTOS/PR01072026/30-motor-receita.md): esta função
   * gravava a linha SEM phone/city/state/normalizedCity/searchText → mesmo quando o dataset
   * cresce, a linha nascia invisível pro `CnpjPublicDatasetService.fetchRecords`
   * (filtra por `normalizedCity` e `searchText`) e sem contato. Agora grava TUDO que o L4 trouxe
   * e o `update` PREENCHE campos vazios (nunca sobrescreve valor já existente e não-nulo) — o
   * dataset acumula em vez de nascer morto.
   */
  private async cacheIntoLocal(prisma: any, r: CnpjL4Result): Promise<void> {
    if (!prisma?.cnpjPublicCompany?.findUnique || !r.cnpj || !r.razaoSocial) return;
    const rawJson = JSON.stringify({ qsa: (r.ownerNames || []).map((nome) => ({ nome })) });
    const phoneDigits = String(r.phone || '').replace(/\D/g, '') || null;
    const normalizedCity = normalizeSearchText(r.city);
    const searchText = normalizeSearchText(
      [r.nomeFantasia, r.razaoSocial, r.cnae, r.cnaeDescription].filter(Boolean).join(' '),
    );

    const baseData = {
      razaoSocial: r.razaoSocial,
      nomeFantasia: r.nomeFantasia,
      cnae: r.cnae,
      cnaeDescription: r.cnaeDescription,
      situacao: r.companySituation || 'ativa',
      address: r.address,
      email: r.email,
      phone: r.phone,
      phoneDigits,
      city: r.city,
      state: r.state,
      normalizedCity,
      searchText,
      porte: r.porte,
      matrizFilial: r.matrizFilial,
      rawJson,
    };

    try {
      const existing = await prisma.cnpjPublicCompany.findUnique({ where: { cnpj: r.cnpj } }).catch(() => null);
      if (existing) {
        // update PREENCHE só o que está vazio no banco — nunca sobrescreve valor não-nulo já gravado.
        const fillIfEmpty: Record<string, any> = {};
        for (const [key, value] of Object.entries(baseData)) {
          if (value == null || value === '') continue;
          const current = (existing as Record<string, any>)[key];
          if (current == null || current === '') {
            fillIfEmpty[key] = value;
          }
        }
        if (Object.keys(fillIfEmpty).length && prisma.cnpjPublicCompany.update) {
          await prisma.cnpjPublicCompany.update({ where: { cnpj: r.cnpj }, data: fillIfEmpty }).catch(() => null);
        }
        return;
      }
      if (prisma.cnpjPublicCompany.create) {
        await prisma.cnpjPublicCompany.create({ data: { cnpj: r.cnpj, ...baseData } }).catch(() => null);
      }
    } catch {
      // degrade gracioso: cache é best-effort, nunca quebra o lookup por causa dele
    }
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
    if (l4.phone && !meta?.ownerPhone) patch.ownerPhone = l4.phone;

    const nextMetadataJson = JSON.stringify(patch);
    if (!row?.id || !prisma?.radarLeadPool?.update) return nextMetadataJson;

    await prisma.radarLeadPool.update({
      where: { id: row.id },
      data: { metadataJson: nextMetadataJson },
    }).catch(() => null); // additive — ignora falha

    return nextMetadataJson;
  }
}
