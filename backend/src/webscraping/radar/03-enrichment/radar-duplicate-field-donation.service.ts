import { Injectable } from '@nestjs/common';
import {
  inferWebsiteStatus,
  isLikelyValidBrPhone,
  normalizePhoneDigits,
  normalizeWebsiteKey,
} from '../shared/radar-core-shared';

/**
 * Fusão por campo no dedup web×receita (docs/PLANEJAMENTOS/PR01072026/80-fusao-por-campo.md).
 *
 * O run item que perde o dedup (`status='duplicate'`) morria inteiro: se o web chegou
 * primeiro, o CNPJ da Receita morria com o descartado; se a Receita chegou primeiro,
 * morria o site do web. Este serviço roda NO MOMENTO do duplicate e faz o descartado
 * DOAR os campos que o sobrevivente não tem (fill-empty: NUNCA sobrescreve valor
 * não-nulo), gravando proveniência `mergedFrom` na evidência (rawJson) do sobrevivente.
 * A mesma doação fill-empty é aplicada na linha correspondente do RadarLeadPool quando
 * localizável pelo caminho que o persist já usa (phoneDigits/placeId), com metadataJson
 * aditivo no padrão L4 `enrichRow`. O duplicado continua sendo persistido como
 * `duplicate` (auditoria card-por-card) — só que agora DEPOIS de doar.
 *
 * Best-effort de ponta a ponta: qualquer falha aqui vira log warn e o save segue.
 */

type DonationLogger = { warn?: (message: string) => void } | null | undefined;

export type RadarDuplicateDonationInput = {
  prisma: any;
  logger?: DonationLogger;
  runId: string;
  /** Resultado descartado (shape WebscrapingContactResult, antes do rawPayload). */
  duplicate: Record<string, any>;
  /** Chaves calculadas pelo classifyRunItem para o descartado. */
  classified: {
    placeId?: string | null;
    phoneDigits?: string | null;
    websiteKey?: string | null;
  };
  /** Razão do duplicate (vem do classifyRunItem) — decide a chave do lookup. */
  duplicateReason: string | null | undefined;
  /** Chave composta do descartado (host calcula com buildRunCompositeKey). */
  compositeKey?: string | null;
  /** Builder da chave composta (host) — usado no lookup do caso composite. */
  buildRunCompositeKey?: (row: {
    name?: string | null;
    city?: string | null;
    state?: string | null;
    segment?: string | null;
  }) => string;
};

export type RadarDuplicateDonationResult = {
  survivorId: string | null;
  donatedFields: string[];
  poolDonatedFields: string[];
};

type DonorFields = {
  cnpj: string | null;
  legalName: string | null;
  cnae: string | null;
  cnaeDescription: string | null;
  companySituation: string | null;
  website: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  email: string | null;
  address: string | null;
  phone: string | null;
  phoneDigits: string | null;
};

function isEmptyValue(value: unknown) {
  return value == null || String(value).trim() === '';
}

function textOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function parseMaybeJsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return { ...(value as Record<string, any>) };
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function appendMergedFrom(container: Record<string, any>, entry: Record<string, any>) {
  const previous = Array.isArray(container.mergedFrom)
    ? container.mergedFrom
    : container.mergedFrom
      ? [container.mergedFrom]
      : [];
  return [...previous, entry];
}

@Injectable()
export class RadarDuplicateFieldDonationService {
  async donate(input: RadarDuplicateDonationInput): Promise<RadarDuplicateDonationResult> {
    const result: RadarDuplicateDonationResult = {
      survivorId: null,
      donatedFields: [],
      poolDonatedFields: [],
    };
    const warn = (message: string) => {
      try {
        input?.logger?.warn?.(message);
      } catch {
        // logger nunca derruba a doação
      }
    };

    let survivor: any = null;
    try {
      survivor = await this.locateSurvivor(input);
    } catch (error) {
      warn(`[radar-fusao-dedup] lookup do sobrevivente falhou sem bloquear o save (runId=${input?.runId}): ${String((error as any)?.message || error)}`);
      return result;
    }
    if (!survivor?.id) return result;
    result.survivorId = String(survivor.id);

    const donor = this.buildDonorFields(input.duplicate || {});
    const provenance = {
      source: textOrNull(input.duplicate?.source || input.duplicate?.sourceEngine),
      placeId: textOrNull(input.classified?.placeId || input.duplicate?.placeId),
      mergedAt: new Date().toISOString(),
    };

    try {
      result.donatedFields = await this.donateToRunItem(input.prisma, survivor, donor, provenance);
    } catch (error) {
      warn(`[radar-fusao-dedup] doação no run item sobrevivente falhou sem bloquear o save (runId=${input?.runId}): ${String((error as any)?.message || error)}`);
    }

    try {
      result.poolDonatedFields = await this.donateToPool(input.prisma, survivor, donor, provenance);
    } catch (error) {
      warn(`[radar-fusao-dedup] doação no RadarLeadPool falhou sem bloquear o save (runId=${input?.runId}): ${String((error as any)?.message || error)}`);
    }

    return result;
  }

