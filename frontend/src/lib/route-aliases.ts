const LEGACY_PREFIX = "/" + "dashboard";

const LEGACY_ROUTE_ALIASES: Array<[string, string]> = [
  ["/boas-vindas", "/boasvindas"],
  ["/financeiro", "/pagamento"],
  ["/planos", "/planos"],
  ["/vendas", "/vendas"],
  ["/inbox", "/atendimento"],
  ["/whatsapp", "/whatsapp"],
  ["/website", "/website"],
  ["/webscraping", "/radar-digital"],
  ["/gerencial", "/gerencial"],
  ["/cadastros", "/cadastros"],
  ["/importacoes/followup-global", "/followup-global"],
  ["/importacoes/cadastros", "/importacoes/cadastros"],
  ["/importacoes/historico", "/importacoes/historico"],
  ["/importacoes/novo", "/importacoes/novo"],
  ["/importacoes/editar", "/importacoes/editar"],
  ["/master", "/master"],
  ["/auto-replies", "/auto-replies"],
  ["/messages", "/messages"],
  ["/checkout", "/checkout"],
  ["/layouts", "/layouts"],
];

export function normalizeInternalRouteAlias(value?: string | null) {
  const path = String(value || "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  if (path === LEGACY_PREFIX) return "/boasvindas";

  if (!path.startsWith(`${LEGACY_PREFIX}/`)) return path;

  for (const [legacyPath, cleanPath] of LEGACY_ROUTE_ALIASES) {
    const legacyRoute = `${LEGACY_PREFIX}${legacyPath}`;
    if (path === legacyRoute || path.startsWith(`${legacyRoute}/`) || path.startsWith(`${legacyRoute}?`)) {
      return `${cleanPath}${path.slice(legacyRoute.length)}`;
    }
  }

  return "/boasvindas";
}
