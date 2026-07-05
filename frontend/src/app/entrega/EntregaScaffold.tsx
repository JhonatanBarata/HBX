"use client";

// ================================================================
// LOGÍSTICA-MOBILE A2 — CASCA das seções do app (Clientes/Produtos/Ajustes).
// Header do skin entrega + estado vazio HONESTO ("Nenhum cliente ainda", não
// "em breve") + a tab bar do app no rodapé. A3/A4 trocam o miolo (children)
// por lista/form reais; a casca (header + abas + auth) fica.
//
// Auth reusa a sessão do app (igual à home): sem token → /login. ZERO texto
// explicativo (Lei do plano); classes .ent-* (5 Leis, nada solto aqui).
// ================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getToken } from "@/lib/api";

import { EntregaTabBar } from "./EntregaTabBar";
import { I, ICON_PATHS } from "./icons";

export function EntregaScaffold({
  title,
  emptyIcon,
  emptyTitle,
  children,
}: {
  title: string;
  emptyIcon: keyof typeof ICON_PATHS;
  emptyTitle: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();

  // AUTH: reusa a sessão do app (mesma regra da home). Sem token → login.
  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  return (
    <div className="ent-app has-tabbar">
      <header className="ent-head">
        <div>
          <div className="ent-head-title">{title}</div>
        </div>
      </header>

      {children ?? (
        <div className="ent-empty">
          <div className="ent-empty-icon" aria-hidden="true">
            <I d={ICON_PATHS[emptyIcon]} size={40} />
          </div>
          <div className="ent-empty-title">{emptyTitle}</div>
        </div>
      )}

      <EntregaTabBar />
    </div>
  );
}
