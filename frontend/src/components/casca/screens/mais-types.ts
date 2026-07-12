// MOBILE-CASCA/W5 — tipos compartilhados entre a folha "Mais" e a tela
// Configurações mobile. Espelham (mesmo contrato, sem importar — os do
// desktop não são exportados) os tipos locais de
// app/(app)/configuracoes/page.client.tsx e components/hbx/shell.tsx.
//
// useMaisCurrentUser() busca DIRETO de /profile/current-user (não usa o
// useCurrentUser() de shell.tsx: aquele CurrentUser não expõe avatarUrl — o
// desktop configuracoes/page.client.tsx também busca à parte pelo mesmo
// motivo). Zero endpoint novo. FIX pós-publish 06/07: a versão publicada em
// 49cd2d89 usava useCurrentUser (sem avatarUrl) e quebrava tsc --noEmit —
// corrigido aqui.

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

export type MaisCurrentUser = {
  name?: string | null;
  email?: string | null;
  username?: string | null;
  role?: string | null;
  userKind?: string | null;
  operationalCapabilities?: string[] | null;
  isSystemMaster?: boolean | null;
  canViewBilling?: boolean | null;
  avatarUrl?: string | null;
  company?: { name?: string | null; contactPhone?: string | null } | null;
} | null;

export type MasterNotice = {
  id: string;
  title: string;
  body: string;
  tone?: string | null;
  acknowledged?: boolean;
  createdAt?: string | null;
};

export type TeamMember = {
  id: number;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  isActive?: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  USERMASTER: "Administrador",
  USER: "Vendas",
  MASTER: "Master",
};

export function roleLabel(role?: string | null): string {
  return ROLE_LABEL[String(role || "").toUpperCase()] || "Usuário";
}

export function displayName(user: MaisCurrentUser): string {
  return user?.name || user?.username || user?.email || "—";
}

export function companyName(user: MaisCurrentUser): string {
  return user?.company?.name || "Sua empresa";
}

/** GET /profile/current-user — mesmo endpoint do desktop, shape com avatarUrl. */
export function useMaisCurrentUser(): MaisCurrentUser {
  const [user, setUser] = useState<MaisCurrentUser>(null);
  useEffect(() => {
    let alive = true;
    apiFetch<MaisCurrentUser>("/profile/current-user")
      .then(res => { if (alive) setUser(res); })
      .catch(() => { /* sem sessão — AuthGate cuida */ });
    return () => { alive = false; };
  }, []);
  return user;
}

// Data relativa curta para o rodapé/lista de avisos ("agora", "há 5 min",
// "há 2h", "12/06").
export function fmtWhen(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
