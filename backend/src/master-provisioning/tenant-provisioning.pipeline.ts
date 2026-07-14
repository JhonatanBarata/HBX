import {
  buildTenantProductSeeds,
  ensureTenantProductsTx,
  type EnsureTenantProductResult,
  type TenantProductSeed,
  type TenantProductSeedInput,
} from '../products/tenant-product-seed';

// ============================================================================
// Pipeline único de nascimento de tenant (arquitetura nº7 — multi-tenancy S4)
// ============================================================================
//
// PROBLEMA que isto resolve: uma empresa nascia diferente conforme a PORTA por
// onde entrava (signup self-service, convite do master, provisionamento full).
// Cliente do convite ficava SEM produto default; o provisionamento full gravava
// `CompanyModule` por default — brigando com o modelo post-it que o signup
// respeita. Suporte manual depois = ticket. Aqui as 3 portas passam pelo mesmo
// núcleo de "o que é uma empresa recém-nascida", com diffs DECLARATIVOS por preset.
//
// O que MORA aqui (passos compartilháveis, todos recebendo o `tx` do chamador):
//   - produtos default (seedTenantDefaultProductsTx)
//   - módulos (seedTenantModulesTx) — POST-IT: só grava CompanyModule quando o
//     master mandou módulos EXPLÍCITOS; default = não grava nada (a caixa do
//     kill-switch resolve ao vivo em module-access-policy.ts).
//   - ledger de nascimento (buildProvisioningLedger) — trilha de COMO nasceu.
//
// O que NÃO mora aqui (é da PORTA, difere demais entre presets): a linha
// `company.create` em si (status/billing/trial/convite/token de e-mail), o
// envio de e-mail e a criação do usuário admin/convite. Cada porta monta sua
// empresa e chama estes passos; o preset só declara QUAIS passos rodam.

export type TenantProvisioningPreset = 'self_service' | 'master_invite' | 'master_full';

// Declaração do que cada preset faz nascer. É a "diferença legível" entre as portas.
export type TenantProvisioningPresetSpec = {
  // Semeia os produtos default do tenant (oferta-principal em rascunho).
  seedsDefaultProducts: boolean;
  // Cria o admin com senha temporária no próprio nascimento. Só o full — no
  // self_service o user vem do signup; no invite o admin nasce sem senha (token).
  createsAdminWithPassword: boolean;
};

export const TENANT_PROVISIONING_PRESETS: Record<TenantProvisioningPreset, TenantProvisioningPresetSpec> = {
  // Signup público: empresa em pending_checkout, produtos default, SEM
  // SEM admin no pipeline (o usuário ADMIN é criado pelo próprio signup).
  self_service: {
    seedsDefaultProducts: true,
    createsAdminWithPassword: false,
  },
  // Convite do master: empresa em pending_checkout + contato/convite (o e-mail e
  // o token de definir senha continuam na porta createByMaster, FORA do pipeline)
  // + produtos default.
  master_invite: {
    seedsDefaultProducts: true,
    createsAdminWithPassword: false,
  },
  // Provisionamento full do master: admin com senha temporária, canais e
  // implantação assistida. Capacidade de produto não muda por esta porta.
  master_full: {
    seedsDefaultProducts: true,
    createsAdminWithPassword: true,
  },
};

export function getTenantProvisioningPreset(preset: TenantProvisioningPreset): TenantProvisioningPresetSpec {
  return TENANT_PROVISIONING_PRESETS[preset];
}

// Constrói os seeds de produtos default (idênticos entre presets). `source`
// distingue a porta na trilha de metadados do produto (auth_signup vs master).
export function buildTenantDefaultProductSeeds(source: string): TenantProductSeed[] {
  return buildTenantProductSeeds(null, { source, defaultStatus: 'draft' });
}

// Semeia os produtos default do tenant (idempotente — ensureTenantProductsTx só
// cria o que falta). Usado pelas 3 portas para o nascimento não divergir.
export async function seedTenantDefaultProductsTx(
  tx: any,
  companyId: number,
  options: { source: string; authorId?: number | null; products?: TenantProductSeedInput[] | null } = { source: 'tenant_provisioning' },
): Promise<EnsureTenantProductResult[]> {
  // Produtos EXPLÍCITOS (só o full envia) usam o catálogo enviado; senão, o default.
  const seeds = Array.isArray(options.products) && options.products.length > 0
    ? buildTenantProductSeeds(options.products, { source: options.source })
    : buildTenantDefaultProductSeeds(options.source);
  if (!seeds.length) return [];
  return ensureTenantProductsTx(tx, companyId, seeds, { authorId: options.authorId ?? null });
}

// A empresa não nasce com cópia de módulos comerciais. `CompanyModule` guarda
// somente a decisão explícita do master; o restante vem do kill-switch vivo.
export async function seedTenantModulesTx(
  tx: any,
  companyId: number,
  modules: Array<{ key: string; enabled: boolean; source: 'input' }>,
): Promise<{ resolvedModuleKeys: string[] }> {
  if (!modules.length) {
    // Sem exceção explícita = post-it vazio. Não toca em CompanyModule.
    return { resolvedModuleKeys: [] };
  }

  const moduleRows = await tx.systemModule.findMany({
    where: {
      companyAssignable: true,
      key: { in: modules.map((moduleItem) => moduleItem.key) },
    },
    select: { id: true, key: true },
  });
  const moduleIdByKey = new Map(moduleRows.map((row: any) => [String(row.key), Number(row.id)]));

  for (const moduleItem of modules) {
    const moduleId = moduleIdByKey.get(moduleItem.key);
    if (!moduleId) continue;
    await tx.companyModule.upsert({
      where: { companyId_moduleId: { companyId, moduleId } },
      update: { enabled: moduleItem.enabled },
      create: { companyId, moduleId, enabled: moduleItem.enabled },
    });
  }

  return { resolvedModuleKeys: moduleRows.map((row: any) => String(row.key)) };
}

// Trilha de nascimento (ledger): registra COMO cada empresa nasceu — por qual
// porta, qual preset, e o resultado de cada passo. Persistido em
// Company.provisioningLedgerJson (coluna nullable aditiva). Suporte lê isso pra
// saber por que uma empresa está sem produto/entitlement sem adivinhar.
export type TenantProvisioningLedgerStep = {
  key: string;
  status: 'done' | 'skipped';
  detail?: string | null;
};

export type TenantProvisioningLedger = {
  version: 1;
  preset: TenantProvisioningPreset;
  source: string;
  bornAt: string;
  steps: TenantProvisioningLedgerStep[];
};

export function buildProvisioningLedger(
  preset: TenantProvisioningPreset,
  source: string,
  steps: TenantProvisioningLedgerStep[],
): TenantProvisioningLedger {
  return {
    version: 1,
    preset,
    source,
    bornAt: new Date().toISOString(),
    steps,
  };
}

export function serializeProvisioningLedger(ledger: TenantProvisioningLedger): string {
  return JSON.stringify(ledger);
}
