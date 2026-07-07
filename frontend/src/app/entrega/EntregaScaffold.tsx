"use client";

// ================================================================
// MOBILE-CASCA/W6+ — /entrega usa a MESMA casca central do HBX:
// raiz .casca, topo 1 linha, palco, transições, toast e CascaTabBar fixa
// Vendas · Conversas · Empresas · Rota · Mais. A cor de logística continua
// vindo do re-vestimento [data-skin="entrega"] em hbx-theme/entrega.css.
//
// Título NÃO duplica (regra aprendida na frente): o topo já mostra o nome
// da tela — os componentes de conteúdo não repetem `<h1>`/título próprio.
// ================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { CascaToastHost } from "@/components/casca";
import { CascaTabBar } from "@/components/casca/tab-bar";
import { getToken } from "@/lib/api";

import { I, ICON_PATHS } from "./icons";

export function EntregaScaffold({
  title,
  emptyIcon,
  emptyTitle,
  headerActions,
  children,
}: {
  title: string;
  emptyIcon?: keyof typeof ICON_PATHS;
  emptyTitle?: string;
  /** ação compacta do topo (ex.: pendências offline) — alvo ≤28px, NUNCA fileira de ícones. */
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const router = useRouter();

  // AUTH: reusa a sessão do app (mesma regra da home). Sem token → /login.
  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  return (
    <div className="casca">
      <div className="casca-top">
        <h1 className="casca-top__title">{title}</h1>
        {headerActions ? <div className="casca-top__actions">{headerActions}</div> : null}
      </div>

      <div className="casca-stage">
        <div className="casca-view casca-view--enter">
          {children ?? (
            <div className="ent-empty">
              <div className="ent-empty-icon" aria-hidden="true">
                {emptyIcon ? <I d={ICON_PATHS[emptyIcon]} size={40} /> : null}
              </div>
              <div className="ent-empty-title">{emptyTitle}</div>
            </div>
          )}
        </div>
      </div>

      <CascaTabBar />
      <CascaToastHost />
    </div>
  );
}
