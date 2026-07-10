"use client";

// ================================================================
// MOBILE-CASCA/W6+ — /entrega usa a MESMA casca visual do HBX:
// raiz .casca, topo 1 linha, palco, transições, toast e tab bar nas classes
// centrais .casca-tabbar/.casca-tab. A navegação interna continua sendo a do
// app de logística: Rota · Clientes · Produtos · Ajustes · HBX.
//
// Título NÃO duplica (regra aprendida na frente): o topo já mostra o nome
// da tela — os componentes de conteúdo não repetem `<h1>`/título próprio.
// ================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { CascaToastHost } from "@/components/casca";
import { HbxMarkViva } from "@/components/casca/hbx-mark";
import { getToken } from "@/lib/api";

import { EntregaTabBar } from "./EntregaTabBar";
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

  // AUTH: reusa a sessão do app (mesma regra da home). Sem token → landing
  // com login aberto ("/?entrar" — /login morreu como tela, W1 10/07).
  useEffect(() => {
    if (!getToken()) router.replace("/?entrar");
  }, [router]);

  return (
    <div className="casca">
      <div className="casca-top">
        {/* título sai do visual (ordem do dono) mas fica pra leitor de tela;
            a marca »HBX viva é a MESMA da casca central (components/casca/hbx-mark) */}
        <h1 className="casca-top__title hbx-sr-only">{title}</h1>
        <HbxMarkViva />
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

      <EntregaTabBar />
      <CascaToastHost />
    </div>
  );
}
