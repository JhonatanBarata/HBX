export const MOBILE_ROUTE_PREFIX = "/mobile";

const MOBILE_ROUTE_ALIASES: Record<string, string> = {
  "/login": "/mobile/login",
  "/boasvindas": "/mobile/boas-vindas",
  "/boas-vindas": "/mobile/boas-vindas",
  "/tutorial": "/mobile/tutorial",
  "/radar-digital": "/mobile/radar-digital",
  "/vendas": "/mobile/vendas",
  "/planos": "/mobile/planos",
};

function splitInternalPath(value: string) {
  const hashIndex = value.indexOf("#");
  const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const queryIndex = beforeHash.indexOf("?");
  return {
    pathname: queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash,
    search: queryIndex >= 0 ? beforeHash.slice(queryIndex) : "",
    hash,
  };
}

export function toMobileRoute(value?: string | null) {
  const path = String(value || "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//")) return path;
  const { pathname, search, hash } = splitInternalPath(path);

  if (pathname === MOBILE_ROUTE_PREFIX || pathname.startsWith(`${MOBILE_ROUTE_PREFIX}/`)) {
    return `${pathname}${search}${hash}`;
  }

  const mappedPathname = MOBILE_ROUTE_ALIASES[pathname] || pathname;
  return `${mappedPathname}${search}${hash}`;
}

export function mobileRouteIsActive(currentPathname: string | null | undefined, targetPathname: string) {
  const current = String(currentPathname || "");
  const target = toMobileRoute(targetPathname);
  return current === target || current === targetPathname;
}
