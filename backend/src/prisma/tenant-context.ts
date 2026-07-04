import { AsyncLocalStorage } from 'node:async_hooks';

// Contexto de tenant por request (arquitetura nº7 — multi-tenancy Sprint 1).
//
// O PrismaClient é SINGLETON (1 conexão para todos os requests). Então a trava
// de escopo do Prisma (tenant-guard.extension.ts) NÃO pode carregar o companyId
// no próprio client — precisa descobrir, no momento de CADA query, de qual tenant
// é o request atual. Esse elo é o AsyncLocalStorage: o interceptor abre um "store"
// por request com o companyId efetivo (o mesmo que o JwtStrategy já resolveu em
// `req.user.companyId`) e o guard lê esse store dentro de `$allOperations`.
//
// Sem tenant no store (ex.: master puro sem empresa assumida, jobs de boot, cron)
// o guard NÃO acusa — não há tenant a exigir. Ver tenant-guard.extension.ts.

export type TenantStore = {
  // companyId efetivo do request (empresa própria OU empresa que o master assumiu).
  companyId?: number | null;
  // master do sistema — informativo; NÃO desliga o guard sozinho (master que
  // assumiu uma empresa continua escopado nela). O bypass consciente é o
  // `withoutTenantScopeReason` abaixo.
  isSystemMaster?: boolean;
  // Quando preenchido, o guard deixa passar queries sem companyId e LOGA o motivo.
  // Setado só via helper withoutTenantScope(reason) para chamadas master/cross-tenant
  // legítimas (lagoa do Radar, telas master, relatórios globais).
  withoutTenantScopeReason?: string | null;
};

const storage = new AsyncLocalStorage<TenantStore>();

// Abre um escopo de tenant para o callback (usado pelo interceptor por request e
// pelos testes). Reaproveita/estende o store atual se já houver um aberto. Igual ao
// withoutTenantScope: se o callback devolver promessa preguiçosa, encadeia dentro
// do frame pra query não rodar depois do escopo fechar.
export function runWithTenantContext<T>(store: TenantStore, callback: () => T): T {
  const current = storage.getStore();
  const next: TenantStore = current ? { ...current, ...store } : { ...store };
  return storage.run(next, () => {
    const result = callback();
    if (isThenable(result)) {
      return Promise.resolve(result) as unknown as T;
    }
    return result;
  });
}

export function getTenantStore(): TenantStore | undefined {
  return storage.getStore();
}

export function getTenantCompanyId(): number | null {
  const store = storage.getStore();
  const raw = store?.companyId;
  const companyId = Number(raw);
  return Number.isInteger(companyId) && companyId > 0 ? companyId : null;
}

export function isTenantScopeBypassed(): boolean {
  return Boolean(storage.getStore()?.withoutTenantScopeReason);
}

export function getTenantScopeBypassReason(): string | null {
  return storage.getStore()?.withoutTenantScopeReason || null;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

// Escape hatch CONSCIENTE: roda o callback com a trava de tenant desligada, sempre
// com um motivo (logado pelo guard quando uma query sem companyId passar). Use SÓ
// em caminhos master/cross-tenant legítimos. Preserva o companyId atual no store —
// só marca o bypass — para o log ainda mostrar de onde veio.
//
// IMPORTANTE (assíncrono): quando o callback devolve uma promessa PREGUIÇOSA (o
// caso do Prisma — a query só dispara no `.then`), precisamos garantir que esse
// disparo aconteça DENTRO do frame do AsyncLocalStorage; senão o escopo já fechou
// quando a query executa e o bypass "some". Por isso, se o retorno for thenable,
// encadeamos um `.then` ainda dentro do `run` (`Promise.resolve(...)` faz isso).
export function withoutTenantScope<T>(reason: string, callback: () => T): T {
  const normalized = String(reason || '').trim() || 'sem-motivo-informado';
  const current = storage.getStore();
  const next: TenantStore = {
    ...(current || {}),
    withoutTenantScopeReason: normalized,
  };
  return storage.run(next, () => {
    const result = callback();
    if (isThenable(result)) {
      // Dispara/encadeia a promessa dentro do frame (mantém o bypass ativo até
      // a query rodar). Cast preserva a assinatura para o chamador.
      return Promise.resolve(result) as unknown as T;
    }
    return result;
  });
}
