"use client";

// ================================================================
// W6 (10/07) — papel do usuário DENTRO do módulo /entrega.
// O módulo não sabia role; este helper busca GET /profile/current-user
// UMA vez (cache em módulo, mesma pegada do cache de cfg) e decide com o
// isTenantAdmin canônico de lib/roles (fonte única de papel do front).
// Falha do fetch → NÃO-admin (fail-closed). Gate: botão "Excluir cliente",
// merge da duplicidade, seção "Módulos" de Ajustes e "Marcar pago" do
// Financeiro. NÃO importa nada do shell.
//
// W4 (PR10072026): o MESMO fetch cacheado agora também alimenta o NOME DA
// EMPRESA do header (de-HBX quando só-logística) — com espelho em
// localStorage pro PWA offline não abrir sem marca nenhuma.
// ================================================================

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { isTenantAdmin, type RoleUser } from "@/lib/roles";

type PerfilUser = NonNullable<RoleUser> & {
  id?: number | null;
  company?: { id?: number | null; name?: string | null } | null;
  // /profile/current-user (sanitizeUser) já expõe isSystemMaster: o master
  // assumindo o contexto de um tenant. Usado pra NÃO disparar requests que o
  // backend barra pro master (ex.: module-categories/options → 400).
  isSystemMaster?: boolean;
  operationalCapabilities?: Array<"SELLER" | "DRIVER"> | null;
};

let perfilPromise: Promise<PerfilUser | null> | null = null;

/** GET /profile/current-user cacheado (1 fetch por sessão de app; erro re-tenta na próxima tela). */
function getPerfil(): Promise<PerfilUser | null> {
  if (!perfilPromise) {
    perfilPromise = apiFetch<PerfilUser>("/profile/current-user").then(
      (u) => u,
      () => {
        // Fail-closed: erro = sem perfil; zera o cache pra próxima tela re-tentar.
        perfilPromise = null;
        return null;
      },
    );
  }
  return perfilPromise;
}

/** true se o usuário logado é admin do TENANT (dono/USERMASTER/ADMIN). */
export function getIsAdmin(): Promise<boolean> {
  return getPerfil().then((u) => (u ? isTenantAdmin(u) : false));
}

/** true se o usuário logado é o system master (assumindo contexto ou não). */
export function getIsSystemMaster(): Promise<boolean> {
  return getPerfil().then((u) => u?.isSystemMaster === true);
}

export function getEntregaOperationalCapabilities(): Promise<Array<"SELLER" | "DRIVER">> {
  return getPerfil().then((u) => Array.isArray(u?.operationalCapabilities) ? u.operationalCapabilities : []);
}

const LS_EMPRESA_NOME = "hbx:entrega:empresa-nome";
const LS_QUEUE_OWNER = "hbx:entrega:queue-owner";

/**
 * Identidade que isola a fila offline. O valor fresco do perfil sempre vence;
 * o espelho local existe apenas para o mesmo usuário continuar offline.
 */
export async function getEntregaQueueOwner(): Promise<string | null> {
  const perfil = await getPerfil();
  const companyId = Number(perfil?.company?.id || 0);
  const userId = Number(perfil?.id || 0);
  if (companyId > 0 && userId > 0) {
    const owner = `${companyId}:${userId}`;
    try { localStorage.setItem(LS_QUEUE_OWNER, owner); } catch { /* sem storage */ }
    return owner;
  }
  try {
    const cached = String(localStorage.getItem(LS_QUEUE_OWNER) || "").trim();
    return /^\d+:\d+$/.test(cached) ? cached : null;
  } catch {
    return null;
  }
}

/**
 * Nome da empresa do usuário logado — pro header do /entrega quando
 * só-logística. Pinta primeiro o espelho do localStorage (PWA offline),
 * depois o valor fresco do /profile/current-user (e re-espelha).
 */
export function useEmpresaNome(): string {
  const [nome, setNome] = useState("");
  useEffect(() => {
    let vivo = true;
    try {
      const cache = localStorage.getItem(LS_EMPRESA_NOME);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lê localStorage (indisponível no SSR) 1x no mount; efeito legítimo
      if (cache) setNome(cache);
    } catch {
      /* sem storage */
    }
    void getPerfil().then((u) => {
      const fresco = String(u?.company?.name || "").trim();
      if (!fresco) return;
      if (vivo) setNome(fresco);
      try {
        localStorage.setItem(LS_EMPRESA_NOME, fresco);
      } catch {
        /* sem storage */
      }
    });
    return () => {
      vivo = false;
    };
  }, []);
  return nome;
}