  /**
   * Localiza o run item sobrevivente pela chave que causou o duplicate. O snapshot de
   * dedup só guarda Sets de chaves (não ids) e o web pode ter sido salvo num batch
   * anterior ao da Receita (cross-batch) → o lookup é no banco mesmo.
   */
  private async locateSurvivor(input: RadarDuplicateDonationInput): Promise<any> {
    const delegate = input?.prisma?.webscrapingSearchRunItem;
    if (!delegate?.findFirst) return null;
    const reason = String(input.duplicateReason || '').toLowerCase();
    const placeId = String(input.classified?.placeId || '').trim();
    const phoneDigits = String(input.classified?.phoneDigits || '').trim();
    const websiteKey = String(input.classified?.websiteKey || '').trim();

    let where: Record<string, any> | null = null;
    if (reason.includes('placeid') && placeId) where = { runId: input.runId, placeId };
    else if (reason.includes('telefone') && phoneDigits) where = { runId: input.runId, phoneDigits };
    else if (reason.includes('website') && websiteKey) where = { runId: input.runId, websiteKey };

    if (where) {
      // Preferir o dono "de verdade" da chave (status found); fallback: primeira linha com a chave.
      const found = await delegate.findFirst({ where: { ...where, status: 'found' }, orderBy: { createdAt: 'asc' } });
      if (found) return found;
      return delegate.findFirst({ where, orderBy: { createdAt: 'asc' } });
    }

    // Caso composite (nome+cidade+estado+segmento): a chave não existe como coluna →
    // recalcula linha a linha com o MESMO builder do host.
    const compositeKey = String(input.compositeKey || '').trim();
    if (compositeKey && compositeKey !== '|||' && typeof input.buildRunCompositeKey === 'function' && delegate.findMany) {
      const rows = await delegate.findMany({ where: { runId: input.runId }, orderBy: { createdAt: 'asc' } });
      const matches = (Array.isArray(rows) ? rows : []).filter((row: any) => {
        try {
          return input.buildRunCompositeKey!(row) === compositeKey;
        } catch {
          return false;
        }
      });
      return matches.find((row: any) => String(row?.status || '') === 'found') || matches[0] || null;
    }
    return null;
  }

  /** Extrai do descartado tudo que ele pode doar (shape web e shape cnpj_public). */
  private buildDonorFields(duplicate: Record<string, any>): DonorFields {
    const evidence = parseMaybeJsonObject(duplicate.evidenceJson);
    const cnpjPublic = parseMaybeJsonObject(evidence.cnpjPublic);
    const phoneDigits = normalizePhoneDigits(duplicate.phoneDigits || duplicate.phone) || null;
    return {
      cnpj: textOrNull(duplicate.cnpj) || textOrNull(cnpjPublic.cnpj),
      legalName: textOrNull(duplicate.legalName) || textOrNull(duplicate.razaoSocial),
      cnae: textOrNull(duplicate.cnae) || textOrNull(cnpjPublic.cnae),
      cnaeDescription: textOrNull(duplicate.cnaeDescription) || textOrNull(cnpjPublic.cnaeDescription),
      companySituation: textOrNull(duplicate.companySituation) || textOrNull(cnpjPublic.situacao),
      website: textOrNull(duplicate.website),
      instagramUrl: textOrNull(duplicate.instagramUrl),
      facebookUrl: textOrNull(duplicate.facebookUrl),
      email: textOrNull(duplicate.email),
      address: textOrNull(duplicate.address),
      phone: textOrNull(duplicate.phone),
      phoneDigits,
    };
  }

  /**
   * Doa campos VAZIOS do sobrevivente a partir do descartado (colunas + rawJson).
   * Nunca sobrescreve valor não-nulo. Grava `mergedFrom` no rawJson quando doou algo.
   */
  private async donateToRunItem(
    prisma: any,
    survivor: any,
    donor: DonorFields,
    provenance: Record<string, any>,
  ): Promise<string[]> {
    const delegate = prisma?.webscrapingSearchRunItem;
    if (!delegate?.update) return [];
    const survivorRaw = parseMaybeJsonObject(survivor.rawJson);
    const donated: string[] = [];
    const columnData: Record<string, any> = {};

    if (donor.website && isEmptyValue(survivor.website)) {
      columnData.website = donor.website;
      const websiteKey = normalizeWebsiteKey(donor.website);
      if (websiteKey && isEmptyValue(survivor.websiteKey)) columnData.websiteKey = websiteKey;
      if (isEmptyValue(survivorRaw.website)) survivorRaw.website = donor.website;
      donated.push('website');
    }
    if (donor.address && isEmptyValue(survivor.address)) {
      columnData.address = donor.address;
      if (isEmptyValue(survivorRaw.address)) survivorRaw.address = donor.address;
      donated.push('address');
    }
    // Fone: SÓ se o sobrevivente está sem fone válido (o fone quente do web nunca é
    // trocado pelo frio da RFB).
    const survivorHasValidPhone = isLikelyValidBrPhone(survivor.phoneDigits || survivor.phone);
    if (!survivorHasValidPhone && donor.phoneDigits && isLikelyValidBrPhone(donor.phoneDigits)) {
      columnData.phone = donor.phone || donor.phoneDigits;
      columnData.phoneDigits = donor.phoneDigits;
      survivorRaw.phone = columnData.phone;
      survivorRaw.phoneDigits = donor.phoneDigits;
      donated.push('phone');
    }
    for (const field of ['cnpj', 'legalName', 'cnae', 'cnaeDescription', 'companySituation', 'instagramUrl', 'facebookUrl', 'email'] as const) {
      const value = donor[field];
      if (!value) continue;
      if (!isEmptyValue(survivorRaw[field])) continue;
      survivorRaw[field] = value;
      donated.push(field);
    }

    if (!donated.length) return [];
    survivorRaw.mergedFrom = appendMergedFrom(survivorRaw, { ...provenance, donatedFields: donated });
    await delegate.update({
      where: { id: survivor.id },
      data: { ...columnData, rawJson: JSON.stringify(survivorRaw) },
    });
    return donated;
  }

