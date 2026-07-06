// MOBILE-CASCA/W4 — EMPRESAS mobile (mockup aprovado 3). Tipos e helpers
// espelhando (mesmo contrato, sem importar — os do desktop não são
// exportados) os tipos locais de `empresas/page.client.tsx`. MESMOS
// endpoints do NÚCLEO-CRM que o desktop usa. Zero backend novo.

export type EmpresaListItem = {
  id: string;
  name: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  origin: string | null;
  contatosCount: number;
};

export type EmpresaListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: EmpresaListItem[];
} | null;

export type EmpresaContato = {
  id: string;
  nome: string;
  cargo: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  isPrincipal: boolean;
  source: string | null;
};

export type EmpresaDetail = {
  id: string;
  name: string | null;
  cnpj: string | null;
  document: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  origin: string | null;
  createdAt: string | null;
  contatos: EmpresaContato[];
} | null;

// CNPJ 14 dígitos → 00.000.000/0000-00 (só formata, não valida) — mesma
// função do desktop (empresas/page.client.tsx).
export function fmtCnpj(cnpj: string | null): string {
  const d = String(cnpj || "").replace(/\D+/g, "");
  if (d.length !== 14) return cnpj || "—";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function fmtPhone(v: string | null): string {
  const d = String(v || "").replace(/\D+/g, "");
  if (d.length < 10) return v || "—";
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  return rest.length === 9
    ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
    : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

export function localCityUf(cidade: string | null, uf: string | null): string {
  const parts = [String(cidade || "").trim(), String(uf || "").trim()].filter(Boolean);
  return parts.length ? parts.join("/") : "";
}

/** Iniciais pro avatar quadrado (1-2 letras, mesmo critério do <Av> central). */
export function initials(name: string | null): string {
  const s = String(name || "").trim();
  if (!s) return "?";
  return s.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

/**
 * Badge ÚNICA por linha (régua W4: 1 badge, não 3 como no desktop):
 * cliente > lead > fornecedor > sem papel. "cliente" pesa mais porque é o
 * status comercial mais forte (já converteu).
 */
export function papelBadge(e: { isCliente: boolean; isLead: boolean; isFornecedor: boolean }): { label: string; tone: "cliente" | "lead" | "fornecedor" } | null {
  if (e.isCliente) return { label: "cliente", tone: "cliente" };
  if (e.isLead) return { label: "lead", tone: "lead" };
  if (e.isFornecedor) return { label: "fornecedor", tone: "fornecedor" };
  return null;
}

/** Status por extenso pra linha "cidade · segmento · status" do header da ficha. */
export function statusLabel(e: { isCliente: boolean; isLead: boolean; isFornecedor: boolean }): string {
  const b = papelBadge(e);
  return b ? b.label[0].toUpperCase() + b.label.slice(1) : "—";
}
