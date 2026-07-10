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
  company?: { name?: string | null } | null;
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

const LS_EMPRESA_NOME = "hbx:entrega:empresa-nome";

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