  /**
   * Mesma doação fill-empty na linha do RadarLeadPool correspondente ao sobrevivente,
   * localizada pelo caminho que o persist já usa (phoneDigits/placeId). Campos de
   * Receita vão pro metadataJson aditivo (padrão L4 `enrichRow`).
   */
  private async donateToPool(
    prisma: any,
    survivor: any,
    donor: DonorFields,
    provenance: Record<string, any>,
  ): Promise<string[]> {
    const delegate = prisma?.radarLeadPool;
    if (!delegate?.findFirst || !delegate?.update) return [];

    const or: Array<Record<string, any>> = [];
    const survivorPhoneDigits = normalizePhoneDigits(survivor.phoneDigits || survivor.phone);
    if (survivorPhoneDigits) or.push({ phoneDigits: survivorPhoneDigits });
    const survivorPlaceId = String(survivor.placeId || '').trim();
    if (survivorPlaceId && !survivorPlaceId.startsWith('radar:') && !survivorPlaceId.startsWith('radar_external:')) {
      or.push({ placeId: survivorPlaceId });
    }
    if (!or.length) return [];

    const poolRow = await delegate.findFirst({ where: { OR: or } });
    if (!poolRow?.id) return [];

    const donated: string[] = [];
    const data: Record<string, any> = {};

    if (donor.website && isEmptyValue(poolRow.website)) {
      data.website = donor.website;
      data.websiteStatus = inferWebsiteStatus(donor.website);
      donated.push('website');
    }
    if (donor.email && isEmptyValue(poolRow.email)) {
      data.email = donor.email;
      donated.push('email');
    }
    if (donor.instagramUrl && isEmptyValue(poolRow.instagramUrl)) {
      data.instagramUrl = donor.instagramUrl;
      donated.push('instagramUrl');
    }
    if (donor.facebookUrl && isEmptyValue(poolRow.facebookUrl)) {
      data.facebookUrl = donor.facebookUrl;
      donated.push('facebookUrl');
    }
    if ((data.instagramUrl || data.facebookUrl) && ['', 'missing', 'unknown'].includes(String(poolRow.socialStatus || '').trim().toLowerCase())) {
      data.socialStatus = 'found';
    }
    if (donor.address && isEmptyValue(poolRow.address)) {
      data.address = donor.address;
      donated.push('address');
    }
    if (
      donor.phoneDigits
      && isLikelyValidBrPhone(donor.phoneDigits)
      && !isLikelyValidBrPhone(poolRow.phoneDigits || poolRow.phone)
    ) {
      // phoneDigits é @unique no pool: só doa se nenhuma OUTRA linha já for dona dos dígitos.
      const digitsOwner = await delegate.findFirst({ where: { phoneDigits: donor.phoneDigits } }).catch(() => null);
      if (!digitsOwner || String(digitsOwner.id) === String(poolRow.id)) {
        data.phone = donor.phone || donor.phoneDigits;
        data.phoneDigits = donor.phoneDigits;
        donated.push('phone');
      }
    }

    const metadata = parseMaybeJsonObject(poolRow.metadataJson);
    const metadataPatch: Record<string, any> = {};
    const metadataFields: Array<[string, string | null]> = [
      ['cnpj', donor.cnpj],
      ['razaoSocial', donor.legalName],
      ['cnae', donor.cnae],
      ['cnaeDescription', donor.cnaeDescription],
      ['companySituation', donor.companySituation],
    ];
    for (const [key, value] of metadataFields) {
      if (!value) continue;
      if (!isEmptyValue(metadata[key])) continue;
      metadataPatch[key] = value;
      donated.push(`metadata.${key}`);
    }

    if (!donated.length) return [];
    data.metadataJson = JSON.stringify({
      ...metadata,
      ...metadataPatch,
      mergedFrom: appendMergedFrom(metadata, { ...provenance, donatedFields: donated }),
    });
    await delegate.update({ where: { id: poolRow.id }, data });
    return donated;
  }
}
