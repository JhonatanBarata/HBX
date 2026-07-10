"use client";

// ================================================================
// W6 (10/07) — papel do usuário DENTRO do módulo /entrega.
// O módulo não sabia role; este helper busca GET /profile/current-user
// UMA vez (cache em módulo, mesma pegada do cache de cfg) e decide com o
// isTenantAdmin canônico de lib/roles (fonte única de papel do front).
// Falha do fetch → NÃO-admin (fail-closed). Gate: botão "Excluir cliente"
// e os botões de merge da duplicidade. NÃO importa nada do shell.
// ================================================================

import { apiFetch } from "@/lib/api";
import { isTenantAdmin, type RoleUser } from "@/lib/roles";

let adminPromise: Promise<boolean> | null = null;

/** true se o usuário logado é admin do TENANT (dono/USERMASTER/ADMIN). */
export function getIsAdmin(): Promise<boolean> {
  if (!adminPromise) {
    adminPromise = apiFetch<NonNullable<RoleUser>>("/profile/current-user").then(
      (u) => isTenantAdmin(u),
      () => {
        // Fail-closed: erro = não-admin; zera o cache pra próxima tela re-tentar.
        adminPromise = null;
        return false;
      },
    );
  }
  return adminPromise;
}
