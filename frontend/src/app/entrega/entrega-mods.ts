"use client";

// ================================================================
// PR10072026 W4 — módulos do usuário DENTRO do app /entrega.
//
// Fonte: GET /modules/me (mesmo veredito do guard do backend). O shell do
// dashboard tem um fetch cacheado (fetchMyModulesCached), mas o TTL de 60s
// dele não dá refresh imediato depois do toggle de categorias em Ajustes —
// e o /entrega precisa refletir NA HORA na tab bar. Por isso o app tem este
// store próprio (cache em módulo + assinatura) com:
//   · refreshEntregaMods() — re-busca forçada (chamada após salvar módulos);
//   · snapshot em localStorage — PWA offline não "vira HBX" por falta de rede
//     (mesma exigência do nome da empresa no header, item 2 do plano).
// Falha de rede SEM snapshot → loaded=true com byKey vazio (fail-closed:
// nada acessível; o soLogistica dá false e o app se comporta como hoje).
//
// Também moram aqui os wrappers da gestão de categorias de módulo do tenant
// (Ajustes → seção "Módulos"): GET /profile/module-categories/options e
// POST /profile/module-categories (contratos do W1, CONTRATOS.md).
// ================================================================

import { useSyncExternalStore } from "react";

import { apiFetch, getToken } from "@/lib/api";
import type { ModAccessState } from "@/lib/so-logistica";

export type EntregaMod = { key: string; accessible?: boolean; visible?: boolean };
export type EntregaModsState = ModAccessState;

const LS_MODS = "hbx:entrega:mods";
const ESTADO_INICIAL: EntregaModsState = { loaded: false, byKey: {} };

let estado: EntregaModsState = ESTADO_INICIAL;
let buscou = false;
const ouvintes = new Set<() => void>();

function emitir() {
  for (const cb of ouvintes) cb();
}

function paraEstado(lista: unknown): EntregaModsState {
  const byKey: EntregaModsState["byKey"] = {};
  if (Array.isArray(lista)) {
    for (const m of lista as EntregaMod[]) {
      const key = String(m?.key || "").trim().toLowerCase();
      if (key) byKey[key] = { accessible: m?.accessible === true };
    }
  }
  return { loaded: true, byKey };
}

function snapshotDoStorage(): EntregaModsState | null {
  try {
    const raw = localStorage.getItem(LS_MODS);
    if (!raw) return null;
    return paraEstado(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Re-busca /modules/me AGORA (pós-toggle de módulos) e notifica os assinantes. */
export function refreshEntregaMods(): Promise<void> {
  if (!getToken()) return Promise.resolve();
  return apiFetch<EntregaMod[]>("/modules/me")
    .then((lista) => {
      estado = paraEstado(lista);
      try {
        localStorage.setItem(LS_MODS, JSON.stringify(Array.isArray(lista) ? lista : []));
      } catch {
        /* sem storage: segue só em memória */
      }
    })
    .catch(() => {
      // Offline/erro: snapshot do storage (PWA); sem snapshot, vazio fail-closed.
      estado = snapshotDoStorage() ?? { loaded: true, byKey: {} };
    })
    .then(emitir);
}

function assinar(cb: () => void): () => void {
  ouvintes.add(cb);
  if (!buscou) {
    buscou = true;
    // Hidrata do storage primeiro (paint sem flash de HBX no PWA) e revalida na rede.
    const cache = snapshotDoStorage();
    if (cache) {
      estado = cache;
      emitir();
    }
    void refreshEntregaMods();
  }
  return () => ouvintes.delete(cb);
}

/** Estado dos módulos deste usuário (assinado — refreshEntregaMods re-renderiza). */
export function useEntregaMods(): EntregaModsState {
  return useSyncExternalStore(assinar, () => estado, () => ESTADO_INICIAL);
}

// ── Categorias de módulo do tenant (Ajustes → "Módulos") ─────────────────────
export type CategoriaModuloKey = "radar" | "vendas" | "whatsapp" | "logistica" | "website";

export interface CategoriaModulo {
  key: CategoriaModuloKey;
  enabled: boolean;
  locked: boolean;
}

// Rótulo mínimo por categoria (label + campo, sem textão — regra do dono).
export const CATEGORIA_LABEL: Record<CategoriaModuloKey, string> = {
  radar: "Radar",
  vendas: "Vendas",
  whatsapp: "WhatsApp",
  logistica: "Logística",
  website: "Website",
};

export function getCategoriasModulos(): Promise<{ categories: CategoriaModulo[] }> {
  return apiFetch<{ categories: CategoriaModulo[] }>("/profile/module-categories/options");
}

export function salvarCategoriasModulos(categories: string[]): Promise<{
  ok: boolean;
  moduleCategories: string[];
  skippedModules: string[];
}> {
  return apiFetch("/profile/module-categories", {
    method: "POST",
    body: JSON.stringify({ categories }),
  });
}
