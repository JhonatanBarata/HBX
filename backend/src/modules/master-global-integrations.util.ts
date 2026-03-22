import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ensureMasterBillingRuntimeSchema } from './master-runtime';

export const MASTER_GLOBAL_INTEGRATIONS_KEY = 'default';

type NullableString = string | null | undefined;

type CompanyLike = {
  id?: number | null;
  useMasterMercadoPagoToken?: boolean | null;
  useMasterWhatsAppToken?: boolean | null;
  masterMercadoPagoCredentialKey?: NullableString;
  masterWhatsAppCredentialKey?: NullableString;
  mercadoPagoAccessToken?: NullableString;
  whatsappAccessToken?: NullableString;
  whatsappPhoneNumberId?: NullableString;
  whatsappWabaId?: NullableString;
  whatsappNumber?: NullableString;
  whatsappDisplayNumber?: NullableString;
  whatsappEndpoints?: any[] | null;
};

export type MasterMercadoPagoCredential = {
  key: string;
  label: string;
  accessToken: string | null;
  sourceCompanyId: number | null;
  sourceCompanyName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type MasterWhatsAppCredential = {
  key: string;
  label: string;
  accessToken: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  whatsappNumber: string | null;
  displayNumber: string | null;
  sourceCompanyId: number | null;
  sourceCompanyName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function normalize(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeDate(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const text = normalize(value);
  return text || null;
}

function previewSecret(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return `***${normalized.slice(-6)}`;
}

function safeJsonParseArray(value: unknown) {
  if (!value) return [] as any[];
  if (Array.isArray(value)) return value;
  const raw = String(value || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeMercadoPagoCredential(value: any): MasterMercadoPagoCredential | null {
  const accessToken = normalize(value?.accessToken);
  const label = normalize(value?.label) || normalize(value?.sourceCompanyName) || 'Token Mercado Pago';
  if (!accessToken && !label) return null;
  return {
    key: normalize(value?.key) || randomUUID(),
    label,
    accessToken,
    sourceCompanyId: Number(value?.sourceCompanyId || 0) || null,
    sourceCompanyName: normalize(value?.sourceCompanyName),
    createdAt: normalizeDate(value?.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDate(value?.updatedAt) || new Date().toISOString(),
  };
}

function normalizeWhatsAppCredential(value: any): MasterWhatsAppCredential | null {
  const accessToken = normalize(value?.accessToken);
  const phoneNumberId = normalize(value?.phoneNumberId);
  const displayNumber = normalize(value?.displayNumber) || normalize(value?.whatsappNumber);
  const label =
    normalize(value?.label) || displayNumber || normalize(value?.sourceCompanyName) || 'Token WhatsApp';
  if (!accessToken && !phoneNumberId && !displayNumber && !label) return null;
  return {
    key: normalize(value?.key) || randomUUID(),
    label,
    accessToken,
    phoneNumberId,
    wabaId: normalize(value?.wabaId),
    whatsappNumber: normalize(value?.whatsappNumber),
    displayNumber,
    sourceCompanyId: Number(value?.sourceCompanyId || 0) || null,
    sourceCompanyName: normalize(value?.sourceCompanyName),
    createdAt: normalizeDate(value?.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDate(value?.updatedAt) || new Date().toISOString(),
  };
}

function dedupeMercadoPagoLibrary(entries: MasterMercadoPagoCredential[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const fingerprint = `${normalize(entry.accessToken) || ''}::${normalize(entry.label) || ''}`;
    if (!fingerprint.trim() || seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function dedupeWhatsAppLibrary(entries: MasterWhatsAppCredential[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const fingerprint = `${normalize(entry.accessToken) || ''}::${normalize(entry.phoneNumberId) || ''}`;
    if ((!normalize(entry.accessToken) && !normalize(entry.phoneNumberId)) || seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function buildLegacyMercadoPagoCredential(config: any) {
  const accessToken = normalize(config?.mercadoPagoAccessToken);
  if (!accessToken) return null;
  return normalizeMercadoPagoCredential({
    key: 'legacy-mercado-pago',
    label: 'MASTER Principal',
    accessToken,
    sourceCompanyName: 'MASTER',
    createdAt: config?.createdAt,
    updatedAt: config?.updatedAt,
  });
}

function buildLegacyWhatsAppCredential(config: any) {
  const accessToken = normalize(config?.whatsappAccessToken);
  const phoneNumberId = normalize(config?.whatsappPhoneNumberId);
  if (!accessToken || !phoneNumberId) return null;
  return normalizeWhatsAppCredential({
    key: 'legacy-whatsapp',
    label: normalize(config?.whatsappDisplayNumber) || normalize(config?.whatsappNumber) || 'MASTER Principal',
    accessToken,
    phoneNumberId,
    wabaId: config?.whatsappWabaId,
    whatsappNumber: config?.whatsappNumber,
    displayNumber: config?.whatsappDisplayNumber,
    sourceCompanyName: 'MASTER',
    createdAt: config?.createdAt,
    updatedAt: config?.updatedAt,
  });
}

export async function getMasterGlobalIntegrationConfig(prisma: PrismaService) {
  await ensureMasterBillingRuntimeSchema(prisma);
  return prisma.masterGlobalIntegrationConfig.upsert({
    where: { key: MASTER_GLOBAL_INTEGRATIONS_KEY },
    update: {},
    create: { key: MASTER_GLOBAL_INTEGRATIONS_KEY },
  });
}

export function normalizeMasterGlobalIntegrationConfig(config: any) {
  const mercadoPagoLibrary = safeJsonParseArray(config?.mercadoPagoLibrary)
    .map((entry) => normalizeMercadoPagoCredential(entry))
    .filter(Boolean) as MasterMercadoPagoCredential[];
  const whatsappLibrary = safeJsonParseArray(config?.whatsappLibrary)
    .map((entry) => normalizeWhatsAppCredential(entry))
    .filter(Boolean) as MasterWhatsAppCredential[];

  const legacyMercadoPago = buildLegacyMercadoPagoCredential(config);
  const legacyWhatsApp = buildLegacyWhatsAppCredential(config);

  const mergedMercadoPago = dedupeMercadoPagoLibrary(
    [...(legacyMercadoPago ? [legacyMercadoPago] : []), ...mercadoPagoLibrary].filter(Boolean),
  );
  const mergedWhatsApp = dedupeWhatsAppLibrary(
    [...(legacyWhatsApp ? [legacyWhatsApp] : []), ...whatsappLibrary].filter(Boolean),
  );

  return {
    key: String(config?.key || MASTER_GLOBAL_INTEGRATIONS_KEY),
    mercadoPagoLibrary: mergedMercadoPago,
    whatsappLibrary: mergedWhatsApp,
    createdAt:
      config?.createdAt instanceof Date ? config.createdAt.toISOString() : normalize(config?.createdAt),
    updatedAt:
      config?.updatedAt instanceof Date ? config.updatedAt.toISOString() : normalize(config?.updatedAt),
  };
}

export function serializeMasterGlobalIntegrationConfig(config: any) {
  const normalized = normalizeMasterGlobalIntegrationConfig(config);
  return {
    key: normalized.key,
    mercadoPagoConfigured: normalized.mercadoPagoLibrary.some((entry) => Boolean(normalize(entry.accessToken))),
    whatsappConfigured: normalized.whatsappLibrary.some(
      (entry) => Boolean(normalize(entry.accessToken) && normalize(entry.phoneNumberId)),
    ),
    mercadoPagoLibrary: normalized.mercadoPagoLibrary.map((entry) => ({
      ...entry,
      accessTokenPreview: previewSecret(entry.accessToken),
      configured: Boolean(normalize(entry.accessToken)),
    })),
    whatsappLibrary: normalized.whatsappLibrary.map((entry) => ({
      ...entry,
      accessTokenPreview: previewSecret(entry.accessToken),
      configured: Boolean(normalize(entry.accessToken) && normalize(entry.phoneNumberId)),
    })),
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  };
}

export function serializeMasterIntegrationLibrariesForStorage(input: {
  mercadoPagoLibrary?: any[];
  whatsappLibrary?: any[];
}) {
  const mercadoPagoLibrary = dedupeMercadoPagoLibrary(
    (input?.mercadoPagoLibrary || [])
      .map((entry) => normalizeMercadoPagoCredential(entry))
      .filter(Boolean) as MasterMercadoPagoCredential[],
  );
  const whatsappLibrary = dedupeWhatsAppLibrary(
    (input?.whatsappLibrary || [])
      .map((entry) => normalizeWhatsAppCredential(entry))
      .filter(Boolean) as MasterWhatsAppCredential[],
  );
  return {
    mercadoPagoLibrary,
    whatsappLibrary,
    mercadoPagoLibraryJson: JSON.stringify(mercadoPagoLibrary),
    whatsappLibraryJson: JSON.stringify(whatsappLibrary),
  };
}

export function pickMasterMercadoPagoCredential(config: any, credentialKey?: NullableString) {
  const normalized = normalizeMasterGlobalIntegrationConfig(config);
  const normalizedKey = normalize(credentialKey);
  return (
    normalized.mercadoPagoLibrary.find((entry) => entry.key === normalizedKey) ||
    normalized.mercadoPagoLibrary.find((entry) => Boolean(normalize(entry.accessToken))) ||
    null
  );
}

export function pickMasterWhatsAppCredential(config: any, credentialKey?: NullableString) {
  const normalized = normalizeMasterGlobalIntegrationConfig(config);
  const normalizedKey = normalize(credentialKey);
  return (
    normalized.whatsappLibrary.find((entry) => entry.key === normalizedKey) ||
    normalized.whatsappLibrary.find(
      (entry) => Boolean(normalize(entry.accessToken) && normalize(entry.phoneNumberId)),
    ) ||
    null
  );
}

export async function resolveCompanyMercadoPagoAccess(prisma: PrismaService, companyId: number) {
  await ensureMasterBillingRuntimeSchema(prisma);
  const company = await prisma.company.findUnique({ where: { id: Number(companyId) } });
  if (!company) return { company: null, accessToken: '', source: 'missing_company' as const, masterConfig: null, credential: null };

  const companyToken = normalize(company.mercadoPagoAccessToken) || '';
  const masterConfig = await getMasterGlobalIntegrationConfig(prisma);
  const credential = pickMasterMercadoPagoCredential(masterConfig, company.masterMercadoPagoCredentialKey);

  if (company.useMasterMercadoPagoToken) {
    return {
      company,
      accessToken: credential?.accessToken || '',
      source: credential?.accessToken ? ('master' as const) : ('master_missing' as const),
      masterConfig,
      credential,
    };
  }

  return {
    company,
    accessToken: companyToken,
    source: companyToken ? ('company' as const) : ('company_missing' as const),
    masterConfig,
    credential: null,
  };
}

export async function applyMasterWhatsAppCredentials<T extends CompanyLike>(
  prisma: PrismaService,
  company: T | null | undefined,
) {
  await ensureMasterBillingRuntimeSchema(prisma);
  if (!company) {
    return {
      company: company as T | null | undefined,
      source: 'missing_company' as const,
      masterConfig: null,
      credential: null,
    };
  }

  if (!company.useMasterWhatsAppToken) {
    return {
      company,
      source: 'company' as const,
      masterConfig: null,
      credential: null,
    };
  }

  const masterConfig = await getMasterGlobalIntegrationConfig(prisma);
  const credential = pickMasterWhatsAppCredential(masterConfig, company.masterWhatsAppCredentialKey);

  if (!credential?.accessToken || !credential?.phoneNumberId) {
    return {
      company,
      source: 'master_missing' as const,
      masterConfig,
      credential: null,
    };
  }

  const hydratedCompany = {
    ...company,
    whatsappAccessToken: credential.accessToken,
    whatsappPhoneNumberId: credential.phoneNumberId,
    whatsappWabaId: credential.wabaId || company.whatsappWabaId || null,
    whatsappNumber: credential.whatsappNumber || company.whatsappNumber || null,
    whatsappDisplayNumber:
      credential.displayNumber ||
      credential.whatsappNumber ||
      company.whatsappDisplayNumber ||
      company.whatsappNumber ||
      null,
    whatsappEndpoints: [],
  } as T;

  return {
    company: hydratedCompany,
    source: 'master' as const,
    masterConfig,
    credential,
  };
}
